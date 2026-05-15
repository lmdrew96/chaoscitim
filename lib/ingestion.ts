import { createHash, randomUUID } from 'node:crypto';
import { restoreDiacritics } from './diacritic';
import { analyze } from './udpipe';
import { parseConllu } from './conllu';
import type { ParsedMwt, ParsedSentence, ParsedToken } from './conllu';
import { classifyAllSe } from './se-rule';
import { resolveGlosses, shouldGloss } from './glosses-resolve';
import { generateContextGlosses, shouldContextGloss, MODEL_VERSION } from './gloss-context';
import { getDb } from '../db';
import {
  texts,
  textSentences,
  textTokens,
  type NewText,
  type NewTextSentence,
  type NewTextToken,
} from '../db/schema';
import type {
  CefrLevel,
  License,
  SourceType,
  Visibility,
} from '../db/types';

export interface IngestInput {
  title: string;
  author?: string | null;
  sourceUrl?: string | null;
  sourceType: SourceType;
  license: License;
  rawContent: string;
  cefrLevel: CefrLevel;
  topicTags: string[];
  ownerId?: string | null;
  visibility: Visibility;
  model?: string;
  /** Skip Wiktionary fetch — use overrides + cache only. Cache misses become null. */
  offlineGlosses?: boolean;
  glossCachePath?: string;
  glossOverridesPath?: string;
  /** Skip AI contextual gloss generation (for tests or offline mode). */
  skipContextGlosses?: boolean;
}

export interface PreparedIngestion {
  textRow: NewText;
  sentenceRows: NewTextSentence[];
  tokenRows: NewTextToken[];
  diagnostics: {
    diacriticsChanged: boolean;
    sentenceCount: number;
    wordCount: number;
    seClassifications: number;
    mwtCount: number;
    glossesResolved: number;
    glossesMissing: number;
    glossesFromOverride: number;
    glossesFromCache: number;
    glossesFromFetch: number;
    contextGlossesGenerated: number;
    contextGlossesMissing: number;
  };
}

export async function prepareIngestion(
  input: IngestInput,
): Promise<PreparedIngestion> {
  const { restored, changed } = restoreDiacritics(input.rawContent);

  const { conllu, modelVersion, modelLicense } = await analyze({
    text: restored,
    model: input.model,
  });

  const sentences = parseConllu(conllu);
  if (sentences.length === 0) {
    throw new Error(
      'prepareIngestion: UDPipe returned no sentences — input may be empty or malformed',
    );
  }

  const offsets = computeSentenceOffsets(restored, sentences);

  const textId = randomUUID();
  const analyzedAt = new Date();

  const sentenceRows: NewTextSentence[] = sentences.map((s, i) => ({
    textId,
    sentenceId: s.sentenceId,
    sentenceText: s.text,
    charStart: offsets[i]!.charStart,
    charEnd: offsets[i]!.charEnd,
  }));

  // Collect glossable lemmas before building token rows so we can resolve
  // glosses in one batched Wiktionary call and attach them inline.
  const glossLookups: { lemma: string; upos: typeof sentences[number]['tokens'][number]['upos'] }[] = [];
  const seenLemmas = new Set<string>();
  for (const sentence of sentences) {
    for (const token of sentence.tokens) {
      if (!shouldGloss(token.upos)) continue;
      if (!token.lemma || seenLemmas.has(token.lemma)) continue;
      seenLemmas.add(token.lemma);
      glossLookups.push({ lemma: token.lemma, upos: token.upos });
    }
  }
  const glossResult = await resolveGlosses(glossLookups, {
    offline: input.offlineGlosses ?? false,
    cachePath: input.glossCachePath,
    overridesPath: input.glossOverridesPath,
  });

  // AI contextual glosses — one Claude call per sentence, keyed by
  // `${sentenceId}:${tokenPosition}`. Skip when explicitly disabled.
  const contextGlossMap = input.skipContextGlosses
    ? new Map<string, string | null>()
    : await generateContextGlosses(sentences);

  let contextGlossesGenerated = 0;
  let contextGlossesMissing = 0;

  const tokenRows: NewTextToken[] = [];
  let wordCount = 0;
  let seClassifications = 0;
  let mwtCount = 0;

  for (const sentence of sentences) {
    const seReadings = classifyAllSe(sentence);
    seClassifications += seReadings.size;
    const mwtMap = applyMwts(sentence.tokens, sentence.mwts);
    if (sentence.mwts.length > 0) mwtCount += sentence.mwts.length;

    for (const token of sentence.tokens) {
      if (token.upos !== 'PUNCT') wordCount++;
      const mwt = mwtMap.get(token.id);
      const glossEn = shouldGloss(token.upos)
        ? glossResult.glosses.get(token.lemma) ?? null
        : null;
      const glossEnContext = shouldContextGloss(token)
        ? (contextGlossMap.get(`${sentence.sentenceId}:${token.id}`) ?? null)
        : null;

      if (shouldContextGloss(token)) {
        if (glossEnContext !== null) contextGlossesGenerated++;
        else contextGlossesMissing++;
      }

      tokenRows.push({
        textId,
        sentenceId: sentence.sentenceId,
        tokenPosition: token.id,
        surfaceForm: token.form,
        lemma: token.lemma,
        upos: token.upos,
        xpos: token.xpos,
        features: token.feats,
        headPosition: token.head,
        deprel: token.deprel,
        enrichedSeReading: seReadings.get(token.id) ?? null,
        glossEn,
        glossEnContext,
        ambiguityAlternatives: null,
        mwtId: mwt?.mwtId ?? null,
        mwtSurfaceForm: mwt?.mwtSurfaceForm ?? null,
      });
    }
  }

  const rawContentHash = createHash('sha256').update(restored).digest('hex');

  const textRow: NewText = {
    id: textId,
    title: input.title,
    author: input.author ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceType: input.sourceType,
    license: input.license,
    rawContent: restored,
    rawContentOriginal: changed ? input.rawContent : null,
    rawContentHash,
    cefrLevel: input.cefrLevel,
    topicTags: input.topicTags,
    analyzerModelVersion: modelVersion,
    analyzerLicense: modelLicense,
    analyzedAt,
    wordCount,
    sentenceCount: sentences.length,
    ownerId: input.ownerId ?? null,
    visibility: input.visibility,
    // Leave glossModelVersion null if context glosses were expected but none
    // were generated — the backfill script uses IS NULL to find texts that
    // need (re)processing, so a silent API failure stays detectable.
    glossModelVersion: input.skipContextGlosses || contextGlossesGenerated === 0
      ? null
      : MODEL_VERSION,
  };

  return {
    textRow,
    sentenceRows,
    tokenRows,
    diagnostics: {
      diacriticsChanged: changed,
      sentenceCount: sentences.length,
      wordCount,
      seClassifications,
      mwtCount,
      glossesResolved: glossResult.diagnostics.total - glossResult.diagnostics.missing,
      glossesMissing: glossResult.diagnostics.missing,
      glossesFromOverride: glossResult.diagnostics.fromOverride,
      glossesFromCache: glossResult.diagnostics.fromCache,
      glossesFromFetch: glossResult.diagnostics.fromFetch,
      contextGlossesGenerated,
      contextGlossesMissing,
    },
  };
}

export async function commitIngestion(
  prepared: PreparedIngestion,
): Promise<string> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(texts).values(prepared.textRow);
    if (prepared.sentenceRows.length > 0) {
      await tx.insert(textSentences).values(prepared.sentenceRows);
    }
    if (prepared.tokenRows.length > 0) {
      // Postgres parameter limit is ~65k. With ~16 columns per token, a
      // single insert can carry ~4000 tokens. For very long texts we'd
      // chunk, but seed library + most BYO texts are well under that.
      await tx.insert(textTokens).values(prepared.tokenRows);
    }
  });
  return prepared.textRow.id!;
}

export async function ingest(input: IngestInput): Promise<string> {
  const prepared = await prepareIngestion(input);
  return commitIngestion(prepared);
}

// ── helpers ───────────────────────────────────────────────────────────

function computeSentenceOffsets(
  rawContent: string,
  sentences: ParsedSentence[],
): Array<{ charStart: number; charEnd: number }> {
  const offsets: Array<{ charStart: number; charEnd: number }> = [];
  let cursor = 0;
  for (const s of sentences) {
    const idx = s.text ? rawContent.indexOf(s.text, cursor) : -1;
    if (idx === -1) {
      // Whitespace-normalized fallback: claim the next chunk of length
      // equal to the sentence text. Not perfectly accurate but
      // monotonic and good enough for downstream consumers.
      const end = Math.min(cursor + (s.text?.length ?? 0), rawContent.length);
      offsets.push({ charStart: cursor, charEnd: end });
      cursor = end;
    } else {
      offsets.push({ charStart: idx, charEnd: idx + s.text.length });
      cursor = idx + s.text.length;
    }
  }
  return offsets;
}

function applyMwts(
  tokens: ParsedToken[],
  mwts: ParsedMwt[],
): Map<number, { mwtId: number; mwtSurfaceForm: string | null }> {
  const result = new Map<
    number,
    { mwtId: number; mwtSurfaceForm: string | null }
  >();
  for (let i = 0; i < mwts.length; i++) {
    const mwt = mwts[i]!;
    const mwtId = i + 1; // sentence-scoped, 1-indexed
    for (const token of tokens) {
      if (token.id >= mwt.start && token.id <= mwt.end) {
        result.set(token.id, {
          mwtId,
          mwtSurfaceForm: token.id === mwt.start ? mwt.form : null,
        });
      }
    }
  }
  return result;
}
