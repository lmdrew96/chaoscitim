/**
 * Fetch a public URL and extract its main article text using Mozilla
 * Readability. This is the server-side companion to the BYO URL ingestion
 * form. Returns `{ title, content }` where `content` is plain text suitable
 * for `prepareIngestion`.
 *
 * Failure modes are deliberately user-visible: a clear error message beats a
 * silent fallback that ingests boilerplate.
 *
 * SSRF hardening: we follow redirects manually so every hop is validated
 * against private/loopback/link-local IP ranges and known metadata endpoints
 * before the request is sent. This prevents a user-supplied URL from
 * bouncing through a redirect to an internal cloud metadata service.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4_000_000; // 4 MB; refuses obvious scraping bombs.
const MAX_REDIRECTS = 5;

// ────────────────────────────────────────────────────────────────────────
// SSRF URL safety validation
// ────────────────────────────────────────────────────────────────────────

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);
const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localdomain'];

// IPv4 ranges that must never be the fetch target.
const BLOCKED_IPv4: RegExp[] = [
  /^0\./,                                        // 0.0.0.0/8
  /^10\./,                                        // 10.0.0.0/8 private
  /^127\./,                                       // 127.0.0.0/8 loopback
  /^169\.254\./,                                  // 169.254.0.0/16 link-local / AWS IMDS
  /^172\.(1[6-9]|2\d|3[01])\./,                  // 172.16.0.0/12 private
  /^192\.0\.2\./,                                 // TEST-NET-1
  /^192\.168\./,                                  // 192.168.0.0/16 private
  /^198\.51\.100\./,                              // TEST-NET-2
  /^203\.0\.113\./,                               // TEST-NET-3
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,  // 100.64.0.0/10 CGNAT
];

// IPv6 addresses that must never be the fetch target.
const BLOCKED_IPv6: RegExp[] = [
  /^::1?$/,         // loopback (::1) and all-zeros (::)
  /^fe[89ab]/i,     // link-local fe80::/10
  /^f[cd]/i,        // unique-local fc00::/7
];

/** Throws if the URL hostname is a private/loopback/metadata target. */
export function assertSafeUrl(url: URL): void {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL must use http or https.');
  }

  // Unwrap IPv6 bracket notation: [::1] → ::1
  const host = url.hostname.toLowerCase();
  const bare =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (BLOCKED_HOSTNAMES.has(bare)) {
    throw new Error('URL target is not permitted.');
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((s) => bare.endsWith(s))) {
    throw new Error('URL target is not permitted.');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare) && BLOCKED_IPv4.some((re) => re.test(bare))) {
    throw new Error('URL target is not permitted.');
  }
  if (bare.includes(':') && BLOCKED_IPv6.some((re) => re.test(bare))) {
    throw new Error('URL target is not permitted.');
  }
}

// ────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────

export interface ExtractedArticle {
  title: string;
  content: string;
  byline: string | null;
  excerpt: string | null;
}

export async function extractFromUrl(rawUrl: string): Promise<ExtractedArticle> {
  const parsed = new URL(rawUrl);
  assertSafeUrl(parsed);

  const html = await fetchHtml(parsed);
  const dom = new JSDOM(html, { url: parsed.toString() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent) {
    throw new Error(
      'Could not extract readable content from this URL — the page may be JS-rendered, paywalled, or lack a main article body.',
    );
  }

  const content = normalizeWhitespace(article.textContent);
  if (content.length < 20) {
    throw new Error(
      'Extracted article is too short. Try pasting the text directly.',
    );
  }

  return {
    title: (article.title || parsed.hostname).trim(),
    content,
    byline: article.byline?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fetch with manual redirect following
// ────────────────────────────────────────────────────────────────────────

async function fetchHtml(initialUrl: URL): Promise<string> {
  // One shared timeout for the whole operation including redirects.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    let current = initialUrl;
    let hops = 0;
    let res: Response;

    for (;;) {
      res = await fetch(current, {
        signal: controller.signal,
        // Never auto-follow — we validate every hop before sending.
        redirect: 'manual',
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; ChaosCitim/1.0; +https://chaoscitim.adhdesigns.dev)',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error('Redirect response missing Location header.');
        if (++hops > MAX_REDIRECTS) throw new Error('Too many redirects.');
        const next = new URL(location, current);
        assertSafeUrl(next); // block redirect to private target
        current = next;
        continue;
      }

      break;
    }

    if (!res.ok) {
      throw new Error(`URL returned HTTP ${res.status}.`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('xml')) {
      throw new Error(
        `URL did not return an HTML document (content-type: ${contentType || 'unknown'}).`,
      );
    }

    // Read with a hard size cap to avoid memory blowups on hostile servers.
    const reader = res.body?.getReader();
    if (!reader) throw new Error('URL response had no body.');
    let received = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_HTML_BYTES) {
        throw new Error('URL response exceeded the 4 MB size limit.');
      }
      chunks.push(value);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  } finally {
    clearTimeout(timer);
  }
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
