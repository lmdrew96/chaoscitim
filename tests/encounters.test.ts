import { describe, it, expect } from 'vitest';
import { buildEncounterRows, type TapInfo, type SentenceFirstEvent, type TokenInfo } from '../lib/encounters';

const SESSION = 'session-aaa';
const USER = 'user-111';
const TEXT = 'text-bbb';

const t0 = new Date('2026-05-01T10:00:00Z');
const t1 = new Date('2026-05-01T10:00:05Z');
const t2 = new Date('2026-05-01T10:00:10Z');

function token(sentenceId: number, tokenPosition: number): TokenInfo {
  return { textId: TEXT, sentenceId, tokenPosition };
}

function tapInfo(sentenceId: number, tokenPosition: number, maxTier: number, firstTapAt: Date): TapInfo {
  return { textId: TEXT, sentenceId, tokenPosition, maxTier, firstTapAt };
}

function firstEvent(sentenceId: number, firstEventAt: Date): SentenceFirstEvent {
  return { textId: TEXT, sentenceId, firstEventAt };
}

describe('buildEncounterRows', () => {
  it('emits tier-0 row for uneventful token in visited sentence', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1)],
      priorEncounterKeys: new Set(),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: SESSION,
      userId: USER,
      textId: TEXT,
      sentenceId: 1,
      tokenPosition: 1,
      maxTierReached: 0,
      countedInCurve: true,
      msSinceFirstEventInSentence: null,
    });
  });

  it('records max tier from tap and computes msSinceFirstEventInSentence', () => {
    // Sentence 1 first event at t0, token 2 first tap at t1 (5000ms later).
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [tapInfo(1, 2, 2, t1)],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1), token(1, 2)],
      priorEncounterKeys: new Set(),
    });

    const tok1 = rows.find((r) => r.tokenPosition === 1)!;
    const tok2 = rows.find((r) => r.tokenPosition === 2)!;

    expect(tok1.maxTierReached).toBe(0);
    expect(tok1.msSinceFirstEventInSentence).toBeNull();
    expect(tok2.maxTierReached).toBe(2);
    expect(tok2.msSinceFirstEventInSentence).toBe(5000);
  });

  it('floors msSinceFirstEventInSentence at 0 for simultaneous events', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [tapInfo(1, 1, 1, t0)],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1)],
      priorEncounterKeys: new Set(),
    });

    expect(rows[0]!.msSinceFirstEventInSentence).toBe(0);
  });

  it('marks countedInCurve=false for show_all session', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'show_all',
      taps: [],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1)],
      priorEncounterKeys: new Set(),
    });

    expect(rows[0]!.countedInCurve).toBe(false);
  });

  it('marks countedInCurve=false for practice session', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'practice',
      taps: [],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1)],
      priorEncounterKeys: new Set(),
    });

    expect(rows[0]!.countedInCurve).toBe(false);
  });

  it('marks countedInCurve=false for re-read tokens, true for new ones', () => {
    const priorKey = `${TEXT}:1:1`;
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1), token(1, 2)],
      priorEncounterKeys: new Set([priorKey]),
    });

    const tok1 = rows.find((r) => r.tokenPosition === 1)!;
    const tok2 = rows.find((r) => r.tokenPosition === 2)!;
    expect(tok1.countedInCurve).toBe(false); // re-read
    expect(tok2.countedInCurve).toBe(true);  // new
  });

  it('handles multiple sentences independently', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [tapInfo(2, 1, 1, t1)],
      firstEvents: [firstEvent(1, t0), firstEvent(2, t0)],
      tokens: [token(1, 1), token(2, 1), token(2, 2)],
      priorEncounterKeys: new Set(),
    });

    expect(rows).toHaveLength(3);
    const s1t1 = rows.find((r) => r.sentenceId === 1 && r.tokenPosition === 1)!;
    const s2t1 = rows.find((r) => r.sentenceId === 2 && r.tokenPosition === 1)!;
    const s2t2 = rows.find((r) => r.sentenceId === 2 && r.tokenPosition === 2)!;
    expect(s1t1.maxTierReached).toBe(0);
    expect(s2t1.maxTierReached).toBe(1);
    expect(s2t1.msSinceFirstEventInSentence).toBe(5000);
    expect(s2t2.maxTierReached).toBe(0);
    expect(s2t2.msSinceFirstEventInSentence).toBeNull();
  });

  it('emits no rows when tokens list is empty', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [],
      firstEvents: [],
      tokens: [],
      priorEncounterKeys: new Set(),
    });

    expect(rows).toHaveLength(0);
  });

  it('uses max tier 3 correctly', () => {
    const rows = buildEncounterRows({
      sessionId: SESSION,
      userId: USER,
      initialMode: 'active',
      taps: [tapInfo(1, 1, 3, t2)],
      firstEvents: [firstEvent(1, t0)],
      tokens: [token(1, 1)],
      priorEncounterKeys: new Set(),
    });

    expect(rows[0]!.maxTierReached).toBe(3);
    expect(rows[0]!.msSinceFirstEventInSentence).toBe(t2.getTime() - t0.getTime());
  });
});
