# Romanian NLP Analyzer Evaluation

**Patch:** Research Romanian NLP/morphology tooling — pick the analyzer
**Date:** 2026-04-28
**Status:** Phase 1 (desk research) complete. Recommendation below.

## TL;DR

**Pick UDPipe 2.** Ship v1 against the hosted LINDAT REST endpoint
(`https://lindat.mff.cuni.cz/services/udpipe/`). Self-host the Docker image
later if traffic outgrows the academic service. Use **dexonline** as a
complementary lookup for tier-3 paradigm/lemma enrichment — not as the
primary analyzer.

Diacritic restoration is **orthogonal** to this pick and stays its own patch.

---

## Comparison: off-the-shelf accuracy on UD Romanian RRT

All scores are end-to-end (raw text → CoNLL-U) on the official UD test set.

| Tool                             | UPOS  | UFeats / Morph | Lemma | LAS   | Notes                                 |
| -------------------------------- | ----- | -------------- | ----- | ----- | ------------------------------------- |
| **UDPipe 2** (UD 2.17)           | 97.86 | **97.38**      | 98.10 | 88.84 | Best on every metric; hosted REST     |
| Stanza (UD 2.15)                 | 97.50 | 97.10          | 97.42 | 86.86 | Close 2nd; Python-only, self-host     |
| spaCy `ro_core_news_lg` 3.8.0    | 93.87 | 94.94          | 95.69 | 84.30 | ~2.5pt morph gap; ergonomic but weak  |
| bert-base-romanian-cased-v1      | 98.00 | n/a            | n/a   | 89.69 | Base LM only — no tagger off the shelf |
| dexonline                        | n/a   | n/a            | n/a   | n/a   | Dictionary, not contextual analyzer   |

**Why UDPipe 2 over Stanza:** UDPipe 2 leads on all four metrics with the
freshest training data (UD 2.17 vs Stanza's 2.15) and a free hosted REST API.
Stanza is excellent but offers nothing UDPipe 2 doesn't, and it requires
self-hosting + Python in our pipeline.

**Why not spaCy:** A 2.4pt gap on UFeats and a 2.4pt gap on lemma sounds
small but compounds at the construction level — we're glossing morphology, so
mistagging case is the failure case the product can least afford. spaCy's
ergonomics don't recover that.

**Why not RoBERT-based:** `dumitrescustefan/bert-base-romanian-cased-v1` has
the best UPOS (98.00), but it's a base LM. We'd need to fine-tune a tagger
on UD-RRT, train morphology heads, and host inference ourselves. That's
~weeks of work for a marginal gain over UDPipe 2 (which already does
everything end-to-end). Revisit only if production data shows UDPipe 2
failing on a register we care about.

---

## Why dexonline isn't an alternative — and what it *is* good for

Dexonline is a Romanian dictionary, not a contextual tagger. Given the form
*casa*, dexonline returns all possible parses (definite-articulated nominative
of *casă*, etc.); it does not pick the right one based on sentence context.
For graduated glossing we need exactly one tag per token, in context. So
UDPipe 2 drives tagging.

But dexonline has data UDPipe 2 doesn't: full inflectional paradigms,
register/stylistic notes, etymology, and authoritative definitions. That's
exactly what we want at **tier 3** (English gloss + lemma + paradigm view).

**No official API.** Two practical paths:
- Scrape `dexonline.ro/definitie/<word>` (third-party reference impls:
  [BlackKakapo/dexonline-API](https://github.com/BlackKakapo/dexonline-API),
  [k6w/ro-dexify-api](https://github.com/k6w/ro-dexify-api))
- Import the SQL dump and host locally (most robust; respects the project)

Decide between these when the tier-3 UI patch happens.

**Schema implication for the `text_tokens` patch:** the table needs a column
for analyzer features (UDPipe-derived, per-token-in-context) **and** a
separate link to a paradigm/lemma record (dexonline-derived, per-lemma).
Don't conflate them.

---

## Integration plan

**v1 (ingestion script, ~25 seed texts):**
- Call LINDAT REST endpoint from the server-side ingestion pipeline.
- Cache the analyzer output verbatim in `text_tokens` so the analyzer is hit
  exactly once per text.
- LINDAT is a free academic service. For ~25 texts it's a non-issue.

**Production hedge (when BYO ingestion goes live):**
- UDPipe 2 ships a Docker image. Self-host on Railway/Render/Fly behind the
  ingestion worker. No model retraining needed; we use the same RRT model.
- Keep the analyzer behind an `analyze(text) → tokens` interface so swapping
  hosted-LINDAT → self-hosted is a one-file change.

**The constraint to flag:** LINDAT is a *free academic service*. Fine for v1
seeded library. Real risk if BYO ingestion grows — both for rate limits and
because the service could change terms. Self-hosting the Docker image is the
exit ramp; don't write code that assumes LINDAT is permanent.

---

## Diacritic restoration — orthogonal, deferred

UDPipe 2's 97% UFeats is on properly-diacriticked text. Informal Romanian
(Reddit, SMS) drops ș/ț → s/t and accuracy will fall. **None of the
analyzers solve this** — it's a preprocessing problem.

State of the art (per [arXiv 2511.13182](https://arxiv.org/abs/2511.13182))
is LLM-based restoration with GPT-4o leading, but that's expensive per token
and overkill for v1. Cheaper deterministic approaches exist (rule + dictionary
lookup) and likely suffice for the seeded library, where we control text
quality. Punt the deep eval to the diacritic-restoration patch.

For now: assume seeded-library text is clean. Treat BYO informal text as a
v1+ problem, gated on the diacritic-restoration patch landing.

---

## Phase 2: validation, not bake-off

The desk-research gap is large enough that a 4-way head-to-head on sample
passages would waste effort. Phase 2 is narrower: **confirm UDPipe 2 holds
up on the registers we care about.**

Run UDPipe 2 (LINDAT REST) on three short passages and spot-check:
- **News:** Adevărul / Digi24 — clean modern prose. UDPipe should crush this.
- **Literary:** Caragiale / Eminescu prose — older syntax, rich morphology,
  mobile clitics around the perfect compound. The realistic worst case for
  the seeded library.
- **Informal (with diacritics restored):** Reddit r/Romania thread, manually
  diacriticked. Tests that conversational syntax doesn't break the parser
  even with clean orthography.

**Pass criteria:** no systematic failures on
- genitive-dative case marking on articulated feminine NPs
- compound perfect (am/ai/a + past participle) clitic ordering
- reflexive *se* (reflexive vs passive vs impersonal)
- definite article suffix recognition

If it passes: ship. If literary syntax collapses: revisit RoBERT-fine-tune
or stanza fallback for that register tier specifically. If only informal
collapses: that's the diacritic-restoration patch becoming blocking, not an
analyzer problem.

---

## Sources

- [Stanza performance](https://stanfordnlp.github.io/stanza/performance.html)
- [UDPipe 2 models](https://ufal.mff.cuni.cz/udpipe/2/models)
- [spaCy ro_core_news_lg-3.8.0 release](https://github.com/explosion/spacy-models/releases/tag/ro_core_news_lg-3.8.0)
- [bert-base-romanian-cased-v1](https://huggingface.co/dumitrescustefan/bert-base-romanian-cased-v1)
- [RELATE platform paper (RACAI, 2024)](https://arxiv.org/html/2410.21778)
- [Diacritic restoration eval (2025)](https://arxiv.org/abs/2511.13182)
- [UD Romanian RRT treebank](https://universaldependencies.org/treebanks/ro_rrt/index.html)
