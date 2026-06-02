/**
 * ccoFinanceReportPackager — Sprint CF.9 (MVP 8)
 *
 * Sparar rapport-paket till secure storage:
 *   reports/<period>/<reportKind>/report.json
 *   reports/<period>/<reportKind>/report.csv
 *   reports/<period>/<reportKind>/manifest.json (SHA256 per fil)
 *
 * Säkerhet:
 *  - Allt via secureStorage (data/secure/, gitignored)
 *  - Inga externa länkar — endast storage-keys
 *  - SHA256-checksum per fil för integritetsverifiering
 *  - Audit på package-build + download
 *
 * Manifest matchar review-packager-format (CF.8.B) för konsekvens.
 */

'use strict';

const crypto = require('crypto');
const { generateReport, reportToCsv, VALID_REPORT_KINDS } = require('./ccoFinanceReportEngine');

const SCHEMA_VERSION = '1.0.0';

function nowIso() { return new Date().toISOString(); }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function newPackageId() { return 'reportpkg_' + crypto.randomBytes(6).toString('hex'); }
function newManifestId() { return 'manifest_' + crypto.randomBytes(6).toString('hex'); }

function periodKeySegment(periodLabel) {
  // periodLabel kan vara YYYY-MM-DD, YYYY-MM, YYYY-Q1, YYYY, eller "YYYY-MM-DD → YYYY-MM-DD"
  if (!periodLabel) return 'unknown';
  return String(periodLabel)
    .replace(/\s/g, '')
    .replace(/→/g, '_to_')
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * Bygg + spara rapport-paket.
 *
 * @param {object} input
 * @param {string} input.kind             — report kind
 * @param {string} input.period           — period identifier (YYYY-MM, YYYY-MM-DD, etc.)
 * @param {object} input.data             — { expenses, receipts, vendors, recurrings, reviews, exportBatches }
 * @param {object} input.secureStorage    — putObject + getObject
 * @param {object} input.actor
 * @param {object} [input.auditLog]
 */
async function buildReportPackage({
  kind,
  period,
  data = {},
  secureStorage,
  actor,
  auditLog = null,
} = {}) {
  if (!VALID_REPORT_KINDS.includes(kind)) {
    throw new Error(`Okänd report kind: ${kind}`);
  }
  if (!secureStorage?.putObject || !secureStorage?.getObject) {
    throw new Error('secureStorage krävs (putObject + getObject)');
  }

  // 1. Generera rapport (pure)
  const report = generateReport({ kind, period, data, generatedBy: actor || null });

  // 2. Bygg payloads
  const reportJsonStr = JSON.stringify(report, null, 2) + '\n';
  const reportCsvStr = reportToCsv(report);
  const reportJsonBuf = Buffer.from(reportJsonStr, 'utf8');
  const reportCsvBuf = Buffer.from(reportCsvStr, 'utf8');

  // 3. Storage-keys
  const periodSeg = periodKeySegment(report.periodLabel);
  const packageId = newPackageId();
  const baseKey = `reports/${periodSeg}/${kind}/${packageId}`;
  const reportJsonKey = `${baseKey}/report.json`;
  const reportCsvKey = `${baseKey}/report.csv`;
  const manifestKey = `${baseKey}/manifest.json`;

  // 4. Spara JSON + CSV
  await secureStorage.putObject(reportJsonKey, reportJsonBuf, { mimeType: 'application/json' });
  await secureStorage.putObject(reportCsvKey, reportCsvBuf, { mimeType: 'text/csv' });

  // 5. Bygg manifest
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    manifestId: newManifestId(),
    packageId,
    reportKind: kind,
    period: report.periodLabel,
    periodRange: report.period,
    generatedAt: nowIso(),
    generatedBy: actor || null,
    files: [
      {
        kind: 'report_json',
        storageKey: reportJsonKey,
        sizeBytes: reportJsonBuf.length,
        checksum: sha256(reportJsonBuf),
        mimeType: 'application/json',
      },
      {
        kind: 'report_csv',
        storageKey: reportCsvKey,
        sizeBytes: reportCsvBuf.length,
        checksum: sha256(reportCsvBuf),
        mimeType: 'text/csv',
      },
    ],
    fortnoxStatus: 'BLOCKED_INTEGRATION — paketet är genererat för manuell revisor-granskning utan Fortnox-sync',
    securityNotes: [
      'Alla filer ligger i secure storage (gitignored)',
      'Inga externa länkar — endast storage-keys',
      'SHA256-checksum per fil för integritetsverifiering',
      'Ingen patientdata utöver det som finns på länkade expenses',
    ],
    summary: {
      totals: report.totals || null,
      anomalyCount: Array.isArray(report.anomalies) ? report.anomalies.length : 0,
    },
  };
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await secureStorage.putObject(manifestKey, manifestBuf, { mimeType: 'application/json' });

  // 6. Audit
  try {
    auditLog?.append?.({
      action: 'cf.report.package_built', kind: 'cf.report.package_built',
      surface: 'cco.cf.reports',
      ts: nowIso(),
      actor,
      target: { kind: 'report_package', packageId, reportKind: kind, period: report.periodLabel },
      detail: {
        packageId, reportKind: kind, period: report.periodLabel,
        manifestKey, reportJsonKey, reportCsvKey,
        sizes: { json: reportJsonBuf.length, csv: reportCsvBuf.length, manifest: manifestBuf.length },
      },
    });
  } catch {}

  return {
    ok: true,
    packageId,
    manifestId: manifest.manifestId,
    reportKind: kind,
    period: report.periodLabel,
    keys: {
      report_json: reportJsonKey,
      report_csv: reportCsvKey,
      manifest: manifestKey,
    },
    manifest,
    report, // returnera även rapporten för in-memory rendering
  };
}

/**
 * Hämta en fil från ett rapport-paket. Loggar audit på download.
 */
async function downloadFromPackage({
  packageId,
  fileKind,
  reportKind,
  period,
  secureStorage,
  actor,
  auditLog = null,
} = {}) {
  const periodSeg = periodKeySegment(period);
  const baseKey = `reports/${periodSeg}/${reportKind}/${packageId}`;
  const keyMap = {
    report_json: `${baseKey}/report.json`,
    report_csv: `${baseKey}/report.csv`,
    manifest: `${baseKey}/manifest.json`,
  };
  const key = keyMap[fileKind];
  if (!key) throw new Error(`Okänd fileKind: ${fileKind}. Tillåtna: ${Object.keys(keyMap).join(', ')}`);

  const obj = await secureStorage.getObject(key);
  if (!obj) throw new Error('Filen finns inte i secure storage.');
  const buffer = obj.buffer || obj;
  const mimeType = (obj.metadata && obj.metadata.mimeType)
    || (fileKind === 'report_csv' ? 'text/csv' : 'application/json');

  // Audit
  try {
    auditLog?.append?.({
      action: 'cf.report.downloaded', kind: 'cf.report.downloaded',
      surface: 'cco.cf.reports',
      ts: nowIso(),
      actor,
      target: { kind: 'report_package_file', packageId, fileKind, reportKind, period },
      detail: { packageId, fileKind, key, sizeBytes: buffer.length },
    });
  } catch {}

  return { buffer, mimeType, key, sizeBytes: buffer.length };
}

module.exports = {
  SCHEMA_VERSION,
  buildReportPackage,
  downloadFromPackage,
  periodKeySegment,
};
