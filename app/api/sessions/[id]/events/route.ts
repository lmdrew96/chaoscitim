/**
 * POST /api/sessions/:id/events — append a batch of interaction events.
 *
 * Body: { events: [{ id, type, textId?, sentenceId?, tokenPosition?,
 *                    payload?, clientCreatedAt }] }
 *
 * Trust contract (per db/schema.ts §interaction_events): events with
 * clientCreatedAt outside [session.startedAt - 5s, now + 5s] are rejected.
 * Idempotent on event.id via ON CONFLICT DO NOTHING, so retries are safe.
 * Also bumps reading_sessions.lastEventAt to the max clientCreatedAt in
 * the batch — feeds the idle-sweeper that closes silent sessions.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { interactionEvents, readingSessions } from '@/db/schema';

const EventInput = z.object({
  id: z.string().uuid(),
  type: z.enum(['tap', 'mode_change', 'practice_guess', 'ambiguity_override']),
  textId: z.string().uuid().nullish(),
  sentenceId: z.number().int().nullish(),
  tokenPosition: z.number().int().nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
  clientCreatedAt: z.string().datetime(),
});

const Body = z.object({
  events: z.array(EventInput).min(1).max(500),
});

const TRUST_WINDOW_MS = 5_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = getDb();

  const [session] = await db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.id, sessionId));
  if (!session) {
    return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  }
  if (session.userId !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: 'session_ended' }, { status: 409 });
  }

  const now = Date.now();
  const lowerBound = session.startedAt.getTime() - TRUST_WINDOW_MS;
  const upperBound = now + TRUST_WINDOW_MS;

  // Validate timestamps before constructing the insert rows.
  for (const e of parsed.data.events) {
    const t = new Date(e.clientCreatedAt).getTime();
    if (t < lowerBound || t > upperBound) {
      return NextResponse.json(
        { error: 'clientCreatedAt_out_of_window', eventId: e.id },
        { status: 400 },
      );
    }
  }

  const rows = parsed.data.events.map((e) => ({
    id: e.id,
    sessionId,
    userId,
    textId: e.textId ?? null,
    sentenceId: e.sentenceId ?? null,
    tokenPosition: e.tokenPosition ?? null,
    type: e.type,
    payload: e.payload ?? null,
    clientCreatedAt: new Date(e.clientCreatedAt),
  }));

  await db.insert(interactionEvents).values(rows).onConflictDoNothing({
    target: interactionEvents.id,
  });

  const maxClientTs = rows.reduce(
    (acc, r) => (r.clientCreatedAt > acc ? r.clientCreatedAt : acc),
    session.lastEventAt,
  );
  if (maxClientTs > session.lastEventAt) {
    await db
      .update(readingSessions)
      .set({ lastEventAt: maxClientTs })
      .where(eq(readingSessions.id, sessionId));
  }

  return NextResponse.json({ accepted: rows.length }, { status: 200 });
}
