/**
 * cfoFinanceReportEngine — Sprint CF.9 (MVP 8)
 *
 * Pure-function rapportmotor för 12 rapporttyper. Inga side-effects, inga
 * I/O. Tar emot en data-bundle + period och returnerar ett rapport-objekt.
 *
 * Rapporttyper (kind):
 *  - daily            — dagrapport (1 dag)
 *  - weekly           — veckorapport (7 dagar med per-dag-breakdown)
 *  - monthly          — månadsrapport
 *  - quarterly        — kvartal (3 månader)
 *  - yearly           — år (12 månader / 4 kvartal)
 *  - cash             — kassarapport (cash/swish/card direkt-debiterat)
 *  - expense_summary  — expense-status breakdown
 *  - receipt_summary  — receipt-status breakdown
 *  - vat_summary      — VAT/moms breakdown (netto, brutto, deductible, reverse)
 *  - supplier_summary — vendor-spend top-N + risk-flags
 *  - recurring_summary— recurring expenses status + anomalies
 *  - export_status    — export-batches + revisor-review-status
 *
 * Säkerhet:
 *  - Pure functions (ingen audit, ingen I/O — caller ansvarar för audit)
 *  - Patientdata läcker inte in om expenses inte explicit har customerId
 *  - Ingen Fortnox-write
 */

'use strict';

const SCHEMA_VERSION = '1.0.0';

const VALID_REPORT_KINDS = Object.freeze([
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'cash',
  'expense_summary',
  'receipt_summary',
  'vat_summary',
  'supplier_summary',
  'recurring_summary',
  'export_status',
]);

const CASH_LIKE_PAYMENT_METHODS = Object.freeze(['cash', 'swish', 'card']);

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function num(v) { return isFiniteNumber(v) ? v : 0; }
function round2(v) { return Math.round(num(v) * 100) / 100; }

function nowIso() { return new Date().toISOString(); }

// ---------- period helpers ----------

function dayRange(dateStr) {
  const d = String(dateStr || '').slice(0, 10);
  return { fromDate: d, toDate: d, label: d, kind: 'daily' };
}

function weekRange(anchorDate) {
  // ISO-week semantik: måndag som första dag
  const d = new Date(`${String(anchorDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dayRange(anchorDate);
  const utcDay = d.getUTCDay(); // 0=söndag, 1=måndag ...
  const offsetToMonday = (utcDay + 6) % 7;
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offsetToMonday
  ));
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6
  ));
  return {
    fromDate: monday.toISOString().slice(0, 10),
    toDate: sunday.toISOString().slice(0, 10),
    label: `${monday.toISOString().slice(0, 10)} → ${sunday.toISOString().slice(0, 10)}`,
    kind: 'weekly',
  };
}

function monthRange(periodId) {
  // periodId: YYYY-MM
  const m = /^(\d{4})-(\d{2})$/.exec(String(periodId || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const to = new Date(Date.UTC(y, mo, 0)); // last day
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    label: periodId,
    kind: 'monthly',
  };
}

function quarterRange(quarterId) {
  // quarterId: YYYY-Q1 / Q2 / Q3 / Q4
  const m = /^(\d{4})-Q([1-4])$/.exec(String(quarterId || ''));
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]);
  const startMonth = (q - 1) * 3;
  const from = new Date(Date.UTC(y, startMonth, 1));
  const to = new Date(Date.UTC(y, startMonth + 3, 0));
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
    label: quarterId,
    kind: 'quarterly',
  };
}

function yearRange(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  return {
    fromDate: `${y}-01-01`,
    toDate: `${y}-12-31`,
    label: String(y),
    kind: 'yearly',
  };
}

function resolvePeriod({ kind, period }) {
  if (kind === 'daily') return dayRange(period);
  if (kind === 'weekly') return weekRange(period);
  if (kind === 'monthly') return monthRange(period);
  if (kind === 'quarterly') return quarterRange(period);
  if (kind === 'yearly') return yearRange(period);
  // För summary-rapporter går period in som månads-id eller daily
  if (/^\d{4}-\d{2}$/.test(String(period || ''))) return monthRange(period);
  if (/^\d{4}-Q[1-4]$/.test(String(period || ''))) return quarterRange(period);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(period || ''))) return dayRange(period);
  if (/^\d{4}$/.test(String(period || ''))) return yearRange(period);
  return null;
}

function inPeriod(dateStr, range) {
  if (!range) return true;
  const d = String(dateStr || '').slice(0, 10);
  return d >= range.fromDate && d <= range.toDate;
}

// ---------- filter ----------

function filterExpenses(expenses, range) {
  if (!Array.isArray(expenses)) return [];
  return expenses.filter((e) => e && e.status !== 'rejected' && inPeriod(e.date, range));
}

function filterReceipts(receipts, range) {
  if (!Array.isArray(receipts)) return [];
  return receipts.filter((r) => {
    if (!r) return false;
    // ReceiptStore använder uploadedAt; vissa kan ha receiptDate
    const d = r.receiptDate || r.uploadedAt || '';
    return inPeriod(d, range);
  });
}

// ---------- aggregations ----------

function aggregateExpensesByCategory(expenses) {
  const out = {};
  for (const e of expenses) {
    const k = e.category || 'okategoriserad';
    out[k] = out[k] || { category: k, count: 0, totalGrossSek: 0, totalNetSek: 0, totalVatSek: 0 };
    out[k].count += 1;
    out[k].totalGrossSek += num(e.amountSek);
    out[k].totalNetSek += num(e.netAmountSek);
    out[k].totalVatSek += num(e.vatSek);
  }
  return Object.values(out).map((c) => ({
    ...c,
    totalGrossSek: round2(c.totalGrossSek),
    totalNetSek: round2(c.totalNetSek),
    totalVatSek: round2(c.totalVatSek),
  })).sort((a, b) => b.totalGrossSek - a.totalGrossSek);
}

function aggregateExpensesBySupplier(expenses, vendors = []) {
  const vendorMap = new Map();
  for (const v of vendors || []) vendorMap.set(v.id, v);
  const out = {};
  for (const e of expenses) {
    const key = e.supplierId || (e.supplier ? `name:${String(e.supplier).toLowerCase()}` : 'okänd');
    const display = e.supplierId && vendorMap.get(e.supplierId)?.name || e.supplier || 'Okänd leverantör';
    out[key] = out[key] || {
      supplierId: e.supplierId || null,
      supplierName: display,
      count: 0,
      totalGrossSek: 0,
      totalVatSek: 0,
      riskFlag: e.supplierId ? (vendorMap.get(e.supplierId)?.riskFlag || null) : null,
    };
    out[key].count += 1;
    out[key].totalGrossSek += num(e.amountSek);
    out[key].totalVatSek += num(e.vatSek);
  }
  return Object.values(out)
    .map((s) => ({ ...s, totalGrossSek: round2(s.totalGrossSek), totalVatSek: round2(s.totalVatSek) }))
    .sort((a, b) => b.totalGrossSek - a.totalGrossSek);
}

function aggregateExpensesByPaymentMethod(expenses) {
  const out = {};
  for (const e of expenses) {
    const k = e.paymentMethod || 'unknown';
    out[k] = out[k] || { paymentMethod: k, count: 0, totalGrossSek: 0 };
    out[k].count += 1;
    out[k].totalGrossSek += num(e.amountSek);
  }
  return Object.values(out)
    .map((p) => ({ ...p, totalGrossSek: round2(p.totalGrossSek) }))
    .sort((a, b) => b.totalGrossSek - a.totalGrossSek);
}

function aggregateExpensesByDay(expenses) {
  const out = {};
  for (const e of expenses) {
    const d = String(e.date || '').slice(0, 10);
    if (!d) continue;
    out[d] = out[d] || { date: d, count: 0, totalGrossSek: 0, totalVatSek: 0 };
    out[d].count += 1;
    out[d].totalGrossSek += num(e.amountSek);
    out[d].totalVatSek += num(e.vatSek);
  }
  return Object.values(out)
    .map((d) => ({ ...d, totalGrossSek: round2(d.totalGrossSek), totalVatSek: round2(d.totalVatSek) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function aggregateExpensesByMonth(expenses) {
  const out = {};
  for (const e of expenses) {
    const m = String(e.date || '').slice(0, 7);
    if (!m) continue;
    out[m] = out[m] || { month: m, count: 0, totalGrossSek: 0, totalVatSek: 0 };
    out[m].count += 1;
    out[m].totalGrossSek += num(e.amountSek);
    out[m].totalVatSek += num(e.vatSek);
  }
  return Object.values(out)
    .map((m) => ({ ...m, totalGrossSek: round2(m.totalGrossSek), totalVatSek: round2(m.totalVatSek) }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function aggregateVat(expenses) {
  let net = 0;
  let gross = 0;
  let vat = 0;
  let deductible = 0;
  let nonDeductible = 0;
  let reverseChargeCount = 0;
  let reverseChargeAmount = 0;
  const byVatMode = {};
  const byVatRate = {};

  for (const e of expenses) {
    net += num(e.netAmountSek);
    gross += num(e.amountSek);
    vat += num(e.vatSek);
    deductible += num(e.deductibleVatSek);
    nonDeductible += num(e.nonDeductibleVatSek);
    if (e.reverseCharge) {
      reverseChargeCount += 1;
      reverseChargeAmount += num(e.amountSek);
    }
    const mode = e.vatMode || 'unset';
    byVatMode[mode] = (byVatMode[mode] || 0) + 1;
    const rate = e.vatRatePercent === null || e.vatRatePercent === undefined ? 'unknown' : String(e.vatRatePercent);
    byVatRate[rate] = (byVatRate[rate] || 0) + 1;
  }

  return {
    totalNetSek: round2(net),
    totalGrossSek: round2(gross),
    totalVatSek: round2(vat),
    totalDeductibleVatSek: round2(deductible),
    totalNonDeductibleVatSek: round2(nonDeductible),
    reverseChargeCount,
    reverseChargeAmountSek: round2(reverseChargeAmount),
    byVatMode,
    byVatRate,
  };
}

// ---------- anomalies ----------

function detectAnomalies({ expenses, receipts, recurrings = [] }) {
  const out = [];

  // Expenses utan kategori
  const noCategory = expenses.filter((e) => !e.category);
  if (noCategory.length > 0) {
    out.push({
      kind: 'expenses_missing_category',
      severity: 'medium',
      message: `${noCategory.length} expense(s) saknar kategori.`,
      count: noCategory.length,
    });
  }

  // Expenses med vatReviewStatus = pending
  const pendingVat = expenses.filter((e) => e.vatReviewStatus === 'pending');
  if (pendingVat.length > 0) {
    out.push({
      kind: 'vat_review_pending',
      severity: 'medium',
      message: `${pendingVat.length} expense(s) väntar på momsgranskning.`,
      count: pendingVat.length,
    });
  }

  // Expenses i needs_review
  const needsReview = expenses.filter((e) => e.status === 'needs_review' || e.status === 'new');
  if (needsReview.length > 0) {
    out.push({
      kind: 'expenses_need_review',
      severity: 'high',
      message: `${needsReview.length} expense(s) väntar på review.`,
      count: needsReview.length,
    });
  }

  // Receipts i new/needs_review
  const receiptsNeedReview = (receipts || []).filter((r) => r && (r.status === 'new' || r.status === 'needs_review'));
  if (receiptsNeedReview.length > 0) {
    out.push({
      kind: 'receipts_need_review',
      severity: 'medium',
      message: `${receiptsNeedReview.length} kvitto(n) behöver granskning.`,
      count: receiptsNeedReview.length,
    });
  }

  // Recurring overdue
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (recurrings || []).filter((r) => r && r.status === 'active' && r.nextDueDate && r.nextDueDate < today);
  if (overdue.length > 0) {
    out.push({
      kind: 'recurring_overdue',
      severity: 'high',
      message: `${overdue.length} återkommande kostnad(er) försenade.`,
      count: overdue.length,
    });
  }

  // Recurring med anomalies (severity high)
  for (const r of recurrings || []) {
    const highSev = (r.anomalies || []).filter((a) => a.severity === 'high');
    if (highSev.length > 0) {
      out.push({
        kind: 'recurring_high_severity_anomaly',
        severity: 'high',
        message: `Återkommande "${r.label || r.id}" har ${highSev.length} hög-severity anomali.`,
        recurringId: r.id,
        count: highSev.length,
      });
    }
  }

  return out;
}

// ---------- report generators ----------

function buildBaseReport({ kind, range, generatedBy }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    reportKind: kind,
    periodLabel: range?.label || '',
    period: { fromDate: range?.fromDate || null, toDate: range?.toDate || null },
    generatedAt: nowIso(),
    generatedBy: generatedBy || null,
    fortnoxStatus: 'BLOCKED_INTEGRATION',
  };
}

function reportDaily({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const rec = filterReceipts(data.receipts, range);
  return {
    ...buildBaseReport({ kind: 'daily', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      receiptCount: rec.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      totalVatSek: round2(exp.reduce((s, e) => s + num(e.vatSek), 0)),
    },
    breakdown: {
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors).slice(0, 10),
      byPaymentMethod: aggregateExpensesByPaymentMethod(exp),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: rec, recurrings: data.recurrings }),
  };
}

function reportWeekly({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const rec = filterReceipts(data.receipts, range);
  return {
    ...buildBaseReport({ kind: 'weekly', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      receiptCount: rec.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      totalVatSek: round2(exp.reduce((s, e) => s + num(e.vatSek), 0)),
    },
    breakdown: {
      byDay: aggregateExpensesByDay(exp),
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors).slice(0, 10),
      byPaymentMethod: aggregateExpensesByPaymentMethod(exp),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: rec, recurrings: data.recurrings }),
  };
}

function reportMonthly({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const rec = filterReceipts(data.receipts, range);
  return {
    ...buildBaseReport({ kind: 'monthly', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      receiptCount: rec.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      totalVatSek: round2(exp.reduce((s, e) => s + num(e.vatSek), 0)),
      totalNetSek: round2(exp.reduce((s, e) => s + num(e.netAmountSek), 0)),
    },
    breakdown: {
      byDay: aggregateExpensesByDay(exp),
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors),
      byPaymentMethod: aggregateExpensesByPaymentMethod(exp),
      vat: aggregateVat(exp),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: rec, recurrings: data.recurrings }),
  };
}

function reportQuarterly({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  return {
    ...buildBaseReport({ kind: 'quarterly', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      totalVatSek: round2(exp.reduce((s, e) => s + num(e.vatSek), 0)),
    },
    breakdown: {
      byMonth: aggregateExpensesByMonth(exp),
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors).slice(0, 20),
      vat: aggregateVat(exp),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: data.receipts || [], recurrings: data.recurrings }),
  };
}

function reportYearly({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const byMonth = aggregateExpensesByMonth(exp);
  const byQuarter = {};
  for (const m of byMonth) {
    const month = Number(m.month.slice(5, 7));
    const q = Math.ceil(month / 3);
    const qKey = `${m.month.slice(0, 4)}-Q${q}`;
    byQuarter[qKey] = byQuarter[qKey] || { quarter: qKey, count: 0, totalGrossSek: 0, totalVatSek: 0 };
    byQuarter[qKey].count += m.count;
    byQuarter[qKey].totalGrossSek += m.totalGrossSek;
    byQuarter[qKey].totalVatSek += m.totalVatSek;
  }
  return {
    ...buildBaseReport({ kind: 'yearly', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      totalVatSek: round2(exp.reduce((s, e) => s + num(e.vatSek), 0)),
    },
    breakdown: {
      byMonth,
      byQuarter: Object.values(byQuarter)
        .map((q) => ({ ...q, totalGrossSek: round2(q.totalGrossSek), totalVatSek: round2(q.totalVatSek) }))
        .sort((a, b) => String(a.quarter).localeCompare(String(b.quarter))),
      byCategory: aggregateExpensesByCategory(exp),
      vat: aggregateVat(exp),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: data.receipts || [], recurrings: data.recurrings }),
  };
}

function reportCash({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range)
    .filter((e) => CASH_LIKE_PAYMENT_METHODS.includes(e.paymentMethod));
  return {
    ...buildBaseReport({ kind: 'cash', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      totalGrossSek: round2(exp.reduce((s, e) => s + num(e.amountSek), 0)),
      cashTotal: round2(exp.filter((e) => e.paymentMethod === 'cash').reduce((s, e) => s + num(e.amountSek), 0)),
      swishTotal: round2(exp.filter((e) => e.paymentMethod === 'swish').reduce((s, e) => s + num(e.amountSek), 0)),
      cardTotal: round2(exp.filter((e) => e.paymentMethod === 'card').reduce((s, e) => s + num(e.amountSek), 0)),
    },
    breakdown: {
      byPaymentMethod: aggregateExpensesByPaymentMethod(exp),
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors).slice(0, 20),
    },
    anomalies: [],
  };
}

function reportExpenseSummary({ data, range, generatedBy }) {
  const all = (data.expenses || []).filter((e) => inPeriod(e.date, range));
  const byStatus = {};
  const byCategorySource = {};
  let totalAmount = 0;
  for (const e of all) {
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    if (e.status !== 'rejected') totalAmount += num(e.amountSek);
    const src = e.categorySource || 'none';
    byCategorySource[src] = (byCategorySource[src] || 0) + 1;
  }
  return {
    ...buildBaseReport({ kind: 'expense_summary', range, generatedBy }),
    totals: {
      total: all.length,
      totalAmountSek: round2(totalAmount),
      readyForExport: byStatus.ready_for_export || 0,
      exported: byStatus.exported || 0,
      needsReview: (byStatus.new || 0) + (byStatus.needs_review || 0),
      rejected: byStatus.rejected || 0,
    },
    breakdown: {
      byStatus,
      byCategorySource,
    },
    anomalies: detectAnomalies({ expenses: all, receipts: [], recurrings: [] }),
  };
}

function reportReceiptSummary({ data, range, generatedBy }) {
  const all = filterReceipts(data.receipts, range);
  const byStatus = {};
  const byCategory = {};
  const bySource = {};
  let totalAmount = 0;
  for (const r of all) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.category) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    if (r.sourceSystem) bySource[r.sourceSystem] = (bySource[r.sourceSystem] || 0) + 1;
    if (typeof r.amountSek === 'number') totalAmount += r.amountSek;
  }
  return {
    ...buildBaseReport({ kind: 'receipt_summary', range, generatedBy }),
    totals: {
      total: all.length,
      totalAmountSek: round2(totalAmount),
      needsReview: (byStatus.new || 0) + (byStatus.needs_review || 0),
    },
    breakdown: { byStatus, byCategory, bySource },
    anomalies: detectAnomalies({ expenses: [], receipts: all, recurrings: [] }),
  };
}

function reportVatSummary({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const vat = aggregateVat(exp);
  return {
    ...buildBaseReport({ kind: 'vat_summary', range, generatedBy }),
    totals: {
      expenseCount: exp.length,
      ...vat,
    },
    breakdown: {
      byCategory: aggregateExpensesByCategory(exp),
      bySupplier: aggregateExpensesBySupplier(exp, data.vendors).slice(0, 15),
    },
    anomalies: detectAnomalies({ expenses: exp, receipts: [], recurrings: [] })
      .filter((a) => a.kind === 'vat_review_pending' || a.kind === 'expenses_missing_category'),
  };
}

function reportSupplierSummary({ data, range, generatedBy }) {
  const exp = filterExpenses(data.expenses, range);
  const supplierBreakdown = aggregateExpensesBySupplier(exp, data.vendors);
  const vendorMap = new Map((data.vendors || []).map((v) => [v.id, v]));

  const flagged = [];
  for (const v of data.vendors || []) {
    if (v.riskFlag && v.riskFlag !== 'none') {
      flagged.push({ vendorId: v.id, name: v.name, riskFlag: v.riskFlag, source: v.source });
    }
  }
  const missingPub = (data.vendors || []).filter((v) => v.active !== false && !v.hasPubAgreement);
  return {
    ...buildBaseReport({ kind: 'supplier_summary', range, generatedBy }),
    totals: {
      uniqueSuppliersInPeriod: supplierBreakdown.length,
      totalGrossSek: round2(supplierBreakdown.reduce((s, x) => s + num(x.totalGrossSek), 0)),
      activeVendors: (data.vendors || []).filter((v) => v.active !== false).length,
      flaggedCount: flagged.length,
      missingPubAgreementCount: missingPub.length,
    },
    breakdown: {
      topSuppliers: supplierBreakdown.slice(0, 20),
      flagged,
      missingPubAgreement: missingPub.map((v) => ({ vendorId: v.id, name: v.name, source: v.source })),
    },
    anomalies: flagged.length > 0
      ? [{ kind: 'suppliers_flagged', severity: 'medium', message: `${flagged.length} leverantör(er) med risk-flag.`, count: flagged.length }]
      : [],
  };
}

function reportRecurringSummary({ data, range, generatedBy }) {
  const recurrings = data.recurrings || [];
  const today = new Date().toISOString().slice(0, 10);
  const today30 = new Date(Date.parse(today) + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  let active = 0; let proposed = 0; let paused = 0; let ended = 0;
  let monthlyLoad = 0;
  let overdueCount = 0; let overdueAmount = 0;
  let dueNext30Count = 0; let dueNext30Amount = 0;
  let unmatchedCount = 0;
  const byFrequency = {};
  const allAnomalies = [];

  for (const r of recurrings) {
    if (r.status === 'active') active += 1;
    else if (r.status === 'proposed') proposed += 1;
    else if (r.status === 'paused') paused += 1;
    else if (r.status === 'ended') ended += 1;
    byFrequency[r.frequency] = (byFrequency[r.frequency] || 0) + 1;

    if (r.status !== 'active') continue;
    const days = ({ monthly: 30, quarterly: 90, yearly: 365, weekly: 7, biweekly: 14 }[r.frequency] || 30);
    monthlyLoad += num(r.amountEstimate) * (30 / days);
    if (r.nextDueDate && r.nextDueDate < today) { overdueCount += 1; overdueAmount += num(r.amountEstimate); }
    if (r.nextDueDate && r.nextDueDate >= today && r.nextDueDate <= today30) {
      dueNext30Count += 1; dueNext30Amount += num(r.amountEstimate);
    }
    if (!r.lastMatchedAt) unmatchedCount += 1;
    for (const a of r.anomalies || []) {
      allAnomalies.push({ recurringId: r.id, recurringLabel: r.label, ...a });
    }
  }

  return {
    ...buildBaseReport({ kind: 'recurring_summary', range, generatedBy }),
    totals: {
      total: recurrings.length,
      active, proposed, paused, ended,
      estimatedMonthlyLoadSek: round2(monthlyLoad),
      overdueCount, overdueAmountSek: round2(overdueAmount),
      dueNext30Count, dueNext30AmountSek: round2(dueNext30Amount),
      unmatchedActiveCount: unmatchedCount,
    },
    breakdown: {
      byFrequency,
      activeList: recurrings.filter((r) => r.status === 'active').slice(0, 50).map((r) => ({
        id: r.id, label: r.label, supplierId: r.supplierId,
        amountEstimate: r.amountEstimate, frequency: r.frequency, nextDueDate: r.nextDueDate,
      })),
      anomalies: allAnomalies.slice(0, 30),
    },
    anomalies: detectAnomalies({ expenses: [], receipts: [], recurrings }),
  };
}

function reportExportStatus({ data, range, generatedBy }) {
  const batches = (data.exportBatches || []).filter((b) => {
    if (!range) return true;
    const d = String(b.exportedAt || '').slice(0, 10);
    return inPeriod(d, range);
  });
  const reviewsByBatch = new Map();
  for (const r of data.reviews || []) {
    if (r && r.batchId) reviewsByBatch.set(r.batchId, r);
  }

  const enriched = batches.map((b) => {
    const review = reviewsByBatch.get(b.batchId) || null;
    return {
      batchId: b.batchId,
      exportedAt: b.exportedAt,
      exportedBy: b.exportedBy || null,
      expenseCount: b.expenseCount || 0,
      totalGrossSek: round2(num(b.totalAmountSek)),
      reviewStatus: review?.status || 'no_review',
      reviewerNoteCount: review?.notes?.length || 0,
    };
  });

  return {
    ...buildBaseReport({ kind: 'export_status', range, generatedBy }),
    totals: {
      batchCount: enriched.length,
      acceptedForBookkeepingCount: enriched.filter((b) => b.reviewStatus === 'accepted_for_bookkeeping').length,
      needsCorrectionCount: enriched.filter((b) => b.reviewStatus === 'needs_correction').length,
      pendingReviewCount: enriched.filter((b) => b.reviewStatus === 'pending' || b.reviewStatus === 'no_review').length,
    },
    breakdown: { batches: enriched },
    anomalies: [],
  };
}

// ---------- dispatcher ----------

function generateReport({ kind, period, data = {}, generatedBy = null } = {}) {
  if (!VALID_REPORT_KINDS.includes(kind)) {
    throw new Error(`Okänd report kind: ${kind}. Tillåtna: ${VALID_REPORT_KINDS.join(', ')}`);
  }
  const range = resolvePeriod({ kind, period });
  if (!range && ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(kind)) {
    throw new Error(`Ogiltig period "${period}" för kind=${kind}.`);
  }
  const ctx = { data, range, generatedBy };
  switch (kind) {
    case 'daily': return reportDaily(ctx);
    case 'weekly': return reportWeekly(ctx);
    case 'monthly': return reportMonthly(ctx);
    case 'quarterly': return reportQuarterly(ctx);
    case 'yearly': return reportYearly(ctx);
    case 'cash': return reportCash(ctx);
    case 'expense_summary': return reportExpenseSummary(ctx);
    case 'receipt_summary': return reportReceiptSummary(ctx);
    case 'vat_summary': return reportVatSummary(ctx);
    case 'supplier_summary': return reportSupplierSummary(ctx);
    case 'recurring_summary': return reportRecurringSummary(ctx);
    case 'export_status': return reportExportStatus(ctx);
    default: throw new Error(`Inte implementerad: ${kind}`);
  }
}

// ---------- CSV converter ----------

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function reportToCsv(report) {
  if (!report) return '';
  const out = [];
  out.push(`kind;${escapeCsv(report.reportKind)}`);
  out.push(`period;${escapeCsv(report.periodLabel)}`);
  out.push(`generatedAt;${escapeCsv(report.generatedAt)}`);
  out.push(`fortnoxStatus;${escapeCsv(report.fortnoxStatus)}`);
  out.push('');
  out.push('# Totals');
  for (const [k, v] of Object.entries(report.totals || {})) {
    if (typeof v === 'object' && v !== null) continue;
    out.push(`${escapeCsv(k)};${escapeCsv(v)}`);
  }
  // Skriv alla list-breakdowns som tabeller
  const b = report.breakdown || {};
  for (const [bkey, bval] of Object.entries(b)) {
    if (!Array.isArray(bval) || bval.length === 0) continue;
    out.push('');
    out.push(`# Breakdown: ${bkey}`);
    const headers = Object.keys(bval[0]);
    out.push(headers.map(escapeCsv).join(';'));
    for (const row of bval) {
      out.push(headers.map((h) => escapeCsv(row[h])).join(';'));
    }
  }
  if (Array.isArray(report.anomalies) && report.anomalies.length > 0) {
    out.push('');
    out.push('# Anomalies');
    out.push('kind;severity;message;count');
    for (const a of report.anomalies) {
      out.push([a.kind, a.severity, a.message, a.count || ''].map(escapeCsv).join(';'));
    }
  }
  return out.join('\n') + '\n';
}

module.exports = {
  SCHEMA_VERSION,
  VALID_REPORT_KINDS,
  CASH_LIKE_PAYMENT_METHODS,
  generateReport,
  reportToCsv,
  // exposed för smoke-test
  resolvePeriod,
  filterExpenses,
  filterReceipts,
  aggregateExpensesByCategory,
  aggregateExpensesBySupplier,
  aggregateExpensesByPaymentMethod,
  aggregateExpensesByDay,
  aggregateExpensesByMonth,
  aggregateVat,
  detectAnomalies,
};
