// Shared types for the texts / text_sentences / text_tokens schema.
// Pure TypeScript unions — Zod runtime validation lives with the
// ingestion script (next patch).

export type SourceType =
  | 'wikipedia_ro'
  | 'wikisource_ro'
  | 'cc_blog'
  | 'friend_contributed'
  | 'byo_url'
  | 'byo_paste'
  | 'byo_pdf'
  | 'byo_epub'
  | 'byo_clipboard';

export type License =
  | 'cc_by'
  | 'cc_by_sa'
  | 'cc_by_nc'
  | 'cc_by_nc_sa'
  | 'cc0'
  | 'public_domain'
  | 'friend_explicit_grant'
  | 'user_byo';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type Visibility = 'public_seed' | 'private' | 'cohort_shared';

// Result of app-layer post-processing on bare-*se* per the analyzer eval.
// Null when the token is not *se* or the rule produces no confident reading.
export type SeReading = 'passive' | 'impersonal' | 'reflexive';

// Reading-session mode. See docs/specs/graduated-glossing.md §Session modes.
// 'show_all' is the "I'm tired" honest-opt-out — token_encounters in this
// mode are flagged counted_in_curve=false.
export type SessionMode = 'active' | 'assisted' | 'show_all' | 'practice';

// Why the session ended. The 30-min idle rule lives in
// docs/specs/graduated-glossing.md §Definition of "session".
export type SessionEndReason =
  | 'explicit'        // user pressed "Done reading"
  | 'idle_sweeper'    // server sweeper closed it after 30+ min of silence
  | 'tab_closed';     // (v1+) PWA detected tab close before idle timeout

// Event types in interaction_events. Hover is intentionally not logged —
// it's exploratory per the gloss spec.
export type EventType =
  | 'tap'                 // escalation (tier_reached carries the new tier)
  | 'mode_change'         // payload: { from, to }
  | 'practice_guess'      // payload: { guess, correct_value, is_match }
  | 'ambiguity_override'; // (v1+) payload: { parser_pick, user_pick }

// Practice mode case-quiz options. Scope at v1+ launch is case only,
// per docs/specs/graduated-glossing.md §Practice mode.
export type PracticeCaseGuess = 'nom_acc' | 'gen_dat' | 'voc' | 'idk';

// Universal POS tags (UD). UDPipe emits these.
export type UPos =
  | 'ADJ' | 'ADP' | 'ADV' | 'AUX' | 'CCONJ' | 'DET' | 'INTJ'
  | 'NOUN' | 'NUM' | 'PART' | 'PRON' | 'PROPN' | 'PUNCT'
  | 'SCONJ' | 'SYM' | 'VERB' | 'X';

// Morphology features. Each token exposes a subset; keys correspond to
// UD feature names. Values are string-typed because UD allows compound
// values (e.g., 'Acc,Nom', 'Dat,Gen' for syncretic case marking) and the
// inflection inventory evolves between UD releases. Index signature
// preserves forward compatibility — unknown keys round-trip safely.
export interface Features {
  Case?: 'Nom' | 'Acc' | 'Gen' | 'Dat' | 'Voc' | 'Acc,Nom' | 'Dat,Gen';
  Number?: 'Sing' | 'Plur';
  Gender?: 'Masc' | 'Fem' | 'Neut';
  Person?: '1' | '2' | '3';
  Tense?: 'Pres' | 'Past' | 'Imp' | 'Fut' | 'Pqp';
  Mood?: 'Ind' | 'Sub' | 'Imp' | 'Cnd';
  VerbForm?: 'Fin' | 'Inf' | 'Part' | 'Ger';
  Voice?: 'Act' | 'Pass';
  Definite?: 'Def' | 'Ind';
  Reflex?: 'Yes';
  Strength?: 'Weak' | 'Strong';
  Variant?: 'Short' | 'Long';
  Position?: 'Prenom' | 'Postnom';
  Polarity?: 'Pos' | 'Neg';
  PronType?: 'Prs' | 'Dem' | 'Int' | 'Rel' | 'Ind' | 'Tot' | 'Neg' | 'Art';
  Degree?: 'Pos' | 'Cmp' | 'Sup';
  AdpType?: 'Prep' | 'Post';
  ExtPos?: string;
  'Number[psor]'?: 'Sing' | 'Plur';
  [key: string]: string | undefined;
}

// One alternative parse for an ambiguous surface form (e.g., *merg* could
// parse as 1sg or 3pl). Populated at ingestion by the homography-table
// patch. v1 ships with this column null on every row.
export interface AmbiguityAlternative {
  upos: UPos;
  xpos?: string;
  lemma: string;
  features: Features;
  // Optional pedagogical label, e.g. '1sg present indicative (eu)'.
  label?: string;
}

// Mapping of UDPipe model identifier → license inherited by token data.
// Authoritative source for `texts.analyzerLicense`. Keep in sync with
// the analyzer evaluation report when adding a new model option.
export const ANALYZER_LICENSES: Record<string, License> = {
  'romanian-rrt-ud-2.17-251125': 'cc_by_nc_sa',
};
