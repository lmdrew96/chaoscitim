import { describe, it, expect } from 'vitest';
import {
  findMWEMatches,
  findMatchAt,
  loadMWETable,
  type MWE,
  type MatchableToken,
} from '../lib/mwe';

// Helper: build a MatchableToken stream from compact triples [pos, lemma, upos].
const tokens = (rows: [number, string, string][]): MatchableToken[] =>
  rows.map(([tokenPosition, lemma, upos]) => ({ tokenPosition, lemma, upos }));

const TABLE: MWE[] = [
  { lemmas: ['sine', 'da', 'seamă'], gloss: 'to realize' },
  { lemmas: ['sine', 'avea', 'da', 'seamă'], gloss: 'to realize' },
  { lemmas: ['de', 'altfel'], gloss: 'besides' },
  { lemmas: ['ține', 'minte'], gloss: 'to remember' },
];

describe('findMWEMatches', () => {
  it('matches a 3-lemma idiom in canonical form', () => {
    // Își dă seama .
    const out = findMWEMatches(
      tokens([
        [1, 'sine', 'PRON'],
        [2, 'da', 'VERB'],
        [3, 'seamă', 'NOUN'],
        [4, '.', 'PUNCT'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startPos: 1, endPos: 3 });
    expect(out[0]!.mwe.gloss).toBe('to realize');
  });

  it('matches the compound-past 4-lemma variant when both entries are in the table', () => {
    // Și-a dat seama . → sine + avea + da + seamă
    const out = findMWEMatches(
      tokens([
        [1, 'sine', 'PRON'],
        [2, 'avea', 'AUX'],
        [3, 'da', 'VERB'],
        [4, 'seamă', 'NOUN'],
        [5, '.', 'PUNCT'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startPos: 1, endPos: 4 });
  });

  it('picks the longest entry when a shorter one is a prefix (greedy longest-first)', () => {
    // ["sine", "da", "seamă"] would match positions 1-3 of the 4-token stream,
    // but ["sine", "avea", "da", "seamă"] does NOT (no "avea" at pos 2). So the
    // shorter entry wins here — verifying longest-first doesn't over-match.
    const out = findMWEMatches(
      tokens([
        [1, 'sine', 'PRON'],
        [2, 'da', 'VERB'],
        [3, 'seamă', 'NOUN'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.mwe.lemmas).toEqual(['sine', 'da', 'seamă']);
  });

  it('finds multiple non-overlapping matches in a sentence', () => {
    // De altfel, ține minte.
    const out = findMWEMatches(
      tokens([
        [1, 'de', 'ADP'],
        [2, 'altfel', 'ADV'],
        [3, ',', 'PUNCT'],
        [4, 'ține', 'VERB'],
        [5, 'minte', 'NOUN'],
        [6, '.', 'PUNCT'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ startPos: 1, endPos: 2 });
    expect(out[1]).toMatchObject({ startPos: 4, endPos: 5 });
  });

  it('returns no matches when no entry applies', () => {
    const out = findMWEMatches(
      tokens([
        [1, 'eu', 'PRON'],
        [2, 'merge', 'VERB'],
        [3, 'acasă', 'ADV'],
      ]),
      TABLE,
    );
    expect(out).toEqual([]);
  });

  it('handles non-contiguous tokenPositions (MWT-split numbering)', () => {
    // Simulates UDPipe MWT decomposition where positions could skip.
    // The matcher operates on the FILTERED word sequence, so position numbers
    // need not be contiguous — startPos/endPos echo the original positions.
    const out = findMWEMatches(
      tokens([
        [5, 'de', 'ADP'],
        [7, 'altfel', 'ADV'],
        [8, '.', 'PUNCT'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startPos: 5, endPos: 7 });
  });

  it('skips punctuation inside the word stream when matching', () => {
    // Punctuation must not block adjacent-lemma matches. (Comma between
    // "de" and "altfel" is hypothetical — real text wouldn't comma-split
    // an idiom — but the filter behavior should still hold.)
    const out = findMWEMatches(
      tokens([
        [1, 'de', 'ADP'],
        [2, ',', 'PUNCT'],
        [3, 'altfel', 'ADV'],
      ]),
      TABLE,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startPos: 1, endPos: 3 });
  });

  it('emits non-overlapping matches when entries could overlap', () => {
    // Pathological table: two entries that would overlap at the same start.
    const overlapping: MWE[] = [
      { lemmas: ['a', 'b'], gloss: 'short' },
      { lemmas: ['a', 'b', 'c'], gloss: 'long' },
    ];
    const out = findMWEMatches(
      tokens([
        [1, 'a', 'X'],
        [2, 'b', 'X'],
        [3, 'c', 'X'],
      ]),
      overlapping,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.mwe.gloss).toBe('long'); // longest-first wins
  });
});

describe('findMatchAt', () => {
  const matches = [
    { startPos: 1, endPos: 3, mwe: { lemmas: ['a', 'b', 'c'], gloss: 'g1' } },
    { startPos: 5, endPos: 6, mwe: { lemmas: ['d', 'e'], gloss: 'g2' } },
  ];

  it('returns the containing match', () => {
    expect(findMatchAt(2, matches)?.mwe.gloss).toBe('g1');
    expect(findMatchAt(5, matches)?.mwe.gloss).toBe('g2');
    expect(findMatchAt(6, matches)?.mwe.gloss).toBe('g2');
  });

  it('returns null when no match contains the position', () => {
    expect(findMatchAt(4, matches)).toBeNull();
    expect(findMatchAt(7, matches)).toBeNull();
  });
});

describe('loadMWETable', () => {
  it('loads the committed seed table and filters out the comment row', () => {
    const table = loadMWETable();
    expect(table.length).toBeGreaterThan(20);
    // Every entry has valid shape.
    for (const e of table) {
      expect(Array.isArray(e.lemmas)).toBe(true);
      expect(e.lemmas.length).toBeGreaterThan(0);
      expect(typeof e.gloss).toBe('string');
      expect(e.gloss.length).toBeGreaterThan(0);
    }
  });

  it('contains expected canonical entries', () => {
    const table = loadMWETable();
    const realizing = table.find(
      (e) => e.lemmas.join('|') === 'sine|da|seamă',
    );
    expect(realizing?.gloss).toBe('to realize');
  });
});
