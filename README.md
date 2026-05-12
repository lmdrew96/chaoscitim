# ChaosCitim

Romanian-first reading companion PWA with graduated morphological glossing. The name comes from Romanian *a citim* — "we read" (1st person plural).

Part of the [ADHDesigns](https://adhdesigns.dev) ecosystem.

> ChaosCitim is the **reception side**. Its sibling [ChaosLimbă](https://chaoslimba.adhdesigns.dev) is the production side (speaking, writing). They share an interlanguage model — a learner who misreads dative case here probably produces it wrong there, and that cross-modal signal is the innovation.

---

## What it does

Helps a Romanian learner read authentic texts with **scaffolded morphological support that gets kicked away as comprehension grows.** Not a flashcard app. Not a word counter. A **comprehension tracker** that measures which grammatical forms and constructions you resolve independently over time.

### Graduated glossing

Each word is its own tappable button. Click cycles through tiers; hover (desktop) peeks tier 1 ephemerally; right-click jumps straight to tier 3.

| Tier | Reveal | Example for *seama* |
|---|---|---|
| **0** | Plain word — you got it on your own. This is what we track. | `seama` |
| **1** | Part of speech + morphology essentials | `noun · the` |
| **2** | Grammatical role in the sentence | `object of *da*` |
| **3** | English gloss + lemma | `account · seamă` |

**Multi-word idioms** render as a single highlighted span with one shared gloss instead of misleading per-token output: *își dă seama* shows as one box reading `to realize`, not `oneself · to give · account`.

---

## Status

**Phase: feature-complete v1 reader.** The pipeline ingests Romanian text, restores diacritics, analyzes with UDPipe, fetches English glosses from Wiktionary, detects idioms, and renders all four tiers with hover/click/right-click interactions. The PWA layer makes it installable and offline-capable.

### What's shipped

- **Ingestion pipeline** — URL or paste → diacritic restoration → UDPipe morphology → Wiktionary glosses → DB (`scripts/ingest.ts`)
- **Diacritic restorer** — Unicode normalization (legacy cedilla → comma-below) + curated substitution map for informal text drops (`lib/diacritic.ts`)
- **Tier-3 English gloss source** — batched MediaWiki API against en.wiktionary, parses Romanian POS sections, caches results to disk (`lib/wiktionary.ts`, CC BY-SA 4.0)
- **MWE / idiom glossing** — render-time longest-first lemma-sequence matching against `data/mwes.json`; ships with ~35 high-frequency entries (`lib/mwe.ts`)
- **Reader UI** — per-token tier escalation, MWE spans, plain-English labels, hover-peek overlays, right-click jump-to-gloss
- **PWA** — generated manifest + icons, hand-written service worker (network-first navigations, stale-while-revalidate static assets), offline fallback page

### What's deferred

- **Dexonline tier-3 paradigm view** — full inflectional table + etymology behind tier 3 (v1+ patch)
- **Homography table** — surface form ambiguity disclosure at tier 1 (v1+ patch)
- **Error Garden integration** — opt-in "guess the case" interaction that logs wrong guesses as reception-side errors, shared with ChaosLimbă
- **BYO ingestion formats** — EPUB import, clipboard watcher
- **Comprehension-event sync queue** — currently no client-side events are logged; will land alongside the comprehension curve patch

---

## Quick start

```bash
pnpm install
cp .env.example .env.local   # then fill DATABASE_URL
pnpm db:push                 # apply schema to Neon
pnpm dev                     # http://localhost:3000
```

Ingest a Romanian text:

```bash
# from a file
pnpm ingest --file path/to/text.txt --title "My text" --license cc_by --cefr B1

# from a URL
pnpm ingest --url https://ro.wikipedia.org/wiki/... --title "..." --license cc_by_sa --cefr B2

# from stdin
echo "Își dă seama că este târziu." | pnpm ingest --paste --title "Test" --license cc0 --cefr A2
```

See `pnpm ingest --help` for the full flag set.

---

## Architecture

| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript |
| Database | [Neon](https://neon.tech) (serverless Postgres) |
| ORM | [Drizzle](https://orm.drizzle.team) |
| Auth | [Clerk](https://clerk.com) |
| Styling | Tailwind CSS v4 |
| Morphology | [UDPipe 2](https://lindat.mff.cuni.cz/services/udpipe/) (`romanian-rrt-ud-2.17`) via LINDAT REST |
| Glosses | en.wiktionary MediaWiki API |
| PWA | hand-written service worker (no plugin) |
| Deploy | Vercel |

### Data flow

```
Romanian text
  → diacritic restoration (lib/diacritic.ts)
  → UDPipe REST analyzer  (lib/udpipe.ts)
  → CoNLL-U parse          (lib/conllu.ts)
  → token rows + sentences (db schema)
  → Wiktionary gloss fetch (lib/wiktionary.ts, batched, cached)
  → text_tokens.gloss_en   (committed to Neon)
                ↓
            reader UI
  ↳ MWE matcher reads cached lemmas, finds idiom spans at render time
  ↳ Service worker caches reader HTML for offline replay
```

### Key paths

- `app/read/[id]/` — reader UI (TokenWord, TokenSpan, Reader)
- `lib/` — pure logic (parsers, matchers, formatters)
- `scripts/ingest.ts` — CLI for adding texts
- `scripts/backfill-glosses.ts` — refresh `text_tokens.gloss_en` for old rows
- `scripts/inspect-lemmas.ts` — debug helper for verifying UDPipe lemma output before adding MWE entries
- `db/schema.ts` — Drizzle schema (texts, text_sentences, text_tokens, events)
- `data/` — curated lookup tables (diacritic map, MWE table, gloss overrides)
- `docs/` — architecture decisions, specs, analyzer evaluation
- `docs/specs/graduated-glossing.md` — the interaction spec
- `docs/wiktionary-attribution.md` — required CC BY-SA attribution for tier-3 glosses

---

## Commands

```bash
pnpm dev          # next dev
pnpm build        # production build
pnpm start        # serve the build (needed to test PWA features)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm db:push      # apply schema to DB
pnpm db:studio    # drizzle-kit studio
pnpm ingest       # ingest a Romanian text (see --help)
```

---

## Licensing and attribution

**Application code:** the repo itself.

**Token data (UDPipe analysis):** [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — inherited from the UDPipe Romanian-RRT model. ChaosCitim therefore stays non-commercial / free-or-donation.

**Tier-3 English glosses:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — sourced from [en.wiktionary.org](https://en.wiktionary.org/). Compatible with the above. See [`docs/wiktionary-attribution.md`](docs/wiktionary-attribution.md) for required reader-side attribution.

**Seed library texts:** every text is recorded with a specific license (`cc_by`, `cc_by_sa`, `cc0`, `public_domain`, `friend_explicit_grant`). Zero copyrighted translations or commercially-licensed material in the seed library.

---

## Patches and roadmap

Active work is tracked in [ChaosPatch](https://chaospatch.adhdesigns.dev) under project slug `chaosciti`. The current backlog covers dexonline paradigm enrichment, homography surfacing, Error Garden integration, and extended BYO ingestion formats — see ChaosPatch for the live state.

Architecture decisions live in [`docs/decisions.md`](docs/decisions.md) — append-only, newest first.
