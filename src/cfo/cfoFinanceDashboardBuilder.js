/**
 * cfoFinanceDashboardBuilder — Sprint CF.2 (MVP 1)
 *
 * Aggregator för Finance Dashboard. Läser från existerande stores:
 *  - cfoFortnoxStore (connection-status)
 *  - cfoFortnoxInvoiceLister (om wireat — invoice + payments per kund)
 *  - ccoSwishStore (connection-status + payments)
 *  - ccoCommercialStore (offert/deposit/faktura snapshot)
 *  - cfoReceiptStore (kvitto-summary)
 *  - ccoVendorRegisterStore (PUB-info, ej fakturor)
 *
 * GISSAR ALDRIG — om data saknas, returnera PARTIAL-flagga.
 * Inga writes. Bara reads.
 */

'use strict';

const SCHEMA_VERSION = '1.0.0';

function nowIso() {
  return new Date().toISOString();
}
function safeNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function previousMonthSameDayEndExclusive(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  const targetYear = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
  const targetMonth = d.getUTCMonth() === 0 ? 11 : d.getUTCMonth() - 1;
  const lastDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d.getUTCDate(), lastDayInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, clampedDay + 1)).toISOString();
}

function periodStartUtcMonth(dateLike, monthOffset = 0) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1)).toISOString();
}

function periodStart(period, dateLike = new Date()) {
  const now = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
  if (period === 'today') {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return d.toISOString();
  }
  if (period === 'week') {
    const day = now.getUTCDay() || 7;
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1))
    );
    return d.toISOString();
  }
  if (period === 'month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  }
  return null;
}

async function safeCall(fn, fallback = null) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function buildFinanceDashboard({
  stores = {},
  tenantId = 'hair_tp',
  now = new Date(),
  // CF.3 (2026-06-01): Fortnox OAuth är blockerad av Fortnox backend
  // (utvecklarportalen ger tre olika felkoder). Markera status som
  // 'blocked_integration' istället för 'not_connected' så UI visar
  // tydligt att det är en känd integration-blocker, inte glömd setup.
  // Återställs när Fortnox-felen löses.
  fortnoxBlockedIntegration = true,
} = {}) {
  const issues = [];
  const partial = { reasons: [] };

  // ── Fortnox status ─────────────────────────────────────────────
  const fortnox = {
    connected: false,
    status: 'not_connected',
    lastSync: null,
    blockedIntegration: false,
  };
  if (stores.fortnoxStore?.getPublicStatus) {
    const fs = await safeCall(() => stores.fortnoxStore.getPublicStatus({ tenantId }));
    if (fs) {
      fortnox.connected = !!fs.connected;
      fortnox.status = fs.connected ? 'connected' : 'not_connected';
      fortnox.connectedAt = fs.connectedAt;
      fortnox.expiresAt = fs.expiresAt;
      fortnox.lastSync = fs.lastRefreshAt;
      fortnox.lastError = fs.lastError;
    } else {
      issues.push('Fortnox status kunde inte hämtas');
    }
  } else {
    issues.push('cfoFortnoxStore saknas');
  }
  // CF.3-flagga: om Fortnox INTE är connected OCH owner har flaggat blocker → markera blocked_integration.
  if (!fortnox.connected && fortnoxBlockedIntegration) {
    fortnox.status = 'blocked_integration';
    fortnox.blockedIntegration = true;
    fortnox.blockerReason =
      'Fortnox Utvecklarportal returnerar fel — OAuth-flödet kan inte slutföras. CF kör manuell expense-export tills Fortnox-felen är lösta.';
  }
  if (!fortnox.connected) {
    partial.reasons.push(
      fortnox.blockedIntegration ? 'fortnox_blocked_integration' : 'fortnox_not_connected'
    );
  }

  // ── Swish status ───────────────────────────────────────────────
  const swish = { connected: false, status: 'not_connected' };
  if (stores.swishStore?.getPublicStatus) {
    const ss = await safeCall(() => stores.swishStore.getPublicStatus({ tenantId }));
    if (ss) {
      swish.connected = !!ss.connected;
      swish.status = ss.connected ? 'connected' : 'not_connected';
      swish.connectedAt = ss.connectedAt;
    } else issues.push('Swish status kunde inte hämtas');
  } else {
    issues.push('ccoSwishStore saknas');
  }
  if (!swish.connected) partial.reasons.push('swish_not_connected');

  // ── Income / outstanding / paid invoices ───────────────────────
  // Hämta från Commercial-store (om finns) + Fortnox-lister (om wireat)
  const invoiceSummary = {
    totalOutstandingSek: null,
    totalPaidThisMonthSek: null,
    totalPaidPreviousComparablePeriodSek: null,
    totalPaidThisWeekSek: null,
    totalPaidTodaySek: null,
    invoiceCounts: { sent: 0, partially_paid: 0, paid: 0, overdue: 0, drafted: 0 },
    partial: true,
    note: null,
  };

  if (fortnox.connected && stores.fortnoxInvoiceLister) {
    // I MVP 1 hämtar vi inte alla kunders fakturor (det är MVP 3).
    // Istället visar vi commercial-snapshot om finns.
    invoiceSummary.note = 'Fortnox connected — full invoice sync är MVP 3';
  }

  if (stores.commercialStore?.listAll) {
    const cases = (await safeCall(() => stores.commercialStore.listAll(), [])) || [];
    const todayIso = periodStart('today', now);
    const weekIso = periodStart('week', now);
    const monthIso = periodStart('month', now);
    const previousMonthIso = periodStartUtcMonth(now, -1);
    const previousComparableEndIso = previousMonthSameDayEndExclusive(now);
    let outstanding = 0,
      paidToday = 0,
      paidWeek = 0,
      paidMonth = 0,
      paidPreviousComparable = 0;
    for (const c of cases) {
      const invStatus = c.invoiceStatus || c.status;
      const paidAt = c.invoicePaidAt || c.paidAt;
      const total = safeNum(c.totalDueSek || c.priceTotal);
      const paid = safeNum(c.totalPaidSek || (invStatus === 'paid' ? total : 0));
      if (invStatus === 'paid') {
        if (paidAt >= todayIso) paidToday += paid;
        if (paidAt >= weekIso) paidWeek += paid;
        if (paidAt >= monthIso) paidMonth += paid;
        if (paidAt >= previousMonthIso && paidAt < previousComparableEndIso)
          paidPreviousComparable += paid;
        invoiceSummary.invoiceCounts.paid += 1;
      } else if (invStatus === 'partially_paid') {
        outstanding += total - paid;
        invoiceSummary.invoiceCounts.partially_paid += 1;
      } else if (invStatus === 'overdue') {
        outstanding += total;
        invoiceSummary.invoiceCounts.overdue += 1;
      } else if (invStatus === 'invoice_sent' || invStatus === 'sent') {
        outstanding += total;
        invoiceSummary.invoiceCounts.sent += 1;
      } else if (invStatus === 'invoice_drafted' || invStatus === 'drafted') {
        invoiceSummary.invoiceCounts.drafted += 1;
      }
    }
    invoiceSummary.totalOutstandingSek = outstanding;
    invoiceSummary.totalPaidThisMonthSek = paidMonth;
    invoiceSummary.totalPaidPreviousComparablePeriodSek = paidPreviousComparable;
    invoiceSummary.totalPaidThisWeekSek = paidWeek;
    invoiceSummary.totalPaidTodaySek = paidToday;
    invoiceSummary.partial = !fortnox.connected; // bara säker när Fortnox sync är klar
  } else {
    issues.push('Commercial-store saknas eller listAll() ej tillgänglig');
    partial.reasons.push('no_commercial_data');
  }

  // ── Deposits ───────────────────────────────────────────────────
  const depositSummary = { totalDepositsHeldSek: null, depositCount: 0, partial: true };
  if (stores.commercialStore?.listAll) {
    const cases = (await safeCall(() => stores.commercialStore.listAll(), [])) || [];
    let held = 0,
      count = 0;
    for (const c of cases) {
      if (c.depositStatus === 'paid' || c.depositPaid) {
        held += safeNum(c.depositAmountSek);
        count += 1;
      }
    }
    depositSummary.totalDepositsHeldSek = held;
    depositSummary.depositCount = count;
    depositSummary.partial = !fortnox.connected;
  }

  // ── Receipts summary ───────────────────────────────────────────
  let receipts = {
    total: 0,
    needsReviewCount: 0,
    byStatus: {},
    byCategory: {},
    totalAmountSek: 0,
    partial: false,
  };
  if (stores.receiptStore?.summary) {
    const s = stores.receiptStore.summary();
    receipts = { ...receipts, ...s, partial: false };
  } else {
    receipts.partial = true;
    issues.push('cfoReceiptStore ej tillgänglig');
  }

  // ── Expenses summary (CF.3) ────────────────────────────────────
  // Visar månadens utgifter + per kategori + moms-summering + ready-for-export.
  // Fungerar utan Fortnox.
  const monthStart = periodStart('month', now);
  const monthStartDate = monthStart ? monthStart.slice(0, 10) : null;
  let expenses = {
    total: 0,
    unrejectedTotal: 0,
    needsReviewCount: 0,
    byStatus: {},
    byCategory: {},
    byPaymentMethod: {},
    byVatRate: {},
    byFortnoxSyncStatus: {},
    totalAmountSek: 0,
    totalVatSek: 0,
    readyForExportCount: 0,
    readyForExportAmountSek: 0,
    approvedAmountSek: 0,
    exportedAmountSek: 0,
    needsReviewAmountSek: 0,
    fortnoxBlockedCount: 0,
    monthAmountSek: 0,
    monthByCategory: {},
    monthVatSek: 0,
    partial: false,
  };
  if (stores.expenseStore?.summary) {
    const all = stores.expenseStore.summary();
    const month = monthStartDate ? stores.expenseStore.summary({ fromDate: monthStartDate }) : all;
    expenses = {
      ...expenses,
      ...all,
      monthAmountSek: month.totalAmountSek,
      monthByCategory: month.byCategory,
      monthVatSek: month.totalVatSek,
      partial: false,
    };
  } else {
    expenses.partial = true;
    issues.push('cfoExpenseStore ej tillgänglig');
  }

  // ── CF.4: Rules + Suggestions summary ──────────────────────────
  let rules = {
    total: 0,
    active: 0,
    inactive: 0,
    byCategory: {},
    totalApplied: 0,
    totalRejected: 0,
    partial: false,
  };
  if (stores.ruleStore?.summary) {
    const s = stores.ruleStore.summary();
    rules = { ...rules, ...s, partial: false };
  } else {
    rules.partial = true;
  }
  // ── CF.5: Vendor (finance-supplier) summary ───────────────────
  let vendors = {
    total: 0,
    active: 0,
    inactive: 0,
    bySource: {},
    byRiskFlag: {},
    totalMatched: 0,
    totalUsed: 0,
    needsReviewCount: 0,
    partial: false,
  };
  if (stores.vendorStore?.summary) {
    const v = stores.vendorStore.summary();
    vendors = { ...vendors, ...v, partial: false };
  } else {
    vendors.partial = true;
  }
  // ── CF.7: Recurring expense summary ──────────────────────────
  let recurring = {
    total: 0,
    active: 0,
    proposed: 0,
    paused: 0,
    ended: 0,
    byFrequency: {},
    bySource: {},
    estimatedMonthlyLoadSek: 0,
    dueNext30Count: 0,
    dueNext30Sek: 0,
    overdueCount: 0,
    overdueAmountSek: 0,
    unmatchedActiveCount: 0,
    recentlyDetected: 0,
    partial: false,
  };
  if (stores.recurringStore?.summary) {
    const r = stores.recurringStore.summary();
    recurring = { ...recurring, ...r, partial: false };
  } else {
    recurring.partial = true;
  }
  // ── CF.8: Review summary ──────────────────────────────────────
  let review = {
    total: 0,
    byStatus: {},
    pendingCount: 0,
    reviewedCount: 0,
    acceptedCount: 0,
    needsCorrectionCount: 0,
    rejectedCount: 0,
    latestActivityAt: null,
    partial: false,
  };
  if (stores.reviewStore?.summary) {
    const r = stores.reviewStore.summary();
    review = { ...review, ...r, partial: false };
  } else {
    review.partial = true;
  }

  // ── CF.9: Monthly close summary ───────────────────────────────
  let monthlyClose = {
    total: 0,
    byStatus: {},
    closedCount: 0,
    inFlightCount: 0,
    latestActivityAt: null,
    currentPeriod: null,
    currentStatus: 'open',
    blockingItems: [],
    readyForClose: false,
    partial: false,
  };
  if (stores.monthlyCloseStore?.summary) {
    try {
      const m = stores.monthlyCloseStore.summary();
      monthlyClose = { ...monthlyClose, ...m, partial: false };
      // Aktuell månads-status
      const currentPeriodId = nowIso().slice(0, 7);
      monthlyClose.currentPeriod = currentPeriodId;
      const p = stores.monthlyCloseStore.getPeriod?.(currentPeriodId);
      if (p) monthlyClose.currentStatus = p.status;
      if (stores.monthlyCloseStore.evaluateChecklist) {
        const c = stores.monthlyCloseStore.evaluateChecklist({
          periodId: currentPeriodId,
          stores: {
            expenseStore: stores.expenseStore,
            receiptStore: stores.receiptStore,
            recurringStore: stores.recurringStore,
            reviewStore: stores.reviewStore,
          },
        });
        monthlyClose.blockingItems = c.blockingItems;
        monthlyClose.readyForClose = c.readyForClose;
        monthlyClose.checklistPassing = c.passing;
        monthlyClose.checklistTotal = c.totalChecks;
      }
    } catch {
      monthlyClose.partial = true;
    }
  } else {
    monthlyClose.partial = true;
  }

  // Iterera expenses för suggestion-KPI:er + new-supplier-detection.
  let pendingSuggestionsCount = 0;
  let highConfidenceCount = 0;
  let lowConfidenceCount = 0;
  let recurringDetectedCount = 0;
  let linkedSupplierCount = 0;
  // CF.5: ny leverantör = expense har supplier-string men ingen vendor-koppling
  const newSupplierCandidates = new Set();
  if (stores.expenseStore?.listExpenses) {
    const allExpenses = stores.expenseStore.listExpenses({ limit: 1000 });
    for (const e of allExpenses) {
      if (e.suggestion && e.suggestion.bestMatch) {
        pendingSuggestionsCount += 1;
        const conf = Number(e.suggestion.bestMatch.confidence || 0);
        if (conf >= 0.7) highConfidenceCount += 1;
        else if (conf <= 0.3) lowConfidenceCount += 1;
        if (e.suggestion.recurring?.isRecurring) recurringDetectedCount += 1;
      }
      if (e.supplierId) {
        linkedSupplierCount += 1;
      } else if (e.supplier && String(e.supplier).trim()) {
        newSupplierCandidates.add(String(e.supplier).toLowerCase().trim());
      }
    }
  }
  const suggestions = {
    pendingCount: pendingSuggestionsCount,
    highConfidenceCount,
    lowConfidenceCount,
    newSupplierCount: newSupplierCandidates.size,
    recurringDetectedCount,
    linkedSupplierCount,
  };

  // ── Anomalies (lättviktig) ─────────────────────────────────────
  const anomalies = [];
  if (invoiceSummary.invoiceCounts.overdue > 0)
    anomalies.push({
      kind: 'overdue_invoices',
      count: invoiceSummary.invoiceCounts.overdue,
      severity: 'high',
    });
  if (receipts.needsReviewCount > 0)
    anomalies.push({
      kind: 'receipts_need_review',
      count: receipts.needsReviewCount,
      severity: 'medium',
    });
  if (expenses.needsReviewCount > 0)
    anomalies.push({
      kind: 'expenses_need_review',
      count: expenses.needsReviewCount,
      severity: 'medium',
    });
  if (expenses.readyForExportCount > 0)
    anomalies.push({
      kind: 'expenses_ready_for_export',
      count: expenses.readyForExportCount,
      severity: 'low',
    });
  if (suggestions.pendingCount > 0)
    anomalies.push({
      kind: 'expense_suggestions_pending',
      count: suggestions.pendingCount,
      severity: 'medium',
    });
  if (suggestions.newSupplierCount > 0)
    anomalies.push({
      kind: 'new_suppliers_detected',
      count: suggestions.newSupplierCount,
      severity: 'low',
    });
  if (suggestions.recurringDetectedCount > 0)
    anomalies.push({
      kind: 'recurring_expenses_detected',
      count: suggestions.recurringDetectedCount,
      severity: 'low',
    });
  // CF.6: VAT-anomalies
  if ((expenses.vatReviewPendingCount || 0) > 0)
    anomalies.push({
      kind: 'vat_review_pending',
      count: expenses.vatReviewPendingCount,
      severity: 'medium',
    });
  if ((expenses.reverseChargeCount || 0) > 0)
    anomalies.push({
      kind: 'reverse_charge_expenses',
      count: expenses.reverseChargeCount,
      severity: 'low',
    });
  if ((expenses.nonDeductibleCount || 0) > 0)
    anomalies.push({
      kind: 'non_deductible_vat',
      count: expenses.nonDeductibleCount,
      severity: 'low',
    });
  // CF.7: Recurring-anomalies
  if ((recurring.overdueCount || 0) > 0)
    anomalies.push({ kind: 'recurring_overdue', count: recurring.overdueCount, severity: 'high' });
  if ((recurring.dueNext30Count || 0) > 0)
    anomalies.push({ kind: 'recurring_due_30d', count: recurring.dueNext30Count, severity: 'low' });
  if ((recurring.proposed || 0) > 0)
    anomalies.push({
      kind: 'recurring_proposals_pending',
      count: recurring.proposed,
      severity: 'medium',
    });
  if ((recurring.unmatchedActiveCount || 0) > 0)
    anomalies.push({
      kind: 'recurring_never_matched',
      count: recurring.unmatchedActiveCount,
      severity: 'medium',
    });
  // CF.8: Review-anomalies
  if ((review.pendingCount || 0) > 0)
    anomalies.push({ kind: 'review_pending', count: review.pendingCount, severity: 'medium' });
  if ((review.needsCorrectionCount || 0) > 0)
    anomalies.push({
      kind: 'review_needs_correction',
      count: review.needsCorrectionCount,
      severity: 'high',
    });
  if (fortnox.blockedIntegration) {
    anomalies.push({
      kind: 'fortnox_blocked_integration',
      severity: 'high',
      detail: fortnox.blockerReason,
    });
  } else if (!fortnox.connected) {
    anomalies.push({ kind: 'fortnox_not_connected', severity: 'high' });
  }
  if (!swish.connected) anomalies.push({ kind: 'swish_not_connected', severity: 'medium' });

  return {
    schemaVersion: SCHEMA_VERSION,
    builtAt: nowIso(),
    tenantId,
    fortnox,
    swish,
    invoices: invoiceSummary,
    deposits: depositSummary,
    receipts: {
      total: receipts.total,
      needsReviewCount: receipts.needsReviewCount,
      byStatus: receipts.byStatus,
      byCategory: receipts.byCategory,
      bySource: receipts.bySource,
      totalAmountSek: receipts.totalAmountSek,
      partial: receipts.partial,
    },
    expenses: {
      total: expenses.total,
      needsReviewCount: expenses.needsReviewCount,
      byStatus: expenses.byStatus,
      byCategory: expenses.byCategory,
      byPaymentMethod: expenses.byPaymentMethod,
      byVatRate: expenses.byVatRate,
      byFortnoxSyncStatus: expenses.byFortnoxSyncStatus,
      byVatMode: expenses.byVatMode || {}, // CF.6
      totalAmountSek: expenses.totalAmountSek,
      totalVatSek: expenses.totalVatSek,
      totalDeductibleVatSek: expenses.totalDeductibleVatSek || 0, // CF.6
      totalNonDeductibleVatSek: expenses.totalNonDeductibleVatSek || 0, // CF.6
      reverseChargeCount: expenses.reverseChargeCount || 0, // CF.6
      reverseChargeAmountSek: expenses.reverseChargeAmountSek || 0, // CF.6
      nonDeductibleCount: expenses.nonDeductibleCount || 0, // CF.6
      vatReviewPendingCount: expenses.vatReviewPendingCount || 0, // CF.6
      readyForExportCount: expenses.readyForExportCount,
      readyForExportAmountSek: expenses.readyForExportAmountSek,
      approvedAmountSek: expenses.approvedAmountSek,
      exportedAmountSek: expenses.exportedAmountSek,
      needsReviewAmountSek: expenses.needsReviewAmountSek,
      fortnoxBlockedCount: expenses.fortnoxBlockedCount,
      monthAmountSek: expenses.monthAmountSek,
      monthByCategory: expenses.monthByCategory,
      monthVatSek: expenses.monthVatSek,
      partial: expenses.partial,
    },
    rules: {
      total: rules.total,
      active: rules.active,
      inactive: rules.inactive,
      byCategory: rules.byCategory,
      totalApplied: rules.totalApplied,
      totalRejected: rules.totalRejected,
      partial: rules.partial,
    },
    vendors: {
      // CF.5
      total: vendors.total,
      active: vendors.active,
      inactive: vendors.inactive,
      bySource: vendors.bySource,
      byRiskFlag: vendors.byRiskFlag,
      totalMatched: vendors.totalMatched,
      totalUsed: vendors.totalUsed,
      needsReviewCount: vendors.needsReviewCount,
      partial: vendors.partial,
    },
    recurring, // CF.7
    review, // CF.8
    monthlyClose, // CF.9
    suggestions, // CF.4 + CF.5
    anomalies,
    partial: partial.reasons.length > 0,
    partialReasons: partial.reasons,
    issues,
  };
}

module.exports = { buildFinanceDashboard, SCHEMA_VERSION };
