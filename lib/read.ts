/**
 * Server-side data layer for the reader page.
 *
 * Returns a fully-shaped reading payload — texts row, sentences in order,
 * tokens grouped by sentence — in a single round-trip. Designed to feed
 * a server component that hands the result to the client Reader.
 */

import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { texts, textSentences, textTokens } from '@/db/schema';
import type {
  Text,
  TextSentence,
  TextToken,
} from '@/db/schema';

export type ReadingPayload = {
  text: Text;
  sentences: SentenceWithTokens[];
};

export type SentenceWithTokens = TextSentence & {
  tokens: TextToken[];
};

export async function getReadingPayload(
  textId: string,
  viewerUserId: string | null,
): Promise<ReadingPayload | null> {
  const db = getDb();

  const [textRow] = await db
    .select()
    .from(texts)
    .where(
      and(
        eq(texts.id, textId),
        isNull(texts.deletedAt),
        readableBy(viewerUserId),
      ),
    );
  if (!textRow) return null;

  const sentenceRows = await db
    .select()
    .from(textSentences)
    .where(eq(textSentences.textId, textId))
    .orderBy(asc(textSentences.sentenceId));

  const tokenRows = await db
    .select()
    .from(textTokens)
    .where(eq(textTokens.textId, textId))
    .orderBy(asc(textTokens.sentenceId), asc(textTokens.tokenPosition));

  // Group tokens by sentenceId in a single pass.
  const tokensBySentence = new Map<number, TextToken[]>();
  for (const tok of tokenRows) {
    const list = tokensBySentence.get(tok.sentenceId);
    if (list) list.push(tok);
    else tokensBySentence.set(tok.sentenceId, [tok]);
  }

  const sentences = sentenceRows.map((s) => ({
    ...s,
    tokens: tokensBySentence.get(s.sentenceId) ?? [],
  }));

  return { text: textRow, sentences };
}

export async function listTexts(viewerUserId: string | null): Promise<Text[]> {
  const db = getDb();
  return db
    .select()
    .from(texts)
    .where(and(isNull(texts.deletedAt), readableBy(viewerUserId)))
    .orderBy(asc(texts.createdAt));
}

function readableBy(viewerUserId: string | null) {
  return viewerUserId
    ? or(eq(texts.visibility, 'public_seed'), eq(texts.ownerId, viewerUserId))
    : eq(texts.visibility, 'public_seed');
}
