#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { readIndexLines, readJsonFile } = require('./lib/halsoHdGraphInbox');
const {
  buildStructuredFormUpsert,
  emptyDedupState,
  loadDedupState,
  processOneHalsoMessage,
  saveDedupState,
} = require('./lib/halsoHdBatchIngest');
const {
  fetchProdPatients,
  getProdToken,
  putPatientFormsBatch,
} = require('./lib/halsoHdProdClient');
const { buildHalsoPipedriveIdentityBridge } = require('./lib/halsoHdPipedriveIdentityBridge');

function parseArgs(argv) {
  const args = { index: '', checkpoint: '', dedup: '', pipedrivePeople: '', batchSize: 50 };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--index') args.index = path.resolve(argv[++index] || '');
    else if (flag === '--checkpoint') args.checkpoint = path.resolve(argv[++index] || '');
    else if (flag === '--dedup') args.dedup = path.resolve(argv[++index] || '');
    else if (flag === '--pipedrive-people') args.pipedrivePeople = path.resolve(argv[++index] || '');
    else if (flag === '--batch-size') args.batchSize = Math.max(1, Math.min(100, Number(argv[++index]) || 50));
  }
  for (const key of ['index', 'checkpoint', 'dedup', 'pipedrivePeople']) {
    if (!args[key]) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} krävs`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const checkpoint = await readJsonFile(args.checkpoint, null);
  if (!checkpoint?.complete) throw new Error('Corpus-checkpoint är inte komplett.');
  const token = getProdToken();
  const patients = await fetchProdPatients(token);
  const bridge = buildHalsoPipedriveIdentityBridge(
    await fs.readFile(args.pipedrivePeople, 'utf8'),
    patients
  );
  const entries = await readIndexLines(args.index);
  const dedupState = await loadDedupState(args.dedup).catch(() => emptyDedupState());
  const runId = `halso-bulk-${new Date().toISOString()}`;
  const pending = [];
  const stats = { scanned: 0, matched: 0, applied: 0, unmatched: 0, parseFailed: 0 };

  for (const header of entries) {
    const result = await processOneHalsoMessage({
      header,
      patients: bridge.patients,
      dedupState,
      dedupPath: args.dedup,
      dryRun: true,
      runId,
    });
    stats.scanned += 1;
    if (result.status === 'dry_run_matched') {
      const parsed = result.parsed;
      pending.push({
        item: {
          patientId: result.match.patientId,
          personnummer: parsed.personnummer || '',
          formType: parsed.formType || 'health_declaration',
          structuredForm: buildStructuredFormUpsert({
            parsed,
            match: result.match,
            rawMessage: header,
            runId,
          }),
          allergies: parsed.allergies || [],
          halsoHdBackfill: {
            runId,
            formType: parsed.formType || 'health_declaration',
            matchMethod: result.match.method,
            importedAt: new Date().toISOString(),
          },
        },
        dedupKeys: result.dedupKeys,
        dedupEntry: {
          patientId: result.match.patientId,
          formType: parsed.formType || 'health_declaration',
          signedAt: parsed.signedAt,
          internetMessageId: parsed.internetMessageId || header.internetMessageId || '',
          matchMethod: result.match.method,
        },
      });
      stats.matched += 1;
    } else if (result.status === 'parse_failed') stats.parseFailed += 1;
    else if (result.status === 'unmatched' || result.status === 'needs_review') stats.unmatched += 1;
  }

  for (let offset = 0; offset < pending.length; offset += args.batchSize) {
    const chunk = pending.slice(offset, offset + args.batchSize);
    const response = await putPatientFormsBatch(token, chunk.map((row) => row.item));
    if (!response.ok || response.applied !== chunk.length || response.skipped?.length) {
      throw new Error(`Ofullständigt batchsvar vid offset ${offset}: ${JSON.stringify(response)}`);
    }
    for (const row of chunk) {
      for (const key of row.dedupKeys) {
        dedupState.entries[key] = { ...row.dedupEntry, recordedAt: new Date().toISOString() };
      }
    }
    await saveDedupState(args.dedup, dedupState);
    stats.applied += chunk.length;
    console.error(`Applied ${stats.applied}/${pending.length}`);
  }

  console.log(JSON.stringify({ ok: true, runId, bridge: bridge.stats, stats }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
