/**
 * Fetch a public URL and extract its main article text using Mozilla
 * Readability. This is the server-side companion to the BYO URL ingestion
 * form. Returns `{ title, content }` where `content` is plain text suitable
 * for `prepareIngestion`.
 *
 * Failure modes are deliberately user-visible: a clear error message beats a
 * silent fallback that ingests boilerplate.
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4_000_000; // 4 MB; refuses obvious scraping bombs.

export interface ExtractedArticle {
  title: string;
  content: string;
  byline: string | null;
  excerpt: string | null;
}

export async function extractFromUrl(url: string): Promise<ExtractedArticle> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL must use http or https.');
  }

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

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Identify ourselves; many sites block default fetch UAs.
        'user-agent':
          'Mozilla/5.0 (compatible; ChaosCitim/1.0; +https://chaoscitim.adhdesigns.dev)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
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
