#!/usr/bin/env node
'use strict';

/**
 * ORD-29 — Enrich patient master personnummer from Cliento Dataexport CSV.
 *
 * Usage:
 *   node scripts/enrich-patient-master-pnr-from-dataexport.js --from ./path/to/Dataexport.csv --dry-run
 *   node scripts/enrich-patient-master-pnr-from-dataexport.js --from ./path/to/Dataexport.csv --commit
 *   node scripts/enrich-patient-master-pnr-from-dataexport.js --from ./path/to/Dataexport.csv --commit --prod
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');
const {
  fetchProdPatients,
  getProdToken,
  putPatient,
  fetchPatient,
} = require('./lib/halsoHdProdClient');
const {
  parseDataexportCsvText,
  dedupeDataexportByKundId,
  evaluatePnrEnrichment,
  buildPatientPnrEnrichmentPatch,
} = require('./lib/enrichPatientMasterPnrFromDataexport');

const ROOT = path.join(__dirname, '..');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const DEFAULT_MASTER_PATH =
  process.env.CCO_PATIENT_MASTER_PATH || path.join(ROOT, 'data/cco-patient-master.json');

function parseArgs(argv) {
  const args = {
    from: '',
    dryRun: true,
    commit: false,
    prod: false,
    tenantId: TENANT_ID,
    masterPath: DEFAULT_MASTER_PATH,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--from') args.from = path.resolve(argv[++i] || '');
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (token === '--prod') args.prod = true;
    else if (token === '--tenant') args.tenantId = argv[++i] || TENANT_ID;
    else if (token === '--master') args.masterPath = path.resolve(argv[++i] || '');
    else if (token === '--help' || token === '-h') {
      console.log(
        'Usage: node scripts/enrich-patient-master-pnr-from-dataexport.js --from <dataexport.csv> [--dry-run|--commit] [--prod]'
      );
      process.exit(0);
    }
  }
  return args;
}

async function loadPatients(args) {
  if (args.prod) {
    const token = getProdToken();
    const patients = await fetchProdPatients(token);
    return { patients, token, source: 'prod' };
  }

  const patientMasterStore = await createCcoPatientMasterStore({ filePath: args.masterPath });
  const listed = await patientMasterStore.listPatients({
    tenantId: args.tenantId,
    limit: 20000,
    offset: 0,
  });
  return { patients: listed.patients || [], token: '', source: 'local', patientMasterStore };
}

async function commitLocalEnrichments({ patientMasterStore, tenantId, enrichments, patients }) {
  const byId = new Map(patients.map((patient) => [patient.id || patient.patientId, patient]));
  let committed = 0;
  for (const enrichment of enrichments) {
    const existing = byId.get(enrichment.patientId);
    if (!existing) continue;
    const patch = buildPatientPnrEnrichmentPatch(existing, enrichment);
    await patientMasterStore.upsertPatient({ ...patch, tenantId, id: enrichment.patientId });
    committed += 1;
  }
  return committed;
}

async function commitProdEnrichments({ token, enrichments }) {
  let committed = 0;
  for (const enrichment of enrichments) {
    const existing = await fetchPatient(token, enrichment.patientId);
    const patch = buildPatientPnrEnrichmentPatch(existing, enrichment);
    await putPatient(token, {
      ...patch,
      tenantId: existing.tenantId || TENANT_ID,
      id: enrichment.patientId,
    });
    committed += 1;
  }
  return committed;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.from) {
    throw new Error('Saknar --from <path-to-dataexport.csv>');
  }

  const csvText = await fs.readFile(args.from, 'utf8');
  const parsedRows = parseDataexportCsvText(csvText);
  const { deduped, stats: dedupeStats } = dedupeDataexportByKundId(parsedRows);

  const loaded = await loadPatients(args);
  const { summary, enrichments } = evaluatePnrEnrichment({
    dedupedRows: deduped,
    patients: loaded.patients,
  });

  let committed = 0;
  if (args.commit && enrichments.length) {
    if (args.prod) {
      committed = await commitProdEnrichments({
        token: loaded.token || getProdToken(),
        enrichments,
      });
    } else if (loaded.patientMasterStore) {
      committed = await commitLocalEnrichments({
        patientMasterStore: loaded.patientMasterStore,
        tenantId: args.tenantId,
        enrichments,
        patients: loaded.patients,
      });
    }
  }

  const report = {
    ok: true,
    mode: args.commit ? (args.prod ? 'commit-prod' : 'commit-local') : 'dry-run',
    patientSource: loaded.source,
    inputRows: parsedRows.length,
    dedupe: dedupeStats,
    ...summary,
    committed,
  };

  console.log(JSON.stringify(report));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
