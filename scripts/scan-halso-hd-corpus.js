#!/usr/bin/env node
'use strict';

/**
 * Paginerad halso@ inbox corpus-scan (Graph $top + @odata.nextLink).
 * Skriver checkpoint + JSONL-index — PII, committa INTE.
 *
 * Usage:
 *   npm run scan:halso-hd-corpus
 *   npm run scan:halso-hd-corpus -- --since 2020-01-01 --page-size 100
 *   npm run scan:halso-hd-corpus -- --resume
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');
const {
  DEFAULT_MAILBOX,
  scanHalsoInboxCorpus,
  readIndexLines,
  readJsonFile,
} = require('./lib/halsoHdGraphInbox');

const ROOT = path.join(__dirname, '..');
const DEFAULT_CHECKPOINT = path.join(ROOT, 'data/reports/halso-hd-corpus.checkpoint.json');
const DEFAULT_INDEX = path.join(ROOT, 'data/reports/halso-hd-corpus-index.jsonl');

function parseArgs(argv) {
  const args = {
    since: process.env.HALSO_HD_SINCE || '',
    pageSize: Number(process.env.HALSO_HD_PAGE_SIZE || '100') || 100,
    scope: 'mailbox',
    checkpoint: DEFAULT_CHECKPOINT,
    index: DEFAULT_INDEX,
    resume: false,
    maxPages: 0,
    mailbox: DEFAULT_MAILBOX,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--since') args.since = argv[++i] || '';
    else if (token === '--page-size') args.pageSize = Number(argv[++i]) || 100;
    else if (token === '--checkpoint') args.checkpoint = path.resolve(argv[++i] || '');
    else if (token === '--index') args.index = path.resolve(argv[++i] || '');
    else if (token === '--mailbox') args.mailbox = (argv[++i] || DEFAULT_MAILBOX).toLowerCase();
    else if (token === '--scope') args.scope = argv[++i] || 'mailbox';
    else if (token === '--max-pages') args.maxPages = Number(argv[++i]) || 0;
    else if (token === '--resume') args.resume = true;
    else if (token === '--help' || token === '-h') {
      console.log(
        `Usage: node scripts/scan-halso-hd-corpus.js [--since YYYY-MM-DD] [--page-size N] [--resume]`
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const existingCheckpoint = await readJsonFile(args.checkpoint, null);
  if (!args.resume && existingCheckpoint && !existingCheckpoint.complete) {
    console.error(
      `⚠ Ofullständig checkpoint finns (${args.checkpoint}) — kör med --resume eller ta bort filen`
    );
    process.exit(2);
  }

  if (!args.resume && (!existingCheckpoint || existingCheckpoint.complete)) {
    const fs = require('node:fs/promises');
    await fs.mkdir(path.dirname(args.index), { recursive: true });
    await fs.writeFile(args.index, '', 'utf8');
    if (existingCheckpoint?.complete) {
      await fs.unlink(args.checkpoint).catch(() => {});
    }
  }

  console.error(`== halso@ corpus-scan — ${args.mailbox} (scope=${args.scope}) ==`);
  console.error(`since=${args.since || '(allt)'} pageSize=${args.pageSize}`);

  let lastLog = 0;
  const result = await scanHalsoInboxCorpus({
    mailbox: args.mailbox,
    since: args.since,
    pageSize: args.pageSize,
    scope: args.scope,
    checkpointPath: args.checkpoint,
    indexPath: args.index,
    maxPages: args.maxPages,
    onProgress: ({ checkpoint }) => {
      if (checkpoint.messagesScanned - lastLog >= 500 || checkpoint.complete) {
        lastLog = checkpoint.messagesScanned;
        console.error(
          `  … sidor=${checkpoint.pagesScanned} mejl=${checkpoint.messagesScanned} HD=${checkpoint.hdHeadersFound}`
        );
      }
    },
  });

  const indexEntries = await readIndexLines(args.index);
  const report = {
    ok: true,
    phase: 'corpus_scan',
    mailbox: args.mailbox,
    since: args.since || null,
    checkpointPath: args.checkpoint,
    indexPath: args.index,
    complete: result.checkpoint.complete,
    alreadyComplete: result.alreadyComplete,
    pagesScanned: result.checkpoint.pagesScanned,
    messagesScanned: result.checkpoint.messagesScanned,
    hdCorpusTotal: indexEntries.length,
    expectedApproxM365Halso: 1660,
    liveMailboxHdTotal: indexEntries.length,
    note: 'Phase 2 mailbox-corpus (struktur-ingest). ~1660 avser Phase 1 m365_halso-assets — inte samma som live [Hälsodeklaration/Webb]-mejl i Graph.',
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!result.checkpoint.complete) {
    console.error('⏸ Scan pausad — kör igen med --resume');
    process.exit(3);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
