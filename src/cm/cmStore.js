'use strict';

/**
 * CM — Corporate Expense Management Store.
 *
 * Datamodell:
 * - rawItems: importerade mail/filer (original)
 * - documents: PDF/bild/mailtext med OCR-status
 * - expenseRecords: faktura/kvitto/resa med extraherade fält
 * - processingLedger: spårar processing-status per item
 * - auditEvents: alla ändringar
 * - suppliers: leverantörsregister
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const EXPENSE_STATUSES = Object.freeze([
  'IMPORTED',
  'RAW_SAVED',
  'DUPLICATE_CHECKED',
  'DUPLICATE_SKIPPED',
  'PDF_FOUND',
  'NO_PDF_FOUND',
  'BODY_TEXT_USED',
  'OCR_PENDING',
  'OCR_DONE',
  'AI_EXTRACTED',
  'EXTRACTION_LOW_CONFIDENCE',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'REJECTED',
  'READY_FOR_BOOKKEEPING',
  'EXPORTED',
  'ARCHIVED',
  'FAILED',
  'REPROCESS_REQUESTED',
]);

const DOCUMENT_TYPES = Object.freeze([
  'invoice',
  'receipt',
  'travel',
  'flight_ticket',
  'hotel',
  'taxi',
  'subscription',
  'purchase_confirmation',
  'credit_invoice',
  'reminder_invoice',
  'unknown',
]);

const DOCUMENT_FLAGS = Object.freeze([
  'NO_PDF_FOUND',
  'PDF_FOUND',
  'IMAGE_RECEIPT_FOUND',
  'BODY_TEXT_USED_AS_SOURCE',
  'ATTACHMENT_UNREADABLE',
  'OCR_FAILED',
  'LOW_CONFIDENCE_EXTRACTION',
  'UNKNOWN_DOCUMENT_TYPE',
]);

const FINANCE_FLAGS = Object.freeze([
  'MISSING_TOTAL_AMOUNT',
  'MISSING_VAT',
  'MISSING_INVOICE_NUMBER',
  'MISSING_DUE_DATE',
  'MISSING_SUPPLIER',
  'UNKNOWN_SUPPLIER',
  'DUPLICATE_INVOICE_NUMBER',
  'DUPLICATE_RECEIPT_HASH',
  'CURRENCY_NOT_SEK',
  'FOREIGN_PURCHASE',
  'TRAVEL_EXPENSE',
  'SUBSCRIPTION_EXPENSE',
  'PRIVATE_REIMBURSEMENT_NEEDED',
  'ALREADY_PAID',
  'PAYMENT_NEEDED',
]);

const REVIEW_FLAGS = Object.freeze([
  'NEEDS_MANUAL_REVIEW',
  'NEEDS_APPROVAL',
  'NEEDS_ACCOUNTING_REVIEW',
  'NEEDS_SUPPLIER_MATCH',
  'NEEDS_CATEGORY',
  'NEEDS_COST_CENTER',
  'NEEDS_PROJECT',
  'NEEDS_EMPLOYEE_ASSIGNMENT',
]);

const ALL_FLAGS = Object.freeze([...DOCUMENT_FLAGS, ...FINANCE_FLAGS, ...REVIEW_FLAGS]);

function createCmStore({ filePath }) {
  let state = {
    rawItems: [],
    documents: [],
    expenseRecords: [],
    processingLedger: [],
    auditEvents: [],
    suppliers: [],
    importRuns: [],
    syncState: {},
  };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
    if (!state.rawItems) state.rawItems = [];
    if (!state.documents) state.documents = [];
    if (!state.expenseRecords) state.expenseRecords = [];
    if (!state.processingLedger) state.processingLedger = [];
    if (!state.auditEvents) state.auditEvents = [];
    if (!state.suppliers) state.suppliers = [];
    if (!state.importRuns) state.importRuns = [];
    if (!state.syncState) state.syncState = {};
  }

  // ORD-64 · Rotationsskydd (crashloop-lärdomen 2026-07-10): håll store-filen
  // bounded. Äldsta raderna appendas till en .jsonl-arkivfil som ALDRIG läses
  // vid boot — original bevaras (BFN), boot-parse förblir liten.
  // ORD-74: höjd default — full historik från 2024 (~2000+ mail) får inte
  // rotera ut oprocessade rawItems ur storen innan extraktionen hunnit ikapp.
  const RAW_ITEMS_MAX = Math.max(100, Number(process.env.CM_RAW_ITEMS_MAX) || 10000);
  const AUDIT_EVENTS_MAX = Math.max(500, Number(process.env.CM_AUDIT_EVENTS_MAX) || 5000);

  async function rotateIfNeeded() {
    const overflow = [];
    if (state.rawItems.length > RAW_ITEMS_MAX) {
      const cut = state.rawItems.length - RAW_ITEMS_MAX;
      overflow.push(...state.rawItems.splice(0, cut).map((row) => ({ kind: 'rawItem', row })));
    }
    if (state.auditEvents.length > AUDIT_EVENTS_MAX) {
      const cut = state.auditEvents.length - AUDIT_EVENTS_MAX;
      overflow.push(
        ...state.auditEvents.splice(0, cut).map((row) => ({ kind: 'auditEvent', row }))
      );
    }
    if (!overflow.length) return 0;
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    const archivePath = `${filePath}.archive-${ym}.jsonl`;
    const lines = `${overflow.map((e) => JSON.stringify(e)).join('\n')}\n`;
    await fs.appendFile(archivePath, lines, 'utf8');
    return overflow.length;
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await rotateIfNeeded();
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  function audit(action, details = {}) {
    const event = { id: crypto.randomUUID(), action, ...details, timestamp: nowIso() };
    state.auditEvents.push(event);
    return event;
  }

  // ─── RAW IMPORT ───

  function computeDedupeKey(item) {
    const parts = [
      normalizeText(item.internetMessageId || item.messageId || ''),
      normalizeText(item.fileHash || ''),
      normalizeText(item.invoiceNumber || ''),
      normalizeText(item.subject || '').slice(0, 50),
      normalizeText(item.fromEmail || ''),
      normalizeText(item.amount || ''),
    ].filter(Boolean);
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  }

  function isDuplicate(dedupeKey) {
    return state.rawItems.some((item) => item.dedupeKey === dedupeKey);
  }

  function importRawItem({
    sourceType,
    sourceId,
    mailMessageId,
    internetMessageId,
    subject,
    fromEmail,
    receivedAt,
    rawBodyText,
    hasAttachments,
    hasPdf,
    hasImage,
    metadata = {},
  }) {
    const dedupeKey = computeDedupeKey({ internetMessageId, subject, fromEmail, ...metadata });
    if (isDuplicate(dedupeKey)) {
      return { ok: false, reason: 'duplicate', dedupeKey };
    }

    const rawItem = {
      id: crypto.randomUUID(),
      sourceType: normalizeText(sourceType) || 'manual',
      sourceId: normalizeText(sourceId),
      mailMessageId: normalizeText(mailMessageId),
      internetMessageId: normalizeText(internetMessageId),
      subject: normalizeText(subject),
      fromEmail: normalizeText(fromEmail),
      receivedAt: normalizeText(receivedAt) || nowIso(),
      rawBodyText: normalizeText(rawBodyText),
      hasAttachments: Boolean(hasAttachments),
      hasPdf: Boolean(hasPdf),
      hasImage: Boolean(hasImage),
      dedupeKey,
      status: 'RAW_SAVED',
      flags: [],
      createdAt: nowIso(),
    };

    if (hasPdf) rawItem.flags.push('PDF_FOUND');
    else rawItem.flags.push('NO_PDF_FOUND');
    if (hasImage) rawItem.flags.push('IMAGE_RECEIPT_FOUND');
    if (!hasPdf && rawBodyText) rawItem.flags.push('BODY_TEXT_USED_AS_SOURCE');

    state.rawItems.push(rawItem);
    audit('cm.raw_item.imported', { rawItemId: rawItem.id, sourceType, dedupeKey });
    return { ok: true, rawItem };
  }

  // ─── DOCUMENTS ───

  function createDocument({
    rawItemId,
    documentType,
    fileName,
    mimeType,
    storagePath,
    fileHash,
    source = 'pdf',
  }) {
    const doc = {
      id: crypto.randomUUID(),
      rawItemId: normalizeText(rawItemId),
      documentType: DOCUMENT_TYPES.includes(documentType) ? documentType : 'unknown',
      fileName: normalizeText(fileName),
      mimeType: normalizeText(mimeType),
      storagePath: normalizeText(storagePath),
      fileHash: normalizeText(fileHash),
      source,
      ocrStatus: 'pending',
      aiExtractionStatus: 'pending',
      confidenceScore: null,
      createdAt: nowIso(),
    };
    state.documents.push(doc);
    return doc;
  }

  // ─── EXPENSE RECORDS ───

  function createExpenseRecord({
    documentId,
    rawItemId,
    expenseType,
    supplierName,
    invoiceNumber,
    receiptNumber,
    orderNumber,
    date,
    dueDate,
    amountExVat,
    vatAmount,
    amountIncVat,
    currency = 'SEK',
    category,
    costCenter,
    project,
    employeeId,
    confidenceScore,
    flags = [],
  }) {
    const record = {
      id: crypto.randomUUID(),
      documentId: normalizeText(documentId),
      rawItemId: normalizeText(rawItemId), // ORD-68: koppling raw→record för reprocess
      expenseType: DOCUMENT_TYPES.includes(expenseType) ? expenseType : 'unknown',
      supplierName: normalizeText(supplierName),
      invoiceNumber: normalizeText(invoiceNumber),
      receiptNumber: normalizeText(receiptNumber),
      orderNumber: normalizeText(orderNumber),
      date: normalizeText(date),
      dueDate: normalizeText(dueDate),
      amountExVat: Number(amountExVat) || 0,
      vatAmount: Number(vatAmount) || 0,
      amountIncVat: Number(amountIncVat) || 0,
      currency: normalizeText(currency) || 'SEK',
      paymentStatus: 'unknown',
      category: normalizeText(category),
      costCenter: normalizeText(costCenter),
      project: normalizeText(project),
      employeeId: normalizeText(employeeId),
      approvalStatus: 'pending',
      bookkeepingStatus: 'pending',
      externalAccountingId: null,
      cfoExpenseId: null,
      confidenceScore: Number(confidenceScore) || 0,
      flags: flags.filter((f) => ALL_FLAGS.includes(f)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (!record.amountIncVat) record.flags.push('MISSING_TOTAL_AMOUNT');
    if (!record.vatAmount) record.flags.push('MISSING_VAT');
    if (record.expenseType === 'invoice' && !record.invoiceNumber)
      record.flags.push('MISSING_INVOICE_NUMBER');
    if (record.expenseType === 'invoice' && !record.dueDate) record.flags.push('MISSING_DUE_DATE');
    if (!record.supplierName) record.flags.push('MISSING_SUPPLIER');
    if (record.confidenceScore < 70) record.flags.push('NEEDS_MANUAL_REVIEW');
    if (record.currency !== 'SEK') record.flags.push('FOREIGN_PURCHASE');

    state.expenseRecords.push(record);
    audit('cm.expense_record.created', { recordId: record.id, expenseType: record.expenseType });
    return record;
  }

  // ─── APPROVAL ───

  // ORD-63 · CM lämnar över till CFO — cfoExpenseStore äger livscykeln därefter.
  function reject(recordId, { rejectedBy, reason }) {
    const record = state.expenseRecords.find((r) => r.id === recordId);
    if (!record) return null;
    record.approvalStatus = 'rejected';
    record.rejectionReason = normalizeText(reason);
    record.updatedAt = nowIso();
    audit('cm.expense_record.rejected', { recordId, rejectedBy, reason });
    return record;
  }

  function markExported(recordId, { externalAccountingId }) {
    const record = state.expenseRecords.find((r) => r.id === recordId);
    if (!record) return null;
    record.bookkeepingStatus = 'exported';
    record.externalAccountingId = normalizeText(externalAccountingId);
    record.updatedAt = nowIso();
    audit('cm.expense_record.exported', { recordId, externalAccountingId });
    return record;
  }

  // ORD-63 · CM lämnar över till CFO — cfoExpenseStore äger livscykeln därefter.
  function markHandedOff(recordId, { cfoExpenseId, actor } = {}) {
    const record = state.expenseRecords.find((r) => r.id === recordId);
    if (!record) return null;
    record.bookkeepingStatus = 'handed_off';
    record.cfoExpenseId = normalizeText(cfoExpenseId);
    record.updatedAt = nowIso();
    audit('cm.expense_record.handed_off', { recordId, cfoExpenseId: record.cfoExpenseId, actor });
    return record;
  }

  // ─── SYNC STATE (ORD-64 · delta-cursor per mailbox+folder) ───

  function getSyncState(mailboxId, folderType) {
    return state.syncState?.[mailboxId]?.[folderType] || null;
  }

  function setSyncState(mailboxId, folderType, patch = {}) {
    if (!state.syncState) state.syncState = {};
    if (!state.syncState[mailboxId]) state.syncState[mailboxId] = {};
    state.syncState[mailboxId][folderType] = {
      ...(state.syncState[mailboxId][folderType] || {}),
      ...patch,
      updatedAt: nowIso(),
    };
    return state.syncState[mailboxId][folderType];
  }

  // ─── PROCESSING LEDGER (ORD-64) ───

  function addLedgerEntry({
    rawItemId,
    documentId = null,
    expenseRecordId = null,
    processorVersion = 2,
    filterVersion = 1,
    status = 'processing',
  } = {}) {
    const entry = {
      id: crypto.randomUUID(),
      rawItemId: normalizeText(rawItemId),
      documentId,
      expenseRecordId,
      processorVersion,
      filterVersion,
      status,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
      processedAt: nowIso(),
      completedAt: null,
    };
    state.processingLedger.push(entry);
    return entry;
  }

  function completeLedgerEntry(
    id,
    {
      status = 'done',
      expenseRecordId = null,
      documentId = null,
      errorCode = null,
      errorMessage = null,
    } = {}
  ) {
    const entry = state.processingLedger.find((e) => e.id === id);
    if (!entry) return null;
    entry.status = status;
    if (expenseRecordId) entry.expenseRecordId = expenseRecordId;
    if (documentId) entry.documentId = documentId;
    entry.errorCode = errorCode;
    entry.errorMessage = errorMessage ? String(errorMessage).slice(0, 500) : null;
    entry.completedAt = nowIso();
    return entry;
  }

  // ─── QUERIES ───

  function getRawItemById(id) {
    return state.rawItems.find((r) => r.id === id) || null;
  }

  // ORD-75: läs-lista för underlags-backfill (originalStorageKey-pekare)
  function listRawItems() {
    return state.rawItems;
  }

  // ORD-68: rawItems som aldrig fått en expense-record (via ledger ELLER
  // record.rawItemId) — reprocess-kandidater. FAILED-status ingår (retry).
  function listUnprocessedRawItems({ limit = 10 } = {}) {
    const processedIds = new Set();
    for (const entry of state.processingLedger) {
      if (entry.expenseRecordId) processedIds.add(entry.rawItemId);
    }
    for (const record of state.expenseRecords) {
      if (record.rawItemId) processedIds.add(record.rawItemId);
    }
    return state.rawItems.filter((r) => !processedIds.has(r.id)).slice(0, Math.max(1, limit));
  }

  function getExpenseRecordById(id) {
    return state.expenseRecords.find((r) => r.id === id) || null;
  }

  // ORD-72: records som saknar totalbelopp — om-extraktionskandidater.
  // Avvisade hoppas över (ägaren har redan dömt ut dem).
  function listRecordsMissingAmount({ limit = 10 } = {}) {
    return state.expenseRecords
      .filter((r) => !r.amountIncVat && r.approvalStatus !== 'rejected')
      .slice(0, Math.max(1, limit));
  }

  // ORD-72b: minns att om-extraktion försökts på denna processorversion —
  // schemakörningar hoppar över redan-försökta (force=true kör om ändå).
  function markReextractAttempt(recordId, processorVersion) {
    const record = getExpenseRecordById(recordId);
    if (!record) return null;
    record.reextractAttemptVersion = Number(processorVersion) || 0;
    record.reextractAttemptAt = nowIso();
    return record;
  }

  // ORD-72: fyll ENDAST tomma fält ur en ny extraktion — befintliga värden
  // (inkl. ägar-redigerade) skrivs aldrig över. Flaggor räknas om.
  function applyReextraction(recordId, extraction = {}) {
    const record = getExpenseRecordById(recordId);
    if (!record) return null;
    const changed = [];
    const fill = (field, value, numeric = false) => {
      const v = numeric ? Number(value) || 0 : normalizeText(value);
      const empty = numeric ? !record[field] : !record[field];
      if (empty && (numeric ? v > 0 : v)) {
        record[field] = v;
        changed.push(field);
      }
    };
    fill('amountIncVat', extraction.amountIncVat, true);
    fill('amountExVat', extraction.amountExVat, true);
    fill('vatAmount', extraction.vatAmount, true);
    fill('date', extraction.date);
    fill('dueDate', extraction.dueDate);
    fill('supplierName', extraction.supplierName);
    fill('invoiceNumber', extraction.invoiceNumber);
    fill('receiptNumber', extraction.receiptNumber);
    if (changed.length === 0) return { record, changed };

    const drop = new Set();
    if (record.amountIncVat) drop.add('MISSING_TOTAL_AMOUNT');
    if (record.vatAmount) drop.add('MISSING_VAT');
    if (record.supplierName) drop.add('MISSING_SUPPLIER');
    if (record.invoiceNumber) drop.add('MISSING_INVOICE_NUMBER');
    if (record.dueDate) drop.add('MISSING_DUE_DATE');
    record.flags = record.flags.filter((f) => !drop.has(f));
    record.updatedAt = nowIso();
    audit('cm.expense_record.reextracted', { recordId, changed });
    return { record, changed };
  }

  function getDocumentById(id) {
    return state.documents.find((d) => d.id === id) || null;
  }

  // ORD-75c: hämta alla dokument kopplade till en rawItem (t.ex. IMAP-bilagor
  // som behöver läsas om vid reextract när Graph inte är källan).
  function getDocumentsByRawItemId(rawItemId) {
    return state.documents.filter((d) => d.rawItemId === normalizeText(rawItemId));
  }

  // Bugbot PR #831: promotade records (handed_off/cfoExpenseId) ska inte
  // räknas som öppna kandidater i inbox/kö/granskning — CFO äger dem nu.
  function isOpenCandidate(r) {
    return r.bookkeepingStatus !== 'handed_off' && !r.cfoExpenseId;
  }

  function getInbox() {
    return state.expenseRecords.filter(
      (r) =>
        isOpenCandidate(r) &&
        r.approvalStatus === 'pending' &&
        !r.flags.includes('NEEDS_MANUAL_REVIEW')
    );
  }

  function getNeedsReview() {
    // Endast pending — avvisade/godkända ska inte ligga kvar i granska-kön
    // (samma filter som getInbox; upptäckt vid ägar-städning 2026-07-13).
    return state.expenseRecords.filter(
      (r) =>
        isOpenCandidate(r) &&
        r.approvalStatus === 'pending' &&
        r.flags.some((f) => REVIEW_FLAGS.includes(f))
    );
  }

  function getInvoices() {
    return state.expenseRecords.filter((r) => r.expenseType === 'invoice');
  }

  function getReceipts() {
    return state.expenseRecords.filter((r) => r.expenseType === 'receipt');
  }

  function getTravel() {
    return state.expenseRecords.filter((r) =>
      ['travel', 'flight_ticket', 'hotel', 'taxi'].includes(r.expenseType)
    );
  }

  function getApprovalQueue() {
    return state.expenseRecords.filter(
      (r) =>
        isOpenCandidate(r) &&
        r.approvalStatus === 'pending' &&
        !r.flags.includes('NEEDS_MANUAL_REVIEW')
    );
  }

  function getReadyForBookkeeping() {
    return state.expenseRecords.filter((r) => r.bookkeepingStatus === 'ready');
  }

  function getExported() {
    return state.expenseRecords.filter((r) => r.bookkeepingStatus === 'exported');
  }

  function getDuplicates() {
    const seen = new Map();
    const dups = [];
    for (const r of state.expenseRecords) {
      const key = `${r.supplierName}|${r.amountIncVat}|${r.date}`;
      if (seen.has(key)) {
        dups.push([seen.get(key), r]);
      } else seen.set(key, r);
    }
    return dups;
  }

  function getImportErrors() {
    return state.rawItems.filter((r) => r.status === 'FAILED');
  }

  function updateExpenseRecord(recordId, patch = {}, actor = 'owner') {
    const record = state.expenseRecords.find((r) => r.id === recordId);
    if (!record) throw new Error('expense record finns ej');

    const allowed = ['amountIncVat', 'amountExVat', 'vatAmount', 'category', 'flags'];
    const numericFields = new Set(['amountIncVat', 'amountExVat', 'vatAmount']);
    const changed = [];
    for (const k of allowed) {
      if (k in patch) {
        let value = patch[k];
        if (numericFields.has(k)) value = Number(value) || 0;
        if (k === 'category') value = value ? String(value).slice(0, 100) : '';
        if (k === 'flags') value = Array.isArray(value) ? value : record.flags;
        record[k] = value;
        changed.push(k);
      }
    }
    if (changed.length === 0) return { record, changed };

    // Rensa MISSING_TOTAL_AMOUNT om vi nu har ett belopp
    if (record.amountIncVat > 0) {
      record.flags = record.flags.filter((f) => f !== 'MISSING_TOTAL_AMOUNT');
    }
    record.updatedAt = nowIso();
    audit('cm.expense_record.updated', { recordId, fields: changed, actor });
    return { record, changed };
  }

  async function bulkCorrectAmounts({ source = 'receipts', limit = 1000, actor = 'owner' } = {}) {
    const { extractAmountFromRawItem } = require('./cmAmountCorrector');

    const sourceGetters = {
      receipts: getReceipts,
      invoices: getInvoices,
      travel: getTravel,
    };
    const getter = sourceGetters[source];
    if (!getter) throw new Error(`okänd source: ${source}`);

    const candidates = [];
    const records = getter
      .call(this)
      .filter((r) => r.approvalStatus === 'pending' && r.amountIncVat >= 1000);

    for (const record of records.slice(0, limit)) {
      const rawItem = record.rawItemId ? getRawItemById(record.rawItemId) : null;
      if (!rawItem) continue;
      const extracted = extractAmountFromRawItem(rawItem, record.amountIncVat);
      if (!extracted) continue;
      candidates.push({
        id: record.id,
        rawItemId: record.rawItemId,
        supplier: record.supplierName,
        category: record.category,
        currentAmount: record.amountIncVat,
        parsedAmount: extracted.parsedAmount,
        suggestedAmount: extracted.sekAmount,
        currency: extracted.currency,
        strategy: extracted.strategy,
        confidence: extracted.confidence,
        cfoExpenseId: record.cfoExpenseId || null,
        bookkeepingStatus: record.bookkeepingStatus,
      });
    }

    return { ok: true, source, scanned: records.length, candidates };
  }

  function getDashboard() {
    // ORD-70: rullande 24h-räknare för auto-intagets statusrad
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const isLast24h = (iso) => {
      const t = Date.parse(iso || '');
      return Number.isFinite(t) && t >= dayAgo;
    };
    return {
      importedLast24h: state.rawItems.filter((r) => isLast24h(r.createdAt)).length,
      recordsLast24h: state.expenseRecords.filter((r) => isLast24h(r.createdAt)).length,
      inbox: getInbox().length,
      needsReview: getNeedsReview().length,
      invoices: getInvoices().length,
      receipts: getReceipts().length,
      travel: getTravel().length,
      approvalQueue: getApprovalQueue().length,
      readyForBookkeeping: getReadyForBookkeeping().length,
      exported: getExported().length,
      handedOff: state.expenseRecords.filter((r) => r.bookkeepingStatus === 'handed_off').length,
      duplicates: getDuplicates().length,
      importErrors: getImportErrors().length,
      totalRawItems: state.rawItems.length,
      totalDocuments: state.documents.length,
      totalExpenseRecords: state.expenseRecords.length,
    };
  }

  return {
    load,
    persist,
    audit,
    importRawItem,
    isDuplicate,
    computeDedupeKey,
    createDocument,
    createExpenseRecord,
    reject,
    markExported,
    markHandedOff,
    getSyncState,
    setSyncState,
    addLedgerEntry,
    completeLedgerEntry,
    getExpenseRecordById,
    getDocumentById,
    getDocumentsByRawItemId,
    getRawItemById,
    listRawItems,
    listUnprocessedRawItems,
    listRecordsMissingAmount,
    markReextractAttempt,
    applyReextraction,
    getInbox,
    getNeedsReview,
    getInvoices,
    getReceipts,
    getTravel,
    getApprovalQueue,
    getReadyForBookkeeping,
    getExported,
    getDuplicates,
    getImportErrors,
    updateExpenseRecord,
    bulkCorrectAmounts,
    getDashboard,
    EXPENSE_STATUSES,
    DOCUMENT_TYPES,
    ALL_FLAGS,
  };
}

module.exports = { createCmStore, EXPENSE_STATUSES, DOCUMENT_TYPES, ALL_FLAGS };
