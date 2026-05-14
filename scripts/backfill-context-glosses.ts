#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Backfill text_tokens.gloss_en_context for texts ingested before the
 * AI contextual gloss pipeline shipped. Processes sentence by sentence,
 * one Claude Haiku call per sentence.
 *
 *   pnpm tsx scripts/backfill-context-glosses.ts            # all texts missing glosses
 *   pnpm tsx scripts/backfill-context-glosses.ts --text ID  # one text only
 *   pnpm tsx scripts/backfill-context-glosses.ts --force    # re-generate even if present
 *   pnpm tsx scripts/backfill-context-glosses.ts --dry-run  # report only, no writes
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { parseArgs } from 'node:util';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { getDb, closeDb } from '../db';
import { texts, textSentences, textTokens } from '../db/schema';
import {
  generateSentenceGlosses,
  shouldContextGloss,
  MODEL_VERSION,
} from '../lib/gloss-context';
import type { ParsedSentence, ParsedToken } from '../lib/conllu';

const cli = parseArgs({
  options: {
    text: { type: 'string' },
    force: { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
  },
  strict: true,
  allowPositionals: false,
});

const args = cli.values;

if (args.help) {
  console.log(
    'Usage: pnpm tsx scripts/backfill-context-glosses.ts [--text ID] [--force] [--dry-run]',
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const db = getDb();
  const client = new Anthropic();

  // Find texts to process: missing gloss_model_version (never glossed) or
  // --force to re-run all.
  const textWhere = args.text
    ? [eq(texts.id, args.text)]
    : args.force
      ? []
      : [isNull(texts.glossModelVersion)];

  const targetTexts = await db
    .select({ id: texts.id, title: texts.title })
    .from(texts)
    .where(textWhere.length > 0 ? and(...textWhere) : undefined);

  if (targetTexts.length === 0) {
    console.log('No texts to process — all up to date.');
    return;
  }
  console.log(`→ ${targetTexts.length} text(s) to process\n`);

  let totalGenerated = 0;
  let totalMissing = 0;
  let totalSentences = 0;

  for (const text of targetTexts) {
    console.log(`  [${text.id}] "${text.title}"`);

    // Load sentences and tokens for this text.
    const sentenceRows = await db
      .select()
      .from(textSentences)
      .where(eq(textSentences.textId, text.id))
      .orderBy(textSentences.sentenceId);

    const tokenRows = await db
      .select()
      .from(textTokens)
      .where(eq(textTokens.textId, text.id))
      .orderBy(textTokens.sentenceId, textTokens.tokenPosition);

    // Reconstruct ParsedSentence[] from DB rows (no re-UDPipe needed).
    const sentenceMap = new Map<number, ParsedToken[]>();
    for (const token of tokenRows) {
      const list = sentenceMap.get(token.sentenceId) ?? [];
      list.push({
        id: token.tokenPosition,
        form: token.surfaceForm,
        lemma: token.lemma,
        upos: token.upos as ParsedToken['upos'],
        xpos: token.xpos ?? null,
        feats: (token.features as ParsedToken['feats']) ?? {},
        head: token.headPosition ?? null,
        deprel: token.deprel,
        deps: null,
        misc: {},
      });
      sentenceMap.set(token.sentenceId, list);
    }

    const sentences: ParsedSentence[] = sentenceRows.map((s) => ({
      sentenceId: s.sentenceId,
      text: s.sentenceText,
      tokens: sentenceMap.get(s.sentenceId) ?? [],
      mwts: [],
    }));

    // In --force mode, clear glosses from tokens now excluded by shouldContextGloss
    // (e.g. AUX, reflexive pronouns, "să") so stale verbose glosses don't linger.
    if (args.force && !args['dry-run']) {
      const allTokenIds = tokenRows.map((t) => t.tokenPosition);
      const eligibleIds = new Set(
        tokenRows
          .filter((t) =>
            shouldContextGloss({
              id: t.tokenPosition,
              form: t.surfaceForm,
              lemma: t.lemma,
              upos: t.upos as ParsedToken['upos'],
              xpos: t.xpos ?? null,
              feats: (t.features as ParsedToken['feats']) ?? {},
              head: t.headPosition ?? null,
              deprel: t.deprel,
              deps: null,
              misc: {},
            }),
          )
          .map((t) => t.tokenPosition),
      );
      const excludedIds = allTokenIds.filter((id) => !eligibleIds.has(id));
      if (excludedIds.length > 0) {
        // Batch clear in chunks to avoid query size limits.
        for (let i = 0; i < excludedIds.length; i += 200) {
          const chunk = excludedIds.slice(i, i + 200);
          await db
            .update(textTokens)
            .set({ glossEnContext: null })
            .where(
              and(
                eq(textTokens.textId, text.id),
                inArray(textTokens.tokenPosition, chunk),
              ),
            );
        }
        console.log(`    cleared ${excludedIds.length} excluded-token glosses`);
      }
    }

    let textGenerated = 0;
    let textMissing = 0;

    for (const sentence of sentences) {
      const eligible = sentence.tokens.filter(shouldContextGloss);
      if (eligible.length === 0) continue;
      totalSentences++;

      const glossMap = await generateSentenceGlosses(sentence, client);

      if (args['dry-run']) {
        textGenerated += glossMap.size;
        textMissing += eligible.length - glossMap.size;
        continue;
      }

      // Write each token's gloss individually. Small sentences keep this fast;
      // large texts are bounded by sentence count, not token count.
      for (const token of eligible) {
        const gloss = glossMap.get(token.id) ?? null;
        if (gloss !== null) textGenerated++;
        else textMissing++;

        await db
          .update(textTokens)
          .set({ glossEnContext: gloss })
          .where(
            and(
              eq(textTokens.textId, text.id),
              eq(textTokens.sentenceId, sentence.sentenceId),
              eq(textTokens.tokenPosition, token.id),
            ),
          );
      }
    }

    // Mark text as glossed.
    if (!args['dry-run']) {
      await db
        .update(texts)
        .set({ glossModelVersion: MODEL_VERSION })
        .where(eq(texts.id, text.id));
    }

    totalGenerated += textGenerated;
    totalMissing += textMissing;
    console.log(`    ✓ ${textGenerated} glossed, ${textMissing} missing`);
  }

  console.log(
    `\n${args['dry-run'] ? '[dry-run] ' : ''}Done: ${totalGenerated} glosses across ${totalSentences} sentences. ${totalMissing} tokens had no AI output.`,
  );
}

main()
  .catch((err) => {
    console.error(`\n✗ backfill failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
