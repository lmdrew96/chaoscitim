'use client';

import { useMemo } from 'react';
import type { ReadingPayload } from '@/lib/read';
import type { TextToken } from '@/db/schema';
import { findMWEMatches, loadMWETable, type MWEMatch } from '@/lib/mwe';
import { useReadingSession } from '@/lib/session';
import { TokenWord } from './token-word';
import { TokenSpan } from './token-span';
import { shouldPrependSpace } from './spacing';
import { SessionContextProvider } from './session-context';

export function Reader({ payload }: { payload: ReadingPayload }) {
  // MWE table is static — load once per render.
  const mweTable = useMemo(() => loadMWETable(), []);

  // Mode picker isn't built yet; everyone starts in 'active'. The
  // mode-change event will flow through logEvent once the picker lands.
  const { logEvent } = useReadingSession({
    textId: payload.text.id,
    initialMode: 'active',
  });

  return (
    <SessionContextProvider value={logEvent}>
      <article className="reading-prose mt-6">
        {payload.sentences.map((sentence) => (
          <SentenceP
            key={sentence.sentenceId}
            tokens={sentence.tokens}
            mweTable={mweTable}
          />
        ))}
      </article>
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

  const chunks: React.ReactNode[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    const span = spanStartByPos.get(tok.tokenPosition);
    const prev = i > 0 ? tokens[i - 1]! : null;
    const space = prev && shouldPrependSpace(prev, tok) ? ' ' : '';

    if (span) {
      // Find end index of the span in the sentence token array.
      const endIdx = tokens.findIndex((t) => t.tokenPosition === span.endPos);
      const spanTokens = tokens.slice(i, endIdx + 1);
      chunks.push(
        <span key={`s-${tok.tokenPosition}`}>
          {space}
          <TokenSpan tokens={spanTokens} sentenceTokens={tokens} mwe={span.mwe} />
        </span>,
      );
      i = endIdx + 1;
      continue;
    }

    if (tok.upos === 'PUNCT') {
      chunks.push(
        <span key={tok.tokenPosition}>
          {space}
          {tok.surfaceForm}
        </span>,
      );
      i++;
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
    i++;
  }

  return <p className="mb-6">{chunks}</p>;
}
