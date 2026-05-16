import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getReadingPayload } from '@/lib/read';
import { Reader } from './reader';

export const dynamic = 'force-dynamic';

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await auth();
  const payload = await getReadingPayload(id, userId);
  if (!payload) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-baseline justify-between text-sm opacity-70">
        <Link href="/" className="hover:underline">
          ← Library
        </Link>
        <span className="font-mono text-xs">
          {payload.text.cefrLevel} · {payload.text.wordCount} words ·{' '}
          {payload.text.sentenceCount} sentences
        </span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">
        {payload.text.title}
      </h1>
      {payload.text.author ? (
        <p className="mt-1 text-sm opacity-70">{payload.text.author}</p>
      ) : null}

      <Reader payload={payload} />
    </main>
  );
}
