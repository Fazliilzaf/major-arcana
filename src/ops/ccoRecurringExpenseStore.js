/**
 * ccoRecurringExpenseStore — Sprint CF.7 (MVP 6)
 *
 * Återkommande kostnadsmallar (subscriptions, hyror, licenser).
 * Auto-detection från historiska expenses utan AI.
 *
 * Status-machine:
 *   proposed → active → paused → active (resumed)
 *                    ↘
 *                      ended (final)
 *   proposed → ended (avvisat)
 *
 * Audit-kinds:
 *  - cf.recurring.created
 *  - cf.recurring.updated
 *  - cf.recurring.approved   (proposed → active)
 *  - cf.recurring.paused
 *  - cf.recurring.deactivated (ended)
 *  - cf.recurring.detected    (auto-suggestion sparad)
 *  - cf.recurring.matched_expense
 *  - cf.recurring.anomaly_detected
 *
 * Säkerhet:
 *  - Inga AI/OCR-anrop · ingen Fortnox-write · inga bank-CSV-anrop
 *  - Persisteras i data/cco/recurring-expenses.json (gitignored)
 *  - RBAC: owner/finance write · revisor read
 *  - Human approval krävs — auto-detection sätter status='proposed', kräver explicit
 *    approveRecurring för att gå till 'active'
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_FREQUENCIES = Object.freeze([
  'weekly', 'monthly', 'quarterly', 'yearly', 'custom',
]);

const VALID_STATUSES = Object.freeze([
  'proposed', 'active', 'paused', 'ended',
]);

const VALID_SOURCES = Object.freeze([
  'manual',
  'detected_from_expenses',
  'vendor_rule',
]);

const VALID_ANOMALY_KINDS = Object.freeze([
  'recurring_missing_this_period',
  'recurring_amount_changed',
  'recurring_paid_late',
  'recurring_duplicate',
  'recurring_new_supplier_pattern',
  'recurring_needs_review',
]);

const FREQUENCY_DAYS = Object.freeze({
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
});

const FREQUENCY_TOLERANCE_DAYS = Object.freeze({
  weekly: 2,
  monthly: 5,
  quarterly: 10,
  yearly: 20,
});

function nowIso() { return new Date().toISOString(); }
function newId() { return 'rec_' + crypto.randomBytes(8).toString('hex'); }
function lower(s) { return typeof s === 'string' ? s.toLowerCase().trim() : ''; }
function num(n) { return typeof n === 'number' && Number.isFinite(n) ? n : 0; }

/**
 * Beräkna nästa förväntade förfallodatum baserat på lastMatchedAt + frequency.
 * Returnerar ISO-date-string eller null.
 */
function computeNextDueDate({ lastMatchedAt, startDate, frequency, dueDay = null }) {
  const base = lastMatchedAt || startDate;
  if (!base) return null;
  const days = FREQUENCY_DAYS[frequency];
  if (!days && frequency !== 'custom') return null;
  if (!days) return null; // custom kräver explicit nextDueDate
  const t = Date.parse(base);
  if (!Number.isFinite(t)) return null;
  const next = new Date(t + days * 24 * 3600 * 1000);
  if (dueDay && frequency === 'monthly') {
    // snap till specifik dag i månaden (1-31)
    next.setUTCDate(Math.max(1, Math.min(28, Number(dueDay))));
  }
  return next.toISOString().slice(0, 10);
}

/**
 * Pure: matcha en expense mot en recurring-mall.
 * Returnerar { matched, confidence, amountChangeRatio, daysFromExpected, matchType }
 */
function matchExpenseToRecurring(expense, recurring) {
  if (!expense || !recurring) return { matched: false };
  if (recurring.status === 'ended' || recurring.status === 'paused') return { matched: false };
  const expSupplier = lower(expense.supplier);
  const recSupplier = lower(recurring.supplierName);
  // Token-based fuzzy: dela på whitespace + interpunktion, matcha om något 4+ char token är gemensamt
  const tokenize = (s) => String(s || '').toLowerCase().split(/[\s\-_,./]+/).filter((t) => t.length >= 4);
  const expTokens = tokenize(expSupplier);
  const recTokens = tokenize(recSupplier);
  const tokenOverlap = expTokens.some((t) => recTokens.includes(t));
  const supplierMatch =
    (expense.supplierId && recurring.supplierId && expense.supplierId === recurring.supplierId) ||
    (expSupplier && recSupplier && (
      expSupplier === recSupplier ||
      expSupplier.includes(recSupplier) ||
      recSupplier.includes(expSupplier) ||
      tokenOverlap
    ));
  if (!supplierMatch) return { matched: false };

  // Belopp inom 25 % av estimate
  const est = num(recurring.amountEstimate);
  const amt = num(expense.amountSek);
  const amountChangeRatio = est > 0 ? (amt - est) / est : 0;
  if (est > 0 && Math.abs(amountChangeRatio) > 0.25) {
    // Större avvikelse, men registrera ändå som potentiell match med low confidence
    return {
      matched: false,
      confidence: 0.3,
      amountChangeRatio,
      reason: 'amount_deviation',
    };
  }

  // Datum-check
  const expDate = expense.date ? Date.parse(expense.date) : null;
  const expectedDate = recurring.nextDueDate ? Date.parse(recurring.nextDueDate) : null;
  let daysFromExpected = null;
  if (expDate && expectedDate) {
    daysFromExpected = (expDate - expectedDate) / (24 * 3600 * 1000);
  }

  // Confidence: börja högt vid full supplier+amount-match
  let confidence = 0.85;
  if (amountChangeRatio !== 0) confidence -= Math.min(0.20, Math.abs(amountChangeRatio));
  const tolerance = FREQUENCY_TOLERANCE_DAYS[recurring.frequency] || 7;
  // Date-penalty bara om recurring redan har matched-historik (annars är detta första match)
  if (recurring.lastMatchedAt && daysFromExpected !== null && Math.abs(daysFromExpected) > tolerance) {
    confidence = Math.max(0.4, confidence - 0.20);
  }

  return {
    matched: true,
    confidence,
    amountChangeRatio,
    daysFromExpected,
    matchType: recurring.supplierId === expense.supplierId ? 'supplier_id' : 'supplier_name',
  };
}

/**
 * Pure: scanna en expense-historik och föreslå recurring-mallar.
 * Returnerar array av förslag (utan att spara).
 *
 * Algoritm:
 *   - Gruppera per supplier (case-insensitive)
 *   - För grupper med ≥2 expenses:
 *     - Beräkna belopp-spread
 *     - Beräkna interval mellan datum
 *     - Klassificera som weekly/monthly/quarterly/yearly om interval matchar ±tolerance
 *     - Confidence baserad på antal träffar + spread + interval-stabilitet
 *   - Minimum confidence för förslag: 0.40
 */
function detectRecurringFromHistory({ expenses = [], existingRecurrings = [] } = {}) {
  // Gruppera per supplier
  const groups = {};
  for (const e of expenses) {
    const key = lower(e.supplier);
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  const proposals = [];
  for (const [supKey, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    // Skippa om redan existerar recurring för denna supplier
    const existing = existingRecurrings.find((r) => lower(r.supplierName) === supKey && r.status !== 'ended');
    if (existing) continue;

    // Sortera på datum
    const dated = group
      .filter((e) => e.date)
      .map((e) => ({ ...e, _ts: Date.parse(e.date) }))
      .filter((e) => Number.isFinite(e._ts))
      .sort((a, b) => a._ts - b._ts);
    if (dated.length < 2) continue;

    // Beräkna intervall
    const intervals = [];
    for (let i = 1; i < dated.length; i += 1) {
      intervals.push((dated[i]._ts - dated[i - 1]._ts) / (24 * 3600 * 1000));
    }
    const avgInterval = intervals.reduce((s, n) => s + n, 0) / intervals.length;
    const intervalVariance = intervals.reduce((s, n) => s + Math.abs(n - avgInterval), 0) / intervals.length;

    // Klassificera
    let frequency = null;
    let intervalConfidence = 0;
    if (avgInterval >= 5 && avgInterval <= 9) { frequency = 'weekly'; intervalConfidence = 0.7; }
    else if (avgInterval >= 25 && avgInterval <= 35) { frequency = 'monthly'; intervalConfidence = 0.8; }
    else if (avgInterval >= 82 && avgInterval <= 100) { frequency = 'quarterly'; intervalConfidence = 0.75; }
    else if (avgInterval >= 340 && avgInterval <= 390) { frequency = 'yearly'; intervalConfidence = 0.7; }
    else continue; // matchar ingen standard-frequency

    // Variance-justering
    const tolerance = FREQUENCY_TOLERANCE_DAYS[frequency];
    if (intervalVariance > tolerance) intervalConfidence -= 0.20;

    // Belopp-spread
    const amounts = dated.map((e) => num(e.amountSek)).filter((a) => a > 0);
    const avgAmount = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    const maxDev = amounts.reduce((m, a) => Math.max(m, Math.abs(a - avgAmount) / avgAmount), 0);
    if (maxDev > 0.30) intervalConfidence -= 0.15;

    // Bonus för fler träffar
    if (dated.length >= 3) intervalConfidence += 0.10;
    if (dated.length >= 6) intervalConfidence += 0.05;

    const confidence = Math.max(0, Math.min(1, intervalConfidence));
    if (confidence < 0.40) continue;

    // Plocka category/vatMode/paymentMethod från senaste expense
    const latest = dated[dated.length - 1];

    proposals.push({
      supplierName: latest.supplier,
      supplierId: latest.supplierId || null,
      category: latest.category || null,
      vatMode: latest.vatMode || null,
      paymentMethod: latest.paymentMethod || null,
      amountEstimate: round2(avgAmount),
      frequency,
      startDate: dated[0].date,
      lastSeenDate: latest.date,
      nextDueDate: computeNextDueDate({
        lastMatchedAt: latest.date,
        frequency,
      }),
      linkedExpenseIds: dated.map((e) => e.id),
      confidence,
      detection: {
        avgInterval: round2(avgInterval),
        intervalVariance: round2(intervalVariance),
        avgAmount: round2(avgAmount),
        maxAmountDeviation: round2(maxDev),
        sampleCount: dated.length,
        intervalConfidence: round2(intervalConfidence),
      },
    });
  }
  return proposals.sort((a, b) => b.confidence - a.confidence);
}

function round2(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Pure: detektera anomalies för en recurring + nyligen matched expense.
 * Returnerar array av { kind, severity, detail }.
 */
function detectAnomalies({ recurring, matchedExpense = null, recentExpenses = [], today = null } = {}) {
  const out = [];
  const nowTs = today ? Date.parse(today) : Date.now();

  // 1. Belopp avviker > 20 % från estimate
  if (matchedExpense && recurring.amountEstimate > 0) {
    const dev = (num(matchedExpense.amountSek) - recurring.amountEstimate) / recurring.amountEstimate;
    if (Math.abs(dev) > 0.20) {
      out.push({
        kind: 'recurring_amount_changed',
        severity: Math.abs(dev) > 0.50 ? 'high' : 'medium',
        detail: {
          expectedSek: recurring.amountEstimate,
          actualSek: matchedExpense.amountSek,
          changeRatio: round2(dev),
        },
      });
    }
  }

  // 2. Sen betalning
  if (matchedExpense && recurring.nextDueDate && matchedExpense.date) {
    const diff = (Date.parse(matchedExpense.date) - Date.parse(recurring.nextDueDate)) / (24 * 3600 * 1000);
    const tolerance = FREQUENCY_TOLERANCE_DAYS[recurring.frequency] || 7;
    if (diff > tolerance) {
      out.push({
        kind: 'recurring_paid_late',
        severity: 'medium',
        detail: { daysLate: round2(diff), tolerance },
      });
    }
  }

  // 3. Missad period — nextDueDate passerat utan match (kollas av cron eller dashboard)
  if (!matchedExpense && recurring.status === 'active' && recurring.nextDueDate) {
    const due = Date.parse(recurring.nextDueDate);
    const tolerance = (FREQUENCY_TOLERANCE_DAYS[recurring.frequency] || 7) * 24 * 3600 * 1000;
    if (nowTs - due > tolerance) {
      out.push({
        kind: 'recurring_missing_this_period',
        severity: 'high',
        detail: {
          expectedDate: recurring.nextDueDate,
          daysOverdue: round2((nowTs - due) / (24 * 3600 * 1000)),
        },
      });
    }
  }

  // 4. Dubblett — flera expenses inom samma period
  if (matchedExpense && Array.isArray(recentExpenses)) {
    const periodMs = (FREQUENCY_DAYS[recurring.frequency] || 30) * 24 * 3600 * 1000;
    const dupes = recentExpenses.filter((e) =>
      e.id !== matchedExpense.id &&
      lower(e.supplier) === lower(recurring.supplierName) &&
      e.date && matchedExpense.date &&
      Math.abs(Date.parse(e.date) - Date.parse(matchedExpense.date)) < periodMs * 0.5
    );
    if (dupes.length > 0) {
      out.push({
        kind: 'recurring_duplicate',
        severity: 'medium',
        detail: { duplicateCount: dupes.length, duplicateIds: dupes.map((e) => e.id) },
      });
    }
  }

  return out;
}

// ─── Store ─────────────────────────────────────────────────────

async function createCcoRecurringExpenseStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    recurrings: [],
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.schemaVersion = parsed.schemaVersion || SCHEMA_VERSION;
        data.createdAt = parsed.createdAt || data.createdAt;
        data.updatedAt = parsed.updatedAt || data.updatedAt;
        data.recurrings = Array.isArray(parsed.recurrings) ? parsed.recurrings : [];
      }
    }
  } catch (err) {
    console.warn('[ccoRecurringExpenseStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(action, detail) {
    try {
      auditLog?.append?.({
        action, kind: action,
        surface: 'cco.cf.recurring',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'recurring', id: detail?.recurringId },
        detail,
      });
    } catch {}
  }

  function validateInput(input) {
    if (!input?.supplierName) throw new Error('supplierName krävs');
    if (input.frequency && !VALID_FREQUENCIES.includes(input.frequency)) {
      throw new Error(`Okänd frequency: ${input.frequency}`);
    }
    if (input.source && !VALID_SOURCES.includes(input.source)) {
      throw new Error(`Okänd source: ${input.source}`);
    }
    if (input.status && !VALID_STATUSES.includes(input.status)) {
      throw new Error(`Okänd status: ${input.status}`);
    }
  }

  async function createRecurring({ actor, input = {} } = {}) {
    validateInput(input);
    const id = newId();
    const frequency = input.frequency || 'monthly';
    const r = {
      id,
      supplierName: String(input.supplierName).slice(0, 200),
      supplierId: input.supplierId || null,
      category: input.category || null,
      vatMode: input.vatMode || null,
      amountEstimate: typeof input.amountEstimate === 'number' ? input.amountEstimate : 0,
      paymentMethod: input.paymentMethod || null,
      frequency,
      dueDay: input.dueDay || null,
      startDate: input.startDate || nowIso().slice(0, 10),
      endDate: input.endDate || null,
      status: input.status || 'proposed',
      source: input.source || 'manual',
      confidence: typeof input.confidence === 'number' ? input.confidence : (input.source === 'manual' ? 1.0 : 0.5),
      notes: String(input.notes || '').slice(0, 1000),
      linkedExpenseIds: Array.isArray(input.linkedExpenseIds) ? [...input.linkedExpenseIds] : [],
      lastMatchedAt: input.lastMatchedAt || null,
      lastMatchedExpenseId: null,
      nextDueDate: input.nextDueDate || computeNextDueDate({
        lastMatchedAt: input.lastMatchedAt || null,
        startDate: input.startDate || nowIso().slice(0, 10),
        frequency,
        dueDay: input.dueDay,
      }),
      detection: input.detection || null, // metadata från auto-detection
      anomalies: [],
      stats: { matchedCount: 0, totalAmountPaidSek: 0 },
      createdAt: nowIso(),
      createdBy: actor || null,
      updatedAt: nowIso(),
      history: [{ at: nowIso(), action: 'created', by: actor, status: input.status || 'proposed' }],
    };
    data.recurrings.push(r);
    await persist();
    audit('cf.recurring.created', { recurringId: id, supplierName: r.supplierName, source: r.source, actor });
    if (r.source === 'detected_from_expenses') {
      audit('cf.recurring.detected', { recurringId: id, confidence: r.confidence, actor });
    }
    return { ...r };
  }

  async function updateRecurring({ id, patch = {}, actor } = {}) {
    const r = data.recurrings.find((x) => x.id === id);
    if (!r) throw new Error('recurring finns ej');
    if (patch.frequency && !VALID_FREQUENCIES.includes(patch.frequency)) {
      throw new Error(`Okänd frequency: ${patch.frequency}`);
    }
    const allowed = ['supplierName', 'supplierId', 'category', 'vatMode', 'amountEstimate',
      'paymentMethod', 'frequency', 'dueDay', 'startDate', 'endDate', 'notes', 'nextDueDate'];
    const changed = [];
    for (const k of allowed) if (k in patch) { r[k] = patch[k]; changed.push(k); }
    r.updatedAt = nowIso();
    await persist();
    audit('cf.recurring.updated', { recurringId: id, fields: changed, actor });
    return { ...r };
  }

  async function transitionStatus({ id, newStatus, reason, actor } = {}) {
    if (!VALID_STATUSES.includes(newStatus)) throw new Error(`Okänd status: ${newStatus}`);
    const r = data.recurrings.find((x) => x.id === id);
    if (!r) throw new Error('recurring finns ej');
    const oldStatus = r.status;
    r.status = newStatus;
    r.updatedAt = nowIso();
    r.history.push({ at: nowIso(), action: 'status_changed', by: actor, oldStatus, newStatus, reason: reason || null });
    await persist();
    if (newStatus === 'active' && oldStatus !== 'active') audit('cf.recurring.approved', { recurringId: id, oldStatus, actor });
    else if (newStatus === 'paused') audit('cf.recurring.paused', { recurringId: id, oldStatus, reason, actor });
    else if (newStatus === 'ended') audit('cf.recurring.deactivated', { recurringId: id, oldStatus, reason, actor });
    else audit('cf.recurring.updated', { recurringId: id, oldStatus, newStatus, actor });
    return { ...r };
  }

  async function recordExpenseMatch({ id, expense, actor } = {}) {
    const r = data.recurrings.find((x) => x.id === id);
    if (!r) throw new Error('recurring finns ej');
    r.lastMatchedAt = expense?.date || nowIso().slice(0, 10);
    r.lastMatchedExpenseId = expense?.id || null;
    r.linkedExpenseIds = [...(r.linkedExpenseIds || []), expense.id].slice(-200);
    r.stats = r.stats || { matchedCount: 0, totalAmountPaidSek: 0 };
    r.stats.matchedCount += 1;
    r.stats.totalAmountPaidSek += num(expense.amountSek);
    // Beräkna nästa förfallodatum baserat på den faktiska match-tiden
    r.nextDueDate = computeNextDueDate({
      lastMatchedAt: r.lastMatchedAt,
      startDate: r.startDate,
      frequency: r.frequency,
      dueDay: r.dueDay,
    });
    r.updatedAt = nowIso();
    await persist();
    audit('cf.recurring.matched_expense', {
      recurringId: id, expenseId: expense.id, amountSek: expense.amountSek, actor,
    });
    return { ...r };
  }

  async function recordAnomaly({ id, anomaly, actor } = {}) {
    if (!anomaly?.kind || !VALID_ANOMALY_KINDS.includes(anomaly.kind)) {
      throw new Error(`Okänd anomaly.kind: ${anomaly?.kind}`);
    }
    const r = data.recurrings.find((x) => x.id === id);
    if (!r) throw new Error('recurring finns ej');
    r.anomalies = r.anomalies || [];
    const entry = { ...anomaly, detectedAt: nowIso() };
    r.anomalies.push(entry);
    // Behåll bara senaste 20 för storlek
    r.anomalies = r.anomalies.slice(-20);
    r.updatedAt = nowIso();
    await persist();
    audit('cf.recurring.anomaly_detected', { recurringId: id, kind: anomaly.kind, severity: anomaly.severity, actor });
    return { ...r };
  }

  function getById(id) { return data.recurrings.find((r) => r.id === id) || null; }

  function listRecurrings({ status, supplierId, frequency, source, dueBefore, limit = 200 } = {}) {
    let list = [...data.recurrings];
    if (status) list = list.filter((r) => r.status === status);
    if (supplierId) list = list.filter((r) => r.supplierId === supplierId);
    if (frequency) list = list.filter((r) => r.frequency === frequency);
    if (source) list = list.filter((r) => r.source === source);
    if (dueBefore) list = list.filter((r) => r.nextDueDate && r.nextDueDate <= dueBefore);
    list.sort((a, b) => String(a.nextDueDate || '').localeCompare(String(b.nextDueDate || '')));
    return list.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  /**
   * Försök matcha en expense mot alla aktiva recurrings.
   * Returnerar bästa match eller null.
   */
  function findMatchingRecurring(expense) {
    let best = null;
    for (const r of data.recurrings) {
      if (r.status !== 'active') continue;
      const m = matchExpenseToRecurring(expense, r);
      if (m.matched && (!best || m.confidence > best.confidence)) {
        best = { recurring: r, ...m };
      }
    }
    return best;
  }

  function summary({ now = null } = {}) {
    const today = now || new Date().toISOString().slice(0, 10);
    const today30 = new Date(Date.parse(today) + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    let total = 0, active = 0, proposed = 0, paused = 0, ended = 0;
    const byFrequency = {};
    const bySource = {};
    let estimatedMonthlyLoadSek = 0;
    let dueNext30Sek = 0;
    let dueNext30Count = 0;
    let overdueCount = 0;
    let overdueAmountSek = 0;
    let unmatchedActiveCount = 0;
    let recentlyDetected = 0;

    for (const r of data.recurrings) {
      total += 1;
      if (r.status === 'active') active += 1;
      else if (r.status === 'proposed') proposed += 1;
      else if (r.status === 'paused') paused += 1;
      else if (r.status === 'ended') ended += 1;
      byFrequency[r.frequency] = (byFrequency[r.frequency] || 0) + 1;
      bySource[r.source] = (bySource[r.source] || 0) + 1;

      if (r.status === 'active') {
        // Skala till månads-load
        const days = FREQUENCY_DAYS[r.frequency] || 30;
        const monthlyEquiv = (r.amountEstimate || 0) * (30 / days);
        estimatedMonthlyLoadSek += monthlyEquiv;

        if (r.nextDueDate && r.nextDueDate >= today && r.nextDueDate <= today30) {
          dueNext30Count += 1;
          dueNext30Sek += r.amountEstimate || 0;
        }
        if (r.nextDueDate && r.nextDueDate < today) {
          overdueCount += 1;
          overdueAmountSek += r.amountEstimate || 0;
        }
        if (!r.lastMatchedAt) unmatchedActiveCount += 1;
      }
      if (r.source === 'detected_from_expenses' && r.status === 'proposed') recentlyDetected += 1;
    }

    return {
      total, active, proposed, paused, ended,
      byFrequency, bySource,
      estimatedMonthlyLoadSek: round2(estimatedMonthlyLoadSek),
      dueNext30Count, dueNext30Sek: round2(dueNext30Sek),
      overdueCount, overdueAmountSek: round2(overdueAmountSek),
      unmatchedActiveCount,
      recentlyDetected,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_FREQUENCIES, VALID_STATUSES, VALID_SOURCES, VALID_ANOMALY_KINDS,
    FREQUENCY_DAYS, FREQUENCY_TOLERANCE_DAYS,
    createRecurring, updateRecurring, transitionStatus,
    recordExpenseMatch, recordAnomaly,
    listRecurrings, getById, findMatchingRecurring,
    summary,
    // engine
    matchExpenseToRecurring, detectRecurringFromHistory, detectAnomalies,
    computeNextDueDate,
  };
}

module.exports = {
  createCcoRecurringExpenseStore,
  matchExpenseToRecurring,
  detectRecurringFromHistory,
  detectAnomalies,
  computeNextDueDate,
  VALID_FREQUENCIES,
  VALID_STATUSES,
  VALID_SOURCES,
  VALID_ANOMALY_KINDS,
  FREQUENCY_DAYS,
  FREQUENCY_TOLERANCE_DAYS,
  SCHEMA_VERSION,
};
