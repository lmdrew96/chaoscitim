/**
 * POST /api/texts — ingest a signed-in user's Romanian text via paste or URL.
 *
 * Discriminated `mode`:
 *   - 'paste' → user-provided rawContent
 *   - 'url'   → server fetches + extracts main article text via Readability
 *
 * Stores private rows owned by the current Clerk user (visibility=private,
 * license=user_byo). Both modes share the same prepareIngestion pipeline.
 */
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { commitIngestion, prepareIngestion } from '@/lib/ingestion';
import { extractFromUrl } from '@/lib/url-extract';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CONTENT_CHARS = 20_000;
const MIN_CONTENT_CHARS = 20;
const TMP_GLOSS_CACHE_PATH = '/tmp/chaoscitim-glosses-cache.json';

const cefr = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const tags = z.array(z.string().trim().min(1).max(32)).max(8).optional();

const PasteBody = z.object({
  mode: z.literal('paste'),
  title: z.string().trim().min(1).max(120),
  cefrLevel: cefr,
  rawContent: z
    .string()
    .trim()
    .min(MIN_CONTENT_CHARS)
    .max(MAX_CONTENT_CHARS),
  author: z.string().trim().max(120).optional(),
  topicTags: tags,
});

const UrlBody = z.object({
  mode: z.literal('url'),
  url: z.string().trim().url().max(2000),
  cefrLevel: cefr,
  title: z.string().trim().min(1).max(120).optional(),
  author: z.string().trim().max(120).optional(),
  topicTags: tags,
});

const Body = z.discriminatedUnion('mode', [PasteBody, UrlBody]);

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Back-compat: requests without `mode` are treated as paste.
  if (json && typeof json === 'object' && !('mode' in (json as object))) {
    (json as Record<string, unknown>).mode = 'paste';
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    let title: string;
    let author: string | null;
    let sourceUrl: string | null;
    let sourceType: 'byo_paste' | 'byo_url';
    let rawContent: string;

    if (input.mode === 'paste') {
      title = input.title;
      author = input.author || null;
      sourceUrl = null;
      sourceType = 'byo_paste';
      rawContent = input.rawContent;
    } else {
      const extracted = await extractFromUrl(input.url);
      rawContent = extracted.content;
      if (rawContent.length > MAX_CONTENT_CHARS) {
        return NextResponse.json(
          {
            error: 'content_too_long',
            message: `Extracted article is ${rawContent.length.toLocaleString()} characters — over the ${MAX_CONTENT_CHARS.toLocaleString()} limit. Try a shorter article.`,
          },
          { status: 413 },
        );
      }
      title = input.title?.trim() || extracted.title;
      author = input.author?.trim() || extracted.byline;
      sourceUrl = input.url;
      sourceType = 'byo_url';
    }

    const prepared = await prepareIngestion({
      title,
      author,
      sourceUrl,
      sourceType,
      license: 'user_byo',
      rawContent,
      cefrLevel: input.cefrLevel,
      topicTags: input.topicTags ?? [],
      ownerId: userId,
      visibility: 'private',
      glossCachePath: TMP_GLOSS_CACHE_PATH,
    });
    const textId = await commitIngestion(prepared);

    return NextResponse.json(
      {
        textId,
        diagnostics: prepared.diagnostics,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: 'ingestion_failed',
        message: (err as Error).message,
      },
      { status: 502 },
    );
  }
}
