#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { buildCaptureDateAudit } = require('../src/ops/ccoAssetCaptureDateAudit');

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function readJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function walkRecords(value, byId) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkRecords(item, byId));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const id = value.id || value.fileId || value.sourceRecordId;
  if (id && !byId.has(String(id))) byId.set(String(id), value);
  Object.values(value).forEach((item) => walkRecords(item, byId));
}

function maskPatientId(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.length <= 10 ? text.slice(0, 3) + '***' : text.slice(0, 10) + '...' + text.slice(-4);
}

function isMediaAsset(asset) {
  const mime = String(asset?.mimeType || '').toLowerCase();
  const name = String(asset?.originalFileName || asset?.displayName || '').toLowerCase();
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    /\.(heic|jpe?g|png|webp|mov|mp4|m4v)$/i.test(name)
  );
}

function main() {
  const assetsPath = argValue('--assets', path.join(process.cwd(), 'data/cco-patient-assets.json'));
  const migrationIndexPath = argValue(
    '--migration-index',
    path.join(process.cwd(), 'data/migration-index.json')
  );
  const storageRoot = argValue('--storage-root', process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || '');
  const patientFilter = argValue('--patient', '');
  const outPath = argValue('--out', '');
  const write = hasFlag('--write');

  const state = readJson(assetsPath, null);
  if (!state?.items || typeof state.items !== 'object') {
    throw new Error(`Kunde inte läsa asset-store: ${assetsPath}`);
  }
  const migrationIndex = readJson(migrationIndexPath, {});
  const sourceById = new Map();
  walkRecords(migrationIndex, sourceById);

  const rows = Object.values(state.items).filter((asset) => {
    if (!isMediaAsset(asset)) return false;
    if (patientFilter && asset.patientId !== patientFilter) return false;
    return true;
  });

  const updatedItems = { ...state.items };
  const report = {
    ok: true,
    dryRun: !write,
    generatedAt: new Date().toISOString(),
    assetsPath,
    migrationIndexPath,
    storageRoot: storageRoot ? '[set]' : '[missing]',
    patientFilter: patientFilter || null,
    stats: {
      scanned: rows.length,
      withCaptureDate: 0,
      fromExif: 0,
      fromFilename: 0,
      mismatches: 0,
      missingCaptureSignal: 0,
      wouldWrite: 0,
      written: 0,
    },
    byDocumentDate: {},
    byCaptureDate: {},
    mismatchSamples: [],
  };

  for (const asset of rows) {
    const source = sourceById.get(String(asset.sourceRecordId || '')) || {};
    const audit = buildCaptureDateAudit({ asset, sourceRecord: source, storageRoot });
    if (audit.captureDate) {
      report.stats.withCaptureDate += 1;
      report.byCaptureDate[audit.captureDate] = (report.byCaptureDate[audit.captureDate] || 0) + 1;
    } else {
      report.stats.missingCaptureSignal += 1;
    }
    if (asset.documentDate) {
      report.byDocumentDate[asset.documentDate] =
        (report.byDocumentDate[asset.documentDate] || 0) + 1;
    }
    if (audit.captureDateSource === 'exif') report.stats.fromExif += 1;
    if (audit.captureDateSource === 'filename') report.stats.fromFilename += 1;
    if (audit.captureDateMismatch) {
      report.stats.mismatches += 1;
      if (report.mismatchSamples.length < 20) {
        report.mismatchSamples.push({
          assetId: asset.id,
          patient: maskPatientId(asset.patientId),
          documentDate: asset.documentDate || null,
          captureDate: audit.captureDate,
          captureDateSource: audit.captureDateSource,
          fileName: asset.originalFileName || asset.displayName || '',
        });
      }
    }

    const patch = {
      captureDate: audit.captureDate,
      captureDateTime: audit.captureDateTime,
      captureDateSource: audit.captureDateSource,
      captureDateConfidence: audit.captureDateConfidence,
      captureDateMismatch: audit.captureDateMismatch,
      captureCameraMake: audit.captureCameraMake,
      captureCameraModel: audit.captureCameraModel,
      captureDateAuditAt: report.generatedAt,
    };
    const changed = Object.keys(patch).some((key) => (asset[key] ?? null) !== (patch[key] ?? null));
    if (changed) {
      report.stats.wouldWrite += 1;
      if (write) {
        updatedItems[asset.id] = { ...asset, ...patch, updatedAt: report.generatedAt };
        report.stats.written += 1;
      }
    }
  }

  if (write) {
    const backupPath = `${assetsPath}.capture-date-backup-${Date.now()}`;
    fs.copyFileSync(assetsPath, backupPath);
    writeJson(assetsPath, { ...state, items: updatedItems, updatedAt: report.generatedAt });
    report.backupPath = backupPath;
  }

  if (outPath) writeJson(outPath, report);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
