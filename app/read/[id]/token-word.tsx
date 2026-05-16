'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';
import { formatTier1 } from '@/lib/glosses';
import { useCardContext } from './card-context';
import { useSessionContext } from './session-context';

const HOVER_DELAY_MS = 300;

interface TokenWordProps {
  token: TextToken;
  head: TextToken | null;
  mwe?: Pick<MWE, 'gloss' | 'lemmas'> | null;
}

export function TokenWord({ token, head, mwe = null }: TokenWordProps) {
  const { activeCard, lookedUp, openCard, closeCard } = useCardContext();
  const { logEvent, mode } = useSessionContext();

  const tokenId = `${token.sentenceId}:${token.tokenPosition}`;
  const isActive = activeCard?.tokenId === tokenId;
  const wasLookedUp = lookedUp.has(tokenId);

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tier1Label = formatTier1(token.upos, token.features ?? null);

  // Truncate at first comma — gloss fields often list alternatives ("were living, used to live in")
  // and the first is the most direct. Keeps inline columns narrow and scannable.
  const shortGloss = token.glossEnContext
    ? (token.glossEnContext.split(',')[0]?.trim() ?? token.glossEnContext)
    : null;

  const handleMouseEnter = useCallback(() => {
    if (!tier1Label) return;
    hoverTimerRef.current = setTimeout(() => {
      setTooltipVisible(true);
      logEvent({
        type: 'hover',
        textId: token.textId,
        sentenceId: token.sentenceId,
        tokenPosition: token.tokenPosition,
      });
    }, HOVER_DELAY_MS);
  }, [tier1Label, logEvent, token]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setTooltipVisible(false);
  }, []);

  // Clear timer on unmount.
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

    const el = document.querySelector(`[data-token-id="${tokenId}"]`);
    const rect = el?.getBoundingClientRect();
    if (!rect) return;

    openCard({
      tokenId,
      token,
      head,
      mwe,
      anchor: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
      },
    });

    logEvent({
      type: 'card_open',
      textId: token.textId,
      sentenceId: token.sentenceId,
      tokenPosition: token.tokenPosition,
    });
  }, [isActive, tokenId, token, head, mwe, openCard, closeCard, logEvent]);

  const showTooltip = tooltipVisible && !isActive && tier1Label;

  return (
    <span className={mode === 'show_all' ? 'relative inline-flex flex-col items-center align-top px-1' : 'relative inline-block'}>
      <button
        type="button"
        data-token-button
        data-token-id={tokenId}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        aria-expanded={isActive}
        aria-label={`${token.surfaceForm} — tap for gloss`}
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
        {token.surfaceForm}
      </button>

      {/* Tier-1 hover tooltip (desktop only — suppressed when card is open) */}
      {showTooltip ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.7rem] text-background opacity-90 shadow-sm"
          aria-hidden="true"
        >
          {tier1Label}
        </span>
      ) : null}

      {/* Inline gloss — show_all mode, in-flow so it adds to line height */}
      {mode === 'show_all' && shortGloss ? (
        <span
          className="whitespace-nowrap font-mono text-[0.6rem] text-tier-3 opacity-75"
          aria-hidden="true"
        >
          {shortGloss}
        </span>
      ) : null}
    </span>
  );
}
