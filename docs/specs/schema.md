# Spec: `texts` + `text_sentences` + `text_tokens` schema

**Patch:** Design `texts` schema + `text_tokens` cache table (pre-analyzed morphology)
**Status:** Design locked. Schema code at `db/schema.ts`, types at `db/types.ts`.
**Date:** 2026-04-28

## What this is

The Drizzle schema for ChaosCitim's reading corpus and pre-analyzed
morphology cache. Three tables: `texts` (source records), `text_sentences`
(original sentence text — preserves whitespace and is the source for
tier-2 context display), `text_tokens` (per-token UDPipe output + app-layer
enrichment).

Schema is the source of truth — the file is `db/schema.ts`. This doc
explains *why* each call was made.

## Key decisions

### Token identity is a composite, not a UUID

`text_tokens` PK is `(textId, sentenceId, tokenPosition)`. **Position is
stable across re-analyses; UUIDs aren't.** Comprehension events
(separate patch) FK against this composite.

When we upgrade UDPipe model versions and re-analyze, we transactionally
`DELETE FROM text_tokens WHERE text_id = X` and bulk-insert the new
analysis. The old comprehension events still reference valid
`(text, sentence, position)` and survive intact. If we'd used UUID PKs
they'd all orphan.

This is the load-bearing call for the comprehension-curve patch and the
re-analysis patch — both depend on it.

### `text_sentences` exists because the original sentence text matters

We could derive sentence text from token surface forms, but:

- We'd lose original whitespace and exact punctuation positioning
- Tier-2 role display wants to show the sentence in context for
  reference (e.g., for *cartea* tagged "direct object of *a citi*", we
  want to surface the actual sentence so the learner sees the whole
  construction)
- Search and share-this-sentence both want the original text
- It's cheap (one row per sentence, ~10–30 rows per text)

`text_tokens` FKs to `text_sentences` on `(textId, sentenceId)`. Cascade
delete from texts → sentences → tokens means re-ingestion is a single
DELETE + bulk INSERT.

### No `lemmas` table at v1

Lemma data lives denormalized on `text_tokens` (lemma, upos, features).
Cross-lemma queries are served by the `(lemma, upos)` index.

A normalized `lemmas` table would save ~40 bytes per token and enable a
single source of truth for cross-text lemma metadata. Costs: an extra
join on every render, and a sync problem when a re-analysis would
update a lemma.

The right time to add a `lemmas` table is when the dexonline-paradigm
patch lands — that patch caches per-lemma paradigm data, register notes,
and dexonline IDs, and *that's* a reusable record worth normalizing. v1
without it is the right call.

### License field is split: text license + analyzer license

A public-domain Eminescu text produces tokens whose derivative
licensing is governed by the **analyzer model's** license, not the
source text's. Schema stores both: `texts.license` for the source,
`texts.analyzerLicense` for the analyzer-derived data.

`ANALYZER_LICENSES` map in `db/types.ts` is the authoritative
model→license lookup. The ingestion script populates `analyzerLicense`
from the model id at write time so downstream code doesn't have to
infer.

### Text columns + TS unions, not pgEnum

`sourceType`, `license`, `cefrLevel`, `visibility`, `enrichedSeReading`,
`upos` are all stored as `text` columns with TypeScript union types via
Drizzle's `.$type<...>()` annotation.

pgEnum gives Postgres-level constraints but adding/removing values
requires `ALTER TYPE` migrations that are surprisingly painful in
production. Text + Zod runtime validation (in the ingestion script) is
the same type safety with much friendlier evolution. Cost: a Postgres
constraint we don't get. Worth it.

### JSONB for `features` and `ambiguityAlternatives`

UDPipe's morphology features are a key-value bag whose keys vary by POS.
Encoding each feature as its own column would create ~20 mostly-null
columns per token. JSONB:

- One column, indexable on specific paths if needed
- Tracks UD's evolving feature inventory without schema migrations
- TypeScript `Features` interface gives compile-time access typing

Same logic for `ambiguityAlternatives` — variable-shape array of alt
parses, populated by the future homography-table patch. Both columns
nullable; v1 ships with `ambiguityAlternatives` always null.

### Soft-delete on `texts`, hard-delete on `text_tokens`

`texts.deletedAt` is nullable timestamp. Comprehension history may
reference deleted texts; we keep the metadata around so the curve
remains interpretable.

`text_tokens` has no soft-delete because it's a cache — re-analysis
or text deletion drops the rows hard, but everything that referenced
them either (a) cascades or (b) survives via the composite key
(comprehension events keyed by position outlast the cache).

### MWT (multi-word token) grouping

UDPipe emits forms like *într-un* as a range row spanning two component
tokens. We split the components into separate `text_tokens` rows but
share an `mwtId` integer so the renderer can group them visually (per
the gloss spec: "the gloss row groups them visually with a connector").
First component carries `mwtSurfaceForm` (the joined original form)
for display.

## Indexes

| Index                                | Columns                                       | Use case                                  |
| ------------------------------------ | --------------------------------------------- | ----------------------------------------- |
| `text_tokens_read_order_idx`         | (textId, sentenceId, tokenPosition)           | Reading UI: load tokens in order          |
| `text_tokens_text_lemma_idx`         | (textId, lemma)                               | "Find all occurrences of *casă* in this text" — study/review |
| `text_tokens_lemma_upos_idx`         | (lemma, upos)                                 | Cross-text comprehension curve aggregation |
| `text_tokens_deprel_idx`             | (deprel)                                      | "Find all genitives" study queries        |
| `texts_owner_idx`                    | (ownerId)                                     | "My BYO texts" list                       |
| `texts_visibility_idx`               | (visibility)                                  | Seed library browse                       |
| `texts_cefr_idx`                     | (cefrLevel)                                   | Difficulty filter                         |

The composite PK on text_tokens is itself an index, so any query that
filters by `(textId, sentenceId, tokenPosition)` prefix is covered.

## What's deferred

- **Comprehension events table** — separate patch. Will FK against the
  composite token key. This schema's design supports it directly.
- **`lemmas` table** — deferred to dexonline-paradigm patch.
- **Diacritic-restoration audit fields** — `rawContentOriginal` is the
  hook; the diacritic-restoration patch may add more (e.g., a list of
  positions where restoration changed characters).
- **Indexed JSONB paths on `features`** — only add if real query
  patterns demand them. Premature without ingestion + UI in place.
- **Full-text search on `rawContent`** — Postgres `tsvector` column
  later, when we have a search UI patch.
- **IndexedDB mirror schema** — the PWA's local cache mirrors a subset
  of these tables. Lives in the PWA-setup patch, not here.

## How to evolve this safely

1. **Adding a column to `text_tokens`:** safe, just nullable + new
   migration. Re-analysis isn't required (existing rows have the column
   null).
2. **Removing a column from `text_tokens`:** drop migration, but check
   the comprehension-curve patch isn't reading it.
3. **Changing UDPipe model version:** update
   `texts.analyzerModelVersion` for new ingestion; existing rows keep
   their old model id. To re-analyze a text, run the re-analysis
   transaction (delete tokens + sentences for that text, re-ingest).
   Position-keyed comprehension events survive.
4. **Adding a new union value** (e.g., a new `SourceType`): edit
   `db/types.ts` only, no migration. That's the payoff for skipping
   pgEnum.
5. **Adding a new table** (e.g., `lemmas`): standard Drizzle migration,
   no impact on existing tables unless you also add FK columns.

## Operational notes for the ingestion script (next patch)

- Always set `analyzerModelVersion` and `analyzerLicense` from the same
  source — pull both from `ANALYZER_LICENSES` to avoid drift.
- Compute `rawContentHash` as `sha256(rawContent)` — used by future
  re-ingestion logic to detect "is the underlying text actually changed,
  or just the analyzer version?"
- Set `rawContentOriginal` only when diacritic restoration actually
  altered content (i.e., `rawContent !== rawContentOriginal`). Storing
  identical copies wastes space.
- `wordCount` = count of tokens with `upos != 'PUNCT'`. Cache on `texts`
  for cheap display.
- Wrap the entire ingestion of a single text in a transaction:
  `INSERT texts → INSERT text_sentences → bulk INSERT text_tokens`. If
  any step fails, the whole text rolls back cleanly.
