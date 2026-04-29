import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseConllu } from '../lib/conllu';
import { classifyAllSe, classifySeReading } from '../lib/se-rule';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../docs/phase2');

async function loadFixture(name: string): Promise<string> {
  return readFile(resolve(fixtureDir, name), 'utf8');
}

describe('classifySeReading on Phase 2 se-test passage', () => {
  it('classifies "Se vinde casa lui Ion" as passive', async () => {
    const conllu = await loadFixture('se-test.conllu');
    const sentences = parseConllu(conllu);
    const sentence1 = sentences[0]!;
    expect(sentence1.text).toContain('Se vinde casa');

    const se = sentence1.tokens.find((t) => t.lemma === 'sine');
    expect(se).toBeDefined();
    expect(se!.deprel).toBe('expl:pass');
    expect(classifySeReading(se!, sentence1)).toBe('passive');
  });

  it('classifies "Se merge la teatru" as impersonal', async () => {
    const conllu = await loadFixture('se-test.conllu');
    const sentences = parseConllu(conllu);
    const sentence2 = sentences[1]!;
    expect(sentence2.text).toContain('Se merge');

    const se = sentence2.tokens.find((t) => t.lemma === 'sine');
    expect(se).toBeDefined();
    expect(se!.deprel).toBe('expl:pv');
    expect(classifySeReading(se!, sentence2)).toBe('impersonal');
  });

  it('classifies "Maria se spală" as reflexive', async () => {
    const conllu = await loadFixture('se-test.conllu');
    const sentences = parseConllu(conllu);
    const sentence3 = sentences[2]!;
    expect(sentence3.text).toContain('Maria se spală');

    const se = sentence3.tokens.find((t) => t.lemma === 'sine');
    expect(se).toBeDefined();
    expect(se!.deprel).toBe('expl:pv');
    expect(classifySeReading(se!, sentence3)).toBe('reflexive');
  });
});

describe('classifyAllSe', () => {
  it('returns one classification per *se* token in the test passage', async () => {
    const conllu = await loadFixture('se-test.conllu');
    const sentences = parseConllu(conllu);
    const all = sentences.map((s) => classifyAllSe(s));
    expect(all[0]!.size).toBe(1);
    expect(all[1]!.size).toBe(1);
    expect(all[2]!.size).toBe(1);
  });

  it('returns nothing for sentences without bare *se*', async () => {
    // News passage uses *își* (reflexive dative) but not bare *se*.
    const conllu = await loadFixture('news.conllu');
    const sentences = parseConllu(conllu);
    for (const sentence of sentences) {
      expect(classifyAllSe(sentence).size).toBe(0);
    }
  });
});
