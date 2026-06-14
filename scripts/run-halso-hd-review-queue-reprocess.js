#!/usr/bin/env node
'use strict';

/**
 * Reprocess unmatched/needs_review rows from halso-hd-review-queue.jsonl
 * against fresh prod patient-master (post-Cliento sync).
 *
 * Usage:
 *   node scripts/run-halso-hd-review-queue-reprocess.js --dry-run
 *   node scripts/run-halso-hd-review-queue-reprocess.js --commit [--form-type hd|fc]
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { readIndexLines, readJsonFile, DEFAULT_MAILBOX } = require('./lib/halsoHdGraphInbox');
const { fetchProdPatients, getProdToken, BASE } = require('./lib/halsoHdProdClient');
const {
  emptyBatchStats,
  loadDedupState,
  processOneHalsoMessage,
  applyStats,
} = require('./lib/halsoHdBatchIngest');
const {
  inferFormTypeFromSubject,
  matchesFormTypeFilter,
  normalizeFormTypeFilter,
} = require('./lib/halsoHdFormTypeFilter');
const { matchPatientFromParsed } = require('../src/ops/ccoHalsoHealthDeclarationIngest');

const ROOT = path.join(__dirname, '..');
const DEFAULT_QUEUE = path.join(ROOT, 'data/reports/halso-hd-review-queue.jsonl');
const DEFAULT_INDEX = path.join(ROOT, 'data/reports/halso-hd-corpus-index.jsonl');
const DEFAULT_DEDUP = path.join(ROOT, 'data/reports/halso-hd-batch-dedup.json');
const DEFAULT_REPORT = path.join(ROOT, 'data/reports/halso-hd-review-reprocess-report.json');

function parseArgs(argv) {
  const args = {
    queue: DEFAULT_QUEUE,
    index: DEFAULT_INDEX,
    dedup: DEFAULT_DEDUP,
    out: DEFAULT_REPORT,
    formType: '',
    dryRun: true,
    commit: false,
    limit: 0,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--queue') args.queue = path.resolve(argv[++i] || '');
    else if (token === '--index') args.index = path.resolve(argv[++i] || '');
    else if (token === '--dedup') args.dedup = path.resolve(argv[++i] || '');
    else if (token === '--out') args.out = path.resolve(argv[++i] || '');
    else if (token === '--form-type') args.formType = normalizeFormTypeFilter(argv[++i] || '');
    else if (token === '--limit') args.limit = Number(argv[++i]) || 0;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (token === '--help' || token === '-h') {
      console.log(
        `Usage: node scripts/run-halso-hd-review-queue-reprocess.js [--form-type hd|fc] [--dry-run|--commit] [--limit N]`
      );
      process.exit(0);
    }
  }
  return args;
}

async function readQueueLines(queuePath) {
  try {
    const raw = await fs.readFile(queuePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function dedupeQueueEntries(entries = []) {
  const byMessage = new Map();
  for (const entry of entries) {
    const id = entry.messageId || entry.internetMessageId || '';
    if (!id) continue;
    const prev = byMessage.get(id);
    if (!prev || String(entry.queuedAt || '') >= String(prev.queuedAt || '')) {
      byMessage.set(id, entry);
    }
  }
  return [...byMessage.values()];
}

function headerFromQueueEntry(entry, indexById) {
  const fromIndex = indexById.get(entry.messageId) || null;
  return (
    fromIndex || {
      id: entry.messageId,
      subject: entry.subject || '',
      receivedDateTime: entry.receivedDateTime || '',
      internetMessageId: entry.internetMessageId || '',
    }
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const queueEntries = dedupeQueueEntries(await readQueueLines(args.queue)).filter((entry) =>
    ['unmatched', 'needs_review'].includes(entry.status)
  );

  const filtered = queueEntries.filter((entry) => {
    const formType =
      entry.formType || inferFormTypeFromSubject(entry.subject || '') || 'health_declaration';
    return matchesFormTypeFilter(formType, args.formType);
  });

  const indexEntries = await readIndexLines(args.index);
  const indexById = new Map(indexEntries.map((row) => [row.id, row]));

  const slice = args.limit > 0 ? filtered.slice(0, args.limit) : filtered;

  console.error(`== Review queue reprocess (${args.dryRun ? 'DRY-RUN' : 'COMMIT'}) ==`);
  console.error(
    `Prod: ${BASE} · queue=${filtered.length}${args.formType ? ` · form=${args.formType}` : ''}`
  );

  const token = args.dryRun ? '' : getProdToken();
  const patients = await fetchProdPatients(token || getProdToken());
  console.error(`Patienter: ${patients.length}`);

  const dedupState = await loadDedupState(args.dedup);
  const stats = emptyBatchStats();
  const rows = [];
  const triage = {
    wouldMatchNow: 0,
    stillUnmatched: 0,
    notInMaster: 0,
    needsReview: 0,
  };
  const runId = `halso-review-reprocess-${new Date().toISOString().slice(0, 10)}`;

  for (let i = 0; i < slice.length; i += 1) {
    const entry = slice[i];
    const header = headerFromQueueEntry(entry, indexById);
    const preMatch = matchPatientFromParsed(
      {
        personnummer: entry.personnummer || '',
        email: entry.email || '',
        phone: entry.phone || '',
        displayName: entry.displayName || '',
        phoneKey: entry.phone || '',
      },
      patients
    );

    if (preMatch.status === 'MATCHED') triage.wouldMatchNow += 1;
    else if (preMatch.status === 'NEEDS_REVIEW') triage.needsReview += 1;
    else {
      triage.stillUnmatched += 1;
      if (!entry.personnummer && !entry.email && !entry.phone) triage.notInMaster += 1;
    }

    const result = await processOneHalsoMessage({
      header,
      patients,
      dedupState,
      dedupPath: args.dedup,
      token,
      mailbox: DEFAULT_MAILBOX,
      dryRun: args.dryRun,
      runId,
      formTypeFilter: args.formType,
      allowUnmatchedStubs: !args.dryRun && process.env.HALSO_HD_COMMIT_UNMATCHED_STUBS === 'true',
    });

    applyStats(stats, result);
    rows.push({
      ...result.row,
      queueStatus: entry.status,
      preMatchStatus: preMatch.status,
    });

    if (i === slice.length - 1 || (i + 1) % 25 === 0) {
      console.error(
        `  … ${i + 1}/${slice.length} putOk=${stats.putOk} unmatched=${stats.unmatched}`
      );
    }
  }

  const report = {
    ok: true,
    phase: args.dryRun ? 'review_reprocess_dry_run' : 'review_reprocess_commit',
    prodUrl: BASE,
    formType: args.formType || null,
    queueTotal: queueEntries.length,
    processed: slice.length,
    triage,
    stats,
    runId,
    generatedAt: new Date().toISOString(),
    rows,
  };

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(`Rapport (PII): ${args.out}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        phase: report.phase,
        processed: report.processed,
        triage: report.triage,
        stats: report.stats,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
