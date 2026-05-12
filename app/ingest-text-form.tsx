'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ClipboardPaste, FileUp, Link2, Loader2, Sparkles } from 'lucide-react';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const MAX_CONTENT_CHARS = 20_000;

type Mode = 'paste' | 'url' | 'pdf' | 'epub';

interface ChapterResult {
  order: number;
  title: string;
  status: 'ingested' | 'skipped_short' | 'skipped_long' | 'failed';
  textId?: string;
  charCount?: number;
  error?: string;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'epub_done'; bookTitle: string; firstTextId: string; results: ChapterResult[] };

export function IngestTextForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('paste');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [cefrLevel, setCefrLevel] = useState<(typeof CEFR_LEVELS)[number]>('B1');
  const [rawContent, setRawContent] = useState('');
  const [url, setUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [state, setState] = useState<SubmitState>({ status: 'idle' });

  const remainingChars = MAX_CONTENT_CHARS - rawContent.length;
  const tags = useMemo(
    () =>
      tagInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8),
    [tagInput],
  );

  const onPasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setState({
          status: 'error',
          message: 'Clipboard is empty — copy some Romanian text first.',
        });
        return;
      }
      setRawContent(text.slice(0, MAX_CONTENT_CHARS));
      if (state.status === 'error') setState({ status: 'idle' });
    } catch {
      setState({
        status: 'error',
        message:
          'Clipboard read denied. Paste manually (Cmd+V) or allow clipboard access.',
      });
    }
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.status === 'submitting') return;

    setState({ status: 'submitting' });

    try {
      if (mode === 'epub') {
        if (!epubFile) {
          setState({ status: 'error', message: 'Choose an .epub file to upload.' });
          return;
        }
        const formData = new FormData();
        formData.append('file', epubFile);
        formData.append('cefrLevel', cefrLevel);
        formData.append('topicTags', tags.join(','));

        const res = await fetch('/api/texts/epub', {
          method: 'POST',
          body: formData,
        });
        const body = (await res.json()) as {
          bookTitle?: string;
          firstTextId?: string;
          textIds?: string[];
          results?: ChapterResult[];
          message?: string;
          error?: string;
        };

        if (!res.ok || !body.firstTextId) {
          setState({
            status: 'error',
            message:
              body.message ??
              'EPUB could not be ingested. Make sure it is a valid .epub file.',
          });
          return;
        }
        setState({
          status: 'epub_done',
          bookTitle: body.bookTitle ?? epubFile.name,
          firstTextId: body.firstTextId,
          results: body.results ?? [],
        });
        router.refresh();
        return;
      }

      if (mode === 'pdf') {
        if (!pdfFile) {
          setState({ status: 'error', message: 'Choose a .pdf file to upload.' });
          return;
        }
        const formData = new FormData();
        formData.append('file', pdfFile);
        formData.append('cefrLevel', cefrLevel);
        if (title.trim()) formData.append('title', title.trim());
        if (author.trim()) formData.append('author', author.trim());
        formData.append('topicTags', tags.join(','));

        const res = await fetch('/api/texts/pdf', {
          method: 'POST',
          body: formData,
        });
        const body = (await res.json()) as {
          textId?: string;
          message?: string;
          error?: string;
        };

        if (!res.ok || !body.textId) {
          setState({
            status: 'error',
            message:
              body.message ??
              'The PDF could not be ingested. Make sure it is a readable .pdf file.',
          });
          return;
        }

        router.push(`/read/${body.textId}`);
        router.refresh();
        return;
      }

      const payload =
        mode === 'paste'
          ? {
              mode,
              title,
              author: author || undefined,
              cefrLevel,
              rawContent,
              topicTags: tags,
            }
          : {
              mode,
              url,
              title: title || undefined,
              author: author || undefined,
              cefrLevel,
              topicTags: tags,
            };

      const res = await fetch('/api/texts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = (await res.json()) as {
        textId?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok || !body.textId) {
        setState({
          status: 'error',
          message:
            body.message ??
            'The text could not be analyzed. Shorten it or try again in a minute.',
        });
        return;
      }

      router.push(`/read/${body.textId}`);
      router.refresh();
    } catch (err) {
      setState({
        status: 'error',
        message: (err as Error).message,
      });
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mt-10 border-y border-foreground/15 py-7"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <BookOpen className="h-5 w-5 text-accent" aria-hidden="true" />
            Add a reading
          </h2>
          <p className="mt-1 text-sm opacity-70">
            Paste Romanian text or import by URL, PDF, or EPUB — ChaosCitim
            analyzes it into a private reader entry.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 px-2.5 py-1 text-xs text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          UDPipe
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Ingestion mode"
        className="mb-5 inline-flex rounded-md border border-foreground/15 p-1 text-sm"
      >
        {(['paste', 'url', 'pdf', 'epub'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 transition ${
              mode === m
                ? 'bg-accent text-white'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            {m === 'paste' ? (
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
            ) : m === 'url' ? (
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {m === 'paste'
              ? 'Paste'
              : m === 'url'
                ? 'URL'
                : m === 'pdf'
                  ? 'PDF'
                  : 'EPUB'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        {mode !== 'epub' ? (
          <label className="block">
            <span className="text-sm font-medium">
              Title{mode === 'url' || mode === 'pdf' ? ' (optional — auto-filled)' : ''}
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required={mode === 'paste'}
              maxLength={120}
              className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder={
                mode === 'paste'
                  ? 'Amintiri scurte'
                  : 'Leave blank to use the extracted title'
              }
            />
          </label>
        ) : (
          <div className="text-sm opacity-60">
            Title and author come from the EPUB's metadata. Each chapter is
            ingested as its own private reading.
          </div>
        )}

        <label className="block">
          <span className="text-sm font-medium">Level</span>
          <select
            value={cefrLevel}
            onChange={(event) =>
              setCefrLevel(event.target.value as typeof cefrLevel)
            }
            className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {CEFR_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {mode !== 'epub' ? (
          <label className="block">
            <span className="text-sm font-medium">
              Author{mode === 'url' || mode === 'pdf' ? ' (optional — auto-filled)' : ''}
            </span>
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              maxLength={120}
              className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Optional"
            />
          </label>
        ) : (
          <span className="hidden sm:block" />
        )}

        <label className="block">
          <span className="text-sm font-medium">Tags</span>
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="news, travel, dialogue"
          />
        </label>
      </div>

      {mode === 'paste' ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <label className="block flex-1">
              <span className="text-sm font-medium">Romanian text</span>
              <textarea
                value={rawContent}
                onChange={(event) => setRawContent(event.target.value)}
                required
                minLength={20}
                maxLength={MAX_CONTENT_CHARS}
                rows={9}
                className="mt-1 w-full resize-y rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="Paste the passage here..."
              />
            </label>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onPasteFromClipboard}
              className="inline-flex items-center gap-1.5 rounded-md border border-foreground/20 px-2.5 py-1.5 text-xs transition hover:border-accent hover:text-accent"
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              Paste from clipboard
            </button>
            <p
              className={`text-xs ${
                remainingChars < 0 ? 'text-red-600' : 'opacity-60'
              }`}
            >
              {remainingChars.toLocaleString()} characters remaining
            </p>
          </div>
        </>
      ) : mode === 'url' ? (
        <label key="url-input" className="mt-4 block">
          <span className="text-sm font-medium">Article URL</span>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            placeholder="https://ro.wikipedia.org/wiki/..."
          />
          <span className="mt-1 block text-xs opacity-60">
            ChaosCitim fetches the page and extracts the main article body.
            Paywalled or JS-rendered pages may not work.
          </span>
        </label>
      ) : mode === 'pdf' ? (
        <label key="pdf-input" className="mt-4 block">
          <span className="text-sm font-medium">PDF file</span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
            required
            className="mt-1 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition file:mr-3 file:rounded file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-sm file:text-accent hover:file:bg-accent/25"
          />
          <span className="mt-1 block text-xs opacity-60">
            Scanned PDFs without a text layer are rejected. Max file size 25 MB.
          </span>
        </label>
      ) : (
        <label key="epub-input" className="mt-4 block">
          <span className="text-sm font-medium">EPUB file</span>
          <input
            type="file"
            accept=".epub,application/epub+zip"
            onChange={(event) => setEpubFile(event.target.files?.[0] ?? null)}
            required
            className="mt-1 block w-full rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm outline-none transition file:mr-3 file:rounded file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-sm file:text-accent hover:file:bg-accent/25"
          />
          <span className="mt-1 block text-xs opacity-60">
            Each chapter becomes its own private reading. Chapters under 20
            characters or over {MAX_CONTENT_CHARS.toLocaleString()} are skipped.
            Max file size 25 MB.
          </span>
        </label>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="submit"
          disabled={state.status === 'submitting'}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.status === 'submitting' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <BookOpen className="h-4 w-4" aria-hidden="true" />
          )}
          {state.status === 'submitting'
            ? mode === 'url'
              ? 'Fetching & analyzing...'
              : mode === 'pdf'
                ? 'Parsing & analyzing PDF...'
                : mode === 'epub'
                  ? 'Parsing & analyzing chapters...'
                  : 'Analyzing...'
            : mode === 'url'
              ? 'Fetch & analyze'
              : mode === 'pdf'
                ? 'Import PDF'
                : mode === 'epub'
                  ? 'Import EPUB'
                  : 'Analyze text'}
        </button>
      </div>

      {state.status === 'error' ? (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
          {state.message}
        </p>
      ) : null}

      {state.status === 'epub_done' ? (
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-3 text-sm">
          <p className="font-medium">
            Imported {state.results.filter((r) => r.status === 'ingested').length} chapter
            {state.results.filter((r) => r.status === 'ingested').length === 1 ? '' : 's'} from{' '}
            <span className="italic">{state.bookTitle}</span>.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs opacity-80">
            {state.results.map((r) => (
              <li key={r.order}>
                {r.status === 'ingested' ? (
                  <a
                    href={`/read/${r.textId}`}
                    className="text-accent hover:underline"
                  >
                    {r.title}
                  </a>
                ) : (
                  <span className="opacity-70">
                    {r.title} —{' '}
                    {r.status === 'skipped_short'
                      ? 'too short, skipped'
                      : r.status === 'skipped_long'
                        ? `too long (${r.charCount?.toLocaleString()} chars), skipped`
                        : `failed: ${r.error ?? 'unknown'}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <a
            href={`/read/${state.firstTextId}`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Open first chapter
          </a>
        </div>
      ) : null}
    </form>
  );
}
