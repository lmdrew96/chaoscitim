import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { listTexts } from '@/lib/read';
import { IngestTextForm } from './ingest-text-form';

export const dynamic = 'force-dynamic';

function cefrTopStrip(level: string): string {
  if (level === 'A1' || level === 'A2') return 'bg-mint';
  if (level === 'B1' || level === 'B2') return 'bg-gold';
  return 'bg-purple';
}

function CefrBadge({ level }: { level: string }) {
  const cls =
    level === 'A1' || level === 'A2'
      ? 'bg-mint/20 text-mint'
      : level === 'B1' || level === 'B2'
        ? 'bg-gold/20 text-gold'
        : 'bg-purple/20 text-purple';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {level}
    </span>
  );
}

export default async function Home() {
  const { userId } = await auth();
  const texts = await listTexts(userId);

  return (
    <>
      {/* ── Full-bleed masthead ──────────────────────────────────── */}
      <header className="bg-accent px-6 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-6">

            {/* Brand + tagline */}
            <div>
              <h1 className="text-5xl font-semibold tracking-tight text-white">
                Chaos<span style={{ color: 'var(--gold)' }}>Citim</span>
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/65">
                Romanian reading companion with graduated morphological
                scaffolding — tap a word to reveal morphology, role, or gloss,
                one layer at a time.
              </p>

              {/* Tier chips */}
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: 'rgba(223,166,73,0.18)', color: 'var(--gold)' }}>
                  morfologie · fem sg, dativ
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: 'rgba(136,115,158,0.22)', color: '#c4b4d6' }}>
                  rol · complement indirect
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{ background: 'rgba(140,189,185,0.20)', color: 'var(--mint)' }}>
                  glosar · &ldquo;to give&rdquo; / a da
                </span>
              </div>
            </div>

            {/* Auth */}
            <div className="mt-1 flex shrink-0 flex-col items-end gap-2">
              <Show when="signed-in">
                <UserButton />
              </Show>
              <Show when="signed-out">
                <SignUpButton mode="modal">
                  <button className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-ink transition hover:opacity-90">
                    Sign up free
                  </button>
                </SignUpButton>
                <SignInButton mode="modal">
                  <button className="rounded-full border border-white/30 px-4 py-1.5 text-xs text-white/80 transition hover:bg-white/10">
                    Sign in
                  </button>
                </SignInButton>
              </Show>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="mx-auto max-w-3xl px-6 py-10">

        {/* Add a reading (signed in) */}
        <Show when="signed-in">
          <div className="mb-10 overflow-hidden rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
            <IngestTextForm />
          </div>
        </Show>

        {/* Signed-out nudge */}
        <Show when="signed-out">
          <div className="mb-10 rounded-2xl border border-accent/25 bg-accent/5 px-7 py-6">
            <p className="text-sm opacity-70">
              Sign in to paste text, import a URL, or upload a PDF/EPUB — and
              build a private library with scaffolded glossing.
            </p>
            <SignInButton mode="modal">
              <button className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition hover:opacity-90">
                Get started
              </button>
            </SignInButton>
          </div>
        </Show>

        {/* Library */}
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-medium">Library</h2>
          <div className="h-px flex-1 bg-foreground/10" />
          {texts.length > 0 && (
            <span className="rounded-full bg-foreground/8 px-2.5 py-0.5 text-xs opacity-50">
              {texts.length}
            </span>
          )}
        </div>

        {texts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-foreground/20 p-8 text-sm opacity-50 text-center">
            No texts yet. Signed-in users can add one using the form above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {texts.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/read/${t.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-foreground/10 transition hover:border-foreground/20 hover:shadow-[var(--shadow-card)]"
                >
                  {/* CEFR top strip */}
                  <div className={`h-1.5 flex-shrink-0 ${cefrTopStrip(t.cefrLevel)}`} />
                  <div className="flex flex-1 flex-col px-4 py-4">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug">{t.title}</span>
                      <CefrBadge level={t.cefrLevel} />
                    </div>
                    {t.author ? (
                      <span className="text-xs opacity-55">{t.author}</span>
                    ) : null}
                    <div className="mt-auto pt-3 font-mono text-xs opacity-40">
                      {t.wordCount} words
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
