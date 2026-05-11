/**
 * Format UDPipe morphology and dependency labels into the human-readable
 * strings shown at tier 1 and tier 2 of the graduated-glossing UI.
 *
 * Romanian-tuned. Deliberately concise — labels appear inline next to the
 * word, so "fem sg, dat" beats "feminine singular dative case" every time.
 */

import type { Features, UPos } from '@/db/types';

// Plain-English labels (incl. UD syncretic forms emitted by UDPipe-Romanian).
// Cases describe *what role the form plays* rather than naming the case directly.
const CASE_LABELS: Record<string, string> = {
  Nom: 'subject form',
  Acc: 'object form',
  Dat: 'to/for form',
  Gen: 'of form',
  Voc: 'calling form',
  'Acc,Nom': 'subject/object form',
  'Dat,Gen': 'to/of form',
};

const NUMBER_LABELS: Record<string, string> = {
  Sing: 'singular',
  Plur: 'plural',
};

const GENDER_LABELS: Record<string, string> = {
  Masc: 'masculine',
  Fem: 'feminine',
  Neut: 'neuter',
};

const TENSE_LABELS: Record<string, string> = {
  Pres: 'present',
  Past: 'past',
  Imp: 'was-doing form',
  Fut: 'future',
  Pqp: 'had-done form',
};

const MOOD_LABELS: Record<string, string> = {
  Ind: 'statement',
  Sub: 'subjunctive "să"',
  Imp: 'command',
  Cnd: 'would-form',
};

const VERBFORM_LABELS: Record<string, string> = {
  Fin: 'conjugated',
  Inf: 'infinitive "a …"',
  Part: 'participle',
  Ger: '-ing form',
};

const PERSON_LABELS: Record<string, string> = {
  '1': 'I/we',
  '2': 'you',
  '3': 'he/she/they',
};

const DEFINITE_LABELS: Record<string, string> = {
  Def: 'the',
  Ind: 'a/an',
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
  return parts.join(' · ');
}

/**
 * Human-readable label for a UD dependency relation. Romanian-friendly.
 * Falls back to the raw deprel for relations the spec doesn't curate.
 */
const DEPREL_LABELS: Record<string, string> = {
  root: 'main verb',
  nsubj: 'who/what does',
  'nsubj:pass': 'who/what receives',
  obj: 'what acts on',
  iobj: 'who/what it is for',
  obl: 'when/where/how of',
  'obl:agent': 'done by',
  vocative: 'calling',
  ccomp: 'what (clause)',
  xcomp: 'what tries to do',
  expl: 'placeholder for',
  'expl:pass': 'passive marker for',
  'expl:pv': 'reflexive "se" for',
  nmod: 'of',
  amod: 'describes',
  nummod: 'counts',
  acl: 'describes (clause)',
  'acl:relcl': 'describes (clause)',
  advcl: 'when/why of',
  advmod: 'how/when of',
  aux: 'helps form',
  'aux:pass': 'passive helper for',
  cop: 'links to (to be)',
  mark: 'introduces',
  det: 'marks',
  case: 'connects to',
  cc: 'and/or word',
  conj: 'joined to',
  appos: 'another name for',
  fixed: 'part of',
  flat: 'part of',
  compound: 'compound with',
  parataxis: 'side-by-side with',
  punct: 'punctuation',
  dep: 'connected to',
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
