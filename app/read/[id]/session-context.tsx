'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { EventType, SessionMode } from '@/db/types';

export type LogEvent = (event: {
  type: EventType;
  textId?: string | null;
  sentenceId?: number | null;
  tokenPosition?: number | null;
  payload?: Record<string, unknown> | null;
}) => void;

interface SessionCtx {
  logEvent: LogEvent;
  mode: SessionMode;
  setMode: (mode: SessionMode) => void;
}

const noop: LogEvent = () => {};
const noopSetMode = () => {};

const Ctx = createContext<SessionCtx>({
  logEvent: noop,
  mode: 'active',
  setMode: noopSetMode,
});

export function SessionContextProvider({
  value,
  children,
}: {
  value: SessionCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionContext(): SessionCtx {
  return useContext(Ctx);
}

export function useLogEvent(): LogEvent {
  return useContext(Ctx).logEvent;
}
