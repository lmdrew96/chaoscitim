import Link from 'next/link';
import { listTexts } from '@/lib/read';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const texts = await listTexts();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">ChaosCitim</h1>
      <p className="mt-1 text-sm opacity-70">
        Romanian-first reading companion. Tap a word to escalate from
        morphology → role → gloss.
      </p>

      <h2 className="mt-10 text-lg font-medium">Library</h2>

      {texts.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-foreground/20 bg-foreground/[0.02] p-6 text-sm">
          No texts yet. Run{' '}
          <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
            pnpm ingest --file PATH --title &quot;…&quot; --license LICENSE --cefr LEVEL
          </code>{' '}
          to add one.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-foreground/10">
          {texts.map((t) => (
            <li key={t.id}>
              <Link
                href={`/read/${t.id}`}
                className="flex items-baseline justify-between py-3 transition-colors hover:bg-foreground/[0.04]"
              >
                <span>
                  <span className="font-medium">{t.title}</span>
                  {t.author ? (
                    <span className="ml-2 text-sm opacity-70">— {t.author}</span>
                  ) : null}
                </span>
                <span className="font-mono text-xs opacity-60">
                  {t.cefrLevel} · {t.wordCount} words
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
