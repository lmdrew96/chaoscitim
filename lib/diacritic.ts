// Diacritic restoration for Romanian text.
//
// v1: no-op passthrough. Seeded library content is curated and assumed
// to be properly diacriticked (Wikipedia RO, Wikisource RO).
//
// The proper restoration algorithm — recovering ș/ț from s/t in
// informal/BYO Romanian — is tracked under the dedicated patch
// "Diacritic restoration preprocessor" in ChaosPatch. When that patch
// lands, replace the body of `restoreDiacritics` with the real
// implementation. The hook signature stays stable.
//
// Returns { restored, changed }: `restored` is the (possibly identical)
// output text; `changed` is true iff restoration altered any character.
// The ingestion script uses `changed` to decide whether to populate
// `texts.rawContentOriginal` — empty when nothing was restored.

export interface DiacriticResult {
  restored: string;
  changed: boolean;
}

export function restoreDiacritics(input: string): DiacriticResult {
  // TODO: implement per the diacritic-restoration patch
  return { restored: input, changed: false };
}
