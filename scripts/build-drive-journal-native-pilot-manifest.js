#!/usr/bin/env node
'use strict';

/**
 * Build 50-patient canary manifest for CCO-native Drive journal (counts + IDs only).
 */

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_MANIFEST } = require('../src/ops/ccoDriveJournalNativePilot');

const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1] || 50);
const tenantId = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : 'hair-tp-clinic';
const outPath = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : DEFAULT_MANIFEST;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hasPersonnummer(patient) {
  return String(patient?.personnummer || '').replace(/\D/g, '').length >= 10;
}

function isTierAProfile(patient) {
  return (
    normalizeKey(patient.matchStatus) === 'matched' &&
    hasPersonnummer(patient) &&
    Number(patient.matchConfidence) >= 0.95 &&
    Boolean(patient.cliento) &&
    Number(patient?.fileSummary?.journalPdfs) > 0
  );
}

function loadAssets() {
  const raw = readJson(path.join(process.cwd(), 'data', 'cco-patient-assets.json'));
  const items = raw?.items;
  return Array.isArray(items) ? items : Object.values(items || {});
}

function assetPatientIdsWithVisibleDriveJournal(assets) {
  const ids = new Set();
  for (const asset of assets) {
    if (asset.category !== 'journal') continue;
    if (asset.sourceSystem !== 'drive_import') continue;
    if (asset.status !== 'VISIBLE_ON_PATIENT_CARD' && asset.status !== 'VERIFIED_IN_CCO') continue;
    if (!asset.patientId || asset.patientId === 'unknown') continue;
    if (!asset.storageKey || !asset.checksum) continue;
    ids.add(asset.patientId);
  }
  return ids;
}

function main() {
  const masterPath = path.join(process.cwd(), 'data', 'cco-patient-master.json');
  const master = readJson(masterPath);
  const patients = asArray(master?.tenants?.[tenantId]?.patients).filter(
    (p) => normalizeKey(p.matchStatus) !== 'merged'
  );

  let assets = [];
  try {
    assets = loadAssets();
  } catch {
    assets = [];
  }
  const assetPatients = assetPatientIdsWithVisibleDriveJournal(assets);

  const tierA = patients
    .filter(isTierAProfile)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const overlap = tierA.filter((p) => assetPatients.has(p.id));
  const selectionMode =
    overlap.length >= Math.min(10, MAX) ? 'tier_a_with_storage_overlap' : 'tier_a_index_only';

  const pool = selectionMode === 'tier_a_with_storage_overlap' ? overlap : tierA;
  const picked = pool.slice(0, MAX).map((p) => p.id);

  if (picked.length < MAX) {
    console.warn(`WARN: only ${picked.length} candidates (requested ${MAX})`);
  }

  const manifest = {
    schema: 'cco-drive-journal-native-pilot-v1',
    generatedAt: new Date().toISOString(),
    tenantId,
    description: 'Canary: Filer-flik journal-PDF från CCO storage (dual read, 50 kunder)',
    maxPatients: MAX,
    selection: {
      mode: selectionMode,
      tierAProfiles: tierA.length,
      storageOverlap: overlap.length,
      assetVisiblePatients: assetPatients.size,
    },
    patientIds: picked,
    notes: [
      'Tier A = matched + PNR + matchConfidence>=0.95 + Cliento + index journal',
      'ENABLE_DRIVE_JOURNAL_NATIVE_PILOT=true aktiverar CCO-native viewUrl för dessa patientIds',
      'Övriga kunder behåller migration-index → Drive-stream',
    ],
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${picked.length} patientIds → ${outPath}`);
  console.log(`Selection: ${selectionMode} (tierA=${tierA.length}, overlap=${overlap.length})`);
}

main();
