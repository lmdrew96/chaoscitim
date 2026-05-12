/**
 * POST /api/texts/epub — ingest an EPUB as one private text per chapter.
 *
 * Accepts multipart/form-data with:
 *   - file (the .epub)
 *   - cefrLevel (A1..C2)
 *   - topicTags (optional, comma-separated)
 *
 * Returns the ingested text IDs in spine order, plus a per-chapter skip
 * report (chapters too short or too long are skipped, not silently dropped).
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { commitIngestion, prepareIngestion } from '@/lib/ingestion';
import { extractEpub } from '@/lib/epub-extract';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_CONTENT_CHARS = 20_000;
const MIN_CONTENT_CHARS = 20;
const MAX_EPUB_BYTES = 25_000_000; // 25 MB
const TMP_GLOSS_CACHE_PATH = '/tmp/chaoscitim-glosses-cache.json';
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Cefr = (typeof CEFR)[number];

interface ChapterResult {
  order: number;
  title: string;
  status: 'ingested' | 'skipped_short' | 'skipped_long' | 'failed';
  textId?: string;
  charCount?: number;
  error?: string;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  const cefrInput = String(form.get('cefrLevel') ?? '');
  const tagsInput = String(form.get('topicTags') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (file.size > MAX_EPUB_BYTES) {
    return NextResponse.json(
      {
        error: 'file_too_large',
        message: `EPUB exceeds the ${(MAX_EPUB_BYTES / 1_000_000).toFixed(0)} MB limit.`,
      },
      { status: 413 },
    );
  }
  if (!CEFR.includes(cefrInput as Cefr)) {
    return NextResponse.json(
      { error: 'invalid_cefr', message: 'cefrLevel must be A1..C2.' },
      { status: 400 },
    );
  }
  const cefrLevel = cefrInput as Cefr;
  const topicTags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  let extracted;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    extracted = await extractEpub(buf);
  } catch (err) {
    return NextResponse.json(
      { error: 'epub_parse_failed', message: (err as Error).message },
      { status: 400 },
    );
  }

  const bookTitle = extracted.bookTitle?.trim() || file.name.replace(/\.epub$/i, '');
  const bookAuthor = extracted.bookAuthor?.trim() || null;
  const results: ChapterResult[] = [];

  for (const chapter of extracted.chapters) {
    const len = chapter.content.length;
    if (len < MIN_CONTENT_CHARS) {
      results.push({
        order: chapter.order,
        title: chapter.title,
        status: 'skipped_short',
        charCount: len,
      });
      continue;
    }
    if (len > MAX_CONTENT_CHARS) {
      results.push({
        order: chapter.order,
        title: chapter.title,
        status: 'skipped_long',
        charCount: len,
      });
      continue;
    }

    const title = `${bookTitle} — ${chapter.title}`.slice(0, 120);
    try {
      const prepared = await prepareIngestion({
        title,
        author: bookAuthor,
        sourceUrl: null,
        sourceType: 'byo_epub',
        license: 'user_byo',
        rawContent: chapter.content,
        cefrLevel,
        topicTags,
        ownerId: userId,
        visibility: 'private',
        glossCachePath: TMP_GLOSS_CACHE_PATH,
      });
      const textId = await commitIngestion(prepared);
      results.push({
        order: chapter.order,
        title: chapter.title,
        status: 'ingested',
        textId,
        charCount: len,
      });
    } catch (err) {
      results.push({
        order: chapter.order,
        title: chapter.title,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  const ingestedIds = results
    .filter((r) => r.status === 'ingested')
    .map((r) => r.textId!);

  if (ingestedIds.length === 0) {
    return NextResponse.json(
      {
        error: 'no_chapters_ingested',
        message:
          'Every chapter was skipped or failed. Check the per-chapter report.',
        results,
      },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      bookTitle,
      bookAuthor,
      textIds: ingestedIds,
      firstTextId: ingestedIds[0],
      results,
    },
    { status: 201 },
  );
}
