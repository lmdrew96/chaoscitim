import type { TextToken } from '@/db/schema';

// No-space-before set: punctuation that hugs the previous word.
const NO_LEADING_SPACE = new Set([
  ',', '.', ';', ':', '?', '!',
  ')', ']', '}',
  '»', '”', '’', '“', "'",
  '-',
]);

// No-space-after set: opening brackets/quotes.
const NO_TRAILING_SPACE = new Set([
  '(', '[', '{',
  '«', '“', '‘',
]);

export function shouldPrependSpace(prev: TextToken, curr: TextToken): boolean {
  const prevLast = prev.surfaceForm.slice(-1);
  const currFirst = curr.surfaceForm[0] ?? '';
  if (NO_LEADING_SPACE.has(currFirst)) return false;
  if (NO_TRAILING_SPACE.has(prevLast)) return false;
  // Clitic-hyphen attachment.
  if (prevLast === '-') return false;
  return true;
}

export type TokenGroup =
  | { isMwt: false; token: TextToken }
  | { isMwt: true; tokens: TextToken[] };

/**
 * Groups adjacent non-PUNCT tokens that are hyphen-joined contractions into
 * a single render unit. UDPipe 2 (Romanian) splits contractions like
 * "într-un" → ["într-", "un"] and "și-și" → ["Și", "-și"] without emitting
 * a CoNLL-U range row, so we detect them by surface form:
 *
 *   - prev token ends with "-"   → attach next (e.g. "într-" + "un")
 *   - curr token starts with "-" → attach to prev (e.g. "Și" + "-și")
 *
 * Chains (A- + -B + -C) are handled by extending the group while the
 * hyphen-join condition holds.
 */
export function groupMwtTokens(tokens: TextToken[]): TokenGroup[] {
  const result: TokenGroup[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;

    if (tok.upos !== 'PUNCT') {
      const next = tokens[i + 1];
      if (
        next &&
        next.upos !== 'PUNCT' &&
        (tok.surfaceForm.endsWith('-') || next.surfaceForm.startsWith('-'))
      ) {
        // Extend the group while the hyphen-join condition holds.
        const group: TextToken[] = [tok];
        while (true) {
          const last = group[group.length - 1]!;
          const nextTok = tokens[i + group.length];
          if (!nextTok || nextTok.upos === 'PUNCT') break;
          if (!last.surfaceForm.endsWith('-') && !nextTok.surfaceForm.startsWith('-')) break;
          group.push(nextTok);
        }
        if (group.length > 1) {
          result.push({ isMwt: true, tokens: group });
          i += group.length;
          continue;
        }
      }
    }

    result.push({ isMwt: false, token: tok });
    i++;
  }
  return result;
}
