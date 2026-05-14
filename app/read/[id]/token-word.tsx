'use client';

import { useState } from 'react';
import type { TextToken } from '@/db/schema';
import { formatTier1, formatTier2 } from '@/lib/glosses';
import { useLogEvent } from './session-context';

export type Tier = 0 | 1 | 2 | 3;

export const TIER_COLORS: Record<Tier, string> = {
  0: '',
  1: 'underline decoration-tier-1 decoration-2 underline-offset-4',
  2: 'underline decoration-tier-2 decoration-2 underline-offset-4',
  3: 'underline decoration-tier-3 decoration-2 underline-offset-4',
};

export const PILL_COLORS: Record<Exclude<Tier, 0>, string> = {
  1: 'bg-tier-1/15 text-tier-1',
  2: 'bg-tier-2/15 text-tier-2',
  3: 'bg-tier-3/20 text-tier-3',
};

interface TokenWordProps {
  token: TextToken;
  head: TextToken | null;
  /**
   * Controlled tier — when provided, the component's internal state is
   * bypassed. Used by TokenSpan to share tier state across an MWE span.
   */
  tier?: Tier;
  onEscalate?: () => void;
  /**
   * When true, suppress the per-token tier-3 pill. Set by TokenSpan so a
   * single span-level gloss is shown instead of one pill per token.
   */
  suppressTier3Pill?: boolean;
}

export function TokenWord({
  token,
  head,
  tier: controlledTier,
  onEscalate,
  suppressTier3Pill,
}: TokenWordProps) {
  const [uncontrolledTier, setUncontrolledTier] = useState<Tier>(0);
  const [hovered, setHovered] = useState(false);
  const isControlled = controlledTier !== undefined;
  const tier = isControlled ? controlledTier : uncontrolledTier;
  const logEvent = useLogEvent();

  const emitTap = (tierReached: Tier) => {
    // Tier 0 collapses aren't tier escalations — skip the event log.
    if (tierReached === 0) return;
    logEvent({
      type: 'tap',
      textId: token.textId,
      sentenceId: token.sentenceId,
      tokenPosition: token.tokenPosition,
      payload: { tier_reached: tierReached },
    });
  };

  const escalate = () => {
    if (isControlled) {
      onEscalate?.();
      return;
    }
    const next = ((uncontrolledTier + 1) % 4) as Tier;
    setUncontrolledTier(next);
    emitTap(next);
  };

  // Right-click jumps straight to tier 3 (English gloss). When controlled
  // (inside an MWE span), let the event bubble so the span's handler
  // jumps the whole span at once.
  const jumpToTier3 = (e: React.MouseEvent) => {
    if (isControlled) return;
    e.preventDefault();
    setUncontrolledTier(3);
    emitTap(3);
  };

  const tier1Label = formatTier1(token.upos, token.features ?? null);

  const headLabel =
    head && (head.upos === 'VERB' || head.upos === 'AUX')
      ? head.lemma
      : (head?.surfaceForm ?? null);
  const tier2Label = formatTier2(token.deprel, headLabel);

  const tier3Label = token.glossEn ? `${token.glossEn} · ${token.lemma}` : token.lemma;

  // Peek: lightweight hover overlay showing tier-1 info. Suppressed when
  // committed (tier > 0) since the same info is already visible inline,
  // and when controlled (TokenSpan handles span-level peeks).
  const showPeek = hovered && tier === 0 && !isControlled && tier1Label;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={escalate}
        onContextMenu={jumpToTier3}
        aria-label={`${token.surfaceForm} (current tier ${tier})`}
        className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-foreground/[0.06] ${TIER_COLORS[tier]}`}
      >
        {token.surfaceForm}
      </button>

      {showPeek ? (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-mono text-[0.7rem] text-background opacity-90 shadow-sm"
          aria-hidden="true"
        >
          {tier1Label}
        </span>
      ) : null}

      {tier > 0 ? (
        <span className="ml-1 inline-flex flex-wrap items-baseline gap-1 align-baseline">
          {tier >= 1 && tier1Label ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[1]}`}
            >
              {tier1Label}
            </span>
          ) : null}
          {tier >= 2 && tier2Label !== null ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[2]}`}
            >
              {renderEmphasis(tier2Label)}
            </span>
          ) : null}
          {tier >= 3 && !suppressTier3Pill ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[3]}`}
            >
              {tier3Label}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

// Tier 2 labels embed `*head*` markers for italics. Render those without
// dragging in a markdown library.
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
