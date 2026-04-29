import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseConllu } from '../lib/conllu';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../docs/phase2');

async function loadFixture(name: string): Promise<string> {
  return readFile(resolve(fixtureDir, name), 'utf8');
}

describe('parseConllu', () => {
  it('parses the news passage into 3 sentences', async () => {
    const conllu = await loadFixture('news.conllu');
    const sentences = parseConllu(conllu);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]!.sentenceId).toBe(1);
    expect(sentences[0]!.text).toContain('Președintele a primit');
  });

  it('extracts the first token of the news passage with full morphology', async () => {
    const conllu = await loadFixture('news.conllu');
    const [first] = parseConllu(conllu);
    const presedintele = first!.tokens[0]!;
    expect(presedintele.form).toBe('Președintele');
    expect(presedintele.lemma).toBe('președinte');
    expect(presedintele.upos).toBe('NOUN');
    expect(presedintele.feats.Definite).toBe('Def');
    expect(presedintele.feats.Gender).toBe('Masc');
    expect(presedintele.feats.Number).toBe('Sing');
    expect(presedintele.feats.Case).toBe('Acc,Nom');
  });

  it('parses dative pronoun clitic in i-a prezentat', async () => {
    const conllu = await loadFixture('news.conllu');
    const sentences = parseConllu(conllu);
    const sentence2 = sentences[1]!;
    const iClitic = sentence2.tokens.find((t) => t.form === 'i-');
    expect(iClitic).toBeDefined();
    expect(iClitic!.lemma).toBe('el');
    expect(iClitic!.upos).toBe('PRON');
    expect(iClitic!.feats.Case).toBe('Dat');
    expect(iClitic!.feats.Strength).toBe('Weak');
  });

  it('parses imperfect tense correctly in literary passage', async () => {
    const conllu = await loadFixture('literary.conllu');
    const [sentence] = parseConllu(conllu);
    const trăia = sentence!.tokens.find((t) => t.form === 'trăia');
    expect(trăia).toBeDefined();
    expect(trăia!.feats.Tense).toBe('Imp');
    expect(trăia!.feats.Mood).toBe('Ind');
  });

  it('parses informal passage with reflexive clitic stack', async () => {
    const conllu = await loadFixture('informal.conllu');
    const sentences = parseConllu(conllu);
    expect(sentences.length).toBeGreaterThanOrEqual(2);

    const sentence2 = sentences[1]!;
    const m = sentence2.tokens.find((t) => t.form === 'M-');
    const mi = sentence2.tokens.find((t) => t.form === 'mi-');
    const ne = sentence2.tokens.find((t) => t.form === 'ne-');

    expect(m?.feats.Case).toBe('Acc');
    expect(mi?.feats.Case).toBe('Dat');
    expect(ne?.feats.Case).toBe('Acc');
    expect(ne?.feats.Number).toBe('Plur');
  });

  it('treats head=0 as null head (root)', async () => {
    const conllu = await loadFixture('news.conllu');
    const [first] = parseConllu(conllu);
    const root = first!.tokens.find((t) => t.deprel === 'root');
    expect(root).toBeDefined();
    expect(root!.head).toBeNull();
  });

  it('parses MISC field key=value pairs', async () => {
    const conllu = await loadFixture('news.conllu');
    const [first] = parseConllu(conllu);
    const guvernului = first!.tokens.find((t) => t.form === 'guvernului');
    expect(guvernului?.misc.SpaceAfter).toBe('No');
  });

  it('returns empty result for empty input', () => {
    expect(parseConllu('')).toEqual([]);
  });

  it('returns empty result for comments-only input', () => {
    expect(parseConllu('# generator = test\n# udpipe_model = foo')).toEqual([]);
  });
});
