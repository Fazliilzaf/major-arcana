#!/usr/bin/env node
'use strict';

/**
 * C3 — Spot-check migration-index ↔ patient master (≥20 kunder).
 * Usage: npm run migration:spot-check
 *        npm run migration:spot-check -- --min 20 --sample 40
 */
const fs = require('node:fs');
const path = require('node:path');
const { normalizePersonnummer } = require('./lib/migrationUtils');

function parseArgs(argv) {
  const args = {
    tenantId: process.env.CCO_DEFAULT_TENANT_ID || 'hair-tp-clinic',
    patientMasterPath: path.join(process.cwd(), 'data', 'cco-patient-master.json'),
    indexPath: path.join(process.cwd(), 'data', 'migration-index.json'),
    minMatches: 20,
    sampleSize: 30,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--index') args.indexPath = argv[++i];
    else if (token === '--min') args.minMatches = Number(argv[++i]) || 20;
    else if (token === '--sample') args.sampleSize = Number(argv[++i]) || 30;
  }
  return args;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function record(name, pass, detail = '') {
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function main() {
  const args = parseArgs(process.argv);
  const indexRaw = loadJson(args.indexPath);
  const masterRaw = loadJson(args.patientMasterPath);
  if (!indexRaw || !masterRaw) {
    console.log('WARN: migration spot-check — saknar data/migration-index.json eller patient master lokalt.');
    console.log('✅ migration spot-check hoppad (kör efter migration:scan)');
    return;
  }

  const files = Array.isArray(indexRaw.files) ? indexRaw.files : [];
  const indexByPnr = new Map();
  for (const file of files) {
    const pnr = normalizePersonnummer(file.personnummer);
    if (!pnr) continue;
    if (!indexByPnr.has(pnr)) indexByPnr.set(pnr, []);
    indexByPnr.get(pnr).push(file);
  }

  const patients = (Array.isArray(masterRaw.patients) ? masterRaw.patients : []).filter(
    (patient) =>
      String(patient?.tenantId || args.tenantId) === args.tenantId &&
      normalizePersonnummer(patient.personnummer)
  );

  const overlap = patients.filter((patient) =>
    indexByPnr.has(normalizePersonnummer(patient.personnummer))
  );

  console.log(
    `Spot-check @ tenant=${args.tenantId}\n` +
      `  index files: ${files.length}\n` +
      `  patient master: ${patients.length}\n` +
      `  overlap (pnr i båda): ${overlap.length}\n`
  );

  let hardFail = false;
  if (!record('C3-01 index finns', files.length > 0, `${files.length} filer`)) hardFail = true;
  if (!record('C3-02 patient master finns', patients.length > 0, `${patients.length} kunder`)) {
    hardFail = true;
  }
  if (
    !record(
      'C3-03 overlap ≥ min',
      overlap.length >= args.minMatches,
      `${overlap.length} (min ${args.minMatches})`
    )
  ) {
    hardFail = true;
  }

  const sample = shuffle(overlap).slice(0, Math.min(args.sampleSize, overlap.length));
  let checked = 0;
  let mismatches = 0;

  for (const patient of sample) {
    const pnr = normalizePersonnummer(patient.personnummer);
    const indexFiles = indexByPnr.get(pnr) || [];
    const journalPdfs = indexFiles.filter((file) => file.fileType === 'journal_pdf');
    const masterName = String(patient.displayName || patient.name || '').trim().toLowerCase();
    const indexNames = new Set(
      indexFiles
        .map((file) => String(file.patientName || file.displayName || '').trim().toLowerCase())
        .filter(Boolean)
    );

    checked += 1;
    const nameOk =
      !masterName ||
      !indexNames.size ||
      indexNames.has(masterName) ||
      [...indexNames].some((name) => name.includes(masterName.split(' ')[0]));

    if (!journalPdfs.length) {
      mismatches += 1;
      console.log(`  ⚠ ${pnr}: inga journal_pdf i index (${patient.displayName || patient.id})`);
    } else if (!nameOk) {
      mismatches += 1;
      console.log(
        `  ⚠ ${pnr}: namn avviker master="${masterName}" index=[${[...indexNames].join(', ')}]`
      );
    }
  }

  if (
    !record(
      'C3-04 sample spot-check',
      checked > 0 && mismatches === 0,
      `${checked} kontrollerade, ${mismatches} avvikelser`
    )
  ) {
    hardFail = true;
  }

  if (hardFail) {
    console.error('\n❌ migration spot-check misslyckades');
    process.exit(1);
  }
  console.log('\n✅ migration spot-check klar');
}

main();
