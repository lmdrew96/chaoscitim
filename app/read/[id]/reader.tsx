'use client';

import { useMemo, useState } from 'react';
import type { ReadingPayload } from '@/lib/read';
import type { TextToken } from '@/db/schema';
import type { SessionMode } from '@/db/types';
import { findMWEMatches, loadMWETable, type MWEMatch } from '@/lib/mwe';
import { useReadingSession } from '@/lib/session';
import { TokenWord } from './token-word';
import { TokenSpan } from './token-span';
import { TokenMwt } from './token-mwt';
import { shouldPrependSpace, groupMwtTokens } from './spacing';
import { SessionContextProvider } from './session-context';
import { CardContextProvider } from './card-context';
import { GlossCard } from './gloss-card';

export function Reader({ payload }: { payload: ReadingPayload }) {
  const mweTable = useMemo(() => loadMWETable(), []);
  const [mode, setMode] = useState<SessionMode>('active');

  const { logEvent } = useReadingSession({
    textId: payload.text.id,
    initialMode: mode,
  });

  const handleSetMode = (next: SessionMode) => {
    if (next === mode) return;
    logEvent({ type: 'mode_change', payload: { from: mode, to: next } });
    setMode(next);
  };

  return (
    <SessionContextProvider value={{ logEvent, mode, setMode: handleSetMode }}>
      <CardContextProvider>
        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={() => handleSetMode(mode === 'show_all' ? 'active' : 'show_all')}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              mode === 'show_all'
                ? 'bg-tier-3/20 text-tier-3'
                : 'bg-foreground/[0.06] text-foreground/50 hover:bg-foreground/10'
            }`}
          >
            {mode === 'show_all' ? 'glosses on' : 'glosses off'}
          </button>
        </div>

        <article
          className="reading-prose mt-4"
        >
          {payload.sentences.map((sentence) => (
            <SentenceP
              key={sentence.sentenceId}
              tokens={sentence.tokens}
              mweTable={mweTable}
            />
          ))}
        </article>

        <GlossCard />
      </CardContextProvider>
    </SessionContextProvider>
  );
}

function SentenceP({
  tokens,
  mweTable,
}: {
  tokens: TextToken[];
  mweTable: ReturnType<typeof loadMWETable>;
}) {
  const matches = useMemo(
    () => findMWEMatches(tokens, mweTable),
    [tokens, mweTable],
  );

  const spanStartByPos = new Map<number, MWEMatch>();
  for (const m of matches) spanStartByPos.set(m.startPos, m);

  const groups = useMemo(() => groupMwtTokens(tokens), [tokens]);

  const chunks: React.ReactNode[] = [];
  let prevToken: TextToken | null = null;
  const consumed = new Set<number>(); // token positions absorbed by an MWE span

  for (const group of groups) {
    const leadTok = group.isMwt ? group.tokens[0]! : group.token;

    if (consumed.has(leadTok.tokenPosition)) continue;

    const space = prevToken && shouldPrependSpace(prevToken, leadTok) ? ' ' : '';
    const span = spanStartByPos.get(leadTok.tokenPosition);

    if (span) {
      const endIdx = tokens.findIndex((t) => t.tokenPosition === span.endPos);
      const startIdx = tokens.indexOf(leadTok);
      const spanTokens = tokens.slice(startIdx, endIdx + 1);
      for (const t of spanTokens) consumed.add(t.tokenPosition);
      chunks.push(
        <span key={`s-${leadTok.tokenPosition}`}>
          {space}
          <TokenSpan tokens={spanTokens} sentenceTokens={tokens} mwe={span.mwe} />
        </span>,
      );
      prevToken = tokens[endIdx] ?? leadTok;
      continue;
    }

    if (group.isMwt) {
      chunks.push(
        <span key={`mwt-${leadTok.tokenPosition}`}>
          {space}
          <TokenMwt tokens={group.tokens} sentenceTokens={tokens} />
        </span>,
      );
      prevToken = group.tokens[group.tokens.length - 1]!;
      continue;
    }

    const tok = group.token;

    if (tok.upos === 'PUNCT') {
      chunks.push(
        <span key={tok.tokenPosition}>
          {space}
          {tok.surfaceForm}
        </span>,
      );
      prevToken = tok;
      continue;
    }

    const head =
      tok.headPosition && tok.headPosition > 0
        ? tokens.find((t) => t.tokenPosition === tok.headPosition)
        : null;

    chunks.push(
      <span key={tok.tokenPosition}>
        {space}
        <TokenWord token={tok} head={head ?? null} />
      </span>,
    );
    prevToken = tok;
  }

  return <p className="mb-6">{chunks}</p>;
}
