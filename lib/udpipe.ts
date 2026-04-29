import { ANALYZER_LICENSES } from '../db/types';
import type { License } from '../db/types';

const LINDAT_BASE = 'https://lindat.mff.cuni.cz/services/udpipe/api';

// Pin the model version. Bumping this is an explicit choice; existing
// `texts.analyzerModelVersion` rows continue to point at their original
// pin, and only re-ingestion picks up the new model.
export const DEFAULT_MODEL = 'romanian-rrt-ud-2.17-251125';

export interface AnalyzeOptions {
  text: string;
  model?: string;
  timeoutMs?: number;
}

export interface AnalyzeResult {
  conllu: string;
  modelVersion: string;
  modelLicense: License;
}

export async function analyze({
  text,
  model = DEFAULT_MODEL,
  timeoutMs = 60_000,
}: AnalyzeOptions): Promise<AnalyzeResult> {
  if (!text.trim()) {
    throw new Error('analyze: empty input text');
  }

  const license = ANALYZER_LICENSES[model];
  if (!license) {
    throw new Error(
      `analyze: unknown analyzer model "${model}" — add it to ANALYZER_LICENSES in db/types.ts before use`,
    );
  }

  const body = new URLSearchParams();
  body.set('model', model);
  body.set('tokenizer', '');
  body.set('tagger', '');
  body.set('parser', '');
  body.set('data', text);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${LINDAT_BASE}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`analyze: LINDAT request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`analyze: LINDAT request failed — ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(
      `analyze: LINDAT returned ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as { result?: string; error?: string };
  if (json.error) {
    throw new Error(`analyze: LINDAT error — ${json.error}`);
  }
  if (typeof json.result !== 'string') {
    throw new Error('analyze: LINDAT response missing result field');
  }

  return {
    conllu: json.result,
    modelVersion: model,
    modelLicense: license,
  };
}
