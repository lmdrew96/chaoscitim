# Spec: Graduated Glossing Interaction

**Patch:** Spec the graduated glossing interaction — tier 1 morphology, tier 2 grammatical role, tier 3 gloss
**Status:** Spec — design locked, awaiting implementation
**Date:** 2026-04-28

## What this spec is

The interaction model for ChaosCitim's core UX. How a learner moves from
"I'm reading Romanian and need help" through "I resolved this independently"
on a per-word basis, and how that movement is captured as comprehension
signal without becoming pedagogical noise.

This spec covers behavior, persistence, ambiguity, modes, keyboard,
offline, and comprehension signal. It does **not** cover visual styling
beyond layout intent, and it does **not** cover the schema (that's the
`texts` + `text_tokens` patch).

---

## Dependencies on other patches

This spec describes a complete interaction, but parts of it depend on data
sources and schema fields that are scoped to other patches. The interaction
should be implemented v1 with these stubs in place; v1+ features are
designed but defer until the dependency lands.

| Need                          | Source                                              | Patch                          | v1 / v1+ |
| ----------------------------- | --------------------------------------------------- | ------------------------------ | -------- |
| Per-token morphology + lemma  | UDPipe 2 cache in `text_tokens`                     | Schema patch + ingestion patch | v1       |
| Grammatical role (tier 2)     | Derived from UDPipe deprel + lexical lookup         | Ingestion patch                | v1       |
| English gloss (tier 3)        | **Not yet sourced.** Wiktionary RO→EN extraction at ingestion is the leading candidate; LLM-cached is the v1+ fallback for OOV terms; hand-curated for the seed library if neither works. Needs its own patch. | New patch — "Tier-3 English gloss source"          | v1 (seed library hand-curated) / v1+ (BYO via Wiktionary) |
| Inflectional paradigm (tier 3 expansion) | dexonline lookup or SQL dump import       | New patch — "dexonline integration"                | v1+      |
| Ambiguity flags (tier 1)      | **Not in UDPipe output.** Needs a homography table built from a Romanian inflection corpus (VeLeRo or dexonline dump). | New patch — "Romanian homography table"            | v1+ (v1 ships without ambiguity surfacing — single best parse only, with a known-honest caveat) |
| Bare-*se* / pro-drop disambig | App-layer post-processing (rules over CoNLL-U)      | Ingestion patch                | v1       |
| Comprehension curve storage   | New tables — see comprehension-curve patch          | Comprehension-curve patch      | v1 (events captured) / v1+ (curve aggregation surfaced in UI) |
| Error Garden integration      | Cross-app shared schema with ChaosLimbă             | New patch — "Error Garden shared schema"           | v1+      |

The core tier-cycle interaction (Active mode, tap to escalate, tier-0
default, session-scoped persistence) is v1. Practice mode and full
ambiguity surfacing are v1+ — the spec includes them so we don't paint
ourselves into a corner, but they don't block v1 launch.

---

## The tier model

Each token in a text has a current display tier. Five states, but only
four are visible:

| Tier | What's shown                                              | Trigger                                            |
| :--: | --------------------------------------------------------- | -------------------------------------------------- |
| 0    | Nothing — looks like normal body text                     | Default for every word at session start            |
| 1    | Morphology only: `fem sg dat`                              | First tap (or Space/Enter) on the word             |
| 2    | Tier 1 + grammatical role: `indirect object of *a da*`    | Second tap                                         |
| 3    | Tier 1 + Tier 2 + English gloss + lemma                   | Third tap; or Shift+Space/Enter to jump direct     |
| —    | Tier 0 with collapsed indicator (a small dot under the word) — used after the user has briefly seen ≥1 and tapped to collapse. Tells them "you've looked at this before." | User dismisses gloss (Esc on focused word, or tap-outside) |

**Rule: every word is always tappable.** Tier 0 has no visual indicator
beyond the dot for previously-revealed words. The whole paragraph reads
like a clean Romanian text until the learner asks for help.

### What's in each tier's payload

Concrete data shape, so the schema patch and the renderer agree:

**Tier 1 — morphology**
- POS (e.g., NOUN, VERB)
- Inflectional features in human-readable form: case, number, gender,
  person, tense, mood, voice, definiteness, where applicable
- Optional: ambiguity caveat (v1+) — "this form could also be X"

**Tier 2 — grammatical role**
- Sentence role: subject, direct object, indirect object, oblique,
  modifier, etc., derived from UDPipe deprel + a small label table
- For verbs: argument structure preview ("takes Acc direct object,
  optional Dat indirect object")
- For *se*-marked verbs: the disambiguated reading (passive / impersonal
  / true reflexive) per the post-processing rule from the analyzer eval

**Tier 3 — full reveal**
- English gloss (1–3 word translation in context)
- Lemma (dictionary form)
- Brief usage note if the form/word is non-obvious (e.g., for *mișto*:
  "informal, Romani loanword")
- v1+: link to full inflectional paradigm via dexonline
- v1+: link to other texts in the library where this lemma appears

---

## Interaction model — Active mode (the default)

### Click / tap behavior

- **Tap an untouched word** → tier 0 → tier 1
- **Tap the same word again** → tier 1 → tier 2
- **Tap again** → tier 2 → tier 3
- **Tap a fourth time** → tier 3 → tier 0 (collapsed indicator shows)
- **Tap on tier 0 collapsed-indicator word** → returns to highest tier
  reached this session (so users don't re-climb the ladder unnecessarily)

The cycle is one verb: tap = "more help, please." Same key repeated. No
memorizing different gestures for different tiers — that's the ADHD-
friendly call.

### Hover (desktop only)

- **Hover** = preview tier 1 only, ephemeral. Disappears on hover-out.
- Hover does NOT escalate tier state.
- Hover does NOT log a comprehension event (it's exploratory, not committal).

This separation is the key design call: **tap = commit, hover = peek**.
Lets the learner check a hunch without polluting the comprehension
signal.

### Keyboard (desktop)

| Key                              | Action                                              |
| -------------------------------- | --------------------------------------------------- |
| `Tab` / `Shift+Tab`              | Move focus to next/previous word                    |
| `Arrow keys`                     | Move focus by direction (left/right within line, up/down between lines) |
| `Space` or `Enter`               | Cycle tier on focused word (same as tap)            |
| `Shift+Space` / `Shift+Enter`    | Jump to tier 3 directly                             |
| `Esc`                            | Collapse focused word back to tier 0 (with dot indicator) |
| `Cmd/Ctrl + Shift + C`           | Collapse ALL revealed words in current text         |
| `Cmd/Ctrl + E`                   | Toggle "Show me everything" mode                    |
| `Cmd/Ctrl + P`                   | Toggle Practice mode (v1+)                          |
| `Cmd/Ctrl + .`                   | Open mode picker                                    |

A visible focus ring on the current word is mandatory. Keyboard users are
ND-friendly users by default.

### Mobile

- Tap = same as desktop tap (cycle).
- Long-press = jump to tier 3.
- Swipe-down on the gloss panel (when open) = collapse to tier 0.
- No hover. The mode picker is in a top toolbar.

---

## Tier persistence rules

### Within a reading session

Tier state is **scoped to the current session and stored per token, not
per word/lemma.** That is: tapping one occurrence of *casa* shows tier 1
on *that occurrence*; another *casa* later in the text starts at tier 0
unless tapped.

**Why per-token, not per-lemma:** the goal is to measure independent
comprehension. If the learner resolves a second *casa* without help (and
the parser confirms it's the same lemma), that's a real Tier 0 signal we
want to capture. If revealing one *casa* automatically revealed all
*casa*-s, we'd lose that signal.

The collapsed-dot indicator (when a previously-revealed word is collapsed)
is also per-token.

### Across sessions

- All tier state resets to 0 on new session start.
- The collapsed-dot indicators reset too — fresh look, fresh chance to
  read independently.
- The comprehension curve absorbs the prior session's tier history; it
  doesn't pre-set tiers in the new session, but it does inform what gets
  surfaced in study/review patches downstream.

### Definition of "session"

A session is **any continuous period of reading activity, ending when
either:**
- The user is idle for **30 minutes** (no taps, no hovers, no scrolling
  within ChaosCitim), OR
- The user explicitly ends the session via a "Done reading" button in
  the toolbar.

No automatic end-of-day boundary. No tab-close = end-session (PWA
state restores on reopen if within the 30-min window).

This rule lives in the comprehension-curve patch's spec as well — they
must agree.

---

## Session modes

A small toolbar at the top of the reading view exposes three modes:

| Mode                  | Default tier | Comprehension signal? | Use when                                                            |
| --------------------- | :----------: | :-------------------: | ------------------------------------------------------------------- |
| **Active**            | 0            | Yes — full            | Default. The comprehension-measuring mode.                          |
| **Assisted**          | 1            | Yes — discounted *    | Known-hard register (literary, archaic), or low-energy reading session. |
| **Show me everything**| 3            | No — disabled         | Tired, sick, or "I just want to read" days. Honest opt-out.         |

\* "Discounted" means tier-1 reads in Assisted mode count as Tier 1 hits,
not Tier 0 hits, even though the learner didn't tap. This is honest — the
learner had help available without asking. The curve interprets these
correctly.

### Mode lifecycle rules

- Default for every new session: **Active.** Mode does NOT persist across
  sessions. "I'm tired" yesterday doesn't leak into today's data.
- Mode CAN be changed mid-session. Switching modes does NOT re-tier
  already-displayed words; they keep their current state. Only fresh
  taps respect the new default.
- Mode picker is one tap away (toolbar), discoverable, and shows a
  one-line description of each mode's effect on comprehension data.
  This is non-negotiable: users must know that "Show me everything"
  doesn't get logged as struggle.

---

## Ambiguity surfacing (v1+)

Romanian has many homographous forms. *merg* is 1sg or 3pl. *cântat* is
masc-sg past participle or n-suffixed neuter. UDPipe picks one. Sometimes
wrong, especially in pro-drop contexts.

**v1 behavior:** show UDPipe's pick at tier 1, full stop. No caveat. This
is honest only if we ALSO ship v1 documentation (in-app help) that says
"the morphology shown is the parser's best guess; in pro-drop sentences
without a stated subject, it may show 3pl when 1sg is meant."

**v1+ behavior — needs a homography table patch:**
- Detect at ingestion time: is this surface form ambiguous? (Lookup
  against a Romanian inflection database — VeLeRo or dexonline dump.)
- If yes, store the alternative parses on the token.
- At tier 1 display, show:
  > **present indicative** — `eu` (I, 1sg) ✓ or `ei/ele` (they, 3pl)
  >
  > _The parser picked 1sg based on context. Tap **3pl** to switch._

The user can override the parser's pick. The override is per-token and
counts as engagement (not a comprehension hit, not a miss — pure
exploration signal).

### Why "eu" + "I" together

The display mixes Romanian and English vocabulary deliberately. An A1
learner has not memorized pronoun paradigms; an A2 learner has but might
need a refresher; a B1+ learner doesn't need the English. The English in
parens decays naturally as the learner outgrows it (and a future preference
can hide it). Mixing is honest about scaffold; pure-Romanian display would
be too steep a curve at the start.

---

## Practice mode (v1+, opt-in)

The "guess the case before you see it" interaction described in the patch
notes. Off by default. Toggle in the toolbar; persists per-session only.

**Scope at v1+ launch: case only.** Romanian's case system (especially
the genitive-dative collapse) is the highest-value pedagogical target and
matches the shape of ChaosLimbă's existing Error Garden. Tense, person,
number, gender, etc. are deferred — adding them now multiplies UI
complexity without a corresponding pedagogical payoff.

### Interaction

When Practice mode is on:
- First tap on an untouched **noun, pronoun, or articulated determiner**
  → mini-quiz appears in place of tier 1:
  > _What case is this?_
  > [ Nom/Acc ]  [ Gen/Dat ]  [ Voc ]  [ I don't know ]
- Hover bypass: hover still shows tier 1 directly, no quiz. Quick checks
  remain frictionless.
- "I don't know" → reveals tier 1, no Error Garden log. Honesty without
  shame.
- Wrong answer → reveals tier 1 + logs the mismatch to the Error Garden +
  shows a small `✓ logged` toast (NOT `❌ wrong`). The framing is "we
  captured this for review later," not "you failed."
- Right answer → reveals tier 1 + small `✓ +1` toast. Subtle, not
  celebratory.

Verbs, adjectives, and adverbs in Practice mode behave like Active mode
(tap → tier 1) — no quiz. v1+ scope is case only.

---

## Visual layout

Detailed visual design is the design-system patch's responsibility. The
interaction spec only fixes the *layout intent*:

- **Body text** stays at a comfortable reading size (16–18px, line-height
  1.6, max-width ~65ch). Romanian text needs to breathe.
- **Tier 1 and 2 glosses display inline** in a reserved gloss-row beneath
  each line. The gloss-row exists whether or not it's populated — line
  height does not jump as words are revealed. This is non-negotiable for
  ND-friendly reading flow.
- **Tier 3 opens a panel** — right-side panel on desktop (≥1024px), bottom
  sheet on mobile. Only one tier 3 panel open at a time; opening another
  closes the first.
- **Color is supplemental, never the sole signal.** Tier indicators use
  subtle text decoration (dotted underline for tier 1+, solid underline
  for tier 3-current) so colorblind users and high-contrast-mode users
  read the same affordances.
- **Optional opt-in case-coloring** (v1+) — users who want pattern-
  recognition reinforcement can enable color-by-case (dative = blue,
  genitive = purple, etc.). Off by default.

---

## Offline and slow-network behavior

The PWA architecture (per CLAUDE.md) pre-analyzes every text server-side
and caches `text_tokens` in IndexedDB on first read. Implications for
graduated glossing:

- **Tier 1 and tier 2 data MUST be in the cached payload** — no network
  call ever required to display morphology or grammatical role. This is
  the offline-reading promise.
- **Tier 3's basic content** (English gloss, lemma) MUST be in the cached
  payload too. Reading offline must include reading-with-help offline.
- **Tier 3's expanded paradigm** (full inflectional table, cross-text
  occurrences) is the only piece allowed to require network. When offline,
  show what's cached + a small `Full paradigm available when reconnected`
  notice.
- **Comprehension events** (every tap, every reveal, every Practice answer)
  are queued in IndexedDB and sync on reconnect. Never lose a learning
  signal to network state.

---

## Comprehension signal — what we log

Every tap, every escalation, every mode change emits an event. Schema is
the comprehension-curve patch's domain; this spec only states *what we
care about capturing* per token interaction:

- Token ID + text ID + lemma + morphology features (case/number/etc.)
- Tier reached on this interaction (0 → 1, 1 → 2, etc.)
- Time-to-tier-1 (how long from word becoming visible to first tap, if
  any) — proxy for "did the learner pause to think before asking for help?"
- Mode in effect (Active / Assisted / Show all / Practice)
- For Practice mode: the guess + correct answer
- For ambiguity overrides (v1+): the user's pick vs the parser's pick

A "Tier 0 hit" — a word the learner read past without ever tapping — is
the most valuable signal. We capture this at session-end by diffing the
text's tokens against the tap log.

The curve aggregation (per-construction, per-lemma, over time) is the
comprehension-curve patch.

---

## Edge cases

- **Punctuation, numbers, proper nouns:** generally not interactive. A
  proper noun like *Bucureștiul* IS interactive (it has morphology). A
  number like *1989* is not.
- **Multi-word units:** if UDPipe outputs an MWT (e.g., *într-* + *un* →
  *într-un*), each component is separately tappable, but the gloss row
  groups them visually with a connector.
- **Words with errors in the analyzer output** (the slang/OOV cases from
  Phase 2): tier 1 shows what we have, with a small `(uncertain)` flag
  if the analyzer's confidence is below a threshold. Tier 3 in these
  cases includes a "report this gloss" link that posts to a developer-
  side issue queue (one-click, no extra dialog).
- **Empty Tier 3 (no English gloss source):** for v1, when a token has
  no English gloss in the cached payload, tier 3 shows tier 1 + tier 2
  + lemma only, with a small `Translation not available — looking up...`
  state if online (calls dexonline live). Offline: just lemma.

---

## Out of scope for this patch

- Visual design (colors, typography choices, animations) — design-system
  patch
- Schema fields and relations — `texts` + `text_tokens` patch
- Comprehension curve aggregation and visualization — comprehension-curve
  patch
- Error Garden cross-app schema — Error Garden integration patch
- Ingestion-time enrichment (gloss source, paradigm source, ambiguity
  table) — separate ingestion patches as listed in the dependency table

---

## v1 acceptance — what "done" looks like for the interaction layer

- A reader can open a cached text, see clean Romanian body text, and tap
  any word to escalate through tiers 0→1→2→3 and back.
- Hover (desktop) previews tier 1 without committing.
- Keyboard navigation: Tab through words, Space cycles tiers, Esc
  collapses.
- Three modes work as specified; mode default is always Active on session
  start.
- Session boundary is the 30-min idle rule, with a "Done reading" button.
- Tier 1 + 2 + basic Tier 3 work fully offline.
- Every interaction logs a comprehension event (queued offline).
- Practice mode, ambiguity surfacing, paradigm view, and Error Garden
  integration are visible in the data model but the UI is gated behind a
  feature flag and not shipped to users yet.
