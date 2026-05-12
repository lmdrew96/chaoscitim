#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDb, closeDb } from '../db/index';
import { texts } from '../db/schema';

async function main() {
  const db = getDb();
  const libraryTexts = await db.query.texts.findMany({
    where: (t, { eq }) => eq(t.visibility, 'public_seed'),
  });

  console.log(`\n📚 Seeded Library: ${libraryTexts.length} texts\n`);
  console.log('Title | Level | Words | Source');
  console.log('------|-------|-------|-------');

  libraryTexts.forEach(t => {
    const title = (t.title || '').padEnd(25);
    const level = (t.cefrLevel || '?').padEnd(5);
    const words = String(t.wordCount || 0).padStart(5);
    const source = (t.sourceType || '').slice(0, 15);
    console.log(`${title} | ${level} | ${words} | ${source}`);
  });

  console.log(`\nTotal word tokens: ${libraryTexts.reduce((sum, t) => sum + (t.wordCount || 0), 0)}`);

  await closeDb();
}

main().catch(console.error);

