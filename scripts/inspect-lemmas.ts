#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Quick lemma-inspection tool. Given a Romanian sentence, runs it through
 * the same UDPipe pipeline ingestion uses and prints (surface, lemma, upos,
 * deprel). Useful when curating data/mwes.json — you need to know what
 * lemma UDPipe assigns to clitics like își/mi-am/se before writing entries.
 *
 *   pnpm tsx scripts/inspect-lemmas.ts "Își dă seama că e tarziu."
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { analyze } from '../lib/udpipe';
import { parseConllu } from '../lib/conllu';
import { restoreDiacritics } from '../lib/diacritic';

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: pnpm tsx scripts/inspect-lemmas.ts "<romanian sentence>"');
    process.exit(1);
  }

  const { restored } = restoreDiacritics(input);
  const { conllu } = await analyze({ text: restored });
  const parsed = parseConllu(conllu);

  for (const sentence of parsed) {
    console.log('\n--- sentence ---');
    console.log('text:', sentence.text);
    console.log();
    console.log('pos | surface          | lemma            | upos   | deprel        | head | features');
    console.log('----+------------------+------------------+--------+---------------+------+---------');
    for (const t of sentence.tokens) {
      const f = t.feats ? Object.entries(t.feats).map(([k, v]) => `${k}=${v}`).join(',') : '';
      console.log(
        `${String(t.id).padStart(3)} | ${t.form.padEnd(16)} | ${t.lemma.padEnd(16)} | ${String(t.upos).padEnd(6)} | ${t.deprel.padEnd(13)} | ${String(t.head ?? 0).padStart(4)} | ${f}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
