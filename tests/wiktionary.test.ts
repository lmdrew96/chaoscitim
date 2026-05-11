import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractRomanianSection,
  findPosSection,
  firstDefinition,
  cleanWikiMarkup,
  compressToGloss,
  parseRomanianGloss,
  fetchGlossesBatch,
} from '../lib/wiktionary';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/wiktionary');

async function fixture(name: string): Promise<string> {
  return readFile(join(FIXTURES, `${name}.wikitext`), 'utf8');
}

describe('extractRomanianSection', () => {
  it('finds the Romanian section in a multi-language page', async () => {
    const text = await fixture('merge');
    const ro = extractRomanianSection(text);
    expect(ro).not.toBeNull();
    expect(ro).toContain('===Verb===');
    // It should not include the next language section.
    expect(ro).not.toContain('==English==');
    expect(ro).not.toContain('==Latin==');
  });

  it('handles pages starting with ==Romanian==', async () => {
    const text = await fixture('frumos');
    const ro = extractRomanianSection(text);
    expect(ro).not.toBeNull();
    expect(ro).toContain('===Adjective===');
  });

  it('returns null when no Romanian section exists', () => {
    expect(extractRomanianSection('==English==\nfoo')).toBeNull();
    expect(extractRomanianSection('')).toBeNull();
  });
});

describe('findPosSection', () => {
  it('finds top-level POS subsections (===Noun===)', async () => {
    const text = await fixture('casă');
    const ro = extractRomanianSection(text)!;
    const body = findPosSection(ro, ['Noun']);
    expect(body).not.toBeNull();
    expect(body).toContain('[[house]]');
  });

  it('finds nested POS subsections (====Conjunction==== under ===Etymology N===)', async () => {
    const text = await fixture('și');
    const ro = extractRomanianSection(text)!;
    const body = findPosSection(ro, ['Conjunction']);
    expect(body).not.toBeNull();
    expect(body).toContain('[[and]]');
  });

  it('returns null when POS is not present', async () => {
    const text = await fixture('casă');
    const ro = extractRomanianSection(text)!;
    expect(findPosSection(ro, ['Verb'])).toBeNull();
  });
});

describe('firstDefinition', () => {
  it('returns the first # line and skips ##, #:, #*', () => {
    const body = `
{{ro-noun}}

# [[house]], [[dwellinghouse]]
# [[building]] used for a specific purpose
## {{l|ro|casă de modă}} &ndash; [[fashion house]]
#: example
#* quote
`;
    expect(firstDefinition(body)).toBe('[[house]], [[dwellinghouse]]');
  });

  it('returns null when no definition lines exist', () => {
    expect(firstDefinition('==Foo==\nbar')).toBeNull();
  });
});

describe('cleanWikiMarkup', () => {
  it('inlines wiki links', () => {
    expect(cleanWikiMarkup('[[house]], [[dwellinghouse]]')).toBe('house, dwellinghouse');
    expect(cleanWikiMarkup('[[house|home]]')).toBe('home');
  });

  it('strips template wrappers', () => {
    expect(cleanWikiMarkup('{{lb|ro|informal}} [[move]]')).toBe('move');
    expect(cleanWikiMarkup('{{l|en|walk}}')).toBe('walk');
  });

  it('strips parentheticals and refs', () => {
    expect(cleanWikiMarkup('[[house]] (a building)')).toBe('house');
    expect(cleanWikiMarkup('[[walk]]<ref>foo</ref>')).toBe('walk');
  });

  it('strips bold/italic and trailing punctuation', () => {
    expect(cleanWikiMarkup("'''bold''' and ''italic''.")).toBe('bold and italic');
  });
});

describe('compressToGloss', () => {
  it('keeps short glosses untouched', () => {
    expect(compressToGloss('house')).toBe('house');
    expect(compressToGloss('to walk')).toBe('to walk');
  });

  it('takes the first comma- or "or"-separated alternative', () => {
    expect(compressToGloss('house, dwellinghouse')).toBe('house');
    expect(compressToGloss('walk or stroll')).toBe('walk');
  });

  it('caps at 3 words', () => {
    expect(compressToGloss('a building used for a specific purpose')).toBe('a building used');
  });
});

describe('parseRomanianGloss (end-to-end against real fixtures)', () => {
  it('casă (NOUN) → house', async () => {
    const text = await fixture('casă');
    expect(parseRomanianGloss(text, 'NOUN').gloss).toBe('house');
  });

  it('frumos (ADJ) → beautiful', async () => {
    const text = await fixture('frumos');
    expect(parseRomanianGloss(text, 'ADJ').gloss).toBe('beautiful');
  });

  it('merge (VERB) → to walk', async () => {
    const text = await fixture('merge');
    expect(parseRomanianGloss(text, 'VERB').gloss).toBe('to walk');
  });

  it('în (ADP) → in', async () => {
    const text = await fixture('în');
    expect(parseRomanianGloss(text, 'ADP').gloss).toBe('in');
  });

  it('și (CCONJ) → and', async () => {
    const text = await fixture('și');
    expect(parseRomanianGloss(text, 'CCONJ').gloss).toBe('and');
  });

  it('falls back across POS when UPOS does not match', async () => {
    // frumos is also an Adverb in Romanian; if we ask as ADV first we still
    // resolve to "beautifully" — but if we ask with NOUN (wrong), the parser
    // should still find SOMETHING via fallback.
    const text = await fixture('frumos');
    expect(parseRomanianGloss(text, 'NOUN').gloss).not.toBeNull();
  });

  it('returns null when no Romanian section exists', () => {
    expect(parseRomanianGloss('==English==\n===Noun===\n# foo', 'NOUN').gloss).toBeNull();
  });
});

describe('fetchGlossesBatch (stubbed fetch)', () => {
  it('deduplicates lemmas and calls the API in one batch', async () => {
    const casa = await fixture('casă');
    const merge = await fixture('merge');
    const calls: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      const body = {
        query: {
          pages: [
            { title: 'casă', revisions: [{ slots: { main: { content: casa } } }] },
            { title: 'merge', revisions: [{ slots: { main: { content: merge } } }] },
          ],
        },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const out = await fetchGlossesBatch(
      [
        { lemma: 'casă', upos: 'NOUN' },
        { lemma: 'merge', upos: 'VERB' },
        { lemma: 'casă', upos: 'NOUN' }, // dup
      ],
      { fetchImpl: fakeFetch, delayMs: 0 },
    );
    expect(calls.length).toBe(1);
    expect(out.get('casă')?.gloss).toBe('house');
    expect(out.get('merge')?.gloss).toBe('to walk');
  });

  it('marks missing pages as null', async () => {
    const fakeFetch: typeof fetch = async () => {
      const body = {
        query: {
          pages: [{ title: 'qwertyzzz', missing: true }],
        },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const out = await fetchGlossesBatch(
      [{ lemma: 'qwertyzzz', upos: 'NOUN' }],
      { fetchImpl: fakeFetch, delayMs: 0 },
    );
    expect(out.get('qwertyzzz')?.gloss).toBeNull();
  });
});
