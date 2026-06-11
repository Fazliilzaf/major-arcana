/* eslint-disable no-console */
/**
 * CF.9 smoke-test: cfoFinanceReportEngine + cfoFinanceMonthlyCloseStore + cfoFinanceReportPackager
 *
 * Kör: node tests/cf/financeReportsSmoke.js
 *
 * Testar:
 *  - 12 rapporttyper genererbara
 *  - Period state machine: open → preparing → ready_for_review → in_review → approved → closed → reopened
 *  - Reopen kräver reason
 *  - Period locking (isDateInLockedPeriod) fungerar
 *  - Report packager skapar JSON+CSV+manifest med SHA256-checksum
 *  - CSV-konvertering producerar text
 *  - Audit-events triggar
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateReport,
  reportToCsv,
  VALID_REPORT_KINDS,
  aggregateVat,
} = require('../../src/cfo/cfoFinanceReportEngine');

const {
  createCfoFinanceMonthlyCloseStore,
  isValidPeriodId,
} = require('../../src/cfo/cfoFinanceMonthlyCloseStore');

const { buildReportPackage, downloadFromPackage } = require('../../src/cfo/cfoFinanceReportPackager');

let passes = 0;
let fails = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passes += 1; console.log(`  ✓ ${msg}`); }
  else { fails += 1; failures.push(msg); console.error(`  ✗ ${msg}`); }
}

// ── Mock data ──────────────────────────────────────────────────
const expenses = [
  {
    id: 'exp_1', status: 'approved', category: 'utrustning', supplier: 'Apple Store',
    supplierId: 'vendor_apple', date: '2026-05-03', amountSek: 12000, vatSek: 2400,
    netAmountSek: 9600, deductibleVatSek: 2400, nonDeductibleVatSek: 0,
    vatRatePercent: 25, vatMode: 'standard_25', reverseCharge: false,
    paymentMethod: 'card', vatReviewStatus: 'reviewed',
  },
  {
    id: 'exp_2', status: 'approved', category: 'forbrukning', supplier: 'ICA Maxi',
    date: '2026-05-08', amountSek: 850, vatSek: 102, netAmountSek: 748,
    deductibleVatSek: 102, nonDeductibleVatSek: 0,
    vatRatePercent: 12, vatMode: 'standard_12', reverseCharge: false,
    paymentMethod: 'swish',
  },
  {
    id: 'exp_3', status: 'ready_for_export', category: 'utbildning', supplier: 'Stripe',
    date: '2026-05-15', amountSek: 5000, vatSek: 0, netAmountSek: 5000,
    deductibleVatSek: 0, nonDeductibleVatSek: 0,
    vatRatePercent: 'reverse_charge', vatMode: 'eu_reverse_charge_services', reverseCharge: true,
    paymentMethod: 'card',
  },
  {
    id: 'exp_4', status: 'new', category: null, supplier: 'Okänd butik',
    date: '2026-05-20', amountSek: 200, vatSek: 50, netAmountSek: 150,
    paymentMethod: 'cash', vatReviewStatus: 'pending',
  },
  {
    id: 'exp_5', status: 'approved', category: 'lokal', supplier: 'Hyresvärden',
    supplierId: 'vendor_landlord', date: '2026-04-30', amountSek: 25000, vatSek: 6250,
    netAmountSek: 18750, deductibleVatSek: 6250, nonDeductibleVatSek: 0,
    vatRatePercent: 25, vatMode: 'standard_25',
    paymentMethod: 'bank_transfer',
  },
  {
    id: 'exp_6', status: 'rejected', date: '2026-05-25', amountSek: 999,
  },
];

const receipts = [
  { id: 'rec_1', status: 'categorized', uploadedAt: '2026-05-03T10:00:00Z', amountSek: 12000, category: 'utrustning', sourceSystem: 'upload' },
  { id: 'rec_2', status: 'needs_review', uploadedAt: '2026-05-12T10:00:00Z', amountSek: 850, sourceSystem: 'email_inbox' },
  { id: 'rec_3', status: 'exported', uploadedAt: '2026-05-15T10:00:00Z', amountSek: 5000, sourceSystem: 'upload' },
];

const vendors = [
  { id: 'vendor_apple', name: 'Apple Sweden AB', active: true, riskFlag: 'none', source: 'manual', hasPubAgreement: true, stats: { timesMatched: 5 } },
  { id: 'vendor_landlord', name: 'Stockholm Hyresvärd AB', active: true, riskFlag: 'needs_review', source: 'auto_detected', hasPubAgreement: false, stats: { timesMatched: 12 } },
];

const recurrings = [
  {
    id: 'rec_lease_1', label: 'Hyra kontor', supplierId: 'vendor_landlord',
    amountEstimate: 25000, frequency: 'monthly', status: 'active',
    nextDueDate: '2026-06-30', lastMatchedAt: '2026-05-30',
    anomalies: [],
  },
  {
    id: 'rec_overdue', label: 'Försenad', amountEstimate: 1500, frequency: 'monthly',
    status: 'active', nextDueDate: '2026-05-15', lastMatchedAt: null,
    anomalies: [{ kind: 'amount_drift', severity: 'high', at: '2026-05-20', notes: 'avvikelse' }],
  },
];

const reviews = [
  { id: 'review_1', batchId: 'expbatch_xyz', status: 'accepted_for_bookkeeping', updatedAt: '2026-05-20T12:00:00Z' },
];

const exportBatches = [
  { batchId: 'expbatch_xyz', exportedAt: '2026-05-18T10:00:00Z', exportedBy: { userId: 'u1', role: 'finance' }, expenseCount: 3, totalAmountSek: 17850 },
];

const data = { expenses, receipts, vendors, recurrings, reviews, exportBatches };

// ── 1. Generera alla 12 rapporttyper ──────────────────────────
console.log('\n[1] Generera alla 12 rapporttyper:');
const testCases = [
  { kind: 'daily', period: '2026-05-03' },
  { kind: 'weekly', period: '2026-05-05' },
  { kind: 'monthly', period: '2026-05' },
  { kind: 'quarterly', period: '2026-Q2' },
  { kind: 'yearly', period: '2026' },
  { kind: 'cash', period: '2026-05' },
  { kind: 'expense_summary', period: '2026-05' },
  { kind: 'receipt_summary', period: '2026-05' },
  { kind: 'vat_summary', period: '2026-05' },
  { kind: 'supplier_summary', period: '2026-05' },
  { kind: 'recurring_summary', period: '2026-05' },
  { kind: 'export_status', period: '2026-05' },
];

for (const tc of testCases) {
  try {
    const r = generateReport({ kind: tc.kind, period: tc.period, data, generatedBy: { userId: 'test' } });
    assert(r && r.reportKind === tc.kind, `${tc.kind}: returnerar rätt kind`);
    assert(r.totals !== undefined, `${tc.kind}: har totals`);
    assert(Array.isArray(r.anomalies), `${tc.kind}: har anomalies array`);
    assert(r.fortnoxStatus === 'BLOCKED_INTEGRATION', `${tc.kind}: fortnoxStatus = BLOCKED_INTEGRATION`);
  } catch (err) {
    assert(false, `${tc.kind}: ${err.message}`);
  }
}

// 1b. Monthly-rapport måste innehålla rätt total
console.log('\n[1b] Monthly-rapport värden:');
const monthly = generateReport({ kind: 'monthly', period: '2026-05', data });
// Maj-expenses ej rejected: exp_1 (12000) + exp_2 (850) + exp_3 (5000) + exp_4 (200) = 18050
assert(monthly.totals.totalGrossSek === 18050, `monthly totalGrossSek = 18050 (fick ${monthly.totals.totalGrossSek})`);
assert(monthly.totals.expenseCount === 4, `monthly expenseCount = 4 (fick ${monthly.totals.expenseCount})`);

// 1c. VAT-summary
console.log('\n[1c] VAT-summary:');
const vat = generateReport({ kind: 'vat_summary', period: '2026-05', data });
assert(vat.totals.reverseChargeCount === 1, `reverseChargeCount = 1 (fick ${vat.totals.reverseChargeCount})`);
assert(vat.totals.totalDeductibleVatSek === 2502, `totalDeductibleVatSek = 2502 (2400+102, fick ${vat.totals.totalDeductibleVatSek})`);

// 1d. Supplier-summary
console.log('\n[1d] Supplier-summary:');
const sup = generateReport({ kind: 'supplier_summary', period: '2026-05', data });
assert(sup.totals.flaggedCount === 1, `flaggedCount = 1 (vendor_landlord, fick ${sup.totals.flaggedCount})`);
assert(sup.totals.missingPubAgreementCount === 1, `missingPubAgreementCount = 1 (fick ${sup.totals.missingPubAgreementCount})`);

// 1e. Recurring-summary
console.log('\n[1e] Recurring-summary:');
const rec = generateReport({ kind: 'recurring_summary', period: '2026-05', data });
assert(rec.totals.active === 2, `active = 2 (fick ${rec.totals.active})`);
assert(rec.totals.overdueCount >= 1, `overdueCount >= 1 (fick ${rec.totals.overdueCount})`);

// 1f. Export-status
console.log('\n[1f] Export-status:');
const exp = generateReport({ kind: 'export_status', period: '2026-05', data });
assert(exp.totals.batchCount === 1, `batchCount = 1 (fick ${exp.totals.batchCount})`);
assert(exp.totals.acceptedForBookkeepingCount === 1, `acceptedForBookkeepingCount = 1 (fick ${exp.totals.acceptedForBookkeepingCount})`);

// 1g. CSV-konvertering
console.log('\n[1g] CSV-konvertering:');
const csv = reportToCsv(monthly);
assert(typeof csv === 'string' && csv.includes('kind;monthly'), 'CSV innehåller "kind;monthly"');
assert(csv.includes('# Totals'), 'CSV har Totals-sektion');
assert(csv.includes('# Breakdown'), 'CSV har minst en Breakdown-sektion');

// ── 2. Monthly Close store ───────────────────────────────────
console.log('\n[2] Monthly Close store — state machine:');
(async () => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cf9-close-'));
  const auditEvents = [];
  const auditLog = { append: (e) => auditEvents.push(e) };
  const store = await createCfoFinanceMonthlyCloseStore({
    filePath: path.join(tmpDir, 'periods.json'),
    auditLog,
  });

  const periodId = '2026-05';
  assert(isValidPeriodId(periodId), 'isValidPeriodId(2026-05) = true');
  assert(!isValidPeriodId('2026-13'), 'isValidPeriodId(2026-13) = false (månad utanför 01-12)');
  assert(!isValidPeriodId('2026-00'), 'isValidPeriodId(2026-00) = false');
  assert(!isValidPeriodId('not-a-date'), 'isValidPeriodId(not-a-date) = false');

  const p0 = store.getOrInitPeriod(periodId);
  assert(p0.status === 'open', 'init: status = open');

  const fin = { userId: 'fin1', role: 'finance' };
  const rev = { userId: 'rev1', role: 'revisor' };
  const own = { userId: 'own1', role: 'owner' };
  const staff = { userId: 's1', role: 'staff' };

  // staff får 403
  try {
    await store.startClose({ periodId, actor: staff });
    assert(false, 'staff blockad från startClose');
  } catch (err) { assert(err.statusCode === 403, `staff blockad: ${err.message}`); }

  // finance startar
  const p1 = await store.startClose({ periodId, actor: fin });
  assert(p1.status === 'preparing', `finance startClose → preparing (fick ${p1.status})`);

  // finance markerar klar
  const p2 = await store.markReadyForReview({ periodId, actor: fin });
  assert(p2.status === 'ready_for_review', `markReadyForReview → ready_for_review (fick ${p2.status})`);

  // revisor approve (auto-flytt till in_review först)
  const p3 = await store.approve({ periodId, actor: rev });
  assert(p3.status === 'approved', `approve → approved (fick ${p3.status})`);

  // owner stänger
  const p4 = await store.close({ periodId, actor: own });
  assert(p4.status === 'closed', `close → closed (fick ${p4.status})`);

  // isPeriodLocked
  assert(store.isPeriodLocked(periodId), 'isPeriodLocked(2026-05) = true');
  assert(store.isDateInLockedPeriod('2026-05-15'), 'isDateInLockedPeriod(2026-05-15) = true');
  assert(!store.isDateInLockedPeriod('2026-06-01'), 'isDateInLockedPeriod(2026-06-01) = false');

  // reopen utan reason → fail
  try {
    await store.reopen({ periodId, actor: own, reason: '' });
    assert(false, 'reopen utan reason avvisas');
  } catch (err) { assert(/reason/.test(err.message), `reopen utan reason rejected: ${err.message}`); }

  // reopen som finance → 403
  try {
    await store.reopen({ periodId, actor: fin, reason: 'jag vill' });
    assert(false, 'finance kan inte reopen');
  } catch (err) { assert(err.statusCode === 403, `finance kan inte reopen: ${err.message}`); }

  // owner reopen med reason
  const p5 = await store.reopen({ periodId, actor: own, reason: 'Hittade missat kvitto' });
  assert(p5.status === 'open', `owner reopen → open (fick ${p5.status})`);
  assert(p5.reopenCount === 1, `reopenCount = 1 (fick ${p5.reopenCount})`);
  assert(!store.isPeriodLocked(periodId), 'efter reopen — period inte längre låst');

  // Correction-flöde
  await store.startClose({ periodId, actor: fin });
  await store.markReadyForReview({ periodId, actor: fin });
  const p6 = await store.requestCorrection({ periodId, actor: rev, reason: 'Saknas signatur' });
  assert(p6.status === 'corrections_needed', `requestCorrection → corrections_needed (fick ${p6.status})`);
  assert(p6.correctionReasons.length === 1, 'correctionReasons har 1 entry');

  // Audit-events
  const kinds = auditEvents.map((e) => e.kind);
  assert(kinds.includes('cf.period.started_close'), 'audit: cf.period.started_close');
  assert(kinds.includes('cf.period.ready_for_review'), 'audit: cf.period.ready_for_review');
  assert(kinds.includes('cf.period.approved'), 'audit: cf.period.approved');
  assert(kinds.includes('cf.period.closed'), 'audit: cf.period.closed');
  assert(kinds.includes('cf.period.reopened'), 'audit: cf.period.reopened');
  assert(kinds.includes('cf.period.correction_requested'), 'audit: cf.period.correction_requested');

  // ── 3. Checklist ──────────────────────────────────────────────
  console.log('\n[3] Checklist:');
  const mockStores = {
    expenseStore: {
      listExpenses: ({ fromDate, toDate }) => expenses.filter((e) => e.status !== 'rejected' && e.date >= fromDate && e.date <= toDate),
      listExportBatches: () => exportBatches,
    },
    receiptStore: {
      listReceipts: () => receipts,
    },
    recurringStore: {
      listRecurrings: () => recurrings,
    },
    reviewStore: {
      listReviews: () => reviews,
    },
  };
  const check = store.evaluateChecklist({ periodId: '2026-05', stores: mockStores });
  assert(check.totalChecks === 8, `8 check items (fick ${check.totalChecks})`);
  assert(Array.isArray(check.blockingItems), 'blockingItems is array');
  // expensesAllCategorized ska faila (exp_4 har null category)
  assert(check.checklist.expensesAllCategorized.pass === false, 'expensesAllCategorized FAIL (exp_4 utan category)');
  assert(check.checklist.expensesAllCategorized.count === 1, 'expensesAllCategorized count = 1');
  // exportPackageCreated ska passa (1 batch)
  assert(check.checklist.exportPackageCreated.pass === true, 'exportPackageCreated PASS');
  // reviewerAccepted ska passa
  assert(check.checklist.reviewerAccepted.pass === true, 'reviewerAccepted PASS');

  // ── 4. Report Packager ────────────────────────────────────────
  console.log('\n[4] Report Packager — secure storage:');
  const storage = {};
  const secureStorage = {
    putObject: async (key, buffer, opts) => { storage[key] = { buffer, metadata: opts }; },
    getObject: async (key) => storage[key] || null,
  };
  const pkgResult = await buildReportPackage({
    kind: 'monthly', period: '2026-05', data,
    secureStorage, actor: own, auditLog,
  });
  assert(pkgResult.ok === true, 'package built ok');
  assert(typeof pkgResult.packageId === 'string' && pkgResult.packageId.startsWith('reportpkg_'), 'packageId genererad');
  assert(typeof pkgResult.keys.report_json === 'string', 'keys.report_json finns');
  assert(typeof pkgResult.keys.report_csv === 'string', 'keys.report_csv finns');
  assert(typeof pkgResult.keys.manifest === 'string', 'keys.manifest finns');
  // manifest checksums
  assert(pkgResult.manifest.files.length === 2, 'manifest.files = 2 (json + csv)');
  for (const f of pkgResult.manifest.files) {
    assert(typeof f.checksum === 'string' && f.checksum.length === 64, `${f.kind}: SHA256 är 64 hex chars`);
  }
  // Filer finns i storage
  assert(storage[pkgResult.keys.report_json], 'JSON sparad i secure storage');
  assert(storage[pkgResult.keys.report_csv], 'CSV sparad i secure storage');
  assert(storage[pkgResult.keys.manifest], 'Manifest sparad i secure storage');

  // 4b. Download
  console.log('\n[4b] Download från paket:');
  const dl = await downloadFromPackage({
    packageId: pkgResult.packageId, fileKind: 'report_json',
    reportKind: 'monthly', period: pkgResult.period,
    secureStorage, actor: own, auditLog,
  });
  assert(dl.buffer && dl.buffer.length > 0, 'download returnerar buffer');
  assert(dl.mimeType === 'application/json', `mimeType = application/json (fick ${dl.mimeType})`);

  // 4c. Audit på package
  const pkgAudits = auditEvents.filter((e) => e.kind === 'cf.report.package_built');
  assert(pkgAudits.length === 1, `cf.report.package_built audit fired (fick ${pkgAudits.length})`);
  const dlAudits = auditEvents.filter((e) => e.kind === 'cf.report.downloaded');
  assert(dlAudits.length === 1, `cf.report.downloaded audit fired (fick ${dlAudits.length})`);

  // 5. Bad kinds
  console.log('\n[5] Bad input:');
  try {
    generateReport({ kind: 'invalid_kind', period: '2026-05', data });
    assert(false, 'invalid kind avvisas');
  } catch (err) { assert(/Okänd/.test(err.message), `invalid kind: ${err.message}`); }

  // 6. Cleanup
  await fs.promises.rm(tmpDir, { recursive: true, force: true });

  // ── SLUTRESULTAT ──────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`CF.9 smoke-test: ${passes} PASS, ${fails} FAIL`);
  if (fails > 0) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\n✅ ALL PASSED');
  process.exit(0);
})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
