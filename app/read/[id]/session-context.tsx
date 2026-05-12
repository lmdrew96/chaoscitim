'use client';

/**
 * Per-page session context. Reader instantiates the session manager
 * once and exposes a stable logEvent so deeply-nested token components
 * don't need it threaded through props.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { EventType } from '@/db/types';

type LogEvent = (event: {
  type: EventType;
  textId?: string | null;
  sentenceId?: number | null;
  tokenPosition?: number | null;
  payload?: Record<string, unknown> | null;
}) => void;

const noop: LogEvent = () => {};

const Ctx = createContext<LogEvent>(noop);

export function SessionContextProvider({
  value,
  children,
}: {
  value: LogEvent;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLogEvent(): LogEvent {
  return useContext(Ctx);
}
