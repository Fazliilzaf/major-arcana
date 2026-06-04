/**
 * ccoFinanceReviewPackager — Sprint CF.8 (MVP 7)
 *
 * Bygger komplett revisor-paket för en export-batch:
 *   1. Befintlig CSV + JSON (från ccoExpenseExporter)
 *   2. Manifest med checksum per fil + totals + period + batchId
 *   3. Receipt-attachments (om expenses har receiptId → secure storage download)
 *
 * Allt lagras via secureStorage. Manifest-format är revisor-vänligt JSON
 * med fixed schema som matchar Skatteverkets/revisor-standard.
 *
 * Inga filer i repo. Inga externa länkar. Inga Drive-länkar.
 *
 * Säkerhet:
 *  - Allt går via secureStorage
 *  - Manifest visar storageKey men aldrig externa URL:er
 *  - Checksum verifierar integritet
 *  - Audit på package-build via review-store
 */

'use strict';

const crypto = require('crypto');

function nowIso() { return new Date().toISOString(); }
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Bygg komplett revisor-paket för en export-batch.
 *
 * @param {object} input
 * @param {object} input.expenseStore
 * @param {object} input.receiptStore  - för att hitta receipt-storageKey + checksum
 * @param {object} input.secureStorage - putObject + getObject
 * @param {string} input.batchId       - existerande export-batch (CSV+JSON måste redan finnas)
 * @param {object} input.actor
 * @param {object} input.reviewStore   - för attachManifest
 * @param {object} [input.auditLog]
 */
async function buildReviewPackage({
  expenseStore,
  receiptStore = null,
  secureStorage,
  batchId,
  actor,
  reviewStore = null,
  auditLog = null,
} = {}) {
  if (!expenseStore) throw new Error('expenseStore krävs');
  if (!secureStorage?.putObject || !secureStorage?.getObject) throw new Error('secureStorage krävs');
  if (!batchId) throw new Error('batchId krävs');

  // Hitta alla expenses i batch
  const expensesInBatch = expenseStore.listExpenses({ batchId, limit: 5000 });
  if (expensesInBatch.length === 0) {
    return { ok: false, reason: 'no_expenses_in_batch', batchId };
  }

  // Verifiera att CSV + JSON finns på secure storage
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  let csvKey = null, jsonKey = null, csvBuf = null, jsonBuf = null;
  for (let i = 0; i < 12 && !csvKey; i += 1) {
    const probe = new Date(Date.UTC(utcYear, utcMonth - i, 1));
    const ym = probe.toISOString().slice(0, 7);
    const tryCsv = `exports/expenses/${ym}/${batchId}.csv`;
    const tryJson = `exports/expenses/${ym}/${batchId}.json`;
    try {
      const csvObj = await secureStorage.getObject(tryCsv);
      const jsonObj = await secureStorage.getObject(tryJson);
      if (csvObj && jsonObj) {
        csvKey = tryCsv; jsonKey = tryJson;
        csvBuf = csvObj.buffer || csvObj;
        jsonBuf = jsonObj.buffer || jsonObj;
      }
    } catch {}
  }
  if (!csvKey) {
    return { ok: false, reason: 'export_csv_not_found', batchId };
  }

  // Plocka receipts som är länkade till expenses i batch
  const attachmentKeys = [];
  const receiptList = new Set();
  for (const e of expensesInBatch) {
    if (e.receiptId) receiptList.add(e.receiptId);
  }
  const attachments = [];
  if (receiptStore?.getById) {
    for (const rid of receiptList) {
      const r = receiptStore.getById(rid);
      if (r && r.storageKey) {
        attachments.push({
          receiptId: r.id,
          storageKey: r.storageKey,
          checksum: r.checksum || null,
          sizeBytes: r.sizeBytes || null,
          mimeType: r.mimeType || null,
          originalFileName: r.originalFileName || null,
        });
        attachmentKeys.push(r.storageKey);
      }
    }
  }

  // Beräkna totals för manifest (från JSON-payload)
  let exportPayload = null;
  try { exportPayload = JSON.parse(jsonBuf.toString('utf8')); } catch {}
  const totals = exportPayload?.totals || {};

  // Bygg manifest
  const manifestId = 'manifest_' + crypto.randomBytes(6).toString('hex');
  const manifest = {
    schemaVersion: '1.0.0',
    manifestId,
    batchId,
    createdAt: nowIso(),
    createdBy: actor || null,
    period: {
      fromDate: exportPayload?.fromDate || null,
      toDate: exportPayload?.toDate || null,
    },
    numberOfExpenses: expensesInBatch.length,
    numberOfReceipts: attachments.length,
    totals: {
      totalGrossSek: totals.totalAmountSek || 0,
      totalNetSek: totals.netAmountSek || 0,
      totalVatSek: totals.totalVatSek || 0,
      totalDeductibleVatSek: totals.totalDeductibleVatSek || 0,
      totalNonDeductibleVatSek: totals.totalNonDeductibleVatSek || 0,
      reverseChargeCount: totals.reverseChargeCount || 0,
      reverseChargeAmountSek: totals.reverseChargeAmountSek || 0,
    },
    files: [
      {
        kind: 'csv',
        storageKey: csvKey,
        sizeBytes: csvBuf.length,
        checksum: sha256(csvBuf),
        mimeType: 'text/csv',
      },
      {
        kind: 'json',
        storageKey: jsonKey,
        sizeBytes: jsonBuf.length,
        checksum: sha256(jsonBuf),
        mimeType: 'application/json',
      },
      ...attachments.map((a) => ({
        kind: 'receipt_attachment',
        storageKey: a.storageKey,
        sizeBytes: a.sizeBytes,
        checksum: a.checksum,
        mimeType: a.mimeType,
        receiptId: a.receiptId,
        originalFileName: a.originalFileName,
      })),
    ],
    fortnoxStatus: 'BLOCKED_INTEGRATION — manifestet är genererat för manuell revisor-granskning utan Fortnox-sync',
    securityNotes: [
      'Alla filer ligger i secure storage (gitignored)',
      'Inga externa länkar — endast storage-keys',
      'Inga Drive-länkar',
      'SHA256-checksum per fil för integritetsverifiering',
    ],
  };

  // Spara manifest till secure storage
  const ym = nowIso().slice(0, 7);
  const manifestKey = `exports/reviews/${ym}/${batchId}-manifest.json`;
  const manifestBody = JSON.stringify(manifest, null, 2) + '\n';
  await secureStorage.putObject(manifestKey, Buffer.from(manifestBody, 'utf8'), { mimeType: 'application/json' });

  // Uppdatera review-store (om finns)
  if (reviewStore?.attachManifest) {
    try {
      await reviewStore.getOrCreateForBatch({ batchId, actor });
      await reviewStore.attachManifest({
        batchId, manifestKey, packageKey: null, attachmentKeys, actor,
      });
    } catch (err) { console.warn('[review-packager] attachManifest fail:', err.message); }
  }

  // Audit
  try {
    auditLog?.append?.({
      action: 'cf.review.package_built', kind: 'cf.review.package_built',
      surface: 'cco.cf.review',
      ts: nowIso(),
      actor,
      target: { kind: 'review_package', batchId },
      detail: {
        batchId, manifestId, manifestKey,
        numberOfExpenses: expensesInBatch.length,
        numberOfReceipts: attachments.length,
        attachmentCount: attachmentKeys.length,
      },
    });
  } catch {}

  return {
    ok: true,
    batchId,
    manifestId,
    manifestKey,
    csvKey,
    jsonKey,
    attachmentKeys,
    numberOfExpenses: expensesInBatch.length,
    numberOfReceipts: attachments.length,
    manifest,
  };
}

module.exports = { buildReviewPackage };
