#!/usr/bin/env node
'use strict';

/**
 * Importerar Pipedrive Smartdoc-PDF:er (manifest) → CCO patient_assets + secure storage.
 * ORD-59/59b — batch-skrivning, people-CSV matchning, dedupe via checksum/sourceRecordId.
 */

require('dotenv').config({ quiet: true });

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { resolveSecureStorageRoot } = require('../lib/halsoHdLocalPdfReader');
const { resolveMigrationPaths } = require('./lib/migrationEnv');
const {
  buildPipedrivePatientIndex,
  buildPipedrivePeopleNameIndex,
  resolvePatientForManifestItem,
  mapDocumentKindToAssetMeta,
  buildChecksumIndex,
} = require('./lib/pipedriveSmartdocsImport');

const DEFAULT_ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data'
);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadPeopleCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function parseArgs(argv) {
  const paths = resolveMigrationPaths();
  const args = {
    dryRun: true,
    limit: 0,
    tenantId: paths.tenantId,
    patientMasterPath: paths.patientMasterPath,
    assetPath: path.join(process.cwd(), 'data/cco-patient-assets.json'),
    manifestPath: path.join(DEFAULT_ICLOUD_ROOT, 'pipedrive-smartdocs-2026-07-12/manifest.json'),
    exportRoot: path.join(DEFAULT_ICLOUD_ROOT, 'pipedrive-smartdocs-2026-07-12'),
    peopleCsv: path.join(DEFAULT_ICLOUD_ROOT, 'pipedrive-2026-05-24/personer-2026-05-24.csv'),
    storageRoot: resolveSecureStorageRoot(process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || ''),
    onlyNew: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--commit') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--only-new') args.onlyNew = true;
    else if (token === '--limit') args.limit = Number.parseInt(argv[++i], 10) || 0;
    else if (token === '--manifest') args.manifestPath = argv[++i];
    else if (token === '--export-root') args.exportRoot = argv[++i];
    else if (token === '--people-csv') args.peopleCsv = argv[++i];
    else if (token === '--assets') args.assetPath = argv[++i];
    else if (token === '--patient-master') args.patientMasterPath = argv[++i];
    else if (token === '--tenant') args.tenantId = argv[++i];
    else if (token === '--storage-root') args.storageRoot = argv[++i];
  }
  return args;
}

function extractDocumentDate(fileName = '', addTime = null) {
  const fromName = normalizeText(fileName).match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];
  const fromAdd = normalizeText(addTime).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(fromAdd) ? fromAdd : null;
}

function buildStorageKey({ fileId, sha256, fileName }) {
  const ext = path.extname(fileName) || '.pdf';
  return path.posix.join('pipedrive-import', `${fileId}-${sha256.slice(0, 12)}${ext}`);
}

async function copyToSecureStorage({ sourcePath, storageKey, storageRoot, dryRun }) {
  const dest = path.join(storageRoot, storageKey);
  if (dryRun) return { storageKey, dest, copied: false };
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(sourcePath, dest);
  return { storageKey, dest, copied: true };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.manifestPath)) {
    throw new Error(`Manifest saknas: ${args.manifestPath}`);
  }

  const manifest = JSON.parse(await fsp.readFile(args.manifestPath, 'utf8'));
  let downloaded = (manifest.items || []).filter(
    (item) => item.downloaded && item.storageRelativePath
  );
  if (args.onlyNew) {
    const assetStorePeek = JSON.parse(await fsp.readFile(args.assetPath, 'utf8'));
    const { bySourceRecordId } = buildChecksumIndex(assetStorePeek);
    downloaded = downloaded.filter((item) => !bySourceRecordId.has(String(item.fileId)));
  }
  const selected = args.limit > 0 ? downloaded.slice(0, args.limit) : downloaded;

  const patientMasterStore = await createCcoPatientMasterStore({
    filePath: args.patientMasterPath,
  });
  const listed = await patientMasterStore.listPatients({ tenantId: args.tenantId, limit: 20000 });
  const patients = listed.patients || [];
  const patientIndex = buildPipedrivePatientIndex(patients, { tenantId: args.tenantId });
  const peopleRows = loadPeopleCsv(args.peopleCsv);
  const peopleIndex = buildPipedrivePeopleNameIndex(peopleRows);

  const assetStore = await createCcoPatientAssetStore({ filePath: args.assetPath });
  const assetState = JSON.parse(await fsp.readFile(args.assetPath, 'utf8'));
  const { byChecksum, bySourceRecordId } = buildChecksumIndex(assetState);

  console.log(`\n=== PIPEDRIVE SMARTDOCS IMPORT ${args.dryRun ? '(DRY-RUN)' : '(COMMIT)'} ===`);
  console.log(`Manifest: ${args.manifestPath}`);
  console.log(`Downloaded items: ${downloaded.length}, behandlar: ${selected.length}`);
  console.log(`Patients: ${patients.length}, people CSV: ${peopleRows.length} rader`);

  const totals = {
    processed: 0,
    imported: 0,
    skippedExisting: 0,
    needsReview: 0,
    failed: 0,
    duplicateChecksum: 0,
  };

  assetStore.beginBatch();
  try {
    for (const item of selected) {
      totals.processed += 1;
      const sourceRecordId = String(item.fileId);
      if (bySourceRecordId.has(sourceRecordId)) {
        totals.skippedExisting += 1;
        continue;
      }
      if (item.sha256 && byChecksum.has(item.sha256)) {
        totals.duplicateChecksum += 1;
        continue;
      }

      const match = resolvePatientForManifestItem(item, patientIndex, peopleIndex);
      const meta = mapDocumentKindToAssetMeta(item.documentKind);
      const sourcePath = path.join(args.exportRoot, item.storageRelativePath);
      if (!fs.existsSync(sourcePath)) {
        totals.failed += 1;
        console.error(`MISSING binary fileId=${sourceRecordId}: ${sourcePath}`);
        continue;
      }

      const fileBuffer = await fsp.readFile(sourcePath);
      const sha256 = item.sha256 || crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const byteSize = item.byteSize || fileBuffer.length;
      const storageKey = buildStorageKey({
        fileId: sourceRecordId,
        sha256,
        fileName: item.fileName,
      });

      if (!args.dryRun) {
        await copyToSecureStorage({
          sourcePath,
          storageKey,
          storageRoot: args.storageRoot,
          dryRun: false,
        });
      }

      const status = match.patientId ? 'VISIBLE_ON_PATIENT_CARD' : 'NEEDS_REVIEW';
      if (status === 'NEEDS_REVIEW') totals.needsReview += 1;
      else totals.imported += 1;

      const assetInput = {
        id: crypto.randomUUID(),
        patientId: match.patientId || 'unknown',
        sourceSystem: 'pipedrive_import',
        sourceRecordId,
        originalFileName: item.fileName,
        displayName: meta.displayName ? `${meta.displayName}: ${item.fileName}` : item.fileName,
        storageProvider: 'local',
        storageKey: args.dryRun ? storageKey : storageKey,
        checksum: sha256,
        fileSize: byteSize,
        mimeType: 'application/pdf',
        category: meta.category,
        subCategory: meta.subCategory,
        patientCardSection: meta.patientCardSection,
        documentDate: extractDocumentDate(item.fileName, item.addTime),
        importedAt: new Date().toISOString(),
        importedBy: 'pipedrive-smartdocs-import',
        confidence: match.patientId ? match.confidence || 'high' : 'low',
        status: args.dryRun ? 'DISCOVERED' : status,
        auditRequired: true,
        isJournalRelevant: false,
        isPatientVisible: Boolean(match.patientId),
        provenance: {
          pipedriveFileId: sourceRecordId,
          pipedrivePersonId: item.personId || match.pipedrivePersonId || null,
          pipedriveDealId: item.dealId || null,
          matchMethod: match.method || null,
          extractedName: match.extractedName || null,
          companyDomain: manifest.companyDomain || 'hairtpclinic2',
        },
      };

      if (!args.dryRun) {
        await assetStore.addAsset(assetInput, {
          actor: { role: 'system', id: 'pipedrive-import' },
        });
        bySourceRecordId.set(sourceRecordId, assetInput);
        if (sha256) byChecksum.set(sha256, assetInput);
      }
    }
  } finally {
    await assetStore.flushBatch();
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(totals, null, 2));
  if (args.dryRun) {
    console.log('\nDry-run klar — kör med --commit för att skriva assets + kopiera PDF:er.');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
