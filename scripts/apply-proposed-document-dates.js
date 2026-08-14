#!/usr/bin/env node
'use strict';

/**
 * Applicerar förslagna documentDate från propose-document-dates.js.
 *
 * Kräver --commit för skrivning. Utan --commit är skriptet läs-endast och
 * rapporterar vad som skulle skrivas.
 *
 * node scripts/apply-proposed-document-dates.js \
 *   --patient-assets-store /var/data/cco-patient-assets.json \
 *   --proposals /tmp/proposed-document-dates-v2.json \
 *   --min-confidence high \
 *   --commit
 */

const fs = require('node:fs');
const path = require('node:path');

const { createCcoPatientAssetStore } = require('../src/ops/ccoPatientAssetStore');
const { createCcoAuditLog } = require('../src/security/ccoAuditLog');

const REPO = path.resolve(__dirname, '..');
const DATA = path.join(REPO, 'data');

function parseArgs(argv = process.argv) {
  const args = {
    patientAssetsStorePath: '',
    proposalsPath: '',
    minConfidence: 'high',
    commit: false,
    reason: 'Bulk-fix documentDate from extracted journal/folder dates',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--patient-assets-store') args.patientAssetsStorePath = argv[++i] || '';
    else if (value === '--proposals') args.proposalsPath = argv[++i] || '';
    else if (value === '--min-confidence') args.minConfidence = argv[++i] || 'high';
    else if (value === '--commit') args.commit = true;
    else if (value === '--reason') args.reason = argv[++i] || args.reason;
    else if (value === '--help') {
      console.log('Se skriptets kommentarer.');
      process.exit(0);
    } else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.patientAssetsStorePath) throw new Error('--patient-assets-store krävs.');
  if (!args.proposalsPath) throw new Error('--proposals krävs.');
  return args;
}

const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 };

async function main() {
  const args = parseArgs();
  const proposalsData = JSON.parse(fs.readFileSync(args.proposalsPath, 'utf8'));

  // Bugbot-fynd (2026-08-14, PR #1381), Medium: skrivningar mot
  // patientdata gick utan audit-logg — samma mönster som
  // backfill-asset-display-names.js redan använder
  // (ARCANA_CCO_AUDIT_PATH-env, default data/cco-audit.jsonl).
  const auditPath = process.env.ARCANA_CCO_AUDIT_PATH || path.join(DATA, 'cco-audit.jsonl');
  const auditLog = createCcoAuditLog({ filePath: auditPath });
  const assetStore = await createCcoPatientAssetStore({
    filePath: path.resolve(args.patientAssetsStorePath),
    auditLog,
  });

  const minLevel = CONFIDENCE_ORDER[args.minConfidence] || 3;
  const toApply = [];
  for (const patient of proposalsData.patients || []) {
    for (const prop of patient.proposals || []) {
      if (!prop.proposedDocumentDate) continue;
      if ((CONFIDENCE_ORDER[prop.confidence] || 0) < minLevel) continue;
      toApply.push(prop);
    }
  }

  let existingOk = 0;
  let changed = 0;
  let skipped = 0;
  const actor = { id: 'system', type: 'bulk-repair', name: 'apply-proposed-document-dates' };

  for (const prop of toApply) {
    const existing = await assetStore.getAsset(prop.assetId);
    if (!existing) {
      skipped += 1;
      continue;
    }
    if (existing.documentDate === prop.proposedDocumentDate) {
      existingOk += 1;
      continue;
    }
    if (args.commit) {
      await assetStore.patchAssetNamingMetadata(
        prop.assetId,
        {
          documentDate: prop.proposedDocumentDate,
          documentDateSource: 'journal_date_extracted',
        },
        { actor, reason: args.reason }
      );
    }
    changed += 1;
  }

  const result = {
    mode: args.commit ? 'commit' : 'dry-run',
    minConfidence: args.minConfidence,
    proposalsMatching: toApply.length,
    existingOk,
    changed,
    skipped,
  };
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { parseArgs, CONFIDENCE_ORDER };
