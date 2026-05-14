'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TextToken } from '@/db/schema';
import type { MWE } from '@/lib/mwe';

export interface AnchorInfo {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface ActiveCard {
  /** `${sentenceId}:${tokenPosition}` — unique within a text session. */
  tokenId: string;
  token: TextToken;
  head: TextToken | null;
  mwe: Pick<MWE, 'gloss' | 'lemmas'> | null;
  anchor: AnchorInfo;
}

interface CardCtx {
  activeCard: ActiveCard | null;
  /** Set of tokenIds looked up this session — drives the looked-up underline. */
  lookedUp: ReadonlySet<string>;
  openCard: (card: ActiveCard) => void;
  closeCard: () => void;
}

const CardContext = createContext<CardCtx>({
  activeCard: null,
  lookedUp: new Set(),
  openCard: () => {},
  closeCard: () => {},
});

export function CardContextProvider({ children }: { children: ReactNode }) {
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const lookedUpRef = useRef<Set<string>>(new Set());
  const [lookedUp, setLookedUp] = useState<ReadonlySet<string>>(lookedUpRef.current);

  const openCard = useCallback((card: ActiveCard) => {
    setActiveCard(card);
    if (!lookedUpRef.current.has(card.tokenId)) {
      lookedUpRef.current = new Set(lookedUpRef.current).add(card.tokenId);
      setLookedUp(lookedUpRef.current);
    }
  }, []);

  const closeCard = useCallback(() => setActiveCard(null), []);

  return (
    <CardContext.Provider value={{ activeCard, lookedUp, openCard, closeCard }}>
      {children}
    </CardContext.Provider>
  );
}

export function useCardContext(): CardCtx {
  return useContext(CardContext);
}
