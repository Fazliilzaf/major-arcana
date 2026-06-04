/**
 * ccoFinanceMonthlyCloseStore — Sprint CF.9 (MVP 8)
 *
 * Månadsstängning per period (YYYY-MM). Period-state-machine + checklist.
 *
 * Status-machine:
 *   open → preparing → ready_for_review → in_review → corrections_needed → approved → closed
 *                                                                                       ↓
 *                                                                                   reopened (→ open)
 *
 * RBAC (caller passar in actor.role och vi enforcar):
 *   - finance        : startClose, readyForReview
 *   - revisor        : requestCorrection, approve
 *   - owner+revisor  : close
 *   - owner only     : reopen (kräver reason)
 *   - any            : getPeriod, listPeriods, evaluateChecklist
 *
 * Audit-kinds:
 *   - cf.period.started_close
 *   - cf.period.ready_for_review
 *   - cf.period.correction_requested
 *   - cf.period.approved
 *   - cf.period.closed
 *   - cf.period.reopened
 *
 * Period-locking:
 *   isPeriodLocked(periodId) → boolean. Används av server.js för att blockera
 *   mutationer på expenses vars `date` faller i en stängd period.
 *
 * Säkerhet:
 *  - File-baserad persistens (data/cco/, gitignored)
 *  - Inga side-effects utöver disk-write + audit
 *  - Pure validation av state transitions
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_STATUSES = Object.freeze([
  'open',
  'preparing',
  'ready_for_review',
  'in_review',
  'corrections_needed',
  'approved',
  'closed',
]);

// reopened representeras som 'open' efter reopen, men vi loggar transition i history

const TRANSITIONS = Object.freeze({
  open: ['preparing'],
  preparing: ['ready_for_review', 'open'],
  ready_for_review: ['in_review', 'preparing'],
  in_review: ['corrections_needed', 'approved'],
  corrections_needed: ['preparing'],
  approved: ['closed'],
  closed: ['open'], // reopen
});

const ROLE_OWNER = 'owner';
const ROLE_FINANCE = 'finance';
const ROLE_REVISOR = 'revisor';

function nowIso() { return new Date().toISOString(); }
function newId() { return 'period_' + crypto.randomBytes(6).toString('hex'); }

function isValidPeriodId(p) {
  const s = String(p || '');
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

function isWithinPeriod(dateStr, periodId) {
  if (!isValidPeriodId(periodId)) return false;
  const d = String(dateStr || '').slice(0, 7);
  return d === periodId;
}

function emptyChecklist() {
  return {
    receiptsAllProcessed: { pass: false, label: 'Alla kvitton är categorized/approved/exported', count: 0 },
    expensesAllCategorized: { pass: false, label: 'Alla expenses har kategori', count: 0 },
    vatAllReviewed: { pass: false, label: 'Alla momsfält är granskade', count: 0 },
    noExpensesNeedsReview: { pass: false, label: 'Inga expenses i needs_review', count: 0 },
    recurringChecked: { pass: false, label: 'Återkommande kostnader kontrollerade', count: 0 },
    exportPackageCreated: { pass: false, label: 'Exportpaket skapat', count: 0 },
    reviewerAccepted: { pass: false, label: 'Revisor-review accepterad', count: 0 },
    fortnoxStatus: { pass: true, label: 'Fortnox: BLOCKED_INTEGRATION (informativ)', count: 0 },
  };
}

async function createCcoFinanceMonthlyCloseStore({
  filePath = path.join(process.cwd(), 'data', 'cco', 'finance-monthly-close.json'),
  auditLog = null,
} = {}) {
  let data = { schemaVersion: SCHEMA_VERSION, periods: [] };

  async function load() {
    try {
      const raw = await fs.promises.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.periods)) {
        data = parsed;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn('[ccoFinanceMonthlyCloseStore] load:', err.message);
    }
  }

  async function persist() {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[ccoFinanceMonthlyCloseStore] persist:', err.message);
      throw err;
    }
  }

  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        action: kind, kind,
        surface: 'cco.cf.period',
        ts: nowIso(),
        detail,
      });
    } catch {}
  }

  await load();

  // ---------- read ----------

  function getOrInitPeriod(periodId) {
    if (!isValidPeriodId(periodId)) throw new Error(`Ogiltig periodId: ${periodId}. Förväntat YYYY-MM.`);
    let p = data.periods.find((x) => x.periodId === periodId);
    if (!p) {
      p = {
        id: newId(),
        periodId,
        status: 'open',
        createdAt: nowIso(),
        updatedAt: nowIso(),
        startedBy: null,
        approvedBy: null,
        closedBy: null,
        reopenReason: null,
        reopenCount: 0,
        correctionReasons: [],
        history: [{ status: 'open', at: nowIso(), by: null }],
      };
      data.periods.push(p);
    }
    return p;
  }

  function getPeriod(periodId) {
    const p = data.periods.find((x) => x.periodId === periodId);
    return p ? { ...p, history: [...(p.history || [])] } : null;
  }

  function listPeriods({ status, limit = 60 } = {}) {
    let list = [...data.periods];
    if (status) list = list.filter((p) => p.status === status);
    list.sort((a, b) => String(b.periodId).localeCompare(String(a.periodId)));
    return list.slice(0, Math.max(1, Math.min(500, limit)));
  }

  function isPeriodLocked(periodId) {
    const p = data.periods.find((x) => x.periodId === periodId);
    return Boolean(p && p.status === 'closed');
  }

  function isDateInLockedPeriod(dateStr) {
    const periodId = String(dateStr || '').slice(0, 7);
    return isPeriodLocked(periodId);
  }

  function summary() {
    const byStatus = {};
    let total = 0;
    let closedCount = 0;
    let inFlightCount = 0;
    let latestActivityAt = null;
    for (const p of data.periods) {
      total += 1;
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
      if (p.status === 'closed') closedCount += 1;
      else if (p.status !== 'open') inFlightCount += 1;
      if (!latestActivityAt || p.updatedAt > latestActivityAt) latestActivityAt = p.updatedAt;
    }
    return { total, byStatus, closedCount, inFlightCount, latestActivityAt };
  }

  // ---------- checklist ----------

  /**
   * Evaluerar checklist mot period. Behöver passas in store-handles för att
   * läsa expenses/receipts/recurrings/exportBatches/reviews. Pure funktion
   * — modifierar inte state, returnerar bara checklist-objekt.
   */
  function evaluateChecklist({ periodId, stores = {} } = {}) {
    if (!isValidPeriodId(periodId)) throw new Error(`Ogiltig periodId: ${periodId}.`);

    const checklist = emptyChecklist();
    const fromDate = `${periodId}-01`;
    // toDate beräknas som första dagen nästa månad minus 1
    const [y, m] = periodId.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    // Expenses i perioden
    const expenses = (stores.expenseStore?.listExpenses?.({ fromDate, toDate: last, limit: 5000 }) || [])
      .filter((e) => e && e.status !== 'rejected');

    // 1. Alla expenses kategoriserade
    const missingCategory = expenses.filter((e) => !e.category);
    checklist.expensesAllCategorized.pass = missingCategory.length === 0 && expenses.length > 0;
    checklist.expensesAllCategorized.count = missingCategory.length;

    // 2. Inga needs_review eller new
    const needsReview = expenses.filter((e) => e.status === 'new' || e.status === 'needs_review');
    checklist.noExpensesNeedsReview.pass = needsReview.length === 0;
    checklist.noExpensesNeedsReview.count = needsReview.length;

    // 3. VAT-fält granskade
    const vatPending = expenses.filter((e) => e.vatReviewStatus === 'pending');
    checklist.vatAllReviewed.pass = vatPending.length === 0;
    checklist.vatAllReviewed.count = vatPending.length;

    // 4. Receipts processade
    let receipts = [];
    try {
      receipts = (stores.receiptStore?.listReceipts?.({ limit: 5000 }) || []).filter((r) => {
        if (!r) return false;
        const d = (r.receiptDate || r.uploadedAt || '').slice(0, 10);
        return d >= fromDate && d <= last;
      });
    } catch {}
    const receiptsUnprocessed = receipts.filter((r) => r.status === 'new' || r.status === 'needs_review');
    checklist.receiptsAllProcessed.pass = receipts.length === 0 || receiptsUnprocessed.length === 0;
    checklist.receiptsAllProcessed.count = receiptsUnprocessed.length;

    // 5. Recurring kontrollerade — inga active utan lastMatchedAt om de förfallit
    let recurrings = [];
    try {
      recurrings = stores.recurringStore?.listRecurrings?.({ status: 'active', limit: 1000 }) || [];
    } catch {}
    const today = new Date().toISOString().slice(0, 10);
    const overdueOrUnmatched = recurrings.filter((r) => {
      if (!r) return false;
      const dueInPeriod = r.nextDueDate && r.nextDueDate >= fromDate && r.nextDueDate <= last;
      if (!dueInPeriod) return false;
      // Saknar match-bekräftelse efter period
      return !r.lastMatchedAt || r.lastMatchedAt < fromDate;
    });
    checklist.recurringChecked.pass = overdueOrUnmatched.length === 0;
    checklist.recurringChecked.count = overdueOrUnmatched.length;

    // 6. Exportpaket skapat
    let batches = [];
    try {
      batches = stores.expenseStore?.listExportBatches?.({ limit: 200 }) || [];
    } catch {}
    const batchesInPeriod = batches.filter((b) => {
      const d = String(b.exportedAt || '').slice(0, 10);
      return d >= fromDate && d <= last;
    });
    checklist.exportPackageCreated.pass = batchesInPeriod.length > 0;
    checklist.exportPackageCreated.count = batchesInPeriod.length;

    // 7. Revisor accepterat någon batch i perioden
    let reviews = [];
    try {
      reviews = stores.reviewStore?.listReviews?.({ limit: 1000 }) || [];
    } catch {}
    const acceptedReviews = reviews.filter((rv) => {
      if (rv.status !== 'accepted_for_bookkeeping') return false;
      const batch = batchesInPeriod.find((b) => b.batchId === rv.batchId);
      return Boolean(batch);
    });
    checklist.reviewerAccepted.pass = acceptedReviews.length > 0;
    checklist.reviewerAccepted.count = acceptedReviews.length;

    // 8. Fortnox status — always informational pass=true
    checklist.fortnoxStatus.pass = true;
    checklist.fortnoxStatus.count = 0;

    const totalChecks = Object.keys(checklist).length;
    const passing = Object.values(checklist).filter((c) => c.pass).length;
    const blockingItems = Object.entries(checklist)
      .filter(([k, v]) => !v.pass && k !== 'fortnoxStatus')
      .map(([k]) => k);

    return {
      periodId,
      checklist,
      totalChecks,
      passing,
      blockingItems,
      readyForClose: blockingItems.length === 0,
    };
  }

  // ---------- transitions ----------

  function canTransition(from, to) {
    return TRANSITIONS[from]?.includes(to) || false;
  }

  function ensureRole(actor, allowed) {
    const role = String(actor?.role || '').toLowerCase();
    if (!allowed.includes(role)) {
      const err = new Error(`Du saknar behörighet för denna åtgärd. Krävs: ${allowed.join('/')}`);
      err.statusCode = 403;
      throw err;
    }
  }

  async function transition({ periodId, to, actor, detail = {} } = {}) {
    const p = getOrInitPeriod(periodId);
    if (!canTransition(p.status, to)) {
      throw new Error(`Otillåten transition: ${p.status} → ${to}. Tillåtna från ${p.status}: ${TRANSITIONS[p.status]?.join(', ') || '(inga)'}`);
    }
    const from = p.status;
    p.status = to;
    p.updatedAt = nowIso();
    p.history.push({ status: to, from, at: nowIso(), by: actor || null, detail });
    return p;
  }

  async function startClose({ periodId, actor } = {}) {
    ensureRole(actor, [ROLE_OWNER, ROLE_FINANCE]);
    const p = await transition({ periodId, to: 'preparing', actor });
    p.startedBy = actor || null;
    await persist();
    audit('cf.period.started_close', { periodId, actor });
    return { ...p };
  }

  async function markReadyForReview({ periodId, actor } = {}) {
    ensureRole(actor, [ROLE_OWNER, ROLE_FINANCE]);
    const p = await transition({ periodId, to: 'ready_for_review', actor });
    await persist();
    audit('cf.period.ready_for_review', { periodId, actor });
    return { ...p };
  }

  async function beginReview({ periodId, actor } = {}) {
    // revisor (eller owner) börjar review — auto-transition från ready_for_review → in_review
    ensureRole(actor, [ROLE_OWNER, ROLE_REVISOR]);
    const p = getOrInitPeriod(periodId);
    if (p.status === 'ready_for_review') {
      const updated = await transition({ periodId, to: 'in_review', actor });
      await persist();
      return { ...updated };
    }
    return { ...p };
  }

  async function requestCorrection({ periodId, actor, reason } = {}) {
    ensureRole(actor, [ROLE_OWNER, ROLE_REVISOR]);
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new Error('reason krävs vid request_correction.');
    const p = getOrInitPeriod(periodId);
    // Auto-flytta från ready_for_review till in_review innan correction
    if (p.status === 'ready_for_review') {
      await transition({ periodId, to: 'in_review', actor });
    }
    const updated = await transition({ periodId, to: 'corrections_needed', actor, detail: { reason: trimmedReason } });
    updated.correctionReasons.push({ reason: trimmedReason, at: nowIso(), by: actor });
    await persist();
    audit('cf.period.correction_requested', { periodId, actor, reason: trimmedReason });
    return { ...updated };
  }

  async function approve({ periodId, actor } = {}) {
    ensureRole(actor, [ROLE_OWNER, ROLE_REVISOR]);
    const p = getOrInitPeriod(periodId);
    if (p.status === 'ready_for_review') {
      await transition({ periodId, to: 'in_review', actor });
    }
    const updated = await transition({ periodId, to: 'approved', actor });
    updated.approvedBy = actor || null;
    await persist();
    audit('cf.period.approved', { periodId, actor });
    return { ...updated };
  }

  async function close({ periodId, actor } = {}) {
    ensureRole(actor, [ROLE_OWNER, ROLE_REVISOR]);
    const updated = await transition({ periodId, to: 'closed', actor });
    updated.closedBy = actor || null;
    await persist();
    audit('cf.period.closed', { periodId, actor });
    return { ...updated };
  }

  async function reopen({ periodId, actor, reason } = {}) {
    ensureRole(actor, [ROLE_OWNER]); // OWNER ONLY
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new Error('reason krävs vid reopen.');
    const p = getOrInitPeriod(periodId);
    if (p.status !== 'closed') {
      throw new Error(`Endast closed perioder kan reopens. Aktuell status: ${p.status}`);
    }
    const updated = await transition({ periodId, to: 'open', actor, detail: { reason: trimmedReason, reopen: true } });
    updated.reopenReason = trimmedReason;
    updated.reopenCount = (updated.reopenCount || 0) + 1;
    await persist();
    audit('cf.period.reopened', { periodId, actor, reason: trimmedReason });
    return { ...updated };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_STATUSES, TRANSITIONS,
    // read
    getOrInitPeriod, getPeriod, listPeriods, summary,
    isPeriodLocked, isDateInLockedPeriod,
    evaluateChecklist,
    // transitions
    startClose, markReadyForReview, beginReview,
    requestCorrection, approve, close, reopen,
    // pure helpers
    canTransition, isValidPeriodId, isWithinPeriod,
  };
}

module.exports = {
  createCcoFinanceMonthlyCloseStore,
  VALID_STATUSES,
  TRANSITIONS,
  SCHEMA_VERSION,
  isValidPeriodId,
  isWithinPeriod,
};
