'use client';

import { useState } from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';
import { TokenWord, PILL_COLORS, type Tier } from './token-word';
import { shouldPrependSpace } from './spacing';

/**
 * Renders a contiguous run of tokens that belong to a single MWE span.
 * Owns shared tier state: tapping any word in the span escalates the
 * WHOLE span. Per-token tier-1/tier-2 pills still show individually
 * (they remain accurate); the tier-3 pill is replaced by ONE span-level
 * gloss appended after the last word.
 */
export function TokenSpan({
  tokens,
  sentenceTokens,
  mwe,
}: {
  tokens: TextToken[];
  /** All tokens in the sentence — used to look up dep-tree heads. */
  sentenceTokens: TextToken[];
  mwe: MWE;
}) {
  const [tier, setTier] = useState<Tier>(0);
  const escalate = () => setTier((t) => (((t + 1) % 4) as Tier));

  return (
    <span className="rounded bg-tier-3/[0.04] px-0.5">
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
            ? sentenceTokens.find((t) => t.tokenPosition === token.headPosition)
            : null;

        return (
          <span key={token.tokenPosition}>
            {space}
            <TokenWord
              token={token}
              head={head ?? null}
              tier={tier}
              onEscalate={escalate}
              suppressTier3Pill
            />
          </span>
        );
      })}

      {tier >= 3 ? (
        <span
          className={`ml-1 inline-flex items-baseline rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[3]}`}
        >
          {mwe.gloss} · {mwe.lemmas.join(' ')}
        </span>
      ) : null}
    </span>
  );
}
