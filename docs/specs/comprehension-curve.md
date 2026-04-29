# Comprehension curve — data model and event contract

> Status: spec locked. Schema in `db/schema.ts`. Migration `drizzle/0001_misty_trauma.sql`.
> Companion docs: `graduated-glossing.md` (UX), `schema.md` (texts/tokens design).

## What this spec is

The comprehension curve is **the** metric for ChaosCitim. Vocabulary counts and
streaks are not the goal. The goal is to measure, per learner per construction
over time, **how often they resolve a token without help** — and to surface
that signal honestly enough that the learner can see their own growth.

This document specifies:

- The five tables that store curve data (see `db/schema.ts`).
- The contract between `interaction_events` (source of truth) and
  `token_encounters` (derived materialization).
- Event payload shapes per `EventType`.
- Server-side jobs: idle sweeper, encounter materializer.
- Trust rules for client-asserted timestamps.

It does **not** specify:

- The construction-tagging algorithm (which UDPipe outputs map to which
  `constructions.id`). That's a separate patch.
- The visualization layer (dashboard charts, weekly summaries).
- The Error Garden integration tables (separate patch; FKs back to
  `interaction_events` rows where `type='practice_guess'` and
  `payload.is_match=false`).
- The cross-modal interlanguage model (cross-app, ChaosLimbă-side).

## The five tables, in one breath

| Table                  | Role                                                                 |
|------------------------|----------------------------------------------------------------------|
| `reading_sessions`     | One row per reading session. Holds initial mode, start/end, idle reason. |
| `interaction_events`   | Append-only event log. Source of truth.                              |
| `token_encounters`     | Per-(session, token) materialization. Re-derivable from events.      |
| `constructions`        | Stable slug-keyed taxonomy of grammatical phenomena.                 |
| `token_constructions`  | Junction: which constructions a token participates in.               |

Curve queries hit `token_encounters` (small, indexed). Audit and replay queries
hit `interaction_events`. Constructions is empty in v1 — populated by the
construction-tagging patch.

## Source-of-truth contract

**`interaction_events` is the only thing we cannot lose.** Drop
`token_encounters` and the curve is rebuildable. Drop `interaction_events` and
the user's reading history is gone forever.

This means:

- Encounters are **never** written without a corresponding event row already
  persisted.
- Encounter rebuild is idempotent: replaying events against an empty
  `token_encounters` table for a session reproduces identical rows
  (modulo `created_at`, which is a materialization timestamp, not a learner
  timestamp).
- Backfills, re-tagging, and schema migrations operate on events, then
  re-materialize.

## Event payloads

`interaction_events.payload` is `jsonb`, shape varies by `type`:

| `type`                | Payload shape                                                   | Token FK?  |
|-----------------------|------------------------------------------------------------------|------------|
| `tap`                 | `{ tier_reached: 1 \| 2 \| 3 }`                                  | required   |
| `mode_change`         | `{ from: SessionMode, to: SessionMode }`                         | null       |
| `practice_guess`      | `{ guess: PracticeCaseGuess, correct_value: string, is_match: boolean }` | required |
| `ambiguity_override`  | `{ parser_pick: string, user_pick: string }` (v1+)               | required   |

Hover is **not** logged (per `graduated-glossing.md` §Hover — exploratory; only
taps commit). A `tap` event always means escalation: tier 0→1, 1→2, 2→3. Going
back down a tier is not currently representable; if needed later, add a
`tier_reset` event type rather than overloading `tap`.

`mode_change` events are how we reconstruct mid-session mode shifts. The
session row carries only `initial_mode`; everything after is derivable from
the event stream. This avoids drift between two sources of truth.

## Sessions

### Definition

A session is a contiguous reading interval ending in one of:

- `explicit` — user pressed "Done reading" in the UI.
- `idle_sweeper` — server detected no events for 30+ min on an open session
  (see §Sweeper below).
- `tab_closed` — PWA detected a tab/visibility close before idle (v1+).

Multiple sessions can exist on one text. Each session is a fresh curve
datapoint; re-reads are intentional (see §Re-read handling).

### `reading_sessions` lifecycle

```
client opens reader   → POST /sessions  → row created, id is client-generated UUIDv7
                                           started_at = client time
                                           last_event_at = started_at
                                           initial_mode = current mode
                                           ended_at = null

each event                              → UPDATE last_event_at = max(current, event time)

user presses "Done"   → POST /sessions/:id/end (reason='explicit')
                                          ended_at = now()
                                          end_reason = 'explicit'
                                          (queue materializer)

idle sweeper (cron)                     → for sessions where ended_at IS NULL
                                              AND last_event_at < now() - INTERVAL '30 min':
                                            ended_at = last_event_at + INTERVAL '30 min'
                                            end_reason = 'idle_sweeper'
                                            (queue materializer)

materializer                            → write token_encounters rows
                                          encounters_materialized = true
```

`id` is **client-generated** so events created offline can reference their
session before the session row is synced. The first sync request for a session
is upsert-by-id; subsequent ones are no-ops on insert collisions.

### Sweeper

A cron job runs every 5 minutes:

```sql
UPDATE reading_sessions
   SET ended_at = last_event_at + INTERVAL '30 minutes',
       end_reason = 'idle_sweeper'
 WHERE ended_at IS NULL
   AND last_event_at < NOW() - INTERVAL '30 minutes';
```

Index `reading_sessions_open_idx` on `(ended_at, last_event_at)` keeps this
fast — partial-condition btree filters out closed sessions.

The materializer runs as a follow-up job (or in the same transaction) for any
session whose `ended_at` flipped to non-null and `encounters_materialized` is
false. Idempotent: if encounters already exist for that session, the
materializer no-ops.

## Encounter materialization

Triggered by session end (any reason).

### Step 1: identify visited sentences

```
visited = SELECT DISTINCT (text_id, sentence_id)
            FROM interaction_events
           WHERE session_id = $1
             AND text_id IS NOT NULL
             AND sentence_id IS NOT NULL;
```

A "visited sentence" is any sentence that received at least one
token-attached event during the session. Mode-change events don't count
because they have no token FK.

This is the core call of the spec: **tier-0 hits are dense over visited
sentences, not over the whole text.** Counting tier-0 over the whole text
would conflate "I haven't reached this yet" with "I read it without help."
Sentence-level visiting is the cheapest available proxy for "the eye
landed here" without viewport telemetry.

### Step 2: collect escalations per token

```
SELECT text_id, sentence_id, token_position, MAX(tier_reached) AS max_tier
  FROM interaction_events
 WHERE session_id = $1
   AND type = 'tap'
   AND text_id IS NOT NULL
 GROUP BY text_id, sentence_id, token_position;
```

### Step 3: emit one row per word-token in every visited sentence

For each `(text_id, sentence_id)` in `visited`, INSERT one row into
`token_encounters` per word-token in that sentence (excluding `upos = 'PUNCT'`),
with:

- `max_tier_reached` = the value from Step 2 if present, else `0`.
- `counted_in_curve` per §Counted-in-curve rules.
- `ms_since_first_event_in_sentence` = for non-tier-0 rows, the millisecond
  delta between this token's first `tap` and the sentence's first `tap`. Null
  for tier-0 rows (no escalation timestamp exists).

### Step 4: mark session materialized

```sql
UPDATE reading_sessions SET encounters_materialized = true WHERE id = $1;
```

If the materializer crashes mid-write, on retry it should `DELETE FROM
token_encounters WHERE session_id = $1` first, then redo. Cheaper than
incremental upserts and removes any partial state.

## `counted_in_curve` rules

A row is `counted_in_curve = false` when **any** of:

1. **`session.initial_mode = 'show_all'`** — the "I'm tired" mode is an
   honest opt-out per `graduated-glossing.md` §Session modes. Encounters are
   recorded for completeness but excluded from the curve so a bad day doesn't
   flatten the trendline.
2. **Re-read.** A token is a re-read if a prior **completed** session for
   `(user_id, text_id)` already produced an encounter for the same
   `(text_id, sentence_id, token_position)`. Re-reads happen for legitimate
   reasons (study, revisiting a passage), but we want first-encounter signal
   to drive the curve. The first-encounter rows are the durable measurement;
   subsequent rows are introspection material.
3. **`session.initial_mode = 'practice'`** — practice mode taps are
   pedagogically different from reading taps and shouldn't pollute the
   reading curve. Practice has its own analytics surface.

`active` and `assisted` modes both produce `counted_in_curve = true` rows.
Assisted mode is the realistic baseline for daily reading; active mode is the
"I want to push myself today" override.

## Trust contract

The PWA generates UUIDs and asserts timestamps for every event. We do not
trust the client unconditionally:

- **Reject** on sync if `client_created_at > server_received_at + 5s` (clock
  skew tolerance).
- **Reject** on sync if `client_created_at < session.started_at - 5s` (event
  predates its session).
- **Reject** on sync if `session_id` references a session whose
  `ended_at IS NOT NULL` (no events on closed sessions).
- **Accept** otherwise. We never silently rewrite client timestamps.

Rejected events are returned to the PWA with a reason; the client logs to
sentry-equivalent but does not retry. They are dropped, not replayed.

`server_received_at` always reflects when the row was actually written.
`client_created_at` is the canonical "when did this happen to the learner"
timestamp and is what the curve uses.

## Indexes — what each is for

- `token_encounters_user_curve_idx (user_id, created_at, max_tier_reached)`
  — the curve query: "over the last N weeks, what's my tier-0 rate?" Sorted
  by time, filterable by tier band.
- `token_encounters_user_tier_idx (user_id, max_tier_reached)` — rollups:
  "what's my lifetime tier distribution?"
- `interaction_events_session_idx (session_id, client_created_at)` —
  materializer reads, replay, audit.
- `interaction_events_user_idx (user_id, client_created_at)` — global
  user activity queries (settings page, Error Garden joins).
- `reading_sessions_user_text_idx (user_id, text_id)` — re-read detection.
- `reading_sessions_open_idx (ended_at, last_event_at)` — sweeper scan.
- `token_constructions_token_idx`, `token_constructions_construction_idx` —
  per-token and per-construction lookups for the curve-by-construction
  breakdown.

## Re-analysis identity

When a text is re-analyzed (analyzer model upgrade), `text_tokens` rows are
DELETE-then-INSERTed in a transaction. Composite key
`(text_id, sentence_id, token_position)` is preserved across re-analyses.
Therefore:

- `interaction_events` rows survive: their token FK still resolves.
- `token_encounters` rows survive: same FK.
- `token_constructions` rows are wiped and rebuilt from the new token data.

This is the central design reason composite keys live on tokens instead of
synthetic UUIDs. See `schema.md` §Token identity.

## Privacy / retention

- All curve data is per-user. Cross-user queries don't exist in v1.
- `interaction_events` is retained indefinitely by default. The "delete my
  account" path will cascade DELETE from `texts` (owner-scoped) and from a
  per-user erasure script that removes rows where `user_id = $1`.
- The `payload` field never holds PII other than the user's own typing
  (e.g., `practice_guess.guess`). Guess values are bounded enums or short
  strings; no free-text reflections live here.

## v1 acceptance — what "done" looks like for the curve layer

- [ ] All five tables exist on Neon (migration `0001_misty_trauma.sql` applied).
- [ ] `POST /sessions` creates a row with client-supplied UUIDv7 id; idempotent.
- [ ] `POST /sessions/:id/events` accepts a batch, validates trust contract,
      writes to `interaction_events`, updates `last_event_at` on the session.
- [ ] `POST /sessions/:id/end` sets `ended_at`/`end_reason`, queues
      materializer.
- [ ] Sweeper cron closes sessions idle ≥30 min.
- [ ] Materializer produces correct `token_encounters` rows for a fixture
      session (test plan: replay a known event stream, assert encounter
      rows match the spec).
- [ ] Curve query: "tier-0 rate, weekly buckets, last 12 weeks" returns
      under 100ms for a single user with 10K encounters.

Not in scope for v1 (deferred to follow-on patches):

- Construction tagging (`token_constructions` ships empty; no rule pipeline yet).
- Cross-modal interlanguage signal (ChaosLimbă side).
- Error Garden integration (separate patch tables).
- Visualization layer (dashboard).
