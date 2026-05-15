#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFileSync } from 'fs';
import { getDb, closeDb } from '../db/index';
import { textTokens } from '../db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const raw = JSON.parse(readFileSync('./data/mwes.json', 'utf-8'));
  const mwes: { lemmas: string[]; gloss: string }[] = raw.entries;

  const db = getDb();
  const allTexts = await db.query.texts.findMany();

  for (const text of allTexts.sort((a, b) => (a.cefrLevel ?? '').localeCompare(b.cefrLevel ?? ''))) {
    const tokens = await db.select({ lemma: textTokens.lemma, sentenceId: textTokens.sentenceId, pos: textTokens.tokenPosition })
      .from(textTokens)
      .where(eq(textTokens.textId, text.id))
      .orderBy(textTokens.sentenceId, textTokens.tokenPosition);

    const lemmas = tokens
      .filter(t => t.lemma !== null)
      .map(t => t.lemma as string);

    const hits: string[] = [];
    for (const mwe of mwes) {
      const ml = mwe.lemmas;
      for (let i = 0; i <= lemmas.length - ml.length; i++) {
        if (ml.every((l, k) => lemmas[i + k] === l)) {
          hits.push(mwe.gloss);
          break;
        }
      }
    }
    console.log(`${text.cefrLevel} | ${(text.title ?? '').padEnd(40)} hits: ${hits.length}  [${hits.join(', ')}]`);
  }

  await closeDb();
}

main().catch(console.error);
