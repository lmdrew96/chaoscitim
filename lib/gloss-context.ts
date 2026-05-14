/**
 * AI-powered contextual gloss generation.
 *
 * Produces a short English phrase (3-8 words) capturing the meaning of each
 * inflected token AS USED IN ITS SENTENCE — not a dictionary definition.
 * "casei" → "of the house", "mergeau" → "they were going".
 *
 * One Claude call per sentence. Returns a map keyed by tokenPosition.
 * Any failure (network, bad response) returns null for all tokens in that
 * sentence — the card still renders without the AI line.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ParsedSentence, ParsedToken } from './conllu';

export const MODEL_VERSION = 'claude-haiku-4-5-20251001';

// CCONJ lemmas that are transparent (and → și, but → dar, or → sau/ori,
// but-not → ci). Contextual AI gloss adds no value for these.
const SKIP_CCONJ_LEMMAS = new Set(['și', 'dar', 'sau', 'ori', 'ci']);

/** Returns true when a token should receive a contextual AI gloss. */
export function shouldContextGloss(token: ParsedToken): boolean {
  const { upos, lemma } = token;
  if (upos === 'PUNCT' || upos === 'SYM' || upos === 'X') return false;
  if (upos === 'PROPN') return false;
  if (upos === 'CCONJ' && SKIP_CCONJ_LEMMAS.has(lemma)) return false;
  return true;
}

/** Compact feature string for the prompt — keeps tokens short. */
function describeToken(token: ParsedToken): string {
  const parts: string[] = [token.upos.toLowerCase()];
  const f = token.feats;
  if (!f) return parts.join(', ');
  if (f.VerbForm) parts.push(f.VerbForm.toLowerCase());
  if (f.Person) parts.push(`${f.Person}p`);
  if (f.Number) parts.push(f.Number === 'Sing' ? 'sg' : 'pl');
  if (f.Tense) parts.push(f.Tense.toLowerCase());
  if (f.Mood && f.Mood !== 'Ind') parts.push(f.Mood.toLowerCase());
  if (f.Case) parts.push(f.Case.toLowerCase());
  if (f.Definite) parts.push(f.Definite === 'Def' ? 'def' : 'indef');
  if (f.Reflex === 'Yes') parts.push('reflex');
  return parts.join(', ');
}

const SYSTEM_PROMPT = `You are a Romanian-to-English language assistant helping learners read Romanian text.

For each token in the sentence, produce a short English contextual gloss (3–8 words) that captures the meaning of the inflected form as used IN THIS SPECIFIC SENTENCE — not the bare dictionary definition.

Rules:
- Reflect case meaning for nouns/pronouns (e.g. "of the house", "to her", "for them")
- Reflect person + tense for verbs (e.g. "they were going", "I had given", "she would know")
- Reflect grammatical function for particles and subordinators (e.g. "in order to [subjunctive]", "that [complement]")
- 3–8 words maximum — omit unnecessary articles when unnatural
- Do not repeat the Romanian word in the gloss
- Do not add grammatical labels in parentheses — just natural English`;

interface GlossEntry {
  position: number;
  gloss: string;
}

interface GlossToolInput {
  glosses: GlossEntry[];
}

const GLOSS_TOOL: Anthropic.Tool = {
  name: 'provide_glosses',
  description: 'Provide contextual English glosses for the specified Romanian tokens.',
  input_schema: {
    type: 'object' as const,
    properties: {
      glosses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            position: { type: 'integer', description: 'Token position from the input' },
            gloss: { type: 'string', description: 'English contextual gloss, 3–8 words' },
          },
          required: ['position', 'gloss'],
        },
      },
    },
    required: ['glosses'],
  },
};

/**
 * Generate contextual glosses for all eligible tokens in a sentence.
 *
 * @returns Map from tokenPosition → gloss string (null for skipped/failed tokens)
 */
export async function generateSentenceGlosses(
  sentence: ParsedSentence,
  client: Anthropic,
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();

  const eligible = sentence.tokens.filter(shouldContextGloss);
  if (eligible.length === 0) return result;

  const tokenLines = eligible
    .map((t) => `${t.id}. "${t.form}" (lemma: ${t.lemma}, ${describeToken(t)})`)
    .join('\n');

  const userMessage = `Sentence: "${sentence.text}"\n\nTokens to gloss:\n${tokenLines}`;

  try {
    const response = await client.messages.create({
      model: MODEL_VERSION,
      max_tokens: 512,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [GLOSS_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userMessage }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') return result;

    const input = toolUse.input as GlossToolInput;
    if (!Array.isArray(input.glosses)) return result;

    for (const entry of input.glosses) {
      if (typeof entry.position === 'number' && typeof entry.gloss === 'string') {
        result.set(entry.position, entry.gloss.trim() || null);
      }
    }
  } catch {
    // Network error, rate limit, etc. — degrade gracefully, card renders without AI line.
  }

  return result;
}

/**
 * Generate contextual glosses for all sentences in a text.
 *
 * @returns Map from `${sentenceId}:${tokenPosition}` → gloss (null = no gloss)
 */
export async function generateContextGlosses(
  sentences: ParsedSentence[],
): Promise<Map<string, string | null>> {
  const client = new Anthropic();
  const result = new Map<string, string | null>();

  for (const sentence of sentences) {
    const sentenceGlosses = await generateSentenceGlosses(sentence, client);
    for (const [position, gloss] of sentenceGlosses) {
      result.set(`${sentence.sentenceId}:${position}`, gloss);
    }
  }

  return result;
}
