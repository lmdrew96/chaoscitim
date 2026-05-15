'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { formatTier1, formatTier2 } from '@/lib/glosses';
import { useCardContext } from './card-context';
import { useSessionContext } from './session-context';

const CARD_W = 320;
const CARD_H_EST = 148;
const MARGIN = 8;
const MOBILE_BREAKPOINT = 640;

function computeStyle(
  anchor: { top: number; left: number; width: number; bottom: number; right: number },
): React.CSSProperties {
  if (typeof window === 'undefined') return {};

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw < MOBILE_BREAKPOINT) {
    return { position: 'fixed', bottom: 0, left: 0, right: 0, top: 'auto' };
  }

  const spaceBelow = vh - anchor.bottom - MARGIN;
  const useAbove = spaceBelow < CARD_H_EST;
  const top = useAbove
    ? anchor.top - CARD_H_EST - MARGIN
    : anchor.bottom + MARGIN;

  const idealLeft = anchor.left + anchor.width / 2 - CARD_W / 2;
  const left = Math.max(MARGIN, Math.min(idealLeft, vw - CARD_W - MARGIN));

  return { position: 'fixed', top, left, width: CARD_W };
}

export function GlossCard() {
  const { activeCard, closeCard } = useCardContext();
  const { logEvent } = useSessionContext();
  const [tier3Open, setTier3Open] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Reset tier3 state when a different card opens.
  useEffect(() => {
    setTier3Open(false);
  }, [activeCard?.tokenId]);

  const expandTier3 = useCallback(() => {
    if (!activeCard || tier3Open) return;
    setTier3Open(true);
    logEvent({
      type: 'tier3_expand',
      textId: activeCard.token.textId,
      sentenceId: activeCard.token.sentenceId,
      tokenPosition: activeCard.token.tokenPosition,
    });
  }, [activeCard, tier3Open, logEvent]);

  // Close on Escape.
  useEffect(() => {
    if (!activeCard) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCard();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [activeCard, closeCard]);

  // Close on outside click/touch.
  useEffect(() => {
    if (!activeCard) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element;
      if (
        cardRef.current?.contains(target) ||
        target.closest('[data-token-button]')
      ) {
        return;
      }
      closeCard();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [activeCard, closeCard]);

  if (!mounted || !activeCard) return null;

  const { token, head, mwe, mwtTokens } = activeCard;
  const isMwt = mwtTokens && mwtTokens.length > 1;

  const tier1Label = formatTier1(token.upos, token.features ?? null);
  const headLabel =
    head && (head.upos === 'VERB' || head.upos === 'AUX')
      ? head.lemma
      : (head?.surfaceForm ?? null);
  const tier2Label = formatTier2(token.deprel, headLabel);

  const contextGloss = token.glossEnContext ?? null;
  const staticGloss = token.glossEn ?? null;
  const displayGloss = contextGloss ?? staticGloss;

  const tier3Available = !isMwt && (displayGloss || mwe);

  const cardStyle = computeStyle(activeCard.anchor);

  const isMobile =
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;

  // Joined surface form for MWT header
  const headerForm = isMwt
    ? mwtTokens!.map((t) => t.surfaceForm).join('')
    : token.surfaceForm;

  return createPortal(
    <div
      ref={cardRef}
      data-gloss-card
      style={{ ...cardStyle, boxShadow: 'var(--shadow-card), 0 8px 24px rgba(0,0,0,0.12)' }}
      className={`z-50 ring-1 ring-foreground/10 ${
        isMobile
          ? 'rounded-t-3xl bg-background px-4 pb-6 pt-4'
          : 'rounded-3xl bg-background px-4 py-4'
      }`}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="font-serif text-lg font-semibold leading-tight">
          {headerForm}
        </span>
        <button
          type="button"
          onClick={closeCard}
          aria-label="Close gloss card"
          className="mt-0.5 shrink-0 rounded p-0.5 text-foreground/40 hover:text-foreground/70"
        >
          ✕
        </button>
      </div>

      {/* MWT: stacked morphology + optional tier-3 per component */}
      {isMwt ? (
        <>
          <div className="space-y-2">
            {mwtTokens!.map((tok) => {
              const t1 = formatTier1(tok.upos, tok.features ?? null);
              return (
                <div key={tok.tokenPosition} className="flex items-baseline gap-2">
                  <span className="w-14 shrink-0 font-serif text-sm text-foreground/60">
                    {tok.surfaceForm}
                  </span>
                  {t1 ? (
                    <span className="font-mono text-xs text-tier-1">{t1}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {mwtTokens!.some((t) => t.glossEnContext || t.glossEn) ? (
            <div className="mt-3 border-t border-foreground/10 pt-3">
              {!tier3Open ? (
                <button
                  type="button"
                  onClick={expandTier3}
                  className="flex w-full items-center gap-1.5 text-left font-mono text-xs text-foreground/50 hover:text-foreground/80"
                >
                  <span className="text-[0.65rem]">▶</span>
                  <span>show English gloss</span>
                </button>
              ) : (
                <div className="space-y-1.5">
                  {mwtTokens!.map((tok) => {
                    const g = tok.glossEnContext ?? tok.glossEn;
                    if (!g) return null;
                    return (
                      <div key={tok.tokenPosition} className="flex items-baseline gap-2">
                        <span className="w-14 shrink-0 font-serif text-sm text-foreground/60">
                          {tok.surfaceForm}
                        </span>
                        <span className="font-mono text-xs text-tier-3">
                          {tok.glossEnContext ? `"${tok.glossEnContext}"` : g}
                          {' · '}
                          <span className="opacity-70">{tok.lemma}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Tier 1 — morphology */}
          {tier1Label ? (
            <p className="mb-1 font-mono text-xs text-tier-1">{tier1Label}</p>
          ) : null}

          {/* Tier 2 — syntactic role */}
          {tier2Label ? (
            <p className="mb-1 font-mono text-xs text-tier-2">
              {renderEmphasis(tier2Label)}
            </p>
          ) : null}

          {/* Tier 3 — AI gloss, collapsible */}
          {tier3Available ? (
            <div className="mt-3 border-t border-foreground/10 pt-3">
              {!tier3Open ? (
                <button
                  type="button"
                  onClick={expandTier3}
                  className="flex w-full items-center gap-1.5 text-left font-mono text-xs text-foreground/50 hover:text-foreground/80"
                >
                  <span className="text-[0.65rem]">▶</span>
                  <span>show English gloss</span>
                </button>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {displayGloss ? (
                    <span className="font-mono text-xs text-tier-3">
                      {contextGloss ? `"${contextGloss}"` : displayGloss}
                      {' · '}
                      <span className="opacity-70">{token.lemma}</span>
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-foreground/50">
                      {token.lemma}
                    </span>
                  )}

                  {mwe ? (
                    <span className="font-mono text-xs text-tier-3 opacity-80">
                      {mwe.gloss}
                      {' · '}
                      <span className="opacity-70">{mwe.lemmas.join(' ')}</span>
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}

      {/* Mobile drag handle hint */}
      {isMobile ? (
        <div className="absolute left-1/2 top-2 h-1 w-8 -translate-x-1/2 rounded-full bg-foreground/20" />
      ) : null}
    </div>,
    document.body,
  );
}

function renderEmphasis(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*') ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
