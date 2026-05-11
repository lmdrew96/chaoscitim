/**
 * Multi-word expression (MWE) matcher.
 *
 * Scans a sentence's token stream for occurrences of curated multi-word
 * idioms/phrases stored in `data/mwes.json`. Matching is on LEMMAS, not
 * surface forms — so a single entry like `["da", "seamă"]` catches all
 * inflected variants (*dă seama*, *dau seama*, *au dat seama*, etc.).
 *
 * Algorithm: greedy, longest-first. The table is pre-sorted so the longest
 * lemma sequences are tried before shorter ones, preventing a short
 * idiom from shadowing a longer one that contains it.
 *
 * Pure logic — no DB, no React. The reader UI calls `findMWEMatches`
 * per sentence and renders the resulting spans alongside per-token data.
 */

export interface MWE {
  /** Ordered sequence of lemmas to match against the sentence's tokens. */
  lemmas: string[];
  /** English gloss shown at tier 3 instead of per-token glosses. */
  gloss: string;
  /** Stylistic register tag, e.g. "neutral", "formal", "colloquial". */
  register?: string;
  /** Free-form note (e.g., literal translation) shown on long-press later. */
  notes?: string;
}

export interface MWEMatch {
  /** 1-indexed tokenPosition of the first matched token. */
  startPos: number;
  /** 1-indexed tokenPosition of the last matched token (inclusive). */
  endPos: number;
  mwe: MWE;
}

/** Minimal token shape the matcher needs. Avoids coupling to TextToken. */
export interface MatchableToken {
  tokenPosition: number;
  lemma: string;
  upos: string;
}

/**
 * Find all non-overlapping MWE matches in a sentence's token stream.
 * Tokens must be in reading order. Greedy longest-first: at each
 * position, the longest matching entry wins; matched positions are
 * skipped over so we never emit overlapping spans.
 */
export function findMWEMatches(
  tokens: MatchableToken[],
  table: MWE[],
): MWEMatch[] {
  // Filter out punctuation — MWEs don't span punctuation.
  const wordTokens = tokens.filter((t) => t.upos !== 'PUNCT');

  // Pre-sort by descending lemma-sequence length so longest-first is automatic.
  const sortedTable = [...table].sort((a, b) => b.lemmas.length - a.lemmas.length);

  const matches: MWEMatch[] = [];
  const consumed = new Set<number>(); // 1-indexed tokenPositions already inside a span

  for (let i = 0; i < wordTokens.length; i++) {
    const startTok = wordTokens[i];
    if (!startTok || consumed.has(startTok.tokenPosition)) continue;

    for (const entry of sortedTable) {
      if (entry.lemmas.length === 0) continue;
      if (i + entry.lemmas.length > wordTokens.length) continue;

      let allMatch = true;
      for (let k = 0; k < entry.lemmas.length; k++) {
        const tok = wordTokens[i + k];
        if (!tok || tok.lemma !== entry.lemmas[k] || consumed.has(tok.tokenPosition)) {
          allMatch = false;
          break;
        }
      }
      if (!allMatch) continue;

      const startPos = wordTokens[i]!.tokenPosition;
      const endPos = wordTokens[i + entry.lemmas.length - 1]!.tokenPosition;
      matches.push({ startPos, endPos, mwe: entry });
      for (let k = 0; k < entry.lemmas.length; k++) {
        consumed.add(wordTokens[i + k]!.tokenPosition);
      }
      break; // first (longest) match at this position wins
    }
  }

  return matches;
}

/**
 * Convenience: which MWE match (if any) contains a given tokenPosition?
 * O(matches) — fine at sentence size.
 */
export function findMatchAt(
  tokenPosition: number,
  matches: MWEMatch[],
): MWEMatch | null {
  for (const m of matches) {
    if (tokenPosition >= m.startPos && tokenPosition <= m.endPos) return m;
  }
  return null;
}

import mweData from '../data/mwes.json';

/** Load the curated MWE table from `data/mwes.json`. */
export function loadMWETable(): MWE[] {
  const raw = mweData as { entries?: unknown };
  if (!raw.entries || !Array.isArray(raw.entries)) return [];
  return raw.entries.filter(
    (e): e is MWE =>
      typeof e === 'object' &&
      e !== null &&
      Array.isArray((e as MWE).lemmas) &&
      typeof (e as MWE).gloss === 'string',
  );
}
