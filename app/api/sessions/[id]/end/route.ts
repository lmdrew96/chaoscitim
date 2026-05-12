/**
 * POST /api/sessions/:id/end — mark a reading session as closed.
 *
 * Body: { endReason, endedAt }
 *
 * Idempotent: if the session is already ended, returns the existing
 * endedAt rather than overwriting. token_encounters materialization runs
 * in a later patch; this endpoint just stamps the closure.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { readingSessions } from '@/db/schema';

const Body = z.object({
  endReason: z.enum(['explicit', 'idle_sweeper', 'tab_closed']),
  endedAt: z.string().datetime(),
});

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
    return NextResponse.json(
      { endedAt: session.endedAt.toISOString(), endReason: session.endReason },
      { status: 200 },
    );
  }

  const endedAt = new Date(parsed.data.endedAt);
  await db
    .update(readingSessions)
    .set({ endedAt, endReason: parsed.data.endReason })
    .where(eq(readingSessions.id, sessionId));

  return NextResponse.json(
    { endedAt: endedAt.toISOString(), endReason: parsed.data.endReason },
    { status: 200 },
  );
}
