# Phase 2 Validation Report — UDPipe 2 on three Romanian registers

**Patch:** Research Romanian NLP/morphology tooling — pick the analyzer
**Model tested:** `romanian-rrt-ud-2.17-251125` via LINDAT REST
**Date:** 2026-04-28

## TL;DR

UDPipe 2 passes 4 of the 5 pass criteria cleanly across all three
registers. The 5th (bare *se* disambiguation) is **partial** — passive vs
non-passive is clean, but impersonal vs true reflexive collapse into the
same UD deprel. This is a UD-Romanian annotation convention, not a UDPipe
defect, and is fixable with a few lines of post-processing. **Ship it.**

Two non-blocking issues to track as v1+ concerns:
1. **Pro-drop verb ambiguity in informal text** — when a finite verb form is
   homographous between 1sg and 3pl (e.g. *merg*, *prind*) and there's no
   explicit subject pronoun, the tagger picks 3pl. Mitigation lives at the UI
   layer, not the analyzer.
2. **Slang/loanword OOV** — *mișto*, *rău* (as intensifier), *Salut* (as
   greeting) are mistagged. Predictable; degrades gracefully and does not
   break surrounding morphology.

**License decision (2026-04-28):** Accepted NC. ChaosCitim stays
free/donation-supported. See [§Operational notes](#operational-notes-from-running-this)
for downstream implications.

Outputs are checked into `docs/phase2/{news,literary,informal,se-test}.conllu`.

---

## Pass criteria — results across all three passages

| Criterion                                         | News | Literary | Informal | Verdict           |
| ------------------------------------------------- | :--: | :------: | :------: | :---------------- |
| Genitive-dative on articulated NPs                | ✅   | ✅       | ✅       | PASS              |
| Compound perfect (am/ai/a + Part) with clitics    | ✅   | n/a      | ✅       | PASS              |
| Reflexive clitic stack (m-/mi-/ne-)               | ✅   | n/a      | ✅       | PASS              |
| Bare *se* — passive vs impersonal vs reflexive    | see [§Bare *se*](#bare-se-test-supplemental-passage) | | | PARTIAL — see below |
| Definite article suffix recognition               | ✅   | ✅       | ✅       | PASS              |

---

## What worked — high-signal evidence

**Clitic-perfect tokenization (the canonical hard case).** All four
clitic-stacked perfect compounds tokenized into 3 distinct tokens with
correct morphology:

| Surface          | Tokens                                            | Notes |
| ---------------- | ------------------------------------------------- | ----- |
| `i-a prezentat`  | i- (PRON Dat) + a (AUX) + prezentat (VERB Part)   | Dative clitic correctly distinguished from Accusative |
| `M-am distrat`   | M- (PRON Acc, 1sg) + am (AUX) + distrat (VERB Part) | Reflexive accusative |
| `mi-am întâlnit` | mi- (PRON Dat, 1sg) + am (AUX) + întâlnit (VERB Part) | Ethical/possessive dative — colloquial but tagged correctly |
| `ne-am pilit`    | ne- (PRON Acc, 1pl) + am (AUX) + pilit (VERB Part) | Reflexive plural |

Dative vs accusative is the right split in every case. This was the highest
risk in the desk-research recommendation and it's clean.

**Possessive agreement on plurals.** *picioarele sale sfinte* — *sale* gets
`Number=Plur|Number[psor]=Sing|Person=3|Poss=Yes`. The model tracks the
possessor's number (sing) separately from the head noun's number (plur).
That's exactly the data we need to gloss "his holy feet" correctly at tier 1.

**Imperfect tense.** *călca, trăia, erau* all tagged `Tense=Imp`. The model
does not confuse 3sg imperfect *călca* with the homographous infinitive.
This was a literary-register risk and it cleared.

**Genitive chains.** *germenii viitorului*, *pietroasele pustii ale
pământului*, *vara acestui an*, *delegație a guvernului*, *concertul lui
Smiley* — all parsed correctly with `Case=Dat,Gen` on the genitive
constituent and proper attachment via *al/ale/lui*.

**Fronted articulated adjective.** *pietroasele pustii* — Romanian moves
the definite article to a fronted adjective. UDPipe correctly tagged
*pietroasele* as `Definite=Def` and *pustii* as `Definite=Ind`, reflecting
the morphological reality of where the article sits.

---

## Bare *se* test (supplemental passage)

The original three passages didn't exercise bare *se*. Ran a small extra
passage (`docs/phase2/se-test.conllu`) with one sentence per construction:

| Sentence                                       | Reading       | UDPipe deprel on *se* |
| ---------------------------------------------- | ------------- | --------------------- |
| *Se vinde casa lui Ion la un preț bun.*        | Passive       | `expl:pass`           |
| *Se merge la teatru duminica seara cu prietenii.* | Impersonal | `expl:pv`             |
| *Maria se spală pe față cu apă rece...*         | True reflexive | `expl:pv`            |

**What works:** Passive *se* is cleanly separated from non-passive *se*.
That's a real distinction the parser captures via the `nsubj:pass` /
`expl:pass` pair on sentence 1.

**What doesn't:** Impersonal and true-reflexive *se* share the same
`expl:pv` deprel. This is **the UD-Romanian annotation convention**, not a
UDPipe failure — every UD-trained Romanian tagger will collapse these two
the same way. (UD treats reflexive-paired verbs as a lexicalized class.)

**What to do:** Disambiguating impersonal vs true reflexive needs a
sentence-level rule over the dependency graph at our application layer.
The signal is there:

- `expl:pv` + an explicit `nsubj` whose person/number matches the verb
  → **true reflexive** ("Maria se spală" — Maria is nsubj 3sg, *spală* 3sg → reflexive)
- `expl:pv` + no `nsubj` and 3sg verb → **impersonal** ("Se merge" — no subject, 3sg → impersonal "one goes")
- `expl:pass` → **passive** (parser already labels this)

This is a few lines of post-processing on the CoNLL-U output. Cheap.
Belongs in a small `morphology-enrichment.ts` utility next to wherever
the analyzer client lives — not in the analyzer choice itself.

**Verdict:** Doesn't change the analyzer pick. Bumps the table to PARTIAL
with a known cheap remediation. No other Romanian analyzer (Stanza, spaCy,
RoBERT-finetune) would solve this at the model level — they all train on
the same UD treebanks.

---

## Two issues found — worth flagging, not blocking

### Issue 1: Pro-drop person ambiguity in informal text

**Where:** `informal.conllu` sentence 3.

> *Cred că **merg** și la următorul, dacă mai **prind** bilete.*
> "I think I'm going to the next one too, if I can still get tickets."

UDPipe tagged both *merg* and *prind* as `Person=3|Number=Plur` ("they go" /
"they catch"), when the speaker context makes 1sg ("I go" / "I catch") the
correct reading. *Cred* in the matrix clause is correctly 1sg.

**Why this happens:** *merg* and *prind* are homographous between 1sg pres
indicative and 3pl pres indicative. With no explicit subject (Romanian is
pro-drop) the model defaults to 3pl. Stanza and spaCy would behave the
same way — this is a property of the input, not a bug specific to UDPipe.

**Impact on ChaosCitim:** Glossing *merg* as "they go" when the learner
reads "I go" would mislead. But this exact ambiguity is *also* something
the learner needs to learn — the form is genuinely ambiguous. Two options:

- **Tier 1 honest:** show "1sg or 3pl present indicative" rather than the
  parser's pick. This reveals the genuine ambiguity instead of papering
  over a confident-but-possibly-wrong gloss.
- **Sentence-level reanalysis:** look at the matrix verb's person
  agreement and propagate it as a hint. *Cred că merg* → matrix is 1sg →
  embedded *merg* should align as 1sg.

The honest-display option is cheaper, more pedagogically interesting, and
ND-friendly (it teaches the actual structure of the language). Defer the
decision to the gloss-spec patch.

### Issue 2: Slang and loanword OOV

In `informal.conllu`, three slang/loanword tokens are mistagged:

| Token   | Got            | Should be              |
| ------- | -------------- | ---------------------- |
| *Salut* | VERB *saluta*  | INTJ (greeting)        |
| *mișto* | NOUN           | ADJ (Romani loanword, used adjectivally) |
| *rău*   | ADJ            | ADV (here, intensifier) |

Surrounding morphology (the perfect-compound *a fost*, the noun *banii*,
the article *toți*) is unaffected.

**Impact:** Acceptable. For seeded library v1, slang doesn't appear. For
BYO informal text, OOV slang is graceful — it gets a wrong POS tag but
doesn't break the parse around it. We can ship a per-text "register" tag
later and either suppress glosses on OOV tokens or send them through
dexonline as a fallback for slang lemmas.

---

## Lemma quality note

Lemmatization is generally clean (e.g. *Datele → dată*, *picioarele →
picior*, *banii → ban*, *guvernului → guvern*). One miss in the literary
passage: *miazănoaptea → miazănoaptea* (should strip the article to
*miazănoapte*). Rare poetic word, OOV on the lemmatizer. Not a pattern
across either of the other passages.

This reinforces the dexonline-as-tier-3-enrichment plan: when the
analyzer's lemma looks suspicious or OOV-shaped, fall back to a
dexonline lookup on the surface form.

---

## Operational notes from running this

- LINDAT endpoint responds in ~600ms–1s for ~80-word passages with
  tokenizer+tagger+parser. Plenty fast for the offline ingestion pipeline.
- Model tag pattern: `romanian-rrt-ud-2.{n}-{date}`. The model registry
  exposes both the latest (`-2.17-251125`) and historical pins. **Pin to a
  date-stamped version in the ingestion script** so re-runs are
  reproducible and a model upgrade is an explicit choice, not silent drift.
- **License — needs a decision before the ingestion-script patch lands.**
  The model is CC BY-NC-SA. The NC clause applies whether we use LINDAT or
  self-host the Docker image (same model files). LINDAT itself is research
  infrastructure with implicit non-commercial expectations.

  ADHDesigns has eventual commercial intent across the ecosystem, so this
  isn't ambient noise — ingesting the seed library now and discovering the
  analysis can't ship commercially later is expensive rework.

  **Decision (2026-04-28, Nae):** Accept NC. ChaosCitim stays
  free/donation-supported. Implications:
  - Analyzer-derived data in `text_tokens` inherits CC BY-NC-SA — fine
    for ChaosCitim's posture but means the cached morphology can't be
    redistributed under a more permissive license.
  - Any future analyzer pick for ChaosCitim should also be NC-compatible
    (no need to fight for permissive); we don't gain anything by switching
    to a permissive model later.
  - ChaosLimbă (the production-side sibling) is a separate licensing
    question — if it has different commercial intent, it needs its own
    analyzer eval rather than reusing this one.

---

## Decision

Ship UDPipe 2 against LINDAT REST for v1, pinned to
`romanian-rrt-ud-2.17-251125`. Move forward with the schema
(`texts` + `text_tokens`) and ingestion-script patches.

Mark the analyzer-research patch as done.
