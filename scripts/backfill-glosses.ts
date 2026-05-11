#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Backfill text_tokens.gloss_en for rows ingested before the Wiktionary
 * gloss pipeline shipped. Idempotent: rows that already have a gloss are
 * left untouched unless --force is passed.
 *
 *   pnpm tsx scripts/backfill-glosses.ts            # all texts, fill nulls
 *   pnpm tsx scripts/backfill-glosses.ts --text ID  # one text only
 *   pnpm tsx scripts/backfill-glosses.ts --force    # re-resolve every row
 *   pnpm tsx scripts/backfill-glosses.ts --dry-run  # report, do not write
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { parseArgs } from 'node:util';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb, closeDb } from '../db';
import { textTokens } from '../db/schema';
import { resolveGlosses, shouldGloss } from '../lib/glosses-resolve';
import type { UPos } from '../db/types';

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
    'Usage: pnpm tsx scripts/backfill-glosses.ts [--text ID] [--force] [--dry-run]',
  );
  process.exit(0);
}

async function main(): Promise<void> {
  const db = getDb();

  const whereClauses = [];
  if (args.text) whereClauses.push(eq(textTokens.textId, args.text));
  if (!args.force) whereClauses.push(isNull(textTokens.glossEn));

  const where = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  const rows = await db
    .select({
      textId: textTokens.textId,
      sentenceId: textTokens.sentenceId,
      tokenPosition: textTokens.tokenPosition,
      lemma: textTokens.lemma,
      upos: textTokens.upos,
    })
    .from(textTokens)
    .where(where);

  const glossable = rows.filter((r) => shouldGloss(r.upos));
  console.log(`→ found ${rows.length} candidate rows (${glossable.length} glossable UPOS)`);

  if (glossable.length === 0) {
    console.log('  nothing to do.');
    return;
  }

  // Dedup lemmas (first UPos wins, matches ingestion behavior).
  const seen = new Set<string>();
  const lookups: { lemma: string; upos: UPos }[] = [];
  for (const r of glossable) {
    if (seen.has(r.lemma)) continue;
    seen.add(r.lemma);
    lookups.push({ lemma: r.lemma, upos: r.upos });
  }
  console.log(`→ resolving ${lookups.length} unique lemmas...`);

  const resolved = await resolveGlosses(lookups, {
    onProgress: (done, total, src) => {
      if (done % 25 === 0 || done === total) {
        console.log(`    ${done}/${total} (${src})`);
      }
    },
  });

  console.log(
    `✓ resolved: override ${resolved.diagnostics.fromOverride}, ` +
      `cache ${resolved.diagnostics.fromCache}, ` +
      `fetch ${resolved.diagnostics.fromFetch}, ` +
      `missing ${resolved.diagnostics.missing}`,
  );

  // Group rows by gloss value so we can update in batches.
  // gloss_en is nullable; null entries (missing) we leave unchanged to
  // distinguish "we tried and failed" from "we never tried" — unless
  // --force was passed, in which case we explicitly write nulls.
  const updates = new Map<string | null, { textId: string; sentenceId: number; tokenPosition: number }[]>();
  let willUpdate = 0;
  for (const r of glossable) {
    const gloss = resolved.glosses.get(r.lemma) ?? null;
    if (gloss === null && !args.force) continue;
    const key = gloss;
    if (!updates.has(key)) updates.set(key, []);
    updates.get(key)!.push({
      textId: r.textId,
      sentenceId: r.sentenceId,
      tokenPosition: r.tokenPosition,
    });
    willUpdate++;
  }

  console.log(`→ ${willUpdate} rows queued for update across ${updates.size} distinct glosses`);

  if (args['dry-run']) {
    console.log('\n--dry-run: skipping DB write');
    return;
  }

  let written = 0;
  for (const [gloss, targets] of updates) {
    // Batch by (textId, sentenceId, tokenPosition) composite key. We use a
    // VALUES list join to update many rows in one statement per gloss group.
    // The chunked loop keeps any single query well under driver limits.
    const CHUNK = 500;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      await db.transaction(async (tx) => {
        for (const t of chunk) {
          await tx
            .update(textTokens)
            .set({ glossEn: gloss })
            .where(
              and(
                eq(textTokens.textId, t.textId),
                eq(textTokens.sentenceId, t.sentenceId),
                eq(textTokens.tokenPosition, t.tokenPosition),
              ),
            );
        }
      });
      written += chunk.length;
      console.log(`    wrote ${written}/${willUpdate}`);
    }
  }

  console.log(`\n✓ backfilled ${written} rows`);
}

main()
  .catch((err) => {
    console.error(`\n✗ backfill failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
