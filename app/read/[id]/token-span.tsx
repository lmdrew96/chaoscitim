'use client';

import { useMemo, useState } from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';
import { TokenWord } from './token-word';
import { TokenMwt } from './token-mwt';
import { shouldPrependSpace, groupMwtTokens } from './spacing';

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
  const groups = useMemo(() => groupMwtTokens(tokens), [tokens]);

  const items: React.ReactNode[] = [];
  let prevToken: TextToken | null = null;

  for (const group of groups) {
    const leadTok = group.isMwt ? group.tokens[0]! : group.token;
    const space = prevToken && shouldPrependSpace(prevToken, leadTok) ? ' ' : '';

    if (group.isMwt) {
      items.push(
        <span key={group.tokens[0]!.tokenPosition}>
          {space}
          <TokenMwt tokens={group.tokens} sentenceTokens={sentenceTokens} />
        </span>,
      );
      prevToken = group.tokens[group.tokens.length - 1]!;
    } else if (group.token.upos === 'PUNCT') {
      items.push(
        <span key={group.token.tokenPosition}>
          {space}
          {group.token.surfaceForm}
        </span>,
      );
      prevToken = group.token;
    } else {
      const head =
        group.token.headPosition && group.token.headPosition > 0
          ? sentenceTokens.find((t) => t.tokenPosition === group.token.headPosition) ?? null
          : null;
      items.push(
        <span key={group.token.tokenPosition}>
          {space}
          <TokenWord token={group.token} head={head} mwe={mwe} />
        </span>,
      );
      prevToken = group.token;
    }
  }

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

      {items}
    </span>
  );
}
