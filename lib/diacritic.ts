// Diacritic restoration for Romanian text.
//
// Two-pass, precision-first:
//   1. Unicode normalization — always safe.
//        ş (U+015F cedilla, legacy) → ș (U+0219 comma-below)
//        Ş (U+015E)                → Ș (U+0218)
//        ţ (U+0163)                → ț (U+021B)
//        Ţ (U+0162)                → Ț (U+021A)
//        Then NFC. These code points appear in the wild — Turkish
//        keyboards, older fonts, Windows-1250 round-trips. The cedilla
//        forms are *visually* the same letter but UDPipe tokenizes
//        differently against them.
//   2. Substitution map (data/diacritic-map.json) — restores ASCII forms
//        whose only Romanian interpretation is the diacriticked value.
//        Matched on lowercased word boundaries; case is projected back.
//        AMBIGUOUS forms (e.g. casa/casă, fata/fată, scoala/școală) are
//        deliberately excluded — UDPipe can pick its own parse rather
//        than us lying to it.
//
// Returns { restored, changed }: `restored` is the (possibly identical)
// output text; `changed` is true iff restoration altered any character.
// The ingestion script uses `changed` to decide whether to populate
// `texts.rawContentOriginal` — empty when nothing was restored.

import diacriticMap from '../data/diacritic-map.json';

export interface DiacriticResult {
  restored: string;
  changed: boolean;
}

const LEGACY_TO_COMMA: Record<string, string> = {
  'ş': 'ș', // ş → ș
  'Ş': 'Ș', // Ş → Ș
  'ţ': 'ț', // ţ → ț
  'Ţ': 'Ț', // Ţ → Ț
};

const SUBSTITUTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(diacriticMap).filter(([k]) => !k.startsWith('_')),
);

// Match Romanian word characters: ASCII letters plus already-diacriticked
// forms (so we don't split "așa" mid-token if it's already partially fixed).
const WORD_RE = /[A-Za-zĂăÂâÎîȘșȚțŞşŢţ]+/g;

function normalizeCodepoints(input: string): string {
  let out = '';
  for (const ch of input) {
    out += LEGACY_TO_COMMA[ch] ?? ch;
  }
  return out.normalize('NFC');
}

type CaseShape = 'lower' | 'upper' | 'title' | 'mixed';

function caseOf(word: string): CaseShape {
  if (word.length === 0) return 'lower';
  if (word === word.toLowerCase()) return 'lower';
  if (word === word.toUpperCase()) return 'upper';
  const first = word.charAt(0);
  if (
    first === first.toUpperCase() &&
    word.slice(1) === word.slice(1).toLowerCase()
  ) {
    return 'title';
  }
  return 'mixed';
}

function applyCase(word: string, shape: CaseShape): string {
  switch (shape) {
    case 'upper':
      return word.toUpperCase();
    case 'title':
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    case 'mixed':
    case 'lower':
      return word;
  }
}

function substituteWords(input: string): { out: string; changed: boolean } {
  let changed = false;
  const out = input.replace(WORD_RE, (word) => {
    const replacement = SUBSTITUTIONS[word.toLowerCase()];
    if (!replacement) return word;
    const recased = applyCase(replacement, caseOf(word));
    if (recased !== word) changed = true;
    return recased;
  });
  return { out, changed };
}

export function restoreDiacritics(input: string): DiacriticResult {
  const normalized = normalizeCodepoints(input);
  const normalizedChanged = normalized !== input;
  const { out, changed: subChanged } = substituteWords(normalized);
  return {
    restored: out,
    changed: normalizedChanged || subChanged,
  };
}
