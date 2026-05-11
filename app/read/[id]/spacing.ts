import type { TextToken } from '@/db/schema';

// No-space-before set: punctuation that hugs the previous word.
const NO_LEADING_SPACE = new Set([
  ',', '.', ';', ':', '?', '!',
  ')', ']', '}',
  '»', '”', '’', '"', "'",
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
