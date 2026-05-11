/**
 * Tier-3 English gloss resolution.
 *
 * Combines three sources, in priority order:
 *   1. Hand-curated overrides at `data/seed-glosses.json` (committed).
 *   2. On-disk cache at `data/glosses-cache.json` (gitignored, regenerable).
 *   3. Live Wiktionary fetch (en.wiktionary, CC BY-SA 4.0).
 *
 * Misses are cached as `null` so re-runs don't re-hit Wiktionary for
 * known-missing lemmas. See docs/wiktionary-attribution.md for licensing.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  fetchGlossesBatch,
  type GlossLookup,
  type GlossResult,
} from './wiktionary';

const DEFAULT_CACHE_PATH = 'data/glosses-cache.json';
const DEFAULT_OVERRIDES_PATH = 'data/seed-glosses.json';

interface CacheEntry {
  gloss: string | null;
  raw: string | null;
  fetchedAt: string; // ISO timestamp
}

type CacheShape = Record<string, CacheEntry>;
type OverridesShape = Record<string, string>;

export interface ResolveGlossesOpts {
  cachePath?: string;
  overridesPath?: string;
  /** Skip network fetch entirely; use only overrides + cache. */
  offline?: boolean;
  /** Override fetch implementation (for testing). */
  fetchImpl?: typeof fetch;
  /** Inter-batch delay in ms passed to the Wiktionary fetcher. */
  delayMs?: number;
  onProgress?: (done: number, total: number, source: 'cache' | 'override' | 'fetch') => void;
}

export interface ResolveGlossesResult {
  /** lemma → final gloss (null when no source had one). */
  glosses: Map<string, string | null>;
  diagnostics: {
    total: number;
    fromOverride: number;
    fromCache: number;
    fromFetch: number;
    missing: number;
  };
}

export async function resolveGlosses(
  lookups: GlossLookup[],
  opts: ResolveGlossesOpts = {},
): Promise<ResolveGlossesResult> {
  const cachePath = opts.cachePath ?? DEFAULT_CACHE_PATH;
  const overridesPath = opts.overridesPath ?? DEFAULT_OVERRIDES_PATH;

  const overrides = await loadJsonSafe<OverridesShape>(overridesPath, {});
  const cache = await loadJsonSafe<CacheShape>(cachePath, {});

  const glosses = new Map<string, string | null>();
  const needFetch: GlossLookup[] = [];
  const seen = new Set<string>();

  let fromOverride = 0;
  let fromCache = 0;
  let fromFetch = 0;

  for (const lookup of lookups) {
    if (seen.has(lookup.lemma)) continue;
    seen.add(lookup.lemma);

    if (overrides[lookup.lemma]) {
      glosses.set(lookup.lemma, overrides[lookup.lemma]!);
      fromOverride++;
      opts.onProgress?.(glosses.size, seen.size, 'override');
      continue;
    }
    if (lookup.lemma in cache) {
      glosses.set(lookup.lemma, cache[lookup.lemma]!.gloss);
      fromCache++;
      opts.onProgress?.(glosses.size, seen.size, 'cache');
      continue;
    }
    if (!opts.offline) {
      needFetch.push(lookup);
    }
  }

  if (needFetch.length > 0 && !opts.offline) {
    const fetched = await fetchGlossesBatch(needFetch, {
      fetchImpl: opts.fetchImpl,
      delayMs: opts.delayMs,
    });
    const now = new Date().toISOString();
    for (const [lemma, result] of fetched) {
      glosses.set(lemma, result.gloss);
      cache[lemma] = { gloss: result.gloss, raw: result.raw, fetchedAt: now };
      fromFetch++;
      opts.onProgress?.(glosses.size, seen.size, 'fetch');
    }
    await saveJson(cachePath, cache);
  }

  // Fill anything still unresolved (offline mode + cache miss) with null.
  for (const lemma of seen) {
    if (!glosses.has(lemma)) glosses.set(lemma, null);
  }

  const missing = Array.from(glosses.values()).filter((v) => v === null).length;

  return {
    glosses,
    diagnostics: {
      total: seen.size,
      fromOverride,
      fromCache,
      fromFetch,
      missing,
    },
  };
}

async function loadJsonSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    const buf = await readFile(path, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function saveJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * UPOS values for which we attempt a Wiktionary lookup. Punctuation,
 * symbols, numbers, and the catch-all `X` tag are skipped — they don't
 * have English glosses worth surfacing.
 */
const GLOSSABLE_UPOS = new Set([
  'NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV',
  'ADP', 'CCONJ', 'SCONJ', 'PRON', 'DET', 'INTJ', 'PART',
]);

export function shouldGloss(upos: string): boolean {
  return GLOSSABLE_UPOS.has(upos);
}

export { DEFAULT_CACHE_PATH, DEFAULT_OVERRIDES_PATH };
