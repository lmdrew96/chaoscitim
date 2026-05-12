/**
 * EPUB chapter extraction. Reads an EPUB (zip) buffer, walks the OPF manifest
 * and spine, and returns chapters in reading order as plain text.
 *
 * EPUB 2 & EPUB 3 both work — we only need: the rootfile path from
 * `META-INF/container.xml`, then `manifest`/`spine`/`metadata` from the OPF.
 *
 * Chapters are returned in spine order. Each chapter's text is extracted via
 * jsdom: prefer Readability when it produces a usable body, otherwise fall
 * back to the document's text content. Chapter titles are taken from the
 * first heading inside the chapter, else the manifest item id.
 */

import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { XMLParser } from 'fast-xml-parser';
import { Readability } from '@mozilla/readability';

export interface EpubChapter {
  /** Spine index (0-based). */
  order: number;
  /** Derived chapter title (first heading or manifest id). */
  title: string;
  /** Plain-text body, whitespace-normalized. */
  content: string;
}

export interface EpubExtraction {
  bookTitle: string | null;
  bookAuthor: string | null;
  chapters: EpubChapter[];
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  trimValues: true,
});

export async function extractEpub(
  buffer: ArrayBuffer | Uint8Array,
): Promise<EpubExtraction> {
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await readZipText(zip, 'META-INF/container.xml');
  if (!containerXml) {
    throw new Error('EPUB is missing META-INF/container.xml.');
  }
  const container = xml.parse(containerXml);
  const rootfilePath = pluckRootfilePath(container);
  if (!rootfilePath) {
    throw new Error('EPUB container.xml has no rootfile reference.');
  }

  const opfXml = await readZipText(zip, rootfilePath);
  if (!opfXml) {
    throw new Error(`EPUB rootfile not found at ${rootfilePath}.`);
  }
  const opf = xml.parse(opfXml);

  const { bookTitle, bookAuthor } = pluckMetadata(opf);
  const manifest = pluckManifest(opf);
  const spineIds = pluckSpine(opf);

  if (spineIds.length === 0) {
    throw new Error('EPUB has no spine — nothing readable.');
  }

  const opfDir = dirname(rootfilePath);
  const chapters: EpubChapter[] = [];

  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i]!;
    const item = manifest.get(id);
    if (!item) continue;
    if (!isHtmlMediaType(item.mediaType)) continue;

    const href = resolvePath(opfDir, item.href);
    const htmlText = await readZipText(zip, href);
    if (!htmlText) continue;

    const { title, content } = htmlToChapter(htmlText, id);
    if (!content) continue;

    chapters.push({ order: i, title, content });
  }

  if (chapters.length === 0) {
    throw new Error('EPUB extraction produced no readable chapters.');
  }

  return { bookTitle, bookAuthor, chapters };
}

// ── helpers ─────────────────────────────────────────────────────────────

function pluckRootfilePath(container: unknown): string | null {
  const c = container as {
    container?: {
      rootfiles?: { rootfile?: unknown | unknown[] };
    };
  };
  const rf = c.container?.rootfiles?.rootfile;
  const first = Array.isArray(rf) ? rf[0] : rf;
  const path = (first as { '@_full-path'?: string })?.['@_full-path'];
  return path ?? null;
}

function pluckMetadata(opf: unknown): {
  bookTitle: string | null;
  bookAuthor: string | null;
} {
  const meta = (opf as { package?: { metadata?: Record<string, unknown> } })
    .package?.metadata;
  if (!meta) return { bookTitle: null, bookAuthor: null };

  const titleNode = (meta['dc:title'] ?? meta['title']) as unknown;
  const creatorNode = (meta['dc:creator'] ?? meta['creator']) as unknown;

  return {
    bookTitle: extractText(titleNode),
    bookAuthor: extractText(creatorNode),
  };
}

function extractText(node: unknown): string | null {
  if (!node) return null;
  if (Array.isArray(node)) return extractText(node[0]);
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return (obj['#text'] as string).trim() || null;
  }
  return null;
}

interface ManifestItem {
  href: string;
  mediaType: string;
}

function pluckManifest(opf: unknown): Map<string, ManifestItem> {
  const items = (opf as { package?: { manifest?: { item?: unknown | unknown[] } } })
    .package?.manifest?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const out = new Map<string, ManifestItem>();
  for (const raw of list) {
    const it = raw as Record<string, string>;
    const id = it['@_id'];
    const href = it['@_href'];
    const mediaType = it['@_media-type'] ?? '';
    if (id && href) out.set(id, { href, mediaType });
  }
  return out;
}

function pluckSpine(opf: unknown): string[] {
  const refs = (opf as { package?: { spine?: { itemref?: unknown | unknown[] } } })
    .package?.spine?.itemref;
  const list = Array.isArray(refs) ? refs : refs ? [refs] : [];
  return list
    .map((r) => (r as Record<string, string>)['@_idref'])
    .filter((id): id is string => typeof id === 'string');
}

function isHtmlMediaType(mt: string): boolean {
  return mt.includes('html') || mt.includes('xml');
}

function htmlToChapter(
  html: string,
  fallbackTitle: string,
): { title: string; content: string } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Title: first heading in document order, else <title>, else manifest id.
  const heading = doc.querySelector('h1, h2, h3, h4');
  const title =
    heading?.textContent?.trim() ||
    doc.title?.trim() ||
    fallbackTitle;

  // Try Readability first; fall back to raw body text if it returns nothing
  // usable. Readability sometimes refuses short chapters, which is fine —
  // raw text is acceptable here because EPUB markup is already clean-ish.
  let textContent: string | null = null;
  try {
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    if (article?.textContent && article.textContent.trim().length > 0) {
      textContent = article.textContent;
    }
  } catch {
    // ignore — fall back below
  }
  if (!textContent) {
    textContent = doc.body?.textContent ?? '';
  }

  return { title, content: normalizeWhitespace(textContent) };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('string');
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function resolvePath(dir: string, href: string): string {
  if (!dir) return href;
  // Handle ../ segments in hrefs (rare but legal).
  const parts = (dir + '/' + href).split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}
