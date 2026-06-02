/**
 * ccoExpenseExporter — Sprint CF.3 (MVP 2)
 *
 * Bygger exportpaket av ready_for_export-expenses utan att röra Fortnox.
 * Genererar både CSV (för revisor/manuell import) och JSON (full metadata)
 * och lagrar dem via secureStorage. Inga writes mot tredjepart.
 *
 * Exportpaketet är revisor-vänligt och innehåller alla fält som behövs för
 * att senare kunna föra in manuellt eller automatiskt i Fortnox när
 * OAuth-blockern är löst.
 *
 * Säkerhet:
 *  - Output skrivs ALDRIG till repo (gitignored secure storage)
 *  - Audit-event per export
 *  - Filerna lagras under storage-key: exports/expenses/YYYY-MM/<batchId>.{csv|json}
 */

'use strict';

const crypto = require('crypto');

const CSV_HEADERS = [
  'expenseId',
  'date',
  'supplier',
  'supplierId',                 // CF.5
  'category',
  'paymentMethod',
  'amountSek',                  // = grossAmountSek
  'vatSek',                     // = vatAmountSek
  'vatRatePercent',
  'netAmountSek',               // = gross - vat
  'vatMode',                    // CF.6
  'reverseCharge',              // CF.6 (true/false)
  'deductibleVatSek',           // CF.6
  'nonDeductibleVatSek',        // CF.6
  'vatReviewStatus',            // CF.6
  'recurringExpenseId',         // CF.7
  'recurringMatchConfidence',   // CF.7
  'recurringAnomalyKinds',      // CF.7 (semikolon-separerade)
  'receiptId',
  'customerId',
  'encounterId',
  'treatmentId',
  'offerId',
  'status',
  'fortnoxSyncStatus',
  'fortnoxVoucherId',
  'notes',
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    const net = (typeof row.amountSek === 'number' ? row.amountSek : 0)
      - (typeof row.vatSek === 'number' ? row.vatSek : 0);
    lines.push(CSV_HEADERS.map((h) => {
      if (h === 'netAmountSek') return csvEscape(Number.isFinite(net) ? net.toFixed(2) : '');
      // CF.3-fix 2026-06-02: header 'expenseId' mappar mot row.id (inte row.expenseId)
      if (h === 'expenseId') return csvEscape(row.id);
      // CF.7: anomaly-kinds som semikolon-separerade
      if (h === 'recurringAnomalyKinds') {
        return csvEscape(Array.isArray(row.recurringAnomalies)
          ? row.recurringAnomalies.map((a) => a.kind).join(';') : '');
      }
      return csvEscape(row[h]);
    }).join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {object} input
 * @param {object} input.expenseStore - ccoExpenseStore-instans
 * @param {object} input.secureStorage - putObject({key, body, contentType})
 * @param {object} input.actor - { userId, role }
 * @param {string} [input.statusFilter='ready_for_export'] - vilka status som ska ingå
 * @param {string} [input.batchId] - sätt om vi vill återanvända ID
 * @param {string} [input.fromDate] - YYYY-MM-DD inklusiv
 * @param {string} [input.toDate]   - YYYY-MM-DD inklusiv
 * @param {Array<string>} [input.expenseIds] - explicit lista (override filter)
 * @param {object} [input.auditLog]
 */
async function buildExpenseExportPackage({
  expenseStore,
  secureStorage,
  actor,
  statusFilter = 'ready_for_export',
  batchId,
  fromDate,
  toDate,
  expenseIds = null,
  auditLog = null,
} = {}) {
  if (!expenseStore) throw new Error('expenseStore krävs');
  if (!secureStorage?.putObject) throw new Error('secureStorage krävs');

  const realBatchId = batchId || ('expbatch_' + crypto.randomBytes(6).toString('hex'));

  // Plocka ut expenses att exportera
  let rows;
  if (Array.isArray(expenseIds) && expenseIds.length > 0) {
    rows = expenseIds.map((id) => expenseStore.getById(id)).filter(Boolean);
  } else {
    rows = expenseStore.listExpenses({
      status: statusFilter,
      fromDate, toDate,
      limit: 1000,
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'no_eligible_expenses',
      batchId: realBatchId,
      count: 0,
    };
  }

  const ym = new Date().toISOString().slice(0, 7);
  const csvKey = `exports/expenses/${ym}/${realBatchId}.csv`;
  const jsonKey = `exports/expenses/${ym}/${realBatchId}.json`;

  const csvBody = toCsv(rows);
  const totalAmount = rows.reduce((sum, r) => sum + (typeof r.amountSek === 'number' ? r.amountSek : 0), 0);
  const totalVat = rows.reduce((sum, r) => sum + (typeof r.vatSek === 'number' ? r.vatSek : 0), 0);

  const jsonPayload = {
    schemaVersion: '1.0.0',
    batchId: realBatchId,
    exportedAt: new Date().toISOString(),
    exportedBy: actor || null,
    statusFilter,
    fromDate: fromDate || null,
    toDate: toDate || null,
    expenseCount: rows.length,
    totals: {
      totalAmountSek: totalAmount,
      totalVatSek: totalVat,
      netAmountSek: totalAmount - totalVat,
      // CF.6: VAT-breakdown
      totalDeductibleVatSek: rows.reduce((s, r) => s + (typeof r.deductibleVatSek === 'number' ? r.deductibleVatSek : 0), 0),
      totalNonDeductibleVatSek: rows.reduce((s, r) => s + (typeof r.nonDeductibleVatSek === 'number' ? r.nonDeductibleVatSek : 0), 0),
      reverseChargeCount: rows.filter((r) => r.reverseCharge).length,
      reverseChargeAmountSek: rows.filter((r) => r.reverseCharge).reduce((s, r) => s + (typeof r.amountSek === 'number' ? r.amountSek : 0), 0),
    },
    fortnoxStatus: 'BLOCKED_INTEGRATION — exportpaket genererat manuellt, ingen sync mot Fortnox',
    expenses: rows.map((r) => ({
      id: r.id,
      status: r.status,
      date: r.date,
      supplier: r.supplier,
      supplierId: r.supplierId, // CF.5
      category: r.category,
      paymentMethod: r.paymentMethod,
      amountSek: r.amountSek,
      grossAmountSek: r.grossAmountSek ?? r.amountSek, // CF.6
      vatSek: r.vatSek,
      vatRatePercent: r.vatRatePercent,
      netAmountSek: r.netAmountSek ?? (r.amountSek - (r.vatSek || 0)), // CF.6
      vatMode: r.vatMode, // CF.6
      reverseCharge: !!r.reverseCharge, // CF.6
      deductibleVatSek: r.deductibleVatSek, // CF.6
      nonDeductibleVatSek: r.nonDeductibleVatSek, // CF.6
      vatReviewStatus: r.vatReviewStatus, // CF.6
      recurringExpenseId: r.recurringExpenseId, // CF.7
      recurringMatchConfidence: r.recurringMatchConfidence, // CF.7
      recurringAnomalies: Array.isArray(r.recurringAnomalies) ? r.recurringAnomalies : [], // CF.7
      receiptId: r.receiptId,
      customerId: r.customerId,
      encounterId: r.encounterId,
      treatmentId: r.treatmentId,
      offerId: r.offerId,
      notes: r.notes,
      fortnoxSyncStatus: r.fortnoxSyncStatus,
      attachmentCount: Array.isArray(r.attachmentKeys) ? r.attachmentKeys.length : 0,
    })),
  };
  const jsonBody = JSON.stringify(jsonPayload, null, 2) + '\n';

  await secureStorage.putObject(csvKey, Buffer.from(csvBody, 'utf8'), { mimeType: 'text/csv' });
  await secureStorage.putObject(jsonKey, Buffer.from(jsonBody, 'utf8'), { mimeType: 'application/json' });

  // Markera expenses som exporterade
  const mark = await expenseStore.markExported({
    expenseIds: rows.map((r) => r.id),
    batchId: realBatchId,
    actor,
  });

  try {
    auditLog?.append?.({
      action: 'cf.export.created', kind: 'cf.export.created',
      surface: 'cco.cf.expense',
      ts: new Date().toISOString(),
      actor,
      target: { kind: 'expense_batch', id: realBatchId },
      detail: {
        batchId: realBatchId,
        count: rows.length,
        csvKey, jsonKey,
        totalAmountSek: totalAmount,
        totalVatSek: totalVat,
        fortnoxStatus: 'BLOCKED_INTEGRATION',
      },
    });
  } catch {}

  return {
    ok: true,
    batchId: realBatchId,
    count: rows.length,
    csvKey,
    jsonKey,
    exportedAt: mark.exportedAt,
    totals: jsonPayload.totals,
  };
}

module.exports = { buildExpenseExportPackage, CSV_HEADERS };
