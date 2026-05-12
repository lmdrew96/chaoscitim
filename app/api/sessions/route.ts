/**
 * POST /api/sessions — start a reading session.
 *
 * Body: { sessionId, textId, initialMode, startedAt }
 *
 * The client supplies sessionId (UUIDv7) so events created before the
 * session row reaches the server can still reference it by id once the
 * offline-sync patch lands. For now we're online-only, but the contract
 * is set.
 *
 * Idempotent on sessionId: a duplicate POST with the same id returns the
 * existing row instead of erroring. Lets the client safely retry.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { readingSessions, texts } from '@/db/schema';

const Body = z.object({
  sessionId: z.string().uuid(),
  textId: z.string().uuid(),
  initialMode: z.enum(['active', 'assisted', 'show_all', 'practice']),
  startedAt: z.string().datetime(),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { sessionId, textId, initialMode, startedAt } = parsed.data;

  const db = getDb();

  // Confirm the text exists. We don't gate on visibility here — public
  // seeds are readable by anyone signed in; private BYO texts are owner-only.
  const [text] = await db
    .select({ id: texts.id })
    .from(texts)
    .where(
      and(
        eq(texts.id, textId),
        isNull(texts.deletedAt),
        or(eq(texts.visibility, 'public_seed'), eq(texts.ownerId, userId)),
      ),
    );
  if (!text) {
    return NextResponse.json({ error: 'text_not_found' }, { status: 404 });
  }

  // Idempotent insert. If a row already exists for this sessionId and
  // belongs to the same user, return it; otherwise it's a conflict.
  const [existing] = await db
    .select()
    .from(readingSessions)
    .where(eq(readingSessions.id, sessionId));
  if (existing) {
    if (existing.userId !== userId) {
      return NextResponse.json({ error: 'session_conflict' }, { status: 409 });
    }
    return NextResponse.json({ sessionId: existing.id }, { status: 200 });
  }

  const startedAtDate = new Date(startedAt);
  await db.insert(readingSessions).values({
    id: sessionId,
    userId,
    textId,
    initialMode,
    startedAt: startedAtDate,
    lastEventAt: startedAtDate,
  });

  return NextResponse.json({ sessionId }, { status: 201 });
}
