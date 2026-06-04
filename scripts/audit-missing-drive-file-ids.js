#!/usr/bin/env node
'use strict';

/**
 * P6.14.3 — Audit missing driveFileId
 *
 * Läser `data/migration-index.json` och rapporterar de filer som saknar
 * `driveFileId`. Används för att förstå varför 570 zip-rader inte fick
 * Drive-match (per 2026-05-25 sweep) och vilka som behöver manuell
 * resolve vs. kan backfillas via API.
 *
 * Usage:
 *   node scripts/audit-missing-drive-file-ids.js
 *   node scripts/audit-missing-drive-file-ids.js --json
 *   node scripts/audit-missing-drive-file-ids.js --index ./data/migration-index.json
 *   node scripts/audit-missing-drive-file-ids.js --sample 5
 *
 * Output (default): textrapport med totals + bucketing.
 * Output (--json): hel JSON-struktur för vidare automation.
 *
 * Skriptet är read-only — det ändrar inte index-filen.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_INDEX_PATH =
  process.env.ARCANA_MIGRATION_INDEX_PATH ||
  path.resolve(process.cwd(), 'data', 'migration-index.json');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    indexPath: DEFAULT_INDEX_PATH,
    json: false,
    sampleSize: 3,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--json') {
      args.json = true;
    } else if (flag === '--index') {
      args.indexPath = argv[i + 1];
      i += 1;
    } else if (flag === '--sample') {
      args.sampleSize = Math.max(0, Number(argv[i + 1]) || 0);
      i += 1;
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`audit-missing-drive-file-ids — listar filer utan driveFileId.

Flaggor:
  --index <path>   Sökväg till migration-index.json (default: data/migration-index.json
                   eller env ARCANA_MIGRATION_INDEX_PATH).
  --json           Skriv ut hel rapport som JSON (annars text).
  --sample N       Antal exempel-filer att visa per bucket (default: 3).
  -h, --help       Visa hjälp.
`);
}

/**
 * Buckets filer utifrån varför de saknar driveFileId.
 * Buckets är icke-överlappande — varje fil hamnar i första matchande bucket.
 */
function classifyMissingFile(file = {}) {
  const personnummer = String(file.personnummer || '').trim();
  const fileType = String(file.fileType || '').trim() || 'unknown';
  const source = String(file.source || '').trim() || 'unknown';
  const relativePath = String(file.relativePath || '').trim();
  const hasMimeType = Boolean(String(file.mimeType || '').trim());
  const hasWebViewLink = Boolean(String(file.webViewLink || '').trim());

  if (!personnummer && !relativePath) {
    return {
      bucket: 'no_personnummer_no_path',
      reason: 'Saknar både personnummer och relativePath — kan inte matchas.',
    };
  }
  if (!personnummer) {
    return {
      bucket: 'no_personnummer',
      reason:
        'Saknar personnummer — Drive-matchning faller tillbaka på filnamn (ofta tvetydigt).',
    };
  }
  if (source === 'cliento_export' || source === 'pipedrive') {
    return {
      bucket: 'non_drive_source',
      reason:
        'Filen kommer från Cliento/Pipedrive-export, inte Drive — driveFileId existerar inte.',
    };
  }
  if (fileType === 'image' || fileType === 'video') {
    return {
      bucket: 'media_no_match',
      reason:
        'Bild/video utan Drive-träff — ofta filnamnskollision eller fil borttagen från Drive.',
    };
  }
  if (fileType === 'journal_pdf') {
    return {
      bucket: 'journal_pdf_no_match',
      reason:
        'Journal-PDF utan Drive-träff — kontrollera om patientmappen finns i Drive (kan kräva manuell resolve).',
    };
  }
  if (fileType === 'document_pdf' || fileType.startsWith('document')) {
    return {
      bucket: 'document_no_match',
      reason:
        'Dokument-PDF (hälsodeklaration, samtycke m.fl.) utan Drive-träff — ofta mojibake/teckenkodning som gör att namnmatchningen faller; kräver manuell resolve.',
    };
  }
  if (hasMimeType || hasWebViewLink) {
    return {
      bucket: 'partial_drive_metadata',
      reason:
        'Har mimeType/webViewLink men inget driveFileId — sannolikt felmatchad eller äldre stub.',
    };
  }
  return {
    bucket: 'other',
    reason: `Okänd orsak (fileType=${fileType}, source=${source}).`,
  };
}

function summarizeFile(file = {}) {
  return {
    id: String(file.id || '').trim(),
    fileName: String(file.fileName || '').trim() || path.basename(file.relativePath || ''),
    fileType: String(file.fileType || '').trim(),
    personnummer: String(file.personnummer || '').trim(),
    relativePath: String(file.relativePath || '').trim(),
    source: String(file.source || '').trim(),
  };
}

function loadIndex(indexPath) {
  const resolved = path.resolve(indexPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`migration-index saknas på sökvägen: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.files)) {
    throw new Error('migration-index har inget files[] — kör migration:scan först.');
  }
  return { resolved, data };
}

function buildReport({ indexPath, sampleSize = 3 } = {}) {
  const { resolved, data } = loadIndex(indexPath);
  const files = Array.isArray(data.files) ? data.files : [];
  const total = files.length;
  const missing = files.filter((file) => !String(file.driveFileId || '').trim());

  const buckets = new Map();
  for (const file of missing) {
    const classification = classifyMissingFile(file);
    if (!buckets.has(classification.bucket)) {
      buckets.set(classification.bucket, {
        bucket: classification.bucket,
        reason: classification.reason,
        count: 0,
        samples: [],
      });
    }
    const entry = buckets.get(classification.bucket);
    entry.count += 1;
    if (entry.samples.length < sampleSize) entry.samples.push(summarizeFile(file));
  }

  const bucketRows = Array.from(buckets.values()).sort((left, right) => right.count - left.count);

  return {
    generatedAt: new Date().toISOString(),
    indexPath: resolved,
    indexUpdatedAt: String(data.updatedAt || ''),
    totalFiles: total,
    totalWithDriveFileId: total - missing.length,
    totalMissingDriveFileId: missing.length,
    coveragePercent: total > 0 ? Number(((total - missing.length) / total) * 100).toFixed(2) : '0',
    buckets: bucketRows,
  };
}

function renderText(report) {
  const lines = [];
  lines.push(`Drive driveFileId audit @ ${report.indexPath}`);
  lines.push(`Index updatedAt: ${report.indexUpdatedAt || '—'}`);
  lines.push('');
  lines.push(
    `Totalt filer: ${report.totalFiles} — med driveFileId: ${report.totalWithDriveFileId} (${report.coveragePercent}%) — utan: ${report.totalMissingDriveFileId}`
  );
  lines.push('');
  if (!report.buckets.length) {
    lines.push('Inga filer saknar driveFileId. Allt under kontroll.');
    return lines.join('\n');
  }
  lines.push('Buckets (sorterat efter antal):');
  for (const bucket of report.buckets) {
    lines.push('');
    lines.push(`  ${bucket.bucket}  (${bucket.count} filer)`);
    lines.push(`    ${bucket.reason}`);
    if (bucket.samples.length) {
      lines.push('    Exempel:');
      for (const sample of bucket.samples) {
        const tail = sample.fileName || sample.relativePath || sample.id;
        lines.push(
          `      - [${sample.fileType || '?'}] pnr=${sample.personnummer || '—'} src=${sample.source || '—'} ${tail}`
        );
      }
    }
  }
  lines.push('');
  lines.push('Nästa steg:');
  lines.push('  - För journal_pdf_no_match / media_no_match: backfill via API');
  lines.push('      → node scripts/backfill-drive-file-ids.js --dry-run');
  lines.push('  - För no_personnummer / non_drive_source: manuell resolve eller acceptera som ej Drive-bundna');
  return lines.join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const report = buildReport({ indexPath: args.indexPath, sampleSize: args.sampleSize });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log(renderText(report));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

module.exports = {
  buildReport,
  classifyMissingFile,
  summarizeFile,
};
