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

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const EXPENSE_STATUSES = Object.freeze([
  'IMPORTED', 'RAW_SAVED', 'DUPLICATE_CHECKED', 'DUPLICATE_SKIPPED',
  'PDF_FOUND', 'NO_PDF_FOUND', 'BODY_TEXT_USED', 'OCR_PENDING', 'OCR_DONE',
  'AI_EXTRACTED', 'EXTRACTION_LOW_CONFIDENCE', 'NEEDS_REVIEW',
  'READY_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'READY_FOR_BOOKKEEPING',
  'EXPORTED', 'ARCHIVED', 'FAILED', 'REPROCESS_REQUESTED',
]);

const DOCUMENT_TYPES = Object.freeze([
  'invoice', 'receipt', 'travel', 'flight_ticket', 'hotel', 'taxi',
  'subscription', 'purchase_confirmation', 'credit_invoice',
  'reminder_invoice', 'unknown',
]);

const DOCUMENT_FLAGS = Object.freeze([
  'NO_PDF_FOUND', 'PDF_FOUND', 'IMAGE_RECEIPT_FOUND', 'BODY_TEXT_USED_AS_SOURCE',
  'ATTACHMENT_UNREADABLE', 'OCR_FAILED', 'LOW_CONFIDENCE_EXTRACTION', 'UNKNOWN_DOCUMENT_TYPE',
]);

const FINANCE_FLAGS = Object.freeze([
  'MISSING_TOTAL_AMOUNT', 'MISSING_VAT', 'MISSING_INVOICE_NUMBER', 'MISSING_DUE_DATE',
  'MISSING_SUPPLIER', 'UNKNOWN_SUPPLIER', 'DUPLICATE_INVOICE_NUMBER', 'DUPLICATE_RECEIPT_HASH',
  'CURRENCY_NOT_SEK', 'FOREIGN_PURCHASE', 'TRAVEL_EXPENSE', 'SUBSCRIPTION_EXPENSE',
  'PRIVATE_REIMBURSEMENT_NEEDED', 'ALREADY_PAID', 'PAYMENT_NEEDED',
]);

const REVIEW_FLAGS = Object.freeze([
  'NEEDS_MANUAL_REVIEW', 'NEEDS_APPROVAL', 'NEEDS_ACCOUNTING_REVIEW',
  'NEEDS_SUPPLIER_MATCH', 'NEEDS_CATEGORY', 'NEEDS_COST_CENTER',
  'NEEDS_PROJECT', 'NEEDS_EMPLOYEE_ASSIGNMENT',
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
  };

  async function load() {
    try { state = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { /* first run */ }
    if (!state.rawItems) state.rawItems = [];
    if (!state.documents) state.documents = [];
    if (!state.expenseRecords) state.expenseRecords = [];
    if (!state.processingLedger) state.processingLedger = [];
    if (!state.auditEvents) state.auditEvents = [];
    if (!state.suppliers) state.suppliers = [];
    if (!state.importRuns) state.importRuns = [];
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
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

  function importRawItem({ sourceType, sourceId, mailMessageId, internetMessageId, subject, fromEmail, receivedAt, rawBodyText, hasAttachments, hasPdf, hasImage, metadata = {} }) {
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

  function createDocument({ rawItemId, documentType, fileName, mimeType, storagePath, fileHash, source = 'pdf' }) {
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

  function createExpenseRecord({ documentId, expenseType, supplierName, invoiceNumber, receiptNumber, orderNumber, date, dueDate, amountExVat, vatAmount, amountIncVat, currency = 'SEK', category, costCenter, project, employeeId, confidenceScore, flags = [] }) {
    const record = {
      id: crypto.randomUUID(),
      documentId: normalizeText(documentId),
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
      confidenceScore: Number(confidenceScore) || 0,
      flags: flags.filter((f) => ALL_FLAGS.includes(f)),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    if (!record.amountIncVat) record.flags.push('MISSING_TOTAL_AMOUNT');
    if (!record.vatAmount) record.flags.push('MISSING_VAT');
    if (record.expenseType === 'invoice' && !record.invoiceNumber) record.flags.push('MISSING_INVOICE_NUMBER');
    if (record.expenseType === 'invoice' && !record.dueDate) record.flags.push('MISSING_DUE_DATE');
    if (!record.supplierName) record.flags.push('MISSING_SUPPLIER');
    if (record.confidenceScore < 70) record.flags.push('NEEDS_MANUAL_REVIEW');
    if (record.currency !== 'SEK') record.flags.push('FOREIGN_PURCHASE');

    state.expenseRecords.push(record);
    audit('cm.expense_record.created', { recordId: record.id, expenseType: record.expenseType });
    return record;
  }

  // ─── APPROVAL ───

  function approve(recordId, { approvedBy }) {
    const record = state.expenseRecords.find((r) => r.id === recordId);
    if (!record) return null;
    record.approvalStatus = 'approved';
    record.bookkeepingStatus = 'ready';
    record.updatedAt = nowIso();
    audit('cm.expense_record.approved', { recordId, approvedBy });
    return record;
  }

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

  // ─── QUERIES ───

  function getInbox() {
    return state.expenseRecords.filter((r) => r.approvalStatus === 'pending' && !r.flags.includes('NEEDS_MANUAL_REVIEW'));
  }

  function getNeedsReview() {
    return state.expenseRecords.filter((r) => r.flags.some((f) => REVIEW_FLAGS.includes(f)));
  }

  function getInvoices() {
    return state.expenseRecords.filter((r) => r.expenseType === 'invoice');
  }

  function getReceipts() {
    return state.expenseRecords.filter((r) => r.expenseType === 'receipt');
  }

  function getTravel() {
    return state.expenseRecords.filter((r) => ['travel', 'flight_ticket', 'hotel', 'taxi'].includes(r.expenseType));
  }

  function getApprovalQueue() {
    return state.expenseRecords.filter((r) => r.approvalStatus === 'pending' && !r.flags.includes('NEEDS_MANUAL_REVIEW'));
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
      if (seen.has(key)) { dups.push([seen.get(key), r]); }
      else seen.set(key, r);
    }
    return dups;
  }

  function getImportErrors() {
    return state.rawItems.filter((r) => r.status === 'FAILED');
  }

  function getDashboard() {
    return {
      inbox: getInbox().length,
      needsReview: getNeedsReview().length,
      invoices: getInvoices().length,
      receipts: getReceipts().length,
      travel: getTravel().length,
      approvalQueue: getApprovalQueue().length,
      readyForBookkeeping: getReadyForBookkeeping().length,
      exported: getExported().length,
      duplicates: getDuplicates().length,
      importErrors: getImportErrors().length,
      totalRawItems: state.rawItems.length,
      totalDocuments: state.documents.length,
      totalExpenseRecords: state.expenseRecords.length,
    };
  }

  return {
    load, persist, audit,
    importRawItem, isDuplicate, computeDedupeKey,
    createDocument, createExpenseRecord,
    approve, reject, markExported,
    getInbox, getNeedsReview, getInvoices, getReceipts, getTravel,
    getApprovalQueue, getReadyForBookkeeping, getExported, getDuplicates, getImportErrors,
    getDashboard,
    EXPENSE_STATUSES, DOCUMENT_TYPES, ALL_FLAGS,
  };
}

module.exports = { createCmStore, EXPENSE_STATUSES, DOCUMENT_TYPES, ALL_FLAGS };
