'use client';

/**
 * Client-side reading-session manager.
 *
 * Lazy session creation: the session row + its sessionId materialize on
 * the first event the user generates, not on page mount. Reading the
 * library page or a text without ever tapping does not create a session.
 *
 * In-memory queue: events accumulate locally and flush on debounce
 * (FLUSH_AFTER_MS quiet) or on pagehide / visibilitychange→hidden. There
 * is no IndexedDB sync queue yet — that's the offline-sync patch. If the
 * tab dies between events and a successful flush, the unsynced events
 * are lost. The server side is built to tolerate this (every event has
 * a client-generated id and ON CONFLICT DO NOTHING).
 *
 * pagehide also fires a best-effort /end with reason=tab_closed using
 * navigator.sendBeacon so the row gets a definitive close even when the
 * tab is killed.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { uuidv7 } from './uuidv7';
import type { EventType, SessionMode } from '@/db/types';

type PendingEvent = {
  id: string;
  type: EventType;
  textId?: string | null;
  sentenceId?: number | null;
  tokenPosition?: number | null;
  payload?: Record<string, unknown> | null;
  clientCreatedAt: string;
};

const FLUSH_AFTER_MS = 1_500;

type StartArgs = {
  textId: string;
  initialMode: SessionMode;
};

export function useReadingSession({ textId, initialMode }: StartArgs) {
  const { isSignedIn } = useAuth();

  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const startingRef = useRef<Promise<string | null> | null>(null);
  const queueRef = useRef<PendingEvent[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);

  // Lazily start the session on first event.
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!isSignedIn) return null;
    if (startingRef.current) return startingRef.current;

    const sessionId = uuidv7();
    const startedAt = new Date();
    startingRef.current = (async () => {
      try {
        const res = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            textId,
            initialMode,
            startedAt: startedAt.toISOString(),
          }),
        });
        if (!res.ok) {
          // Surface to console — session-start failure means subsequent
          // event flushes will silently no-op. Worth seeing in dev.
          console.warn('[session] start failed', await res.text());
          return null;
        }
        sessionIdRef.current = sessionId;
        startedAtRef.current = startedAt;
        return sessionId;
      } catch (err) {
        console.warn('[session] start error', err);
        return null;
      } finally {
        startingRef.current = null;
      }
    })();
    return startingRef.current;
  }, [isSignedIn, textId, initialMode]);

  const flush = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (queueRef.current.length === 0) return;
    const sessionId = sessionIdRef.current ?? (await ensureSession());
    if (!sessionId) return;

    const batch = queueRef.current;
    queueRef.current = [];

    try {
      const res = await fetch(`/api/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) {
        console.warn('[session] flush failed', res.status, await res.text());
      }
    } catch (err) {
      console.warn('[session] flush error', err);
    }
  }, [ensureSession]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      void flush();
    }, FLUSH_AFTER_MS);
  }, [flush]);

  const logEvent = useCallback(
    (event: Omit<PendingEvent, 'id' | 'clientCreatedAt'>) => {
      if (!isSignedIn) return;
      queueRef.current.push({
        ...event,
        id: uuidv7(),
        clientCreatedAt: new Date().toISOString(),
      });
      // Kick off session creation in parallel with the debounce — the
      // first event's flush won't be delayed by a cold start round-trip.
      void ensureSession();
      scheduleFlush();
    },
    [ensureSession, isSignedIn, scheduleFlush],
  );

  // Flush + end on tab hide. sendBeacon for the /end call so it survives
  // the page going away.
  useEffect(() => {
    if (!isSignedIn) return;

    const onHide = () => {
      // Force-flush any pending events synchronously via sendBeacon.
      const sessionId = sessionIdRef.current;
      if (sessionId && queueRef.current.length > 0) {
        const body = JSON.stringify({ events: queueRef.current });
        navigator.sendBeacon(
          `/api/sessions/${sessionId}/events`,
          new Blob([body], { type: 'application/json' }),
        );
        queueRef.current = [];
      }
      if (sessionId && !endedRef.current) {
        endedRef.current = true;
        const endBody = JSON.stringify({
          endReason: 'tab_closed',
          endedAt: new Date().toISOString(),
        });
        navigator.sendBeacon(
          `/api/sessions/${sessionId}/end`,
          new Blob([endBody], { type: 'application/json' }),
        );
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };

    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isSignedIn]);

  return { logEvent };
}
