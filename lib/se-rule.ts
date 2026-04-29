// Bare-*se* disambiguation, app-layer post-processing.
//
// UDPipe collapses impersonal and true-reflexive *se* into the same
// `expl:pv` deprel per UD-Romanian convention; this rule recovers the
// distinction by inspecting the dependency graph. Validated empirically
// against docs/phase2/se-test.conllu in Phase 2.
//
// Rules:
// - deprel = `expl:pass`            → passive
// - deprel = `expl:pv`:
//     - verb is 1st or 2nd person            → reflexive (subject is implicit, never impersonal)
//     - verb is 3rd person, has nsubj        → reflexive
//     - verb is 3rd person, no nsubj         → impersonal
// Anything else returns null (not a *se* clitic, or unclear).

import type { ParsedSentence, ParsedToken } from './conllu';
import type { SeReading } from '../db/types';

export function classifySeReading(
  token: ParsedToken,
  sentence: ParsedSentence,
): SeReading | null {
  if (token.deprel === 'expl:pass') return 'passive';
  if (token.deprel !== 'expl:pv') return null;
  if (token.head === null) return null;

  const verb = sentence.tokens.find((t) => t.id === token.head);
  if (!verb) return null;

  const verbPerson = verb.feats.Person;
  if (verbPerson === '1' || verbPerson === '2') return 'reflexive';

  // Verb is 3rd person (or person feature missing — treat as 3rd).
  const hasNsubj = sentence.tokens.some(
    (t) =>
      t.head === verb.id &&
      (t.deprel === 'nsubj' ||
        t.deprel === 'nsubj:pass' ||
        t.deprel === 'csubj' ||
        t.deprel === 'csubj:pass'),
  );

  return hasNsubj ? 'reflexive' : 'impersonal';
}

// Convenience: walk a parsed sentence and return a map of
// tokenId → SeReading for every *se* clitic. Tokens not classified are
// omitted from the map.
export function classifyAllSe(
  sentence: ParsedSentence,
): Map<number, SeReading> {
  const result = new Map<number, SeReading>();
  for (const token of sentence.tokens) {
    if (token.deprel !== 'expl:pass' && token.deprel !== 'expl:pv') continue;
    const reading = classifySeReading(token, sentence);
    if (reading) result.set(token.id, reading);
  }
  return result;
}
