/**
 * POST /api/texts/pdf — ingest a PDF as a single private text.
 *
 * Accepts multipart/form-data:
 *   - file (the .pdf)
 *   - cefrLevel (A1..C2)
 *   - title? — overrides the heuristic title
 *   - author?
 *   - topicTags? — comma-separated
 *
 * One text per PDF (pages aren't semantic units the way EPUB chapters are).
 * Rejects scanned PDFs (no text layer) and oversized extractions with a clear
 * message so the user knows what to do next.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { commitIngestion, prepareIngestion } from '@/lib/ingestion';
import { extractPdf } from '@/lib/pdf-extract';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_CONTENT_CHARS = 20_000;
const MIN_CONTENT_CHARS = 20;
const MAX_PDF_BYTES = 25_000_000;
const TMP_GLOSS_CACHE_PATH = '/tmp/chaoscitim-glosses-cache.json';
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Cefr = (typeof CEFR)[number];

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
  const titleInput = String(form.get('title') ?? '').trim();
  const authorInput = String(form.get('author') ?? '').trim();
  const tagsInput = String(form.get('topicTags') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  }
  if (!isPdfFile(file)) {
    return NextResponse.json(
      {
        error: 'invalid_file_type',
        message: 'Please upload a .pdf file.',
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        error: 'file_too_large',
        message: `PDF exceeds the ${(MAX_PDF_BYTES / 1_000_000).toFixed(0)} MB limit.`,
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
    extracted = await extractPdf(buf, file.name.replace(/\.pdf$/i, ''));
  } catch (err) {
    return NextResponse.json(
      { error: 'pdf_parse_failed', message: (err as Error).message },
      { status: 400 },
    );
  }

  if (!extracted.diagnostics.hasTextLayer) {
    return NextResponse.json(
      {
        error: 'no_text_layer',
        message:
          'This PDF has no extractable text layer — it is probably a scan. OCR is not yet supported.',
        diagnostics: extracted.diagnostics,
      },
      { status: 422 },
    );
  }

  const content = extracted.content;
  if (content.length < MIN_CONTENT_CHARS) {
    return NextResponse.json(
      {
        error: 'content_too_short',
        message: `Extracted only ${content.length} characters — too short to analyze.`,
        diagnostics: extracted.diagnostics,
      },
      { status: 422 },
    );
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      {
        error: 'content_too_long',
        message: `Extracted ${content.length.toLocaleString()} characters — over the ${MAX_CONTENT_CHARS.toLocaleString()} limit. Try a shorter PDF, or paste a section directly.`,
        diagnostics: extracted.diagnostics,
      },
      { status: 413 },
    );
  }

  const title = titleInput || extracted.title || file.name.replace(/\.pdf$/i, '');
  const author = authorInput || null;

  try {
    const prepared = await prepareIngestion({
      title: title.slice(0, 120),
      author,
      sourceUrl: null,
      sourceType: 'byo_pdf',
      license: 'user_byo',
      rawContent: content,
      cefrLevel,
      topicTags,
      ownerId: userId,
      visibility: 'private',
      glossCachePath: TMP_GLOSS_CACHE_PATH,
    });
    const textId = await commitIngestion(prepared);

    return NextResponse.json(
      {
        textId,
        extraction: extracted.diagnostics,
        diagnostics: prepared.diagnostics,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'ingestion_failed', message: (err as Error).message },
      { status: 502 },
    );
  }
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

