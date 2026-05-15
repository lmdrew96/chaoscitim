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
  /** Set when the card represents a multi-word token (contraction). */
  mwtTokens?: TextToken[];
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
    // For MWT cards, mark each component's individual tokenId as looked up.
    const idsToMark = card.mwtTokens
      ? card.mwtTokens.map((t) => `${t.sentenceId}:${t.tokenPosition}`)
      : [card.tokenId];
    const prev = lookedUpRef.current;
    const next = new Set(prev);
    let changed = false;
    for (const id of idsToMark) {
      if (!next.has(id)) { next.add(id); changed = true; }
    }
    if (changed) {
      lookedUpRef.current = next;
      setLookedUp(next);
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
