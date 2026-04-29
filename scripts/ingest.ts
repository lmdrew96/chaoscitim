#!/usr/bin/env tsx
/* eslint-disable no-console */
import { config } from 'dotenv';
// Project convention: .env.local is the gitignored secrets file. Load it
// first; fall back to .env. Mirrors drizzle.config.ts.
config({ path: '.env.local' });
config({ path: '.env' });
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  prepareIngestion,
  commitIngestion,
  type IngestInput,
} from '../lib/ingestion';
import { closeDb } from '../db';

const HELP = `
Ingest a Romanian text into ChaosCitim.

Usage:
  pnpm ingest --file PATH --title "..." --license LICENSE --cefr LEVEL [options]
  pnpm ingest --url URL   --title "..." --license LICENSE --cefr LEVEL [options]
  pnpm ingest --paste     --title "..." --license LICENSE --cefr LEVEL [options]   # read from stdin

Required:
  --title TEXT            Display title for the text
  --license LICENSE       cc_by | cc_by_sa | cc_by_nc | cc_by_nc_sa | cc0 |
                          public_domain | friend_explicit_grant | user_byo
  --cefr LEVEL            A1 | A2 | B1 | B2 | C1 | C2
  One of: --file, --url, --paste

Optional:
  --source-type TYPE      wikipedia_ro | wikisource_ro | cc_blog |
                          friend_contributed | byo_url | byo_paste |
                          byo_epub | byo_clipboard       (default: byo_paste)
  --visibility V          public_seed | private | cohort_shared       (default: private)
  --author NAME           Author of the source text
  --source-url URL        Original URL (if not using --url)
  --tags A,B,C            Comma-separated topic tags
  --owner ID              Clerk user id (omit for seed library)
  --model NAME            UDPipe model id   (default: pinned latest)
  --dry-run               Run pipeline, print summary, do NOT write to DB
  --help                  Show this help

Notes:
  --url performs a plain GET and uses the response body as text.
  HTML→clean-text extraction is a separate patch — for HTML pages,
  pre-extract and use --paste or --file instead.
`;

const cli = parseArgs({
  options: {
    file: { type: 'string' },
    url: { type: 'string' },
    paste: { type: 'boolean' },
    title: { type: 'string' },
    license: { type: 'string' },
    cefr: { type: 'string' },
    'source-type': { type: 'string' },
    visibility: { type: 'string' },
    author: { type: 'string' },
    'source-url': { type: 'string' },
    tags: { type: 'string' },
    owner: { type: 'string' },
    model: { type: 'string' },
    'dry-run': { type: 'boolean' },
    help: { type: 'boolean' },
  },
  strict: true,
  allowPositionals: false,
});

const args = cli.values;

if (args.help) {
  console.log(HELP);
  process.exit(0);
}

const LicenseEnum = z.enum([
  'cc_by',
  'cc_by_sa',
  'cc_by_nc',
  'cc_by_nc_sa',
  'cc0',
  'public_domain',
  'friend_explicit_grant',
  'user_byo',
]);
const CefrEnum = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const SourceTypeEnum = z.enum([
  'wikipedia_ro',
  'wikisource_ro',
  'cc_blog',
  'friend_contributed',
  'byo_url',
  'byo_paste',
  'byo_epub',
  'byo_clipboard',
]);
const VisibilityEnum = z.enum(['public_seed', 'private', 'cohort_shared']);

async function readStdin(): Promise<string> {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function loadContent(): Promise<{ raw: string; defaultSourceType: string }> {
  const sources = [args.file, args.url, args.paste].filter(Boolean);
  if (sources.length !== 1) {
    throw new Error('Specify exactly one of --file, --url, --paste');
  }
  if (args.file) {
    return { raw: await readFile(args.file, 'utf8'), defaultSourceType: 'byo_paste' };
  }
  if (args.url) {
    return { raw: await fetchUrlText(args.url), defaultSourceType: 'byo_url' };
  }
  return { raw: await readStdin(), defaultSourceType: 'byo_paste' };
}

function fail(msg: string): never {
  console.error(`error: ${msg}\n`);
  console.error('Run with --help for usage.');
  process.exit(1);
}

async function main(): Promise<void> {
  if (!args.title) fail('--title is required');
  if (!args.license) fail('--license is required');
  if (!args.cefr) fail('--cefr is required');

  const license = LicenseEnum.safeParse(args.license);
  if (!license.success) fail(`invalid --license: ${args.license}`);
  const cefr = CefrEnum.safeParse(args.cefr);
  if (!cefr.success) fail(`invalid --cefr: ${args.cefr}`);

  const { raw, defaultSourceType } = await loadContent();
  if (!raw.trim()) fail('input content is empty');

  const sourceTypeRaw = args['source-type'] ?? defaultSourceType;
  const sourceType = SourceTypeEnum.safeParse(sourceTypeRaw);
  if (!sourceType.success) fail(`invalid --source-type: ${sourceTypeRaw}`);

  const visibilityRaw = args.visibility ?? 'private';
  const visibility = VisibilityEnum.safeParse(visibilityRaw);
  if (!visibility.success) fail(`invalid --visibility: ${visibilityRaw}`);

  const tags = args.tags
    ? args.tags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const input: IngestInput = {
    title: args.title,
    author: args.author ?? null,
    sourceUrl: args['source-url'] ?? args.url ?? null,
    sourceType: sourceType.data,
    license: license.data,
    rawContent: raw,
    cefrLevel: cefr.data,
    topicTags: tags,
    ownerId: args.owner ?? null,
    visibility: visibility.data,
    model: args.model,
  };

  console.log(`→ analyzing "${input.title}" (${raw.length.toLocaleString()} chars)...`);
  const prepared = await prepareIngestion(input);

  console.log(`✓ analysis complete:`);
  console.log(`    sentences:           ${prepared.diagnostics.sentenceCount}`);
  console.log(`    word tokens:         ${prepared.diagnostics.wordCount}`);
  console.log(`    total tokens:        ${prepared.tokenRows.length}`);
  console.log(`    multi-word tokens:   ${prepared.diagnostics.mwtCount}`);
  console.log(`    se classifications:  ${prepared.diagnostics.seClassifications}`);
  console.log(`    diacritics restored: ${prepared.diagnostics.diacriticsChanged ? 'yes' : 'no'}`);
  console.log(`    analyzer model:      ${prepared.textRow.analyzerModelVersion}`);
  console.log(`    analyzer license:    ${prepared.textRow.analyzerLicense}`);
  console.log(`    text id (would be):  ${prepared.textRow.id}`);

  if (args['dry-run']) {
    console.log('\n--dry-run: skipping DB write');
    return;
  }

  console.log('\n→ writing to database...');
  const id = await commitIngestion(prepared);
  console.log(`✓ ingested as text ${id}`);
}

main()
  .catch((err) => {
    console.error(`\n✗ ingestion failed: ${(err as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
