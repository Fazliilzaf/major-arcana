/**
 * cfoExpenseStore — Sprint CF.3 (MVP 2)
 *
 * Expense-store för Chief of Finance. Fungerar UTAN Fortnox-write — alla
 * expenses kan registreras, kategoriseras, godkännas och exporteras manuellt
 * (CSV/JSON via cfoExpenseExporter) tills Fortnox OAuth-blockern är löst.
 *
 * Status-machine:
 *   new → needs_review → categorized → approved → ready_for_export → exported
 *                                                                  ↓
 *                                                              rejected
 *
 * Audit-kinds (alla mutationer):
 *  - cf.expense.created
 *  - cf.expense.updated
 *  - cf.expense.categorized
 *  - cf.expense.approved
 *  - cf.expense.ready_for_export
 *  - cf.expense.rejected
 *  - cf.expense.exported
 *
 * Fortnox-hook-fält (BLOCKED_INTEGRATION just nu, inga writes):
 *  - fortnoxSyncStatus: 'blocked_integration' | 'pending' | 'synced' | 'error'
 *  - fortnoxVoucherId:  null (sätts av framtida sync)
 *  - fortnoxExportPending: true (markerar att den vill bli synkad)
 *
 * Säkerhet:
 *  - Inga expense-fält i repo (JSON ligger i data/cco/ — gitignored)
 *  - Bilagor lagras via secureStorage (key: expenses/YYYY-MM/<sha8>-<uuid>.<ext>)
 *  - SHA256-checksum på bilagor
 *  - Audit på alla mutationer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_STATUSES = Object.freeze([
  'new',
  'needs_review',
  'categorized',
  'approved',
  'ready_for_export',
  'exported',
  'rejected',
]);

// Återanvänd kategorierna från cfoReceiptStore för konsekvent rapportering.
const VALID_CATEGORIES = Object.freeze([
  'utrustning',
  'forbrukning',
  'lokal',
  'personal',
  'utbildning',
  'resor',
  'mat_representation',
  'marknadsforing',
  'administrativ',
  'it_telefoni',
  'forsakring',
  'juridik_konsult',
  'bank_finansiell',
  'skatter_avgifter',
  'annat',
]);

const VALID_PAYMENT_METHODS = Object.freeze([
  'card',                 // Företagskort / kort
  'swish',                // Swish Företag
  'bank_transfer',        // Manuell banköverföring
  'invoice',              // Leverantörsfaktura (betalas senare)
  'cash',                 // Kontant
  'autogiro',             // Autogiro
  'direct_debit',         // Direktdebitering
  'other',                // Annat / okänt
]);

// Vanliga svenska momssatser. 'reverse_charge' = omvänd skatteskyldighet (EU/utomlands).
const VALID_VAT_RATES = Object.freeze([0, 6, 12, 25, 'reverse_charge']);

const VALID_FORTNOX_SYNC_STATUSES = Object.freeze([
  'blocked_integration', // OAuth-blocker — Fortnox kan inte ta emot writes ännu
  'pending',             // Redo att synkas när OAuth fungerar
  'synced',              // Synkad till Fortnox med voucher-ID
  'error',               // Sync misslyckades, behöver retry
  'skip',                // Owner valde att hoppa över Fortnox-sync för denna expense
]);

function nowIso() { return new Date().toISOString(); }
function newId() { return 'exp_' + crypto.randomBytes(8).toString('hex'); }
function newBatchId() { return 'expbatch_' + crypto.randomBytes(6).toString('hex'); }

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeNumber(value, { allowNull = true } = {}) {
  if (value === null || value === undefined || value === '') return allowNull ? null : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : (allowNull ? null : 0);
}

async function createCfoExpenseStore({ filePath, auditLog = null, secureStorage = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    expenses: [],
    exportBatches: [], // history av export-paket
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.schemaVersion = parsed.schemaVersion || SCHEMA_VERSION;
        data.createdAt = parsed.createdAt || data.createdAt;
        data.updatedAt = parsed.updatedAt || data.updatedAt;
        data.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
        data.exportBatches = Array.isArray(parsed.exportBatches) ? parsed.exportBatches : [];
      }
    }
  } catch (err) {
    console.warn('[cfoExpenseStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(kind, detail) {
    try {
      auditLog?.append?.({
        // CF.3 P2-C workaround: skicka både action OCH kind. ccoAuditLog läser
        // action; framtida konsumenter kan läsa kind.
        action: kind, kind,
        surface: 'cco.cf.expense',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'expense', id: detail?.expenseId },
        detail,
      });
    } catch {}
  }

  function buildAttachmentKey({ ext }) {
    const ym = new Date().toISOString().slice(0, 7);
    const id = crypto.randomBytes(8).toString('hex');
    return `expenses/${ym}/${id}.${ext || 'bin'}`;
  }

  /**
   * Skapa ny expense — antingen från befintligt receipt eller fristående manuell post.
   * @param {object} input
   * @param {object} input.actor   - { userId, role }
   * @param {string} [input.receiptId] - om kvittot redan finns i cfoReceiptStore
   * @param {object} input.fields  - metadata-fält, se beskrivning
   */
  async function createExpense({ actor, receiptId = null, fields = {} } = {}) {
    const id = newId();

    // Validera category om satt
    if (fields.category && !VALID_CATEGORIES.includes(fields.category)) {
      throw new Error(`Okänd category: ${fields.category}. Tillåtna: ${VALID_CATEGORIES.join(', ')}`);
    }
    if (fields.paymentMethod && !VALID_PAYMENT_METHODS.includes(fields.paymentMethod)) {
      throw new Error(`Okänd paymentMethod: ${fields.paymentMethod}.`);
    }
    if (fields.vatRatePercent !== undefined && fields.vatRatePercent !== null
      && !VALID_VAT_RATES.includes(fields.vatRatePercent)) {
      throw new Error(`Okänd vatRatePercent: ${fields.vatRatePercent}. Tillåtna: ${VALID_VAT_RATES.join(', ')}`);
    }

    const initialStatus = fields.category ? 'categorized' : (receiptId ? 'needs_review' : 'new');

    const expense = {
      id,
      status: initialStatus,
      receiptId: receiptId || null,
      supplier: String(fields.supplier || '').slice(0, 200) || null,
      amountSek: normalizeNumber(fields.amountSek),
      vatSek: normalizeNumber(fields.vatSek),
      vatRatePercent: fields.vatRatePercent ?? null,
      date: fields.date || null,
      category: fields.category || null,
      paymentMethod: fields.paymentMethod || null,
      notes: String(fields.notes || '').slice(0, 2000),
      // CCO-koppling
      customerId: fields.customerId || null,
      encounterId: fields.encounterId || null,
      treatmentId: fields.treatmentId || null,
      offerId: fields.offerId || null,
      // Extra bilagor utöver primärt kvitto
      attachmentKeys: Array.isArray(fields.attachmentKeys) ? [...fields.attachmentKeys] : [],
      // Fortnox-hook — BLOCKED_INTEGRATION just nu, ingen write
      fortnoxSyncStatus: 'blocked_integration',
      fortnoxVoucherId: null,
      fortnoxExportPending: true,
      exportBatchId: null,
      // CF.4: kategorisering-källa (manual / rule_engine / rule_engine_approved)
      categorySource: fields.category ? 'manual' : null,
      // CF.4: auto-suggestion från rule engine — kräver human approval
      suggestion: null,
      // CF.5: leverantörsregister-koppling (null när ingen vendor matchat)
      supplierId: fields.supplierId || null,
      supplierMatchType: null, // 'exact' | 'contains' | 'reverse_contains' | 'manual'
      supplierMatchConfidence: null, // 0..1
      // CF.6: VAT-regler — full breakdown + mode-flagga
      vatMode: fields.vatMode || null, // se cfoExpenseVatRules.VALID_VAT_MODES
      reverseCharge: false,            // sätts av setVatMode
      netAmountSek: null,              // beräknat via calculateVatBreakdown
      grossAmountSek: null,            // alias för amountSek (klargör semantik)
      deductibleVatSek: null,
      nonDeductibleVatSek: null,
      vatReviewStatus: null, // 'pending' | 'reviewed' | 'flagged' | null
      vatSuggestion: null,   // separat från category-suggestion
      // CF.7: koppling till återkommande kostnad
      recurringExpenseId: fields.recurringExpenseId || null,
      recurringMatchConfidence: null,
      recurringAnomalies: [], // anomalies upptäckta vid matchning
      // Metadata
      createdAt: nowIso(),
      createdBy: actor || null,
      updatedAt: nowIso(),
      history: [{ status: initialStatus, at: nowIso(), by: actor }],
    };

    data.expenses.push(expense);
    await persist();
    audit('cf.expense.created', { expenseId: id, receiptId, initialStatus, actor });
    if (initialStatus === 'categorized') {
      audit('cf.expense.categorized', { expenseId: id, category: expense.category, actor });
    }
    return { ...expense };
  }

  async function updateExpense({ id, patch = {}, actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');

    if (['exported'].includes(e.status)) {
      throw new Error('exporterad expense kan inte ändras');
    }

    if ('category' in patch && patch.category !== null && !VALID_CATEGORIES.includes(patch.category)) {
      throw new Error(`Okänd category: ${patch.category}. Tillåtna: ${VALID_CATEGORIES.join(', ')}`);
    }
    if ('paymentMethod' in patch && patch.paymentMethod !== null
      && !VALID_PAYMENT_METHODS.includes(patch.paymentMethod)) {
      throw new Error(`Okänd paymentMethod: ${patch.paymentMethod}.`);
    }
    if ('vatRatePercent' in patch && patch.vatRatePercent !== null
      && !VALID_VAT_RATES.includes(patch.vatRatePercent)) {
      throw new Error(`Okänd vatRatePercent: ${patch.vatRatePercent}.`);
    }

    const allowed = [
      'supplier', 'amountSek', 'vatSek', 'vatRatePercent', 'date',
      'category', 'paymentMethod', 'notes',
      'customerId', 'encounterId', 'treatmentId', 'offerId',
      'attachmentKeys',
    ];
    const numericFields = new Set(['amountSek', 'vatSek']);
    const changedFields = [];
    for (const k of allowed) {
      if (k in patch) {
        let value = patch[k];
        if (numericFields.has(k)) value = normalizeNumber(value);
        if (k === 'notes') value = String(value || '').slice(0, 2000);
        if (k === 'supplier') value = value ? String(value).slice(0, 200) : null;
        if (k === 'attachmentKeys') value = Array.isArray(value) ? value : [];
        e[k] = value;
        changedFields.push(k);
      }
    }
    // CF.4: manuell category-edit räknas som 'manual' (overrider eventuell rule-engine-source)
    if ('category' in patch) e.categorySource = patch.category ? 'manual' : null;

    // Auto-transition: om category sätts på new/needs_review → categorized
    if (e.category && (e.status === 'new' || e.status === 'needs_review')) {
      e.status = 'categorized';
      e.history.push({ status: 'categorized', at: nowIso(), by: actor });
      audit('cf.expense.categorized', { expenseId: id, category: e.category, actor });
    }

    e.updatedAt = nowIso();
    await persist();
    audit('cf.expense.updated', { expenseId: id, fields: changedFields, actor });
    return { ...e };
  }

  /**
   * Status-transition. Validerar att övergången är tillåten via VALID_STATUSES.
   * Fail-closed mot okänd target-status.
   */
  async function transitionStatus({ id, newStatus, reason, actor } = {}) {
    if (!VALID_STATUSES.includes(newStatus)) {
      throw new Error('okänd status: ' + newStatus);
    }
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported' && newStatus !== 'exported') {
      throw new Error('exporterad expense kan inte ändra status');
    }
    const oldStatus = e.status;
    e.status = newStatus;
    e.updatedAt = nowIso();
    e.history.push({ status: newStatus, at: nowIso(), by: actor, reason: reason || null });
    await persist();
    if (newStatus === 'rejected') audit('cf.expense.rejected', { expenseId: id, oldStatus, reason, actor });
    else if (newStatus === 'approved') audit('cf.expense.approved', { expenseId: id, oldStatus, actor });
    else if (newStatus === 'ready_for_export') audit('cf.expense.ready_for_export', { expenseId: id, oldStatus, actor });
    else if (newStatus === 'exported') audit('cf.expense.exported', { expenseId: id, oldStatus, actor });
    else audit('cf.expense.updated', { expenseId: id, oldStatus, newStatus, actor });
    return { ...e };
  }

  /**
   * Markera en uppsättning expenses som exporterade (sätter exportBatchId + status).
   * Anropas av cfoExpenseExporter efter att export-paketet skrivits.
   */
  async function markExported({ expenseIds = [], batchId, actor } = {}) {
    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      throw new Error('expenseIds krävs');
    }
    const realBatchId = batchId || newBatchId();
    const exportedAt = nowIso();
    const exportedIds = [];
    for (const id of expenseIds) {
      const e = data.expenses.find((x) => x.id === id);
      if (!e) continue;
      if (e.status === 'exported') continue;
      e.status = 'exported';
      e.exportBatchId = realBatchId;
      e.updatedAt = exportedAt;
      e.history.push({ status: 'exported', at: exportedAt, by: actor, batchId: realBatchId });
      audit('cf.expense.exported', { expenseId: id, batchId: realBatchId, actor });
      exportedIds.push(id);
    }
    data.exportBatches.push({
      batchId: realBatchId,
      exportedAt,
      exportedBy: actor || null,
      expenseIds: exportedIds,
    });
    await persist();
    return { batchId: realBatchId, exportedAt, exportedIds };
  }

  /**
   * Bifoga en till bilaga till en expense via secure storage.
   * Returnerar storageKey för bilagan.
   */
  async function attachFile({ id, buffer, mimeType, originalFileName, actor } = {}) {
    if (!secureStorage?.putObject) throw new Error('secureStorage krävs för uppladdning');
    if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('buffer krävs');
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte få nya bilagor');

    const sha = crypto.createHash('sha256').update(buffer).digest('hex');
    const ext = (mimeType || '').toLowerCase().includes('pdf') ? 'pdf'
      : (mimeType || '').toLowerCase().includes('png') ? 'png'
      : (mimeType || '').toLowerCase().includes('webp') ? 'webp'
      : (mimeType || '').toLowerCase().includes('jpeg') || (mimeType || '').toLowerCase().includes('jpg') ? 'jpg'
      : 'bin';
    const ym = new Date().toISOString().slice(0, 7);
    const key = `expenses/${ym}/${sha.slice(0, 8)}-${e.id}.${ext}`;
    await secureStorage.putObject(key, buffer, { mimeType });
    e.attachmentKeys = [...(e.attachmentKeys || []), {
      key, checksum: sha, sizeBytes: buffer.length,
      mimeType: mimeType || 'application/octet-stream',
      originalFileName: String(originalFileName || '').slice(0, 200),
      addedAt: nowIso(),
    }];
    e.updatedAt = nowIso();
    await persist();
    audit('cf.expense.updated', { expenseId: id, fields: ['attachmentKeys'], attachmentAdded: true, actor });
    return { key, checksum: sha, sizeBytes: buffer.length };
  }

  function listExpenses({
    status, category, supplier, customerId, receiptId, batchId,
    fortnoxSyncStatus, fromDate, toDate,
    limit = 200,
  } = {}) {
    let list = [...data.expenses];
    if (status) list = list.filter((e) => e.status === status);
    if (category) list = list.filter((e) => e.category === category);
    if (supplier) list = list.filter((e) => String(e.supplier || '').toLowerCase().includes(String(supplier).toLowerCase()));
    if (customerId) list = list.filter((e) => e.customerId === customerId);
    if (receiptId) list = list.filter((e) => e.receiptId === receiptId);
    if (batchId) list = list.filter((e) => e.exportBatchId === batchId);
    if (fortnoxSyncStatus) list = list.filter((e) => e.fortnoxSyncStatus === fortnoxSyncStatus);
    if (fromDate) list = list.filter((e) => String(e.date || '') >= fromDate);
    if (toDate) list = list.filter((e) => String(e.date || '') <= toDate);
    list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return list.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  function getById(id) { return data.expenses.find((e) => e.id === id) || null; }

  function listExportBatches({ limit = 50 } = {}) {
    return [...data.exportBatches]
      .sort((a, b) => String(b.exportedAt).localeCompare(String(a.exportedAt)))
      .slice(0, Math.max(1, Math.min(500, limit)));
  }

  function summary({ fromDate, toDate } = {}) {
    const byStatus = {};
    const byCategory = {};
    const byPaymentMethod = {};
    const byVatRate = {};
    const byFortnoxSyncStatus = {};
    const byVatMode = {};       // CF.6
    let totalAmount = 0;
    let totalVat = 0;
    let totalDeductibleVat = 0;  // CF.6
    let totalNonDeductibleVat = 0;
    let reverseChargeCount = 0;
    let reverseChargeAmountSek = 0;
    let nonDeductibleCount = 0;
    let vatReviewPendingCount = 0;
    let readyForExportCount = 0;
    let readyForExportAmount = 0;
    let exportedAmount = 0;
    let approvedAmount = 0;
    let needsReviewAmount = 0;
    let unrejectedTotal = 0;

    for (const e of data.expenses) {
      if (fromDate && String(e.date || '') < fromDate) continue;
      if (toDate && String(e.date || '') > toDate) continue;

      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
      if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      if (e.paymentMethod) byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] || 0) + 1;
      const vatKey = e.vatRatePercent === null || e.vatRatePercent === undefined ? 'unknown' : String(e.vatRatePercent);
      byVatRate[vatKey] = (byVatRate[vatKey] || 0) + 1;
      byFortnoxSyncStatus[e.fortnoxSyncStatus] = (byFortnoxSyncStatus[e.fortnoxSyncStatus] || 0) + 1;
      if (e.vatMode) byVatMode[e.vatMode] = (byVatMode[e.vatMode] || 0) + 1;

      const amt = isFiniteNumber(e.amountSek) ? e.amountSek : 0;
      const vat = isFiniteNumber(e.vatSek) ? e.vatSek : 0;
      const ded = isFiniteNumber(e.deductibleVatSek) ? e.deductibleVatSek : 0;
      const nondd = isFiniteNumber(e.nonDeductibleVatSek) ? e.nonDeductibleVatSek : 0;
      if (e.status !== 'rejected') {
        totalAmount += amt;
        totalVat += vat;
        totalDeductibleVat += ded;
        totalNonDeductibleVat += nondd;
        unrejectedTotal += 1;
      }
      if (e.reverseCharge) {
        reverseChargeCount += 1;
        if (e.status !== 'rejected') reverseChargeAmountSek += amt;
      }
      if (e.vatMode === 'non_deductible' && e.status !== 'rejected') nonDeductibleCount += 1;
      if (e.vatReviewStatus === 'pending' && e.status !== 'rejected') vatReviewPendingCount += 1;
      if (e.status === 'ready_for_export') { readyForExportCount += 1; readyForExportAmount += amt; }
      if (e.status === 'approved') { approvedAmount += amt; }
      if (e.status === 'exported') { exportedAmount += amt; }
      if (e.status === 'new' || e.status === 'needs_review') needsReviewAmount += amt;
    }

    return {
      total: data.expenses.length,
      unrejectedTotal,
      byStatus, byCategory, byPaymentMethod, byVatRate, byFortnoxSyncStatus,
      byVatMode, // CF.6
      totalAmountSek: totalAmount,
      totalVatSek: totalVat,
      totalDeductibleVatSek: totalDeductibleVat, // CF.6
      totalNonDeductibleVatSek: totalNonDeductibleVat, // CF.6
      reverseChargeCount, // CF.6
      reverseChargeAmountSek, // CF.6
      nonDeductibleCount, // CF.6
      vatReviewPendingCount, // CF.6
      readyForExportCount,
      readyForExportAmountSek: readyForExportAmount,
      approvedAmountSek: approvedAmount,
      exportedAmountSek: exportedAmount,
      needsReviewAmountSek: needsReviewAmount,
      needsReviewCount: (byStatus.new || 0) + (byStatus.needs_review || 0),
      fortnoxBlockedCount: byFortnoxSyncStatus.blocked_integration || 0,
    };
  }

  // ─── CF.4: Suggestion-management ──────────────────────────────
  /**
   * Spara en suggestion på en expense. Skriver INTE förslagna fält —
   * de aktiveras först via approveSuggestion. UI:t visar bara förslaget.
   */
  async function setSuggestion({ id, suggestion, actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte få suggestion');
    e.suggestion = suggestion || null;
    e.updatedAt = nowIso();
    await persist();
    if (suggestion) {
      audit('cf.expense.auto_suggested', {
        expenseId: id,
        ruleId: suggestion?.bestMatch?.ruleId || null,
        confidence: suggestion?.bestMatch?.confidence || 0,
        recurring: !!suggestion?.recurring?.isRecurring,
        actor,
      });
    }
    return { ...e };
  }

  /**
   * Godkänn suggestion → applicera förslagna fält på expense.
   * Sätter categorySource = 'rule_engine_approved'.
   * Anropar onApplied-hook för rule-store statistik.
   */
  async function approveSuggestion({ id, actor, onApplied = null } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (!e.suggestion || !e.suggestion.bestMatch) throw new Error('ingen suggestion att godkänna');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte godkännas');

    const fields = e.suggestion.bestMatch.suggestedFields || {};
    if (fields.category && VALID_CATEGORIES.includes(fields.category) && !e.category) {
      e.category = fields.category;
    }
    if (fields.vatRatePercent !== undefined && VALID_VAT_RATES.includes(fields.vatRatePercent)
        && (e.vatRatePercent === null || e.vatRatePercent === undefined)) {
      e.vatRatePercent = fields.vatRatePercent;
    }
    if (fields.supplier && !e.supplier) e.supplier = String(fields.supplier).slice(0, 200);
    if (fields.paymentMethod && VALID_PAYMENT_METHODS.includes(fields.paymentMethod) && !e.paymentMethod) {
      e.paymentMethod = fields.paymentMethod;
    }
    if (fields.notes) e.notes = String(fields.notes).slice(0, 2000);

    e.categorySource = 'rule_engine_approved';
    const appliedRuleId = e.suggestion.bestMatch.ruleId;
    const appliedConfidence = e.suggestion.bestMatch.confidence;

    if (e.category && (e.status === 'new' || e.status === 'needs_review')) {
      e.status = 'categorized';
      e.history.push({ status: 'categorized', at: nowIso(), by: actor, via: 'rule_engine' });
      audit('cf.expense.categorized', { expenseId: id, category: e.category, via: 'rule_engine', actor });
    }

    e.suggestion = null; // konsumerat
    e.updatedAt = nowIso();
    await persist();

    audit('cf.expense.suggestion_approved', {
      expenseId: id,
      ruleId: appliedRuleId,
      confidence: appliedConfidence,
      appliedFields: Object.keys(fields),
      actor,
    });

    if (typeof onApplied === 'function') {
      try { await onApplied({ ruleId: appliedRuleId, confidence: appliedConfidence }); } catch {}
    }

    return { ...e };
  }

  /**
   * Avvisa suggestion. Sätter suggestion=null + audit.
   * Rule-stats för rejection uppdateras via onRejected-hook.
   */
  async function rejectSuggestion({ id, reason, actor, onRejected = null } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (!e.suggestion || !e.suggestion.bestMatch) throw new Error('ingen suggestion att avvisa');
    const rejectedRuleId = e.suggestion.bestMatch.ruleId;
    const rejectedConfidence = e.suggestion.bestMatch.confidence;
    e.suggestion = null;
    e.updatedAt = nowIso();
    await persist();
    audit('cf.expense.suggestion_rejected', {
      expenseId: id, ruleId: rejectedRuleId, confidence: rejectedConfidence, reason, actor,
    });
    if (typeof onRejected === 'function') {
      try { await onRejected({ ruleId: rejectedRuleId, reason }); } catch {}
    }
    return { ...e };
  }

  // ─── CF.5: Supplier-linking ────────────────────────────────────
  /**
   * Koppla expense till en vendor (supplier). Auto-trigger eller manuell.
   * matchType: 'exact' | 'contains' | 'reverse_contains' | 'manual'
   */
  async function linkSupplier({ id, supplierId, matchType = 'manual', confidence = 1.0, actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte länkas om');
    e.supplierId = supplierId || null;
    e.supplierMatchType = supplierId ? matchType : null;
    e.supplierMatchConfidence = supplierId ? confidence : null;
    e.updatedAt = nowIso();
    await persist();
    audit('cf.expense.supplier_matched', {
      expenseId: id, supplierId, matchType, confidence, actor,
    });
    return { ...e };
  }

  // ─── CF.6: VAT-rules ───────────────────────────────────────────
  /**
   * Föreslå vatMode + spara som vatSuggestion på expense.
   * Skriver INTE vatMode-fältet — kräver approval.
   */
  async function setVatSuggestion({ id, suggestion, actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte få vat-suggestion');
    e.vatSuggestion = suggestion || null;
    e.updatedAt = nowIso();
    await persist();
    if (suggestion) {
      audit('cf.expense.vat_suggested', {
        expenseId: id, suggestedVatMode: suggestion.suggestedVatMode,
        confidence: suggestion.confidence, reason: suggestion.reason, actor,
      });
    }
    return { ...e };
  }

  /**
   * Sätt vatMode direkt + beräkna breakdown via cfoExpenseVatRules.
   * markedReview: om true → sätt vatReviewStatus='pending'
   */
  async function setVatMode({ id, vatMode, vatRatePercent, markedReview = false, actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte ändra vatMode');
    const { calculateVatBreakdown, VALID_VAT_MODES } = require('./cfoExpenseVatRules');
    if (vatMode && !VALID_VAT_MODES.includes(vatMode)) {
      throw new Error(`Okänd vatMode: ${vatMode}`);
    }
    const breakdown = calculateVatBreakdown({
      amountSek: e.amountSek,
      vatSek: e.vatSek,
      vatRatePercent: vatRatePercent ?? e.vatRatePercent,
      vatMode,
    });
    e.vatMode = breakdown.vatMode;
    e.reverseCharge = breakdown.reverseCharge;
    e.grossAmountSek = breakdown.grossAmountSek;
    e.netAmountSek = breakdown.netAmountSek;
    // Om vatSek var null/missing, fyll i från breakdown
    if (e.vatSek === null || e.vatSek === undefined) e.vatSek = breakdown.vatAmountSek;
    if (vatRatePercent !== undefined) e.vatRatePercent = vatRatePercent;
    e.deductibleVatSek = breakdown.deductibleVatSek;
    e.nonDeductibleVatSek = breakdown.nonDeductibleVatSek;
    if (markedReview || vatMode === 'needs_review' || vatMode === 'mixed') {
      e.vatReviewStatus = 'pending';
    } else {
      e.vatReviewStatus = 'reviewed';
    }
    e.vatSuggestion = null;
    e.updatedAt = nowIso();
    await persist();
    if (markedReview) {
      audit('cf.expense.vat_marked_review', { expenseId: id, vatMode, actor });
    } else {
      audit('cf.expense.vat_approved', {
        expenseId: id, vatMode, reverseCharge: e.reverseCharge,
        deductibleVatSek: e.deductibleVatSek, nonDeductibleVatSek: e.nonDeductibleVatSek,
        actor,
      });
    }
    return { ...e };
  }

  /**
   * CF.7: Länka expense till recurring-mall + spara confidence + anomalies.
   */
  async function linkRecurring({ id, recurringExpenseId, confidence = 1.0, anomalies = [], actor } = {}) {
    const e = data.expenses.find((x) => x.id === id);
    if (!e) throw new Error('expense finns ej');
    if (e.status === 'exported') throw new Error('exporterad expense kan inte länkas om');
    e.recurringExpenseId = recurringExpenseId || null;
    e.recurringMatchConfidence = recurringExpenseId ? confidence : null;
    e.recurringAnomalies = Array.isArray(anomalies) ? anomalies : [];
    e.updatedAt = nowIso();
    await persist();
    audit('cf.expense.recurring_matched', {
      expenseId: id, recurringExpenseId, confidence, anomalyCount: anomalies.length, actor,
    });
    return { ...e };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_STATUSES, VALID_CATEGORIES, VALID_PAYMENT_METHODS, VALID_VAT_RATES,
    VALID_FORTNOX_SYNC_STATUSES,
    createExpense, updateExpense, transitionStatus,
    markExported, attachFile,
    listExpenses, listExportBatches, getById, summary,
    buildAttachmentKey,
    // CF.4
    setSuggestion, approveSuggestion, rejectSuggestion,
    // CF.5
    linkSupplier,
    // CF.6
    setVatSuggestion, setVatMode,
    // CF.7
    linkRecurring,
  };
}

module.exports = {
  createCfoExpenseStore,
  VALID_STATUSES,
  VALID_CATEGORIES,
  VALID_PAYMENT_METHODS,
  VALID_VAT_RATES,
  VALID_FORTNOX_SYNC_STATUSES,
  SCHEMA_VERSION,
};
