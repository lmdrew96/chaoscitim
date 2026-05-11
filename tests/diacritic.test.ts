import { describe, it, expect } from 'vitest';
import { restoreDiacritics } from '../lib/diacritic';

describe('restoreDiacritics — Unicode normalization', () => {
  it('rewrites legacy cedilla forms to comma-below', () => {
    const { restored, changed } = restoreDiacritics('Bucureşti, ţară');
    expect(restored).toBe('București, țară');
    expect(changed).toBe(true);
  });

  it('rewrites uppercase legacy cedilla forms', () => {
    const { restored, changed } = restoreDiacritics('ŞTIRE ŢARĂ');
    expect(restored).toBe('ȘTIRE ȚARĂ');
    expect(changed).toBe(true);
  });

  it('is a no-op on already-clean text', () => {
    const { restored, changed } = restoreDiacritics('București, țară');
    expect(restored).toBe('București, țară');
    expect(changed).toBe(false);
  });
});

describe('restoreDiacritics — substitution map', () => {
  it('substitutes unambiguous high-frequency words', () => {
    const { restored, changed } = restoreDiacritics('eu si tu');
    expect(restored).toBe('eu și tu');
    expect(changed).toBe(true);
  });

  it('substitutes verb forms of a ști', () => {
    const { restored } = restoreDiacritics('eu stiu, tu stii, el stie');
    expect(restored).toBe('eu știu, tu știi, el știe');
  });

  it('substitutes î-prefixed clitics in isolation', () => {
    const { restored } = restoreDiacritics('il vad, ii dau, imi place');
    // "vad" stays as-is — not in map. Substitution covers il/ii/imi only.
    expect(restored).toBe('îl vad, îi dau, îmi place');
  });

  it('preserves case (title)', () => {
    const { restored } = restoreDiacritics('Si apoi');
    expect(restored).toBe('Și apoi');
  });

  it('preserves case (upper)', () => {
    const { restored } = restoreDiacritics('SI');
    expect(restored).toBe('ȘI');
  });

  it('respects word boundaries — does not match inside other words', () => {
    // "si" inside "asistent" must NOT trigger substitution.
    const { restored, changed } = restoreDiacritics('asistent');
    expect(restored).toBe('asistent');
    expect(changed).toBe(false);
  });
});

describe('restoreDiacritics — precision (must NOT substitute)', () => {
  it('leaves ambiguous def-article forms alone', () => {
    // casa = "the house" def OR "casă" indef stripped — ambiguous, skip.
    // fata = "the girl" def OR "fată" indef stripped — ambiguous, skip.
    // scoala = "the school" def OR "școală" indef stripped — ambiguous, skip.
    // viata = "the life" def OR "viață" indef stripped — ambiguous, skip.
    const input = 'casa fata scoala viata tara biserica varsta';
    const { restored, changed } = restoreDiacritics(input);
    expect(restored).toBe(input);
    expect(changed).toBe(false);
  });

  it('leaves unknown undiacriticked words alone', () => {
    const { restored, changed } = restoreDiacritics('xyzzy abcdef');
    expect(restored).toBe('xyzzy abcdef');
    expect(changed).toBe(false);
  });
});

describe('restoreDiacritics — combined passes', () => {
  it('normalizes legacy code points AND substitutes', () => {
    const { restored, changed } = restoreDiacritics('eu si Bucureşti');
    expect(restored).toBe('eu și București');
    expect(changed).toBe(true);
  });

  it('treats input that only needs codepoint fixes as changed=true', () => {
    const { changed } = restoreDiacritics('Bucureşti');
    expect(changed).toBe(true);
  });

  it('treats input that only needs word substitution as changed=true', () => {
    const { changed } = restoreDiacritics('eu si tu');
    expect(changed).toBe(true);
  });
});

describe('restoreDiacritics — assorted i-prefix and î forms', () => {
  it('handles intelege family', () => {
    const { restored } = restoreDiacritics('inteleg, intelegi, intelegem, intelegeti, inteles');
    expect(restored).toBe('înțeleg, înțelegi, înțelegem, înțelegeți, înțeles');
  });

  it('handles maine/paine/caine', () => {
    const { restored } = restoreDiacritics('maine vine cu paine si caine');
    expect(restored).toBe('mâine vine cu pâine și câine');
  });
});
