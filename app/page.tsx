import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { listTexts } from '@/lib/read';
import { IngestTextForm } from './ingest-text-form';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { userId } = await auth();
  const texts = await listTexts(userId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">ChaosCitim</h1>
        <div className="flex items-center gap-3 text-sm">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-md border border-foreground/20 px-3 py-1.5 hover:bg-foreground/6">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md bg-foreground px-3 py-1.5 text-background hover:opacity-90">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>

      <p className="mt-1 text-sm opacity-70">
        Romanian-first reading companion. Paste text, import a URL, or upload a
        PDF/EPUB — then tap a word to escalate from morphology → role → gloss.
      </p>

      <Show when="signed-in">
        <IngestTextForm />
      </Show>

      <Show when="signed-out">
        <div className="mt-10 rounded-md border border-dashed border-foreground/20 bg-foreground/2 p-5 text-sm">
          Sign in to paste text or upload a PDF/EPUB and turn it into a private
          reader entry.
        </div>
      </Show>

      <h2 className="mt-10 text-lg font-medium">Library</h2>

      {texts.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-foreground/20 bg-foreground/2 p-6 text-sm">
          No texts yet. Signed-in users can paste a text above; seed-library
          ingestion is still available through the CLI.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-foreground/10">
          {texts.map((t) => (
            <li key={t.id}>
              <Link
                href={`/read/${t.id}`}
                className="flex items-baseline justify-between py-3 transition-colors hover:bg-foreground/4"
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
