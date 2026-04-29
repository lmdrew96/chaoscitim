'use client';

import { useState } from 'react';
import type { TextToken } from '@/db/schema';
import { formatTier1, formatTier2 } from '@/lib/glosses';

type Tier = 0 | 1 | 2 | 3;

const TIER_COLORS: Record<Tier, string> = {
  0: '',
  1: 'underline decoration-tier-1 decoration-2 underline-offset-4',
  2: 'underline decoration-tier-2 decoration-2 underline-offset-4',
  3: 'underline decoration-tier-3 decoration-2 underline-offset-4',
};

const PILL_COLORS: Record<Exclude<Tier, 0>, string> = {
  1: 'bg-tier-1/15 text-tier-1',
  2: 'bg-tier-2/15 text-tier-2',
  3: 'bg-tier-3/20 text-tier-3',
};

export function TokenWord({
  token,
  head,
}: {
  token: TextToken;
  head: TextToken | null;
}) {
  const [tier, setTier] = useState<Tier>(0);

  const escalate = () => {
    setTier((t) => (t < 3 ? ((t + 1) as Tier) : t));
  };

  // Tier 1 — morphology label. Some tokens (e.g., conjunctions) have no
  // useful morphology; those get a graceful "—".
  const tier1Label = formatTier1(token.upos, token.features ?? null);

  // Tier 2 — grammatical role. For verbs as roots, head is null and we
  // say "main verb"; otherwise "{role} of {head-lemma}".
  // Use the head's lemma when head is a verb (reads naturally with "of");
  // surface form otherwise.
  const headLabel =
    head && (head.upos === 'VERB' || head.upos === 'AUX')
      ? head.lemma
      : (head?.surfaceForm ?? null);
  const tier2Label = formatTier2(token.deprel, headLabel);

  // Tier 3 — gloss + lemma. gloss_en is null until the gloss-source patch
  // lands; for now show lemma only.
  const tier3Label = token.glossEn ? `${token.glossEn} · ${token.lemma}` : token.lemma;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={escalate}
        aria-label={`${token.surfaceForm} (current tier ${tier})`}
        className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-foreground/[0.06] ${TIER_COLORS[tier]}`}
      >
        {token.surfaceForm}
      </button>

      {tier > 0 ? (
        <span className="ml-1 inline-flex flex-wrap items-baseline gap-1 align-baseline">
          {tier >= 1 && tier1Label ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[1]}`}
            >
              {tier1Label}
            </span>
          ) : null}
          {tier >= 2 ? (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[0.7rem] ${PILL_COLORS[2]}`}
            >
              {renderEmphasis(tier2Label)}
            </span>
          ) : null}
          {tier >= 3 ? (
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
