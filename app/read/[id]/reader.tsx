'use client';

import type { ReadingPayload } from '@/lib/read';
import { TokenWord } from './token-word';
import type { TextToken } from '@/db/schema';

// No-space-before set: punctuation that hugs the previous word (no leading
// space). Romanian-leaning. Closing brackets/quotes included.
const NO_LEADING_SPACE = new Set([
  ',', '.', ';', ':', '?', '!',
  ')', ']', '}',
  '»', '”', '’', '"', "'",
  '-',
]);

// No-space-after set: opening brackets/quotes (no trailing space inside).
const NO_TRAILING_SPACE = new Set([
  '(', '[', '{',
  '«', '“', '‘',
]);

function shouldPrependSpace(prev: TextToken, curr: TextToken): boolean {
  const prevLast = prev.surfaceForm.slice(-1);
  const currFirst = curr.surfaceForm[0] ?? '';
  if (NO_LEADING_SPACE.has(currFirst)) return false;
  if (NO_TRAILING_SPACE.has(prevLast)) return false;
  // If previous token ends with a hyphen (clitic-hyphen), no space.
  if (prevLast === '-') return false;
  return true;
}

export function Reader({ payload }: { payload: ReadingPayload }) {
  return (
    <article className="reading-prose mt-6">
      {payload.sentences.map((sentence) => (
        <p key={sentence.sentenceId} className="mb-6">
          {sentence.tokens.map((token, idx) => {
            const prev = idx > 0 ? sentence.tokens[idx - 1] : null;
            const space = prev && shouldPrependSpace(prev, token) ? ' ' : '';

            // Punctuation: render as plain text, no button.
            if (token.upos === 'PUNCT') {
              return (
                <span key={token.tokenPosition}>
                  {space}
                  {token.surfaceForm}
                </span>
              );
            }

            // Build sentence-token map for head lookup. Done per-token here
            // because the lookup is cheap at sentence size and avoids prop
            // drilling. Tokens are 1-indexed; head=0 means root.
            const head =
              token.headPosition && token.headPosition > 0
                ? sentence.tokens.find(
                    (t) => t.tokenPosition === token.headPosition,
                  )
                : null;

            return (
              <span key={token.tokenPosition}>
                {space}
                <TokenWord token={token} head={head ?? null} />
              </span>
            );
          })}
        </p>
      ))}
    </article>
  );
}
