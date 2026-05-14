import { and, eq, inArray, isNotNull, not, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  interactionEvents,
  readingSessions,
  textTokens,
  tokenEncounters,
  type NewTokenEncounter,
} from '@/db/schema';
import type { SessionMode } from '@/db/types';

// ────────────────────────────────────────────────────────────────────────
// Pure computation — testable without a database connection.
// ────────────────────────────────────────────────────────────────────────

export type TapInfo = {
  textId: string;
  sentenceId: number;
  tokenPosition: number;
  maxTier: number;
  firstTapAt: Date;
};

export type SentenceFirstEvent = {
  textId: string;
  sentenceId: number;
  firstEventAt: Date;
};

export type TokenInfo = {
  textId: string;
  sentenceId: number;
  tokenPosition: number;
};

/**
 * Build token_encounters rows from pre-fetched query results.
 * No DB I/O — all I/O lives in materializeEncounters below.
 * See docs/specs/comprehension-curve.md §Encounter materialization.
 */
export function buildEncounterRows({
  sessionId,
  userId,
  initialMode,
  taps,
  firstEvents,
  tokens,
  priorEncounterKeys,
}: {
  sessionId: string;
  userId: string;
  initialMode: SessionMode;
  taps: TapInfo[];
  firstEvents: SentenceFirstEvent[];
  tokens: TokenInfo[];
  priorEncounterKeys: Set<string>;
}): Omit<NewTokenEncounter, 'createdAt'>[] {
  const tapMap = new Map<string, TapInfo>();
  for (const t of taps) {
    tapMap.set(`${t.textId}:${t.sentenceId}:${t.tokenPosition}`, t);
  }

  const firstEventMap = new Map<string, Date>();
  for (const f of firstEvents) {
    firstEventMap.set(`${f.textId}:${f.sentenceId}`, f.firstEventAt);
  }

  // show_all and practice sessions are recorded but excluded from the curve.
  const baseCountedInCurve =
    initialMode !== 'show_all' && initialMode !== 'practice';

  return tokens.map((tok) => {
    const tapKey = `${tok.textId}:${tok.sentenceId}:${tok.tokenPosition}`;
    const sentKey = `${tok.textId}:${tok.sentenceId}`;
    const tapInfo = tapMap.get(tapKey);
    const maxTierReached = tapInfo?.maxTier ?? 0;
    const firstEventAt = firstEventMap.get(sentKey);

    // Re-reads: token already encountered in a prior completed session.
    const countedInCurve = baseCountedInCurve && !priorEncounterKeys.has(tapKey);

    // ms delta between sentence's first event and this token's first tap.
    // Null for tier-0 rows (no escalation timestamp to measure).
    let msSinceFirstEventInSentence: number | null = null;
    if (maxTierReached > 0 && tapInfo?.firstTapAt && firstEventAt) {
      msSinceFirstEventInSentence = Math.max(
        0,
        tapInfo.firstTapAt.getTime() - firstEventAt.getTime(),
      );
    }

    return {
      sessionId,
      textId: tok.textId,
      sentenceId: tok.sentenceId,
      tokenPosition: tok.tokenPosition,
      userId,
      maxTierReached,
      countedInCurve,
      msSinceFirstEventInSentence,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// DB-backed materializer
// ────────────────────────────────────────────────────────────────────────

/**
 * Materialize token_encounters for a completed reading session.
 * Idempotent: deletes any partial rows before rewriting so retry is safe.
 * Must only run after session.endedAt is non-null.
 */
export async function materializeEncounters(sessionId: string): Promise<void> {
  const db = getDb();

  const [session] = await db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.id, sessionId));

  if (!session?.endedAt || session.encountersMaterialized) return;

  // Delete any partial rows from a previous failed run.
  await db.delete(tokenEncounters).where(eq(tokenEncounters.sessionId, sessionId));

  // Step 1: identify visited sentences (token-attached events only).
  const visited = await db
    .selectDistinct({
      textId: interactionEvents.textId,
      sentenceId: interactionEvents.sentenceId,
    })
    .from(interactionEvents)
    .where(
      and(
        eq(interactionEvents.sessionId, sessionId),
        isNotNull(interactionEvents.textId),
        isNotNull(interactionEvents.sentenceId),
      ),
    );

  if (visited.length === 0) {
    await db
      .update(readingSessions)
      .set({ encountersMaterialized: true })
      .where(eq(readingSessions.id, sessionId));
    return;
  }

  // Step 2a: max tier + first tap timestamp per token.
  const tapRows = await db
    .select({
      textId: interactionEvents.textId,
      sentenceId: interactionEvents.sentenceId,
      tokenPosition: interactionEvents.tokenPosition,
      maxTier: sql<number>`MAX((${interactionEvents.payload}->>'tier_reached')::integer)`,
      firstTapAt: sql<string>`MIN(${interactionEvents.clientCreatedAt})`,
    })
    .from(interactionEvents)
    .where(
      and(
        eq(interactionEvents.sessionId, sessionId),
        eq(interactionEvents.type, 'tap'),
        isNotNull(interactionEvents.textId),
        isNotNull(interactionEvents.sentenceId),
        isNotNull(interactionEvents.tokenPosition),
      ),
    )
    .groupBy(
      interactionEvents.textId,
      interactionEvents.sentenceId,
      interactionEvents.tokenPosition,
    );

  const taps: TapInfo[] = tapRows
    .filter(
      (r): r is typeof r & { textId: string; sentenceId: number; tokenPosition: number } =>
        r.textId != null && r.sentenceId != null && r.tokenPosition != null,
    )
    .map((r) => ({
      textId: r.textId,
      sentenceId: r.sentenceId,
      tokenPosition: r.tokenPosition,
      maxTier: r.maxTier,
      firstTapAt: new Date(r.firstTapAt),
    }));

  // Step 2b: first event timestamp per visited sentence.
  const firstEventRows = await db
    .select({
      textId: interactionEvents.textId,
      sentenceId: interactionEvents.sentenceId,
      firstEventAt: sql<string>`MIN(${interactionEvents.clientCreatedAt})`,
    })
    .from(interactionEvents)
    .where(
      and(
        eq(interactionEvents.sessionId, sessionId),
        isNotNull(interactionEvents.textId),
        isNotNull(interactionEvents.sentenceId),
      ),
    )
    .groupBy(interactionEvents.textId, interactionEvents.sentenceId);

  const firstEvents: SentenceFirstEvent[] = firstEventRows
    .filter(
      (r): r is typeof r & { textId: string; sentenceId: number } =>
        r.textId != null && r.sentenceId != null,
    )
    .map((r) => ({
      textId: r.textId,
      sentenceId: r.sentenceId,
      firstEventAt: new Date(r.firstEventAt),
    }));

  // Group visited sentences by textId for efficient token fetching.
  const visitedByText = new Map<string, number[]>();
  for (const v of visited) {
    if (!v.textId || v.sentenceId == null) continue;
    if (!visitedByText.has(v.textId)) visitedByText.set(v.textId, []);
    visitedByText.get(v.textId)!.push(v.sentenceId);
  }
  const textIds = [...visitedByText.keys()];

  // Re-read detection: tokens already encountered in prior completed sessions.
  const priorRows = await db
    .selectDistinct({
      textId: tokenEncounters.textId,
      sentenceId: tokenEncounters.sentenceId,
      tokenPosition: tokenEncounters.tokenPosition,
    })
    .from(tokenEncounters)
    .innerJoin(readingSessions, eq(tokenEncounters.sessionId, readingSessions.id))
    .where(
      and(
        eq(tokenEncounters.userId, session.userId),
        inArray(tokenEncounters.textId, textIds),
        isNotNull(readingSessions.endedAt),
        eq(readingSessions.encountersMaterialized, true),
        not(eq(tokenEncounters.sessionId, sessionId)),
      ),
    );

  const priorEncounterKeys = new Set(
    priorRows.map((r) => `${r.textId}:${r.sentenceId}:${r.tokenPosition}`),
  );

  // Step 3: all non-PUNCT word tokens in visited sentences.
  const allTokens: TokenInfo[] = [];
  for (const [textId, sentenceIds] of visitedByText.entries()) {
    const rows = await db
      .select({
        textId: textTokens.textId,
        sentenceId: textTokens.sentenceId,
        tokenPosition: textTokens.tokenPosition,
      })
      .from(textTokens)
      .where(
        and(
          eq(textTokens.textId, textId),
          inArray(textTokens.sentenceId, sentenceIds),
          not(eq(textTokens.upos, 'PUNCT')),
        ),
      );
    allTokens.push(...rows);
  }

  if (allTokens.length === 0) {
    await db
      .update(readingSessions)
      .set({ encountersMaterialized: true })
      .where(eq(readingSessions.id, sessionId));
    return;
  }

  const rows = buildEncounterRows({
    sessionId,
    userId: session.userId,
    initialMode: session.initialMode,
    taps,
    firstEvents,
    tokens: allTokens,
    priorEncounterKeys,
  });

  // Step 4: insert in batches to stay within DB limits.
  const BATCH = 1_000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(tokenEncounters).values(rows.slice(i, i + BATCH));
  }

  // Step 5: mark session materialized (idempotency guard for future retries).
  await db
    .update(readingSessions)
    .set({ encountersMaterialized: true })
    .where(eq(readingSessions.id, sessionId));
}
