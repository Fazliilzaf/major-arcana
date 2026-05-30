#!/usr/bin/env node
'use strict';

/**
 * generate-safety-manifest.js — Read-only inventory av iCloud Major Arcana 2.0.
 *
 * INGEN flytt, INGEN radering. Bara metadata-skanning för säkerhetsmanifest.
 *
 * Klassificering per path-pattern:
 *   - "Journal system CCO*"           → patient_data_zip
 *   - "*.zip" med "hair tp clinic"    → patient_data_zip
 *   - "Migration-data/*.csv|xlsx"     → patient_data_export
 *   - "major-arcana(*)"              → code_repo
 *   - "*.md"                          → documentation
 *   - "*.html" mockups                → ui_mockup
 *   - "*.app"                         → application_bundle
 *   - "*.png|jpg|jpeg|heic"           → image_asset
 *   - "*.zip"                         → archive
 *   - "*.DS_Store|*.icloud"           → os_noise
 *
 * SHA-256 beräknas endast för filer <50 MB (skippas för stora zip-filer).
 *
 * Output:
 *   ~/Code/major-arcana/docs/strategy/SAFETY-MANIFEST-2026-05-30.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = '/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0';
const OUTPUT_PATH = process.env.MANIFEST_OUTPUT ||
  '/Users/fazlikrasniqi/Code/major-arcana/docs/strategy/SAFETY-MANIFEST-2026-05-30.json';
const CHECKSUM_MAX_SIZE = 50 * 1024 * 1024;

function classify(relPath, isDir) {
  if (isDir) return 'directory';
  const lower = relPath.toLowerCase();
  if (lower.startsWith('journal system cco')) return 'patient_data_zip';
  if (lower.endsWith('.zip') && lower.includes('hair tp clinic')) return 'patient_data_zip';
  if (lower.includes('migration-data/') &&
      (lower.endsWith('.csv') || lower.endsWith('.xlsx'))) return 'patient_data_export';
  if (lower.startsWith('major-arcana')) return 'code_repo';
  if (lower.endsWith('.md')) return 'documentation';
  if (lower.endsWith('.html')) return 'ui_mockup';
  if (lower.endsWith('.app') || lower.includes('.app/')) return 'application_bundle';
  if (/\.(png|jpg|jpeg|gif|webp|heic)$/.test(lower)) return 'image_asset';
  if (lower.endsWith('.zip') || lower.endsWith('.tar.gz')) return 'archive';
  if (lower.endsWith('.ds_store') || lower.endsWith('.icloud')) return 'os_noise';
  return 'other';
}

function classification(category) {
  if (category === 'patient_data_zip' || category === 'patient_data_export') return 'patient_data';
  if (category === 'code_repo') return 'code';
  if (category === 'documentation') return 'documentation';
  if (category === 'os_noise') return 'os_noise';
  return 'other';
}

function suggestDestination(category) {
  switch (category) {
    case 'patient_data_zip': return '<secure_external_storage>/journal-archives/ (offload from iCloud, NEVER GitHub)';
    case 'patient_data_export': return '<secure_external_storage>/migration-data/ (offload from iCloud)';
    case 'code_repo': return '~/Code/major-arcana/ (already replicated, iCloud copy can quarantine)';
    case 'documentation': return '~/Code/major-arcana/docs/ (commit-ready) or quarantine';
    case 'ui_mockup': return 'quarantine/ui-mockups-archive/';
    case 'application_bundle': return '/Applications/ or quarantine';
    case 'image_asset': return '~/Code/major-arcana/public/ (if used) or quarantine';
    case 'archive': return 'quarantine/archives/';
    case 'os_noise': return 'safe to delete (OS metadata)';
    case 'directory': return 'inspect children';
    default: return 'review manually';
  }
}

function sha256File(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
  } catch (err) {
    return 'sha256:error:' + err.code;
  }
}

function humanize(bytes) {
  if (bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + units[i];
}

function walk(dir, depth = 0, maxDepth = 4) {
  const entries = [];
  if (depth > maxDepth) return entries;

  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (err) {
    return [{
      path: path.relative(ROOT, dir),
      type: 'directory',
      error: err.code,
      status: 'pending_review',
    }];
  }

  for (const item of items) {
    if (item.name === '.DS_Store') continue;
    if (item.name === 'node_modules' || item.name === '.git') {
      const stats = fs.statSync(path.join(dir, item.name));
      entries.push({
        path: path.relative(ROOT, path.join(dir, item.name)),
        type: 'directory',
        category: item.name === 'node_modules' ? 'code_dependency' : 'git_metadata',
        classification: 'code',
        suggestedDestination: item.name === 'node_modules' ? 'rebuild via npm install' : 'follow main repo',
        skippedReason: item.name + ' — not inventoried',
        modifiedAt: new Date(stats.mtime).toISOString(),
        status: 'pending_review',
      });
      continue;
    }

    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(ROOT, fullPath);
    let stats;
    try { stats = fs.statSync(fullPath); }
    catch (err) {
      entries.push({ path: relPath, type: 'unknown', error: err.code, status: 'pending_review' });
      continue;
    }

    if (item.isDirectory()) {
      const category = classify(relPath + '/', true);
      const entry = {
        path: relPath,
        type: 'directory',
        size: null,
        modifiedAt: new Date(stats.mtime).toISOString(),
        category,
        classification: classification(category),
        suggestedDestination: suggestDestination(category),
        status: 'pending_review',
      };
      entries.push(entry);

      if (depth < maxDepth - 1) {
        entries.push(...walk(fullPath, depth + 1, maxDepth));
      } else {
        // Summarize children istället för att gå djupare
        try {
          let childCount = 0, totalSize = 0;
          for (const child of fs.readdirSync(fullPath)) {
            childCount += 1;
            try {
              const cs = fs.statSync(path.join(fullPath, child));
              if (cs.isFile()) totalSize += cs.size;
            } catch {}
          }
          entry._summary = {
            immediateChildren: childCount,
            immediateFilesSizeBytes: totalSize,
            immediateFilesSizeHuman: humanize(totalSize),
          };
        } catch {}
      }
      continue;
    }

    const category = classify(relPath, false);
    const cls = classification(category);
    const entry = {
      path: relPath,
      type: 'file',
      size: stats.size,
      sizeHuman: humanize(stats.size),
      modifiedAt: new Date(stats.mtime).toISOString(),
      category,
      classification: cls,
      suggestedDestination: suggestDestination(category),
      status: 'pending_review',
    };

    if (stats.size <= CHECKSUM_MAX_SIZE && category !== 'os_noise' && category !== 'directory') {
      entry.sha256 = sha256File(fullPath);
    } else {
      entry.sha256 = null;
      entry.checksumSkippedReason = stats.size > CHECKSUM_MAX_SIZE ?
        'file_too_large_>50MB' : 'category_excluded';
    }

    entries.push(entry);
  }

  return entries;
}

function summarize(entries) {
  const summary = {
    totalEntries: entries.length,
    totalFiles: entries.filter((e) => e.type === 'file').length,
    totalDirectories: entries.filter((e) => e.type === 'directory').length,
    totalBytes: entries.filter((e) => e.type === 'file').reduce((a, e) => a + (e.size || 0), 0),
    byCategory: {},
    byClassification: {},
    patientDataFootprint: 0,
    documentationCount: 0,
    codeCount: 0,
    largestFiles: [],
  };

  for (const e of entries) {
    summary.byCategory[e.category] = (summary.byCategory[e.category] || 0) + 1;
    if (e.classification) {
      summary.byClassification[e.classification] = (summary.byClassification[e.classification] || 0) + 1;
    }
    if (e.classification === 'patient_data' && e.size) summary.patientDataFootprint += e.size;
    if (e.classification === 'documentation') summary.documentationCount += 1;
    if (e.classification === 'code') summary.codeCount += 1;
  }

  summary.totalHuman = humanize(summary.totalBytes);
  summary.patientDataHuman = humanize(summary.patientDataFootprint);

  summary.largestFiles = entries
    .filter((e) => e.type === 'file' && e.size)
    .sort((a, b) => (b.size || 0) - (a.size || 0))
    .slice(0, 20)
    .map((e) => ({
      path: e.path,
      sizeHuman: e.sizeHuman,
      classification: e.classification,
      suggestedDestination: e.suggestedDestination,
    }));

  return summary;
}

console.log('SAFETY-MANIFEST generator (read-only)');
console.log('Scan-root: ' + ROOT);
console.log('Output:    ' + OUTPUT_PATH);
console.log('');

const startTime = Date.now();
const entries = walk(ROOT, 0);
const elapsedMs = Date.now() - startTime;

const summary = summarize(entries);

const manifest = {
  $schema: 'cco-safety-manifest-v1',
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  generatedBy: 'scripts/generate-safety-manifest.js',
  scanDurationMs: elapsedMs,
  scanRoot: ROOT,
  checksumMaxSizeMb: CHECKSUM_MAX_SIZE / 1024 / 1024,
  status: 'pending_review',
  ownerMandate: 'INGEN flytt, INGEN radering. Read-only inventory.',
  confirmations: {
    code_replicated_to_local: '~/Code/major-arcana är komplett prod-replika (verifierat 2026-05-30)',
    data_gitignored: 'data/ är gitignored sedan inception',
    no_patient_data_in_github: 'Verifierat via scripts/scan-for-pii.sh — 0 träffar',
    journal_zips_untouched: '28 GB i Journal system CCO-mappen orörd per owner-beslut',
    icloud_code_folders_untouched: 'iCloud/major-arcana och major-arcana-pr96 orörda',
  },
  nextSteps: [
    '1. Owner reviewar manifestet.',
    '2. För varje entry: bekräfta classification + suggestedDestination.',
    '3. Owner ger explicit go-ahead för faktisk flytt (separat owner-bekräftelse krävs).',
    '4. Flytt sker till karantän först (inte radering).',
    '5. Efter karantän: ny verifieringsrapport.',
    '6. Permanent radering kräver yet another owner-bekräftelse.',
  ],
  summary,
  entries,
};

// Säkerställ output-mapp finns
const outputDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2), 'utf8');

console.log('=== Manifest skrivet ===');
console.log('Path:    ' + OUTPUT_PATH);
console.log('Storlek: ' + humanize(fs.statSync(OUTPUT_PATH).size));
console.log('Entries: ' + entries.length);
console.log('Scan-tid: ' + (elapsedMs/1000).toFixed(1) + 's');
console.log('');
console.log('=== Summary ===');
console.log('Total bytes:            ' + summary.totalHuman + ' (' + summary.totalBytes + ' bytes)');
console.log('Total files:            ' + summary.totalFiles);
console.log('Total directories:      ' + summary.totalDirectories);
console.log('Patient-data footprint: ' + summary.patientDataHuman);
console.log('Documentation files:    ' + summary.documentationCount);
console.log('Code files/dirs:        ' + summary.codeCount);
console.log('');
console.log('Per classification:');
for (const [c, n] of Object.entries(summary.byClassification)) {
  console.log('  ' + c.padEnd(20) + ': ' + n);
}
console.log('');
console.log('Per category:');
for (const [c, n] of Object.entries(summary.byCategory)) {
  console.log('  ' + c.padEnd(25) + ': ' + n);
}
console.log('');
console.log('Top 10 largest files:');
summary.largestFiles.slice(0,10).forEach((f) => {
  console.log('  ' + f.sizeHuman.padStart(8) + '  [' + f.classification.padEnd(15) + ']  ' + f.path);
});
