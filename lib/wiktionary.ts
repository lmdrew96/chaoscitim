/**
 * Wiktionary RO→EN gloss extraction.
 *
 * Pulls Romanian definitions from en.wiktionary and compresses them into
 * 1–3 word English glosses for the tier-3 reveal. Two layers:
 *   - Pure parsing: `parseRomanianGloss(wikitext, upos)` — fixture-testable,
 *     no network.
 *   - Batched fetcher: `fetchGlossesBatch(lemmas)` — talks to the MediaWiki
 *     API in chunks of up to 50 titles.
 *
 * Content sourced here is **CC BY-SA 4.0** (en.wiktionary). See
 * docs/wiktionary-attribution.md.
 */
import type { UPos } from '@/db/types';

const API_URL = 'https://en.wiktionary.org/w/api.php';
const USER_AGENT =
  'ChaosCitim/1.0 (https://chaoscitim.adhdesigns.dev; lmdrew96@gmail.com)';
const BATCH_SIZE = 50; // MediaWiki API hard limit for `titles=`
const REQUEST_DELAY_MS = 200; // politeness; ~5 req/s ceiling

// Mapping UDPipe UPOS → ordered list of Wiktionary POS headers to try.
// First match wins. Fallbacks let us accept "close enough" matches (e.g.,
// a UDPipe PRON whose Wiktionary entry calls it a Determiner).
const POS_HEADERS: Record<UPos, string[]> = {
  NOUN: ['Noun', 'Proper noun'],
  PROPN: ['Proper noun', 'Noun'],
  VERB: ['Verb'],
  AUX: ['Verb'],
  ADJ: ['Adjective'],
  ADV: ['Adverb'],
  ADP: ['Preposition', 'Postposition'],
  CCONJ: ['Conjunction'],
  SCONJ: ['Conjunction'],
  PRON: ['Pronoun', 'Determiner'],
  DET: ['Determiner', 'Article', 'Pronoun'],
  INTJ: ['Interjection'],
  NUM: ['Numeral', 'Number'],
  PART: ['Particle'],
  PUNCT: [],
  SYM: [],
  X: [],
};

// Every POS header we recognize, used as a fallback when the UPOS-mapped
// list misses (e.g., UDPipe lemma is "X" but Wiktionary has a real entry).
const ALL_POS_HEADERS = [
  'Verb',
  'Noun',
  'Proper noun',
  'Adjective',
  'Adverb',
  'Preposition',
  'Postposition',
  'Conjunction',
  'Pronoun',
  'Determiner',
  'Article',
  'Interjection',
  'Numeral',
  'Number',
  'Particle',
];

export interface GlossLookup {
  lemma: string;
  upos: UPos;
}

export interface GlossResult {
  lemma: string;
  gloss: string | null;
  /** Raw wikitext definition line, before compression. Useful for debugging. */
  raw: string | null;
}

/**
 * Extract the Romanian-language section from a Wiktionary page. Returns the
 * text between `==Romanian==` and the next `==Language==` header (or EOF).
 */
export function extractRomanianSection(wikitext: string): string | null {
  const startMarker = '\n==Romanian==';
  // Allow the file to begin with ==Romanian== (no leading newline).
  let start = wikitext.startsWith('==Romanian==')
    ? 0
    : wikitext.indexOf(startMarker);
  if (start === -1) return null;
  if (start > 0) start += 1; // skip leading newline
  const after = start + '==Romanian=='.length;
  // Find next top-level (==Language==) header.
  const nextHeader = wikitext
    .slice(after)
    .search(/\n==[^=\n][^=\n]*==\s*\n/);
  const end = nextHeader === -1 ? wikitext.length : after + nextHeader;
  return wikitext.slice(after, end);
}

/**
 * Find a POS subsection within a Romanian section. Handles both
 * `===Verb===` (level 3) and `====Verb====` (level 4, nested under
 * `===Etymology N===`). Returns the body until the next sibling-or-higher
 * header, or null if no matching POS is found.
 */
export function findPosSection(
  romanianSection: string,
  posHeaders: string[],
): string | null {
  for (const header of posHeaders) {
    // Match ===Header=== or ====Header==== (also =====Header=====, etc.).
    const pattern = new RegExp(
      `\\n(=={2,5})${escapeRegex(header)}\\1\\s*\\n`,
      'i',
    );
    const m = romanianSection.match(pattern);
    if (!m || m.index === undefined) continue;
    const level = m[1]!.length; // number of '=' on one side
    const bodyStart = m.index + m[0].length;
    // Section ends at next header with `level` or fewer '='s.
    const afterBody = romanianSection.slice(bodyStart);
    const endPattern = new RegExp(`\\n={2,${level}}[^=\\n][^\\n]*={2,${level}}\\s*\\n`);
    const endMatch = afterBody.search(endPattern);
    const body = endMatch === -1 ? afterBody : afterBody.slice(0, endMatch);
    return body;
  }
  return null;
}

/**
 * Pull the first `# ` definition line from a POS section body. Skips
 * `##` sub-definitions, `#: ` examples, `#* ` quotes, etc. Returns the
 * raw wikitext after `# `, or null if no definition is found.
 */
export function firstDefinition(posBody: string): string | null {
  const lines = posBody.split('\n');
  for (const line of lines) {
    // Single '#' followed by a space (or end), no second '#' or other suffix.
    if (/^#\s+\S/.test(line) && !/^#[#:*]/.test(line)) {
      return line.replace(/^#\s+/, '').trim();
    }
  }
  return null;
}

/**
 * Strip wiki markup from a definition line.
 *
 *   [[X]]        → X
 *   [[X|Y]]      → Y
 *   {{lb|ro|…}}  → ''   (label templates discarded)
 *   {{l|en|X}}   → X    (link templates inlined)
 *   {{m|en|X}}   → X
 *   {{gl|X}}     → X
 *   <ref>...</ref> → ''
 *   '''X'''      → X
 *   ''X''        → X
 *   (X)          → ''   (parentheticals — usually scope notes)
 */
export function cleanWikiMarkup(line: string): string {
  let out = line;

  // Refs.
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  out = out.replace(/<ref[^/]*\/>/g, '');

  // Templates: handle a few common shapes, then drop the rest.
  // {{l|<lang>|<target>|<display>?}} → display ?? target
  // {{m|<lang>|<target>|<display>?}} → display ?? target
  // {{gl|<text>}} → text
  out = out.replace(/\{\{(?:l|m|ll|mention|link)\|[^|}]+\|([^|}]+)(?:\|([^|}]+))?[^}]*\}\}/g,
    (_, target, display) => (display || target).trim());
  out = out.replace(/\{\{(?:gl|gloss|n-g|ng|q|qual)\|([^|}]+)[^}]*\}\}/g,
    (_, text) => text.trim());

  // Drop all remaining templates entirely.
  // Repeat to handle nesting one level deep.
  for (let i = 0; i < 3; i++) {
    out = out.replace(/\{\{[^{}]*\}\}/g, '');
  }

  // Wiki links.
  out = out.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Bold/italic.
  out = out.replace(/'''([^']+)'''/g, '$1');
  out = out.replace(/''([^']+)''/g, '$1');

  // Parenthetical scope notes.
  out = out.replace(/\s*\([^()]*\)\s*/g, ' ');

  // Collapse whitespace.
  out = out.replace(/\s+/g, ' ').trim();

  // Strip trailing punctuation that's not part of the gloss.
  out = out.replace(/[.,;:]+$/, '').trim();

  return out;
}

/**
 * Compress a cleaned definition into a ≤3-word gloss.
 *
 * Strategy: split on commas / semicolons / " or " (alternative readings
 * Wiktionary uses), take the first chunk, then cap at 3 words. A leading
 * "to " on verbs is preserved — it makes verb glosses read naturally.
 */
export function compressToGloss(cleaned: string): string | null {
  if (!cleaned) return null;
  // Take first alternative.
  const firstAlt = cleaned
    .split(/[,;]|(?:\s+or\s+)/i)[0]
    ?.trim();
  if (!firstAlt) return null;
  const words = firstAlt.split(/\s+/);
  if (words.length <= 3) return firstAlt;
  return words.slice(0, 3).join(' ');
}

/**
 * Full pipeline on a single wikitext page: section → POS → first def →
 * clean → compress. Returns null on any miss. Tries UPOS-mapped headers
 * first, then falls back to any POS header (for cases where UDPipe and
 * Wiktionary disagree on category).
 */
export function parseRomanianGloss(
  wikitext: string,
  upos: UPos,
): { gloss: string | null; raw: string | null } {
  const ro = extractRomanianSection(wikitext);
  if (!ro) return { gloss: null, raw: null };

  const headers = POS_HEADERS[upos] ?? [];
  // Try UPOS-aligned headers first, then fall back to any known POS.
  const tryHeaders = [...headers, ...ALL_POS_HEADERS.filter((h) => !headers.includes(h))];
  let posBody: string | null = null;
  for (const header of tryHeaders) {
    posBody = findPosSection(ro, [header]);
    if (posBody) break;
  }
  if (!posBody) return { gloss: null, raw: null };

  const raw = firstDefinition(posBody);
  if (!raw) return { gloss: null, raw: null };

  const cleaned = cleanWikiMarkup(raw);
  const gloss = compressToGloss(cleaned);
  return { gloss, raw };
}

// ── Network layer ─────────────────────────────────────────────────────

interface MediaWikiQueryResponse {
  query?: {
    pages: Array<{
      title: string;
      missing?: boolean;
      revisions?: Array<{
        slots: { main: { content: string } };
      }>;
    }>;
  };
}

/**
 * Fetch wikitext for up to 50 titles in one MediaWiki call. Missing pages
 * come back as `null`. Network errors are thrown — callers decide whether
 * a single failed batch should abort ingestion or fall through to cache.
 */
async function fetchWikitextBatch(
  titles: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string | null>> {
  if (titles.length === 0) return new Map();
  if (titles.length > BATCH_SIZE) {
    throw new Error(`fetchWikitextBatch: batch size ${titles.length} > ${BATCH_SIZE}`);
  }
  const params = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
    formatversion: '2',
  });
  const res = await fetchImpl(`${API_URL}?${params}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Wiktionary API ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as MediaWikiQueryResponse;
  const out = new Map<string, string | null>();
  for (const t of titles) out.set(t, null);
  for (const page of json.query?.pages ?? []) {
    if (page.missing || !page.revisions || page.revisions.length === 0) {
      out.set(page.title, null);
      continue;
    }
    out.set(page.title, page.revisions[0]!.slots.main.content);
  }
  return out;
}

export interface FetchGlossesOpts {
  /** Override the fetch implementation (for testing). */
  fetchImpl?: typeof fetch;
  /** Inter-batch delay in ms. Default 200ms. */
  delayMs?: number;
  /** Per-lemma callback for progress reporting. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Resolve glosses for an array of lemma+UPos pairs by batched Wiktionary
 * lookup. Deduplicates internally; the returned Map is keyed by lemma.
 *
 * Pairs with the same lemma but different UPos resolve once — the first
 * UPos encountered wins. This is a pragmatic choice: Wiktionary entries
 * almost always have a single "best" POS subsection for a given lemma,
 * and the UPOS fallback in `parseRomanianGloss` catches mismatches.
 */
export async function fetchGlossesBatch(
  lookups: GlossLookup[],
  opts: FetchGlossesOpts = {},
): Promise<Map<string, GlossResult>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const delayMs = opts.delayMs ?? REQUEST_DELAY_MS;
  const onProgress = opts.onProgress;

  // Dedup by lemma; first POS wins.
  const byLemma = new Map<string, UPos>();
  for (const { lemma, upos } of lookups) {
    if (!lemma) continue;
    if (!byLemma.has(lemma)) byLemma.set(lemma, upos);
  }
  const lemmas = Array.from(byLemma.keys());
  const results = new Map<string, GlossResult>();
  let done = 0;

  for (let i = 0; i < lemmas.length; i += BATCH_SIZE) {
    const chunk = lemmas.slice(i, i + BATCH_SIZE);
    const wikitexts = await fetchWikitextBatch(chunk, fetchImpl);
    for (const lemma of chunk) {
      const wikitext = wikitexts.get(lemma);
      if (!wikitext) {
        results.set(lemma, { lemma, gloss: null, raw: null });
      } else {
        const { gloss, raw } = parseRomanianGloss(wikitext, byLemma.get(lemma)!);
        results.set(lemma, { lemma, gloss, raw });
      }
      done++;
      onProgress?.(done, lemmas.length);
    }
    if (i + BATCH_SIZE < lemmas.length && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── helpers ───────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
