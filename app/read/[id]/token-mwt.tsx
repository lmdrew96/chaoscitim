'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextToken } from '@/db/schema';
import { formatTier1 } from '@/lib/glosses';
import { useCardContext } from './card-context';
import { useSessionContext } from './session-context';

const HOVER_DELAY_MS = 300;

interface TokenMwtProps {
  tokens: TextToken[]; // MWT component tokens, in sentence order
  sentenceTokens: TextToken[];
}

export function TokenMwt({ tokens, sentenceTokens }: TokenMwtProps) {
  const { activeCard, lookedUp, openCard, closeCard } = useCardContext();
  const { logEvent, mode } = useSessionContext();

  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;

  // Concatenate component surface forms — UDPipe doesn't emit MWT range rows
  // for Romanian contractions, so the joined form must be reconstructed.
  const surfaceForm = tokens.map((t) => t.surfaceForm).join('');

  // Card id uses the first component's position (unique within sentence).
  const cardId = `${first.sentenceId}:${first.tokenPosition}`;
  const isActive = activeCard?.tokenId === cardId;
  const wasLookedUp = tokens.some((t) =>
    lookedUp.has(`${t.sentenceId}:${t.tokenPosition}`),
  );

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tier-1 tooltip shows each component's morphology joined by ·
  const combinedTier1 = tokens
    .map((t) => formatTier1(t.upos, t.features ?? null))
    .filter(Boolean)
    .join(' · ');

  const handleMouseEnter = useCallback(() => {
    if (!combinedTier1) return;
    hoverTimerRef.current = setTimeout(
      () => setTooltipVisible(true),
      HOVER_DELAY_MS,
    );
  }, [combinedTier1]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltipVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (isActive) {
      closeCard();
      return;
    }

    setTooltipVisible(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    const el = document.querySelector(`[data-token-id="${cardId}"]`);
    const rect = el?.getBoundingClientRect();
    if (!rect) return;

    const head =
      first.headPosition && first.headPosition > 0
        ? sentenceTokens.find((t) => t.tokenPosition === first.headPosition) ?? null
        : null;

    openCard({
      tokenId: cardId,
      token: first,
      head,
      mwe: null,
      mwtTokens: tokens,
      anchor: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      },
    });

    // Log card_open for every component so the comprehension curve counts both.
    for (const tok of tokens) {
      logEvent({
        type: 'card_open',
        textId: tok.textId,
        sentenceId: tok.sentenceId,
        tokenPosition: tok.tokenPosition,
      });
    }
  }, [isActive, cardId, first, tokens, sentenceTokens, openCard, closeCard, logEvent]);

  return (
    <span
      className={
        mode === 'show_all'
          ? 'relative inline-flex flex-col items-center align-top px-1'
          : 'relative inline-block'
      }
    >
      <button
        type="button"
        data-token-button
        data-token-id={cardId}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-expanded={isActive}
        aria-label={`${surfaceForm} — tap for gloss`}
        className={[
          'cursor-pointer rounded px-0.5 transition-colors hover:bg-foreground/[0.06]',
          isActive
            ? 'underline decoration-tier-3 decoration-2 underline-offset-4'
            : wasLookedUp
              ? 'underline decoration-mint decoration-2 underline-offset-4'
              : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {surfaceForm}
      </button>

      {tooltipVisible && !isActive && combinedTier1 ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.7rem] text-background opacity-90 shadow-sm"
          aria-hidden="true"
        >
          {combinedTier1}
        </span>
      ) : null}
    </span>
  );
}
