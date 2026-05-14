import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  primaryKey,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import type {
  AmbiguityAlternative,
  CefrLevel,
  EventType,
  Features,
  License,
  SeReading,
  SessionEndReason,
  SessionMode,
  SourceType,
  UPos,
  Visibility,
} from './types';

// ────────────────────────────────────────────────────────────────────────
// texts — source records.
//
// One row per ingested text. Content is stored post-diacritic-restoration
// in `rawContent`; `rawContentOriginal` preserves the pre-restoration
// input for BYO ingestion (null for clean seeded library content).
// `analyzerModelVersion` pins the exact UDPipe model used so re-analysis
// vs. the cache is an explicit decision, not silent drift.
// ────────────────────────────────────────────────────────────────────────
export const texts = pgTable(
  'texts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    title: text('title').notNull(),
    author: text('author'),
    sourceUrl: text('source_url'),
    sourceType: text('source_type').$type<SourceType>().notNull(),
    license: text('license').$type<License>().notNull(),

    rawContent: text('raw_content').notNull(),
    rawContentOriginal: text('raw_content_original'),
    rawContentHash: text('raw_content_hash').notNull(),

    cefrLevel: text('cefr_level').$type<CefrLevel>().notNull(),
    topicTags: text('topic_tags').array().notNull().default(sql`ARRAY[]::text[]`),

    analyzerModelVersion: text('analyzer_model_version').notNull(),
    analyzerLicense: text('analyzer_license').$type<License>().notNull(),
    analyzedAt: timestamp('analyzed_at', { withTimezone: true }).notNull(),

    // Set after contextual glosses are generated. Null means gloss_en_context
    // has not been populated for this text's tokens yet.
    glossModelVersion: text('gloss_model_version'),

    wordCount: integer('word_count').notNull(),
    sentenceCount: integer('sentence_count').notNull(),

    ownerId: text('owner_id'),
    visibility: text('visibility').$type<Visibility>().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    ownerIdx: index('texts_owner_idx').on(t.ownerId),
    visibilityIdx: index('texts_visibility_idx').on(t.visibility),
    cefrIdx: index('texts_cefr_idx').on(t.cefrLevel),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// text_sentences — sentence-level cache.
//
// Holds the original sentence text exactly as UDPipe saw it (including
// whitespace and punctuation). Source of truth for tier-2 role context
// display, share-this-sentence, and full-text search. Without this table
// we'd lose the original whitespace when reconstructing sentences from
// tokens.
// ────────────────────────────────────────────────────────────────────────
export const textSentences = pgTable(
  'text_sentences',
  {
    textId: uuid('text_id')
      .notNull()
      .references(() => texts.id, { onDelete: 'cascade' }),
    sentenceId: integer('sentence_id').notNull(), // 1-indexed

    sentenceText: text('sentence_text').notNull(),
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.textId, t.sentenceId] }),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// text_tokens — per-token analyzer cache.
//
// Natural key is (textId, sentenceId, tokenPosition) — composite, not
// UUID. Position is stable across re-analyses so comprehension events
// FK against this composite and survive analyzer-model upgrades.
//
// Re-analysis pattern: transactional DELETE WHERE textId = X then bulk
// INSERT. Because position is preserved, comprehension events reference
// the same (text, sentence, position) and remain valid.
//
// `gloss_en` is null until the gloss-source patch lands (Wiktionary RO→EN
// extraction at ingestion). `ambiguity_alternatives` is null until the
// homography-table patch lands.
//
// Token license is governed by the analyzer license (see ANALYZER_LICENSES
// in types.ts), which lives on `texts.analyzerLicense`.
// ────────────────────────────────────────────────────────────────────────
export const textTokens = pgTable(
  'text_tokens',
  {
    textId: uuid('text_id').notNull(),
    sentenceId: integer('sentence_id').notNull(),
    tokenPosition: integer('token_position').notNull(), // 1-indexed within sentence

    surfaceForm: text('surface_form').notNull(),
    lemma: text('lemma').notNull(),
    upos: text('upos').$type<UPos>().notNull(),
    xpos: text('xpos'),
    features: jsonb('features').$type<Features>(),

    headPosition: integer('head_position'),
    deprel: text('deprel').notNull(),

    enrichedSeReading: text('enriched_se_reading').$type<SeReading>(),
    glossEn: text('gloss_en'),
    // AI-generated contextual gloss: meaning of this inflected form in this
    // sentence (e.g. "of the house" not "house"). Generated at ingestion time
    // by Claude Haiku; null for PUNCT, PROPN, and transparent CCONJ.
    glossEnContext: text('gloss_en_context'),
    ambiguityAlternatives: jsonb('ambiguity_alternatives').$type<AmbiguityAlternative[]>(),

    // MWT grouping. UDPipe emits multi-word tokens like *într-un* as a
    // range row whose span covers the components. We split the components
    // into separate token rows but keep `mwtId` as a shared marker. The
    // first component carries `mwtSurfaceForm` (the joined original form)
    // for renderer display.
    mwtId: integer('mwt_id'),
    mwtSurfaceForm: text('mwt_surface_form'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.textId, t.sentenceId, t.tokenPosition] }),

    // Composite FK to text_sentences. Cascade on sentence deletion (which
    // itself cascades from texts), so re-analysis cleanup is single-step.
    sentenceFk: foreignKey({
      columns: [t.textId, t.sentenceId],
      foreignColumns: [textSentences.textId, textSentences.sentenceId],
      name: 'text_tokens_sentence_fk',
    }).onDelete('cascade'),

    // Indexes
    readOrderIdx: index('text_tokens_read_order_idx').on(
      t.textId,
      t.sentenceId,
      t.tokenPosition,
    ),
    textLemmaIdx: index('text_tokens_text_lemma_idx').on(t.textId, t.lemma),
    lemmaUposIdx: index('text_tokens_lemma_upos_idx').on(t.lemma, t.upos),
    deprelIdx: index('text_tokens_deprel_idx').on(t.deprel),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// reading_sessions — one row per "I sat down and read" session.
//
// A session is 30 minutes of relative silence (no events) closed either
// by the user pressing "Done reading", by the server-side idle sweeper,
// or by a future PWA tab-close detector. See
// docs/specs/graduated-glossing.md §Definition of "session".
//
// `id` is client-generated (UUIDv7) so the offline-to-online sync queue
// can reference the same session id from events created before the
// session row reaches the server. The PWA owns session identity; the
// server records last_event_at and runs the sweeper.
// ────────────────────────────────────────────────────────────────────────
export const readingSessions = pgTable(
  'reading_sessions',
  {
    id: uuid('id').primaryKey(),

    userId: text('user_id').notNull(), // Clerk user id
    textId: uuid('text_id')
      .notNull()
      .references(() => texts.id, { onDelete: 'cascade' }),

    initialMode: text('initial_mode').$type<SessionMode>().notNull(),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastEventAt: timestamp('last_event_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: text('end_reason').$type<SessionEndReason>(),

    // Set true after `token_encounters` rows have been written. Idempotent
    // marker so the materializer can be retried safely.
    encountersMaterialized: boolean('encounters_materialized').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTextIdx: index('reading_sessions_user_text_idx').on(t.userId, t.textId),
    openSessionsIdx: index('reading_sessions_open_idx').on(t.endedAt, t.lastEventAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// interaction_events — append-only event log.
//
// Source of truth for the comprehension curve. `token_encounters` is a
// materialized view derived from these rows; if encounters is dropped
// it can be rebuilt by replaying events. Hover is intentionally NOT
// logged (exploratory; commitment requires a tap).
//
// `payload` shape varies by `type`. Documented in
// docs/specs/comprehension-curve.md §Event payloads.
//
// Trust contract: `clientCreatedAt` is asserted by the PWA; events with
// `clientCreatedAt > serverReceivedAt + 5s` or
// `clientCreatedAt < session.startedAt - 5s` are rejected at sync time.
// ────────────────────────────────────────────────────────────────────────
export const interactionEvents = pgTable(
  'interaction_events',
  {
    id: uuid('id').primaryKey(), // client-generated UUIDv7

    sessionId: uuid('session_id')
      .notNull()
      .references(() => readingSessions.id, { onDelete: 'cascade' }),

    // Denormalized for direct user-scoped queries without joining sessions.
    userId: text('user_id').notNull(),

    // Composite FK to text_tokens. Optional: mode_change events may not
    // be associated with a specific token. Kept nullable to accommodate.
    textId: uuid('text_id'),
    sentenceId: integer('sentence_id'),
    tokenPosition: integer('token_position'),

    type: text('type').$type<EventType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),

    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenFk: foreignKey({
      columns: [t.textId, t.sentenceId, t.tokenPosition],
      foreignColumns: [textTokens.textId, textTokens.sentenceId, textTokens.tokenPosition],
      name: 'interaction_events_token_fk',
    }).onDelete('cascade'),

    sessionTimelineIdx: index('interaction_events_session_idx').on(
      t.sessionId,
      t.clientCreatedAt,
    ),
    userTimelineIdx: index('interaction_events_user_idx').on(t.userId, t.clientCreatedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// token_encounters — per-(session, token) materialization.
//
// Derived from interaction_events on session end. One row per word-token
// in every sentence the learner *visited* (= had any event in). Tier-0
// hits are dense: tokens in visited sentences with no escalation get
// `maxTierReached=0`, `countedInCurve=true`. Punctuation is excluded.
//
// `countedInCurve` flips false when:
//   - session.initialMode === 'show_all' (tier honesty waiver), or
//   - this is a re-read of a token already encountered in a prior
//     completed session for this (userId, textId).
//
// `msSinceFirstEventInSentence` proxies "how long did the learner sit
// with this token before escalating?" without requiring viewport
// telemetry. Null for tier-0 rows.
// ────────────────────────────────────────────────────────────────────────
export const tokenEncounters = pgTable(
  'token_encounters',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => readingSessions.id, { onDelete: 'cascade' }),

    textId: uuid('text_id').notNull(),
    sentenceId: integer('sentence_id').notNull(),
    tokenPosition: integer('token_position').notNull(),

    // Denormalized for query.
    userId: text('user_id').notNull(),

    maxTierReached: integer('max_tier_reached').notNull(), // 0 | 1 | 2 | 3
    countedInCurve: boolean('counted_in_curve').notNull().default(true),
    msSinceFirstEventInSentence: integer('ms_since_first_event_in_sentence'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.sessionId, t.textId, t.sentenceId, t.tokenPosition],
    }),
    tokenFk: foreignKey({
      columns: [t.textId, t.sentenceId, t.tokenPosition],
      foreignColumns: [textTokens.textId, textTokens.sentenceId, textTokens.tokenPosition],
      name: 'token_encounters_token_fk',
    }).onDelete('cascade'),

    // The hot query: "for this user, over time, how often is tier-0 hit?"
    userCurveIdx: index('token_encounters_user_curve_idx').on(
      t.userId,
      t.createdAt,
      t.maxTierReached,
    ),
    // For "what tier do you typically reach?" rollups.
    userTierIdx: index('token_encounters_user_tier_idx').on(t.userId, t.maxTierReached),
  }),
);

// ────────────────────────────────────────────────────────────────────────
// constructions — taxonomy of grammatical constructions.
//
// Stable slug-keyed catalog. New constructions are added via migration so
// the analytics layer can rely on known IDs. Granularity (e.g., should
// "genitive-dative collapse" be one construction or split by trigger) is
// resolved in the construction-tagging patch.
// ────────────────────────────────────────────────────────────────────────
export const constructions = pgTable('constructions', {
  id: text('id').primaryKey(), // slug, e.g. 'se_passive', 'gen_dat_collapse'
  label: text('label').notNull(),
  description: text('description'),
  category: text('category').notNull(), // 'morphology' | 'syntax' | 'lexis' | 'discourse'
  difficultyTier: text('difficulty_tier').$type<CefrLevel>(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ────────────────────────────────────────────────────────────────────────
// token_constructions — junction: which constructions a token participates in.
//
// One token can belong to multiple constructions (e.g., a *se* verb can be
// tagged both 'se_passive' and 'present_indicative'). Populated by the
// construction-tagging step at ingestion (deferred patch — table ships
// empty for v1).
// ────────────────────────────────────────────────────────────────────────
export const tokenConstructions = pgTable(
  'token_constructions',
  {
    textId: uuid('text_id').notNull(),
    sentenceId: integer('sentence_id').notNull(),
    tokenPosition: integer('token_position').notNull(),
    constructionId: text('construction_id')
      .notNull()
      .references(() => constructions.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.textId, t.sentenceId, t.tokenPosition, t.constructionId],
    }),
    tokenFk: foreignKey({
      columns: [t.textId, t.sentenceId, t.tokenPosition],
      foreignColumns: [textTokens.textId, textTokens.sentenceId, textTokens.tokenPosition],
      name: 'token_constructions_token_fk',
    }).onDelete('cascade'),

    // Reverse lookup: "what constructions does this token participate in?"
    tokenIdx: index('token_constructions_token_idx').on(
      t.textId,
      t.sentenceId,
      t.tokenPosition,
    ),
    // Forward lookup: "all tokens in construction X."
    constructionIdx: index('token_constructions_construction_idx').on(t.constructionId),
  }),
);

// Inferred row types — use these in the ingestion script and elsewhere.
export type Text = typeof texts.$inferSelect;
export type NewText = typeof texts.$inferInsert;

export type TextSentence = typeof textSentences.$inferSelect;
export type NewTextSentence = typeof textSentences.$inferInsert;

export type TextToken = typeof textTokens.$inferSelect;
export type NewTextToken = typeof textTokens.$inferInsert;

export type ReadingSession = typeof readingSessions.$inferSelect;
export type NewReadingSession = typeof readingSessions.$inferInsert;

export type InteractionEvent = typeof interactionEvents.$inferSelect;
export type NewInteractionEvent = typeof interactionEvents.$inferInsert;

export type TokenEncounter = typeof tokenEncounters.$inferSelect;
export type NewTokenEncounter = typeof tokenEncounters.$inferInsert;

export type Construction = typeof constructions.$inferSelect;
export type NewConstruction = typeof constructions.$inferInsert;

export type TokenConstruction = typeof tokenConstructions.$inferSelect;
export type NewTokenConstruction = typeof tokenConstructions.$inferInsert;
