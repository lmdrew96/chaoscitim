import type { Features, UPos } from '../db/types';

export interface ParsedToken {
  id: number; // 1-indexed within sentence
  form: string;
  lemma: string;
  upos: UPos;
  xpos: string | null;
  feats: Features;
  head: number | null; // null for root (head=0 in CoNLL-U)
  deprel: string;
  deps: string | null;
  misc: Record<string, string>;
}

export interface ParsedMwt {
  start: number;
  end: number;
  form: string; // joined surface form, e.g. "într-un"
}

export interface ParsedSentence {
  sentenceId: number;
  text: string;
  tokens: ParsedToken[];
  mwts: ParsedMwt[];
}

const SENT_ID_RE = /^# sent_id = (\S+)/;
const TEXT_RE = /^# text = (.+)$/;

export function parseConllu(input: string): ParsedSentence[] {
  const sentences: ParsedSentence[] = [];
  const blocks = input.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    let sentenceId: number | null = null;
    let text = '';
    const tokens: ParsedToken[] = [];
    const mwts: ParsedMwt[] = [];

    for (const line of lines) {
      if (line.startsWith('#')) {
        const sentIdMatch = line.match(SENT_ID_RE);
        if (sentIdMatch?.[1]) {
          const parsed = parseInt(sentIdMatch[1], 10);
          if (!Number.isNaN(parsed)) sentenceId = parsed;
          continue;
        }
        const textMatch = line.match(TEXT_RE);
        if (textMatch?.[1]) {
          text = textMatch[1];
          continue;
        }
        continue;
      }

      const fields = line.split('\t');
      if (fields.length < 10) continue;

      const idField = fields[0]!;

      // Skip empty/null nodes (decimal IDs like "1.1")
      if (idField.includes('.')) continue;

      // MWT range row (e.g. "1-2") — components follow as separate tokens
      const mwtMatch = idField.match(/^(\d+)-(\d+)$/);
      if (mwtMatch) {
        const start = parseInt(mwtMatch[1]!, 10);
        const end = parseInt(mwtMatch[2]!, 10);
        if (!Number.isNaN(start) && !Number.isNaN(end)) {
          mwts.push({ start, end, form: fields[1]! });
        }
        continue;
      }

      const id = parseInt(idField, 10);
      if (Number.isNaN(id)) continue;

      const headField = fields[6]!;
      const headParsed = parseInt(headField, 10);
      const head = headField === '_' || headField === '0' || Number.isNaN(headParsed)
        ? null
        : headParsed;

      tokens.push({
        id,
        form: fields[1]!,
        lemma: fields[2]!,
        upos: fields[3] as UPos,
        xpos: fields[4] === '_' ? null : fields[4]!,
        feats: parseFeatures(fields[5]!),
        head,
        deprel: fields[7]!,
        deps: fields[8] === '_' ? null : fields[8]!,
        misc: parseMisc(fields[9]!),
      });
    }

    if (sentenceId !== null && tokens.length > 0) {
      sentences.push({ sentenceId, text, tokens, mwts });
    }
  }

  return sentences;
}

function parseFeatures(field: string): Features {
  if (field === '_' || field === '') return {};
  const result: Features = {};
  for (const pair of field.split('|')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    result[key] = value;
  }
  return result;
}

function parseMisc(field: string): Record<string, string> {
  if (field === '_' || field === '') return {};
  const result: Record<string, string> = {};
  for (const pair of field.split('|')) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      result[pair.slice(0, eq)] = pair.slice(eq + 1);
    } else if (pair.length > 0) {
      result[pair] = 'true';
    }
  }
  return result;
}
