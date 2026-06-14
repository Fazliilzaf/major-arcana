#!/usr/bin/env node
'use strict';

/**
 * Patch getaccept_import asset patientId: cliento_* → prod patient UUID (via e-post).
 *
 *   node scripts/patch-getaccept-asset-patient-ids.js --dry-run
 *   node scripts/patch-getaccept-asset-patient-ids.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const { fetchProdPatients } = require('./lib/halsoHdProdClient');
const { getProdToken } = require('./lib/halsoHdProdClient');

const ROOT = path.join(__dirname, '..');
const ASSETS_PATH = path.join(ROOT, 'data/cco-patient-assets.json');
const LEGACY_PATH = path.join(ROOT, 'data/cco-legacy-agreements.json');
const REPORT_PATH = path.join(ROOT, 'data/reports/getaccept-patient-id-patch.json');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function collectPatientEmails(patient) {
  const rows = [
    patient?.primaryEmail,
    patient?.email,
    ...(Array.isArray(patient?.emails) ? patient.emails : []),
    patient?.cliento?.primaryEmail,
    ...(Array.isArray(patient?.cliento?.emails) ? patient.cliento.emails : []),
  ];
  return [...new Set(rows.map(normalizeEmail).filter(Boolean))];
}

function buildEmailToProdIdMap(patients) {
  const map = new Map();
  for (const patient of patients) {
    const id = patient?.id || patient?.patientId;
    if (!id) continue;
    for (const email of collectPatientEmails(patient)) {
      if (!map.has(email)) map.set(email, id);
    }
  }
  return map;
}

function buildClientoToEmailFromLegacy(legacyState) {
  const map = new Map();
  for (const agreement of Object.values(legacyState?.agreements || {})) {
    const clientoId = agreement?.patientId;
    if (!clientoId || !String(clientoId).startsWith('cliento_')) continue;
    const email = normalizeEmail(agreement?.recipients?.[0]?.email);
    if (email) map.set(clientoId, email);
  }
  return map;
}

async function main() {
  const write = process.argv.includes('--write');
  const dryRun = !write;

  const [assetsRaw, legacyRaw] = await Promise.all([
    fs.readFile(ASSETS_PATH, 'utf8'),
    fs.readFile(LEGACY_PATH, 'utf8'),
  ]);
  const assetsState = JSON.parse(assetsRaw);
  const legacyState = JSON.parse(legacyRaw);

  const token = getProdToken();
  const patients = await fetchProdPatients(token);
  const emailToProd = buildEmailToProdIdMap(patients);
  const clientoToEmail = buildClientoToEmailFromLegacy(legacyState);

  let scanned = 0;
  let patched = 0;
  let alreadyProd = 0;
  let unresolved = 0;
  const unresolvedSample = [];

  for (const [assetId, asset] of Object.entries(assetsState.items || {})) {
    if (asset?.sourceSystem !== 'getaccept_import') continue;
    scanned += 1;
    const current = String(asset.patientId || '');
    if (current && !current.startsWith('cliento_')) {
      alreadyProd += 1;
      continue;
    }
    const email =
      clientoToEmail.get(current) ||
      normalizeEmail(asset?.technicalInfo?.recipientEmail || asset?.recipientEmail);
    const prodId = email ? emailToProd.get(email) : null;
    if (!prodId) {
      unresolved += 1;
      if (unresolvedSample.length < 15) {
        unresolvedSample.push({
          assetId,
          clientoId: current,
          email,
          displayName: asset.displayName,
        });
      }
      continue;
    }
    patched += 1;
    if (write) {
      assetsState.items[assetId] = {
        ...asset,
        patientId: prodId,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const report = {
    ok: unresolved === 0,
    dryRun,
    generatedAt: new Date().toISOString(),
    scanned,
    patched,
    alreadyProd,
    unresolved,
    unresolvedSample,
  };

  if (write && patched > 0) {
    assetsState.updatedAt = new Date().toISOString();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const backupDir = path.join(ROOT, 'data/backups', `pre-getaccept-patient-id-patch-${stamp}`);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.copyFile(ASSETS_PATH, path.join(backupDir, 'cco-patient-assets.json'));
    await fs.writeFile(ASSETS_PATH, `${JSON.stringify(assetsState, null, 2)}\n`, 'utf8');
    report.backupDir = backupDir;
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (dryRun && patched > 0) {
    console.error('\nKör med --write för att spara patch.');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
