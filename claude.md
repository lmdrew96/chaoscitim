# ChaosCitim

Romanian-first reading companion PWA with graduated morphological glossing. The name comes from Romanian *a citim* — "we read" (1st person plural). Part of the **ADHDesigns** ecosystem (`adhdesigns.dev`).

> **ChaosPatch slug:** `chaosciti` (kept from before the rename — display name is ChaosCitim everywhere user-facing)

## What This App Does

Helps a Romanian learner read authentic texts with scaffolded morphological support that can be kicked away as comprehension grows. Not a flashcard app, not a word counter — a **comprehension tracker** that measures which grammatical forms and constructions the learner resolves independently over time.

### Core UX: Graduated Glossing

- **Tier 0:** No help — word resolved on its own (this is what we're tracking)
- **Tier 1** (hover/first tap): Morphology only — "fem sg, dative"
- **Tier 2** (second tap): Grammatical role — "indirect object of *a da*"
- **Tier 3** (third tap): English gloss + lemma — last resort

Per-word tiers with a session-level override ("I'm tired, show me everything"). Every tier interaction is logged for comprehension curve tracking.

## Ecosystem Context

- **ChaosLimbă** = production-side (speaking, writing, grammar exercises)
- **ChaosCitim** = reception-side (reading comprehension)
- Both feed the same interlanguage model — a learner who misreads dative in ChaosCitim probably also produces it wrong in ChaosLimbă. Cross-modal signal is the innovation.
- **Error Garden integration:** Optional "guess the case" interaction before revealing morphology — wrong guesses become reception-side errors in the shared Error Garden.

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | Next.js 15 (App Router) | Matches ecosystem standard |
| Language | TypeScript | Mandatory across all ADHDesigns projects |
| Database | Neon (serverless Postgres) | Scale-to-zero, branching for dev |
| ORM | Drizzle | Type-safe, lightweight |
| Auth | Clerk | Google OAuth, free tier |
| Styling | Tailwind CSS + shadcn/ui | Ecosystem standard |
| PWA | next-pwa / service worker | Offline reading is first-class |

### Offline Architecture

- IndexedDB cache for texts + pre-analyzed tokens
- Stale-while-revalidate service worker strategy
- Offline-to-online sync queue for comprehension curve events
- Texts are pre-analyzed server-side once (lemma, morphology, POS), cached as `text_tokens` — no analyzer runs in-browser

## Content Strategy

- **Seeded library** (v1 target: ~25 texts): Wikipedia RO, Wikisource, CC-licensed blogs, possibly friend-contributed under explicit license. Zero copyrighted translations.
- **BYO ingestion pipeline:** URL paste, plain text paste, EPUB import, clipboard watcher (v1+)
- Every text has difficulty tier + topic tags
- Seeded library is the low-decision front door; BYO is the power-user path

## Key Schema Concepts

- `texts` table — source metadata, difficulty, tags, raw content
- `text_tokens` table — pre-analyzed morphology cache (lemma, POS, features per token)
- Comprehension curve data — per-token tier usage over time, aggregated by construction (e.g., "genitive-dative collapse", "conditional perfect", "reflexive *se*")

## Open Decisions

- **Romanian NLP analyzer not yet picked.** Candidates: dexonline API, spaCy-ro, UDPipe, stanza. Needs evaluation against real sample texts across registers (news, literary, informal). This is the primary blocker — everything downstream depends on it.
- **Diacritic restoration preprocessor** needed before analyzer calls, especially for BYO informal text (Reddit, SMS-style Romanian often drops ș/ț)

## Development Conventions

- **IDE:** WebStorm with Claude Code plugin
- **Repo:** `lmdrew96/chaoscitim` on GitHub
- **Deploy target:** Vercel
- **Domain:** TBD (likely `chaoscitim.adhdesigns.dev`)
- **Patches:** Tracked in ChaosPatch under slug `chaosciti` — check there for current priorities before starting work
- **Ship flow:** Type-check → commit → push (see `ship` workflow if available)

## Current State (as of April 2026)

**Phase:** Pre-development — architecture locked, patches scoped, no code written yet.

### High-Priority Patches (do these first)
1. Research & pick the Romanian NLP/morphology analyzer
2. Spec the graduated glossing interaction in detail
3. Design `texts` + `text_tokens` schema
4. Build ingestion script (URL/file → diacritic-restored → analyzed → stored)

### Medium-Priority
5. Design the comprehension curve data model
6. Error Garden integration (reception-side error logging)
7. PWA setup + offline reading architecture

### Low-Priority
8. Extended text ingestion formats (EPUB, clipboard watcher)

## Guardrails

- Don't install packages or pick tools without checking if there's already an ecosystem standard (there usually is)
- Don't run the morphology analyzer client-side — pre-analyze server-side, serve cached tokens
- Don't build auth from scratch — Clerk is mandatory
- Don't use any copyrighted texts as seed content
- Romanian linguistic terminology matters here — if you're unsure about a grammatical concept (e.g., articolul hotărât, cazul genitiv-dativ), ask rather than guess
