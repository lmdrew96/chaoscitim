'use client';

import { useState } from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';
import { TokenWord } from './token-word';
import { shouldPrependSpace } from './spacing';

/**
 * Renders a contiguous run of tokens belonging to a single MWE span.
 *
 * Visual grouping (background box) and a span-level hover tooltip showing
 * the MWE gloss are handled here. Each word inside is independently
 * clickable — tapping it opens the per-token gloss card, which includes
 * the MWE gloss in tier 3 alongside the word's own gloss.
 */
export function TokenSpan({
  tokens,
  sentenceTokens,
  mwe,
}: {
  tokens: TextToken[];
  sentenceTokens: TextToken[];
  mwe: MWE;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className="relative rounded bg-tier-3/[0.10] px-1 py-0.5 outline outline-1 outline-tier-3/25"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Span-level hover tooltip showing MWE gloss */}
      {hovered ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.7rem] text-background opacity-90 shadow-sm"
          aria-hidden="true"
        >
          {mwe.gloss}
        </span>
      ) : null}

      {tokens.map((token, idx) => {
        const prev = idx > 0 ? tokens[idx - 1]! : null;
        const space = prev && shouldPrependSpace(prev, token) ? ' ' : '';

        if (token.upos === 'PUNCT') {
          return (
            <span key={token.tokenPosition}>
              {space}
              {token.surfaceForm}
            </span>
          );
        }

        const head =
          token.headPosition && token.headPosition > 0
            ? sentenceTokens.find((t) => t.tokenPosition === token.headPosition) ?? null
            : null;

        return (
          <span key={token.tokenPosition}>
            {space}
            <TokenWord token={token} head={head} mwe={mwe} />
          </span>
        );
      })}
    </span>
  );
}
