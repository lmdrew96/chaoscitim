/**
 * PDF text extraction. Uses unpdf (serverless build of pdf.js) to pull the
 * text layer from a PDF, then cleans up common artifacts before returning:
 *   - de-hyphenates words broken across line breaks
 *   - drops repeating header/footer lines that appear on most pages
 *   - collapses single-line breaks within paragraphs while preserving blanks
 *
 * Caveats (surfaced to callers via diagnostics):
 *   - Scanned PDFs without a text layer produce empty/garbage output
 *   - Multi-column layouts may interleave columns in the wrong order
 *   - Romanian PDFs commonly encode ş/ţ (cedilla) instead of ș/ț — the
 *     ingestion pipeline's diacritic restorer handles that downstream
 */

import { extractText, getDocumentProxy } from 'unpdf';

export interface PdfExtraction {
  title: string | null;
  content: string;
  diagnostics: {
    totalPages: number;
    droppedHeaderFooterLines: number;
    hyphenJoins: number;
    hasTextLayer: boolean;
  };
}

export async function extractPdf(
  buffer: ArrayBuffer | Uint8Array,
  filenameHint?: string,
): Promise<PdfExtraction> {
  const data =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);

  const { totalPages, text: pages } = await extractText(pdf, {
    mergePages: false,
  });

  const cleanedPages = pages.map((p) => p.replace(/\r\n?/g, '\n'));
  const totalLength = cleanedPages.reduce((s, p) => s + p.length, 0);
  if (totalLength < 20) {
    return {
      title: filenameHint ?? null,
      content: '',
      diagnostics: {
        totalPages,
        droppedHeaderFooterLines: 0,
        hyphenJoins: 0,
        hasTextLayer: false,
      },
    };
  }

  const { dropped, lines } = stripRepeatingHeadersFooters(cleanedPages);
  let merged = lines.join('\n');

  const before = merged.length;
  merged = dehyphenate(merged);
  const hyphenJoins = countHyphenJoins(merged, before);

  merged = collapseWhitespace(merged);

  // Title heuristic: first non-trivial line in the cleaned text, capped at
  // 120 chars; fall back to the filename hint.
  const firstLine = merged.split('\n').find((l) => l.trim().length >= 4);
  const title = firstLine
    ? firstLine.trim().slice(0, 120)
    : filenameHint ?? null;

  return {
    title,
    content: merged,
    diagnostics: {
      totalPages,
      droppedHeaderFooterLines: dropped,
      hyphenJoins,
      hasTextLayer: true,
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────

/**
 * Lines that appear on more than half of the pages (and on at least 3 pages)
 * are treated as running headers/footers and dropped. Pure-numeric lines on a
 * page boundary are also dropped as page numbers.
 */
function stripRepeatingHeadersFooters(pages: string[]): {
  lines: string[];
  dropped: number;
} {
  const counts = new Map<string, number>();
  const minPages = Math.max(3, Math.ceil(pages.length / 2));

  for (const page of pages) {
    const seen = new Set<string>();
    for (const raw of page.split('\n')) {
      const line = raw.trim();
      if (line.length < 3 || line.length > 80) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const blacklist = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= minPages) blacklist.add(line);
  }

  let dropped = 0;
  const out: string[] = [];
  for (const page of pages) {
    const pageLines = page.split('\n');
    for (const raw of pageLines) {
      const line = raw.trim();
      if (blacklist.has(line)) {
        dropped++;
        continue;
      }
      // Page numbers: pure digits, optional surrounding dashes/spaces.
      if (/^[-—–\s]*\d{1,4}[-—–\s]*$/.test(line)) {
        dropped++;
        continue;
      }
      out.push(raw);
    }
    out.push(''); // page break becomes a blank line
  }

  return { lines: out, dropped };
}

/** Rejoin words split by line-ending hyphens: "neîn-\ntrerupt" → "neîntrerupt". */
function dehyphenate(text: string): string {
  return text.replace(/(\p{L})-\n(\p{L})/gu, '$1$2');
}

function countHyphenJoins(after: string, beforeLen: number): number {
  // Each hyphen-join shortens the string by 2 (hyphen + newline removed).
  return Math.max(0, Math.floor((beforeLen - after.length) / 2));
}

/**
 * Collapse single newlines inside paragraphs (where the next line starts
 * lowercase) but preserve paragraph breaks (blank lines) and explicit
 * sentence-ending breaks (line ends with .?!:).
 */
function collapseWhitespace(text: string): string {
  // First normalize >2 blank lines to exactly one paragraph break.
  let t = text.replace(/\n{3,}/g, '\n\n');
  // Join soft line breaks: a single \n between a non-sentence-ender and a
  // lowercase or comma start.
  t = t.replace(/([^\n.?!:])\n(?=[\p{Ll},;])/gu, '$1 ');
  // Collapse runs of inline whitespace.
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n');
  return t.trim();
}
