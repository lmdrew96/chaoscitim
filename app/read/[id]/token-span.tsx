'use client';

import { useState } from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';
import { TokenWord, PILL_COLORS, type Tier } from './token-word';
import { shouldPrependSpace } from './spacing';
import { useLogEvent } from './session-context';

/**
 * Renders a contiguous run of tokens that belong to a single MWE span.
 * Owns shared tier state: tapping any word in the span escalates the
 * WHOLE span. Per-token tier-1/tier-2 pills still show individually
 * (they remain accurate); the tier-3 pill is replaced by ONE span-level
 * gloss appended after the last word.
 *
 * Hover anywhere in the span shows the MWE gloss in a peek overlay.
 * Right-click jumps directly to tier 3.
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
  const [hovered, setHovered] = useState(false);
  const logEvent = useLogEvent();

  // Log a tap for each component token in the span so the materializer
  // sees coverage across the whole MWE, not just the one the user struck.
  const emitSpanTap = (tierReached: Tier) => {
    if (tierReached === 0) return;
    for (const token of tokens) {
      if (token.upos === 'PUNCT') continue;
      logEvent({
        type: 'tap',
        textId: token.textId,
        sentenceId: token.sentenceId,
        tokenPosition: token.tokenPosition,
        payload: { tier_reached: tierReached, mwe: true },
      });
    }
  };

  const escalate = () => {
    setTier((t) => {
      const next = ((t + 1) % 4) as Tier;
      emitSpanTap(next);
      return next;
    });
  };
  const jumpToTier3 = (e: React.MouseEvent) => {
    e.preventDefault();
    setTier(3);
    emitSpanTap(3);
  };

  const showPeek = hovered && tier === 0;

  return (
    <span
      className="relative rounded bg-tier-3/[0.12] px-1 py-0.5 outline outline-1 outline-tier-3/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={jumpToTier3}
    >
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

      {showPeek ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.7rem] text-background opacity-90 shadow-sm"
          aria-hidden="true"
        >
          {mwe.gloss}
        </span>
      ) : null}

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
