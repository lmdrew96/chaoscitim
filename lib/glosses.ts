/**
 * Format UDPipe morphology and dependency labels into the human-readable
 * strings shown at tier 1 and tier 2 of the graduated-glossing UI.
 *
 * Romanian-tuned. Deliberately concise — labels appear inline next to the
 * word, so "fem sg, dat" beats "feminine singular dative case" every time.
 */

import type { Features, UPos } from '@/db/types';

// Compact case labels (incl. UD syncretic forms emitted by UDPipe-Romanian).
const CASE_LABELS: Record<string, string> = {
  Nom: 'nom',
  Acc: 'acc',
  Dat: 'dat',
  Gen: 'gen',
  Voc: 'voc',
  'Acc,Nom': 'nom/acc',
  'Dat,Gen': 'dat/gen',
};

const NUMBER_LABELS: Record<string, string> = {
  Sing: 'sg',
  Plur: 'pl',
};

const GENDER_LABELS: Record<string, string> = {
  Masc: 'masc',
  Fem: 'fem',
  Neut: 'neut',
};

const TENSE_LABELS: Record<string, string> = {
  Pres: 'present',
  Past: 'past',
  Imp: 'imperfect',
  Fut: 'future',
  Pqp: 'pluperfect',
};

const MOOD_LABELS: Record<string, string> = {
  Ind: 'indicative',
  Sub: 'subjunctive',
  Imp: 'imperative',
  Cnd: 'conditional',
};

const VERBFORM_LABELS: Record<string, string> = {
  Fin: 'finite',
  Inf: 'infinitive',
  Part: 'participle',
  Ger: 'gerund',
};

const PERSON_LABELS: Record<string, string> = {
  '1': '1st',
  '2': '2nd',
  '3': '3rd',
};

const DEFINITE_LABELS: Record<string, string> = {
  Def: 'definite',
  Ind: 'indefinite',
};

const VOICE_LABELS: Record<string, string> = {
  Act: 'active',
  Pass: 'passive',
};

/**
 * Tier-1 payload: morphology only, no head/deprel context.
 *
 * Returns a comma-separated string like "fem sg, dat" or "3rd pl, imperfect
 * indicative". Returns null when the token has no morphology worth showing
 * (e.g., punctuation, conjunctions). The UI should hide tier-1 in that
 * case rather than show an empty pill.
 */
export function formatTier1(upos: UPos, features: Features | null): string | null {
  if (!features) return null;

  // Order matters: this is the order labels appear in the rendered string.
  const parts: string[] = [];

  // For nominals and adjectives: gender + number + case + definiteness.
  if (
    upos === 'NOUN' ||
    upos === 'PROPN' ||
    upos === 'ADJ' ||
    upos === 'PRON' ||
    upos === 'DET' ||
    upos === 'NUM'
  ) {
    if (features.Gender) parts.push(GENDER_LABELS[features.Gender] ?? features.Gender);
    if (features.Number) parts.push(NUMBER_LABELS[features.Number] ?? features.Number);
    if (features.Case) parts.push(CASE_LABELS[features.Case] ?? features.Case);
    if (features.Definite) parts.push(DEFINITE_LABELS[features.Definite] ?? features.Definite);
  }

  // Verbs: person + number + tense + mood (+ voice if non-default).
  if (upos === 'VERB' || upos === 'AUX') {
    if (features.Person) parts.push(PERSON_LABELS[features.Person] ?? features.Person);
    if (features.Number) parts.push(NUMBER_LABELS[features.Number] ?? features.Number);
    if (features.Tense) parts.push(TENSE_LABELS[features.Tense] ?? features.Tense);
    if (features.Mood) parts.push(MOOD_LABELS[features.Mood] ?? features.Mood);
    else if (features.VerbForm) {
      parts.push(VERBFORM_LABELS[features.VerbForm] ?? features.VerbForm);
    }
    if (features.Voice && features.Voice !== 'Act') {
      parts.push(VOICE_LABELS[features.Voice] ?? features.Voice);
    }
  }

  if (parts.length === 0) return null;
  return parts.join(' ');
}

/**
 * Human-readable label for a UD dependency relation. Romanian-friendly.
 * Falls back to the raw deprel for relations the spec doesn't curate.
 */
const DEPREL_LABELS: Record<string, string> = {
  root: 'main verb',
  nsubj: 'subject of',
  'nsubj:pass': 'passive subject of',
  obj: 'direct object of',
  iobj: 'indirect object of',
  obl: 'oblique modifier of',
  'obl:agent': 'agent of',
  vocative: 'vocative addressing',
  ccomp: 'clausal complement of',
  xcomp: 'open complement of',
  expl: 'expletive of',
  'expl:pass': 'passive marker of',
  'expl:pv': 'reflexive marker of',
  nmod: 'nominal modifier of',
  amod: 'adjective modifier of',
  nummod: 'numeric modifier of',
  acl: 'relative clause of',
  'acl:relcl': 'relative clause of',
  advcl: 'adverbial clause of',
  advmod: 'adverbial modifier of',
  aux: 'auxiliary of',
  'aux:pass': 'passive auxiliary of',
  cop: 'copula of',
  mark: 'subordinating marker of',
  det: 'determiner of',
  case: 'preposition for',
  cc: 'coordinator',
  conj: 'conjunct with',
  appos: 'apposition to',
  fixed: 'part of',
  flat: 'part of',
  compound: 'compound with',
  parataxis: 'parataxis with',
  punct: 'punctuation',
  dep: 'dependent of',
};

/**
 * Tier-2 payload: grammatical role.
 *
 * Combines deprel-as-role with the head word's surface form to produce
 * "indirect object of *a da*" style labels. `headSurface` should be the
 * lemma when the head is a verb (so it reads naturally with "of"), and
 * the surface form otherwise. The caller decides — we just render.
 */
export function formatTier2(deprel: string, headSurface: string | null): string {
  const label = DEPREL_LABELS[deprel] ?? deprel;
  if (deprel === 'root' || deprel === 'punct' || deprel === 'cc') return label;
  if (!headSurface) return label;
  // Italicize the head word using markdown-ish *…*; Reader can choose to
  // render that. Otherwise read fine inline.
  return `${label} *${headSurface}*`;
}
