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
// Cases that are MARKED in Romanian — worth surfacing at tier 1. Nom/Acc
// is the unmarked default; suppressing it cuts pill noise dramatically.
const MARKED_CASE = new Set(['Dat', 'Gen', 'Voc', 'Dat,Gen']);

// Plain-English part-of-speech labels. UDPipe's UPos tags are universal
// dependency abbreviations; a learner needs the spelled-out word.
const POS_LABELS: Partial<Record<UPos, string>> = {
  NOUN: 'noun',
  PROPN: 'proper noun',
  ADJ: 'adjective',
  VERB: 'verb',
  AUX: 'auxiliary verb',
  ADV: 'adverb',
  ADP: 'preposition',
  DET: 'article',
  PRON: 'pronoun',
  CCONJ: 'conjunction',
  SCONJ: 'subordinator',
  NUM: 'number',
  PART: 'particle',
  INTJ: 'interjection',
};

export function formatTier1(upos: UPos, features: Features | null): string | null {
  const parts: string[] = [];
  const posLabel = POS_LABELS[upos];
  if (posLabel) parts.push(posLabel);

  // Verb-form overrides the bare "verb" label when the form itself is
  // more informative (participle / infinitive / gerund).
  if ((upos === 'VERB' || upos === 'AUX') && features) {
    if (features.VerbForm === 'Part') {
      parts[parts.length - 1] = 'past participle';
    } else if (features.VerbForm === 'Inf') {
      parts[parts.length - 1] = VERBFORM_LABELS.Inf!;
    } else if (features.VerbForm === 'Ger') {
      parts[parts.length - 1] = VERBFORM_LABELS.Ger!;
    }
  }

  if (!features) return parts.length > 0 ? parts.join(' · ') : null;

  // Nouns: definiteness is the most distinctive Romanian fact (suffixed
  // article); show case only when it's marked (not nom/acc). Skip gender —
  // it's available in features data but rarely needed for parsing.
  if (upos === 'NOUN' || upos === 'PROPN') {
    if (features.Definite) parts.push(DEFINITE_LABELS[features.Definite] ?? features.Definite);
    if (features.Case && MARKED_CASE.has(features.Case)) {
      parts.push(CASE_LABELS[features.Case] ?? features.Case);
    }
  }

  // Adjectives: number + gender (agreement is the point of adjectives).
  else if (upos === 'ADJ') {
    if (features.Number) parts.push(NUMBER_LABELS[features.Number] ?? features.Number);
    if (features.Gender) parts.push(GENDER_LABELS[features.Gender] ?? features.Gender);
  }

  // Pronouns: person + marked-case + reflexive flag.
  else if (upos === 'PRON') {
    if (features.Person) parts.push(PERSON_LABELS[features.Person] ?? features.Person);
    if (features.Case && MARKED_CASE.has(features.Case)) {
      parts.push(CASE_LABELS[features.Case] ?? features.Case);
    }
    if (features.Reflex === 'Yes') parts.push('reflexive');
  }

  // Determiners: just definiteness, if any.
  else if (upos === 'DET') {
    if (features.Definite) parts.push(DEFINITE_LABELS[features.Definite] ?? features.Definite);
  }

  // Finite verbs: person + tense, plus mood if it's non-default.
  // Skip number (implicit in person), skip voice (active is default).
  else if (upos === 'VERB' || upos === 'AUX') {
    const isNonFinite =
      features.VerbForm === 'Part' ||
      features.VerbForm === 'Inf' ||
      features.VerbForm === 'Ger';
    if (!isNonFinite) {
      if (features.Person) parts.push(PERSON_LABELS[features.Person] ?? features.Person);
      if (features.Tense) parts.push(TENSE_LABELS[features.Tense] ?? features.Tense);
      if (features.Mood && features.Mood !== 'Ind') {
        parts.push(MOOD_LABELS[features.Mood] ?? features.Mood);
      }
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
// Labels are designed to read as noun phrases — "{label} *X*" where X is
// the head — so the head never sounds like the subject of an action. E.g.
// "object of *cere*" (clear) NOT "what acts on *cere*" (reads backwards).
const DEPREL_LABELS: Record<string, string> = {
  root: 'main verb',
  nsubj: 'subject of',
  'nsubj:pass': 'passive subject of',
  obj: 'object of',
  iobj: 'indirect object of',
  obl: 'circumstance of',
  'obl:agent': 'doer behind',
  vocative: 'addressee of',
  ccomp: 'clause completing',
  xcomp: 'completer of',
  expl: 'placeholder for',
  'expl:pass': 'passive marker for',
  'expl:pv': 'reflexive "se" for',
  'expl:poss': 'possessive reflexive for',
  nmod: 'modifier of',
  amod: 'describes',
  nummod: 'counts',
  acl: 'describes (clause)',
  'acl:relcl': 'describes (clause)',
  advcl: 'background to',
  advmod: 'modifies',
  aux: 'helper for',
  'aux:pass': 'passive helper for',
  cop: 'linking "to be" for',
  mark: 'introduces',
  det: 'article/this/that for',
  case: 'preposition for',
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
