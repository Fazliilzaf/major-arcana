'use strict';

const express = require('express');
const { extractDocument } = require('../cm/cmAiExtractor');
const { createCmMailSync, DEFAULT_FOLDER_TYPES } = require('../cm/cmMailSync');
const { promoteRecordToCfo } = require('../cm/cmCfoHandoff');

function createCmRouter({
  authStore,
  cmStore,
  graphReadConnector,
  cfoExpenseStore = null,
  secureStorage = null,
}) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  // Dashboard
  router.get('/cm/dashboard', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, ...cmStore.getDashboard() });
  });

  // Inbox
  router.get('/cm/inbox', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getInbox() });
  });

  // Needs review
  router.get('/cm/needs-review', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getNeedsReview() });
  });

  // Invoices
  router.get('/cm/invoices', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getInvoices() });
  });

  // Receipts
  router.get('/cm/receipts', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getReceipts() });
  });

  // Travel
  router.get('/cm/travel', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, items: cmStore.getTravel() });
  });

  // Approval queue
  router.get('/cm/approvals', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getApprovalQueue() });
  });

  // Ready for bookkeeping
  router.get('/cm/ready-for-bookkeeping', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getReadyForBookkeeping() });
  });

  // Exported
  router.get('/cm/exported', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getExported() });
  });

  // Duplicates
  router.get('/cm/duplicates', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    return res.json({ ok: true, pairs: cmStore.getDuplicates() });
  });

  // Import errors
  router.get('/cm/import-errors', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    return res.json({ ok: true, items: cmStore.getImportErrors() });
  });

  // Import raw item (manual upload or mail ingestion)
  router.post('/cm/import', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const result = cmStore.importRawItem(req.body || {});
    if (!result.ok) return res.status(409).json(result);
    await cmStore.persist();
    return res.json(result);
  });

  // Create document from raw item
  router.post(
    '/cm/documents',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const doc = cmStore.createDocument(req.body || {});
      await cmStore.persist();
      return res.json({ ok: true, document: doc });
    }
  );

  // Create expense record from document
  router.post(
    '/cm/expense-records',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const record = cmStore.createExpenseRecord(req.body || {});
      await cmStore.persist();
      return res.json({ ok: true, record });
    }
  );

  // Approve
  router.post(
    '/cm/expense-records/:id/approve',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record = cmStore.approve(req.params.id, {
        approvedBy: req.user?.id || req.body?.approvedBy,
      });
      if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
      await cmStore.persist();
      return res.json({ ok: true, record });
    }
  );

  // Reject
  router.post(
    '/cm/expense-records/:id/reject',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record = cmStore.reject(req.params.id, {
        rejectedBy: req.user?.id,
        reason: req.body?.reason,
      });
      if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
      await cmStore.persist();
      return res.json({ ok: true, record });
    }
  );

  // Mark exported — DEPRECATED (ORD-63): CFO äger export-livscykeln.
  // Behålls tills UI:t enbart använder promote-vägen; tas bort därefter.
  router.post(
    '/cm/expense-records/:id/export',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record = cmStore.markExported(req.params.id, {
        externalAccountingId: req.body?.externalAccountingId,
      });
      if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
      await cmStore.persist();
      return res.json({
        ok: true,
        record,
        deprecated: 'Använd /promote — CFO (cfoExpenseStore) äger export-livscykeln (ORD-63)',
      });
    }
  );

  // ORD-63 · Promota CM-kandidat till CFO — cfoExpenseStore äger livscykeln därefter.
  router.post(
    '/cm/expense-records/:id/promote',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore) {
        return res
          .status(503)
          .json({ ok: false, error: 'cfoExpenseStore ej monterad — promote otillgänglig' });
      }
      const record = cmStore.getExpenseRecordById(req.params.id);
      if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
      if (record.cfoExpenseId) {
        return res
          .status(409)
          .json({ ok: false, error: 'already_promoted', cfoExpenseId: record.cfoExpenseId });
      }
      const documents = record.documentId
        ? [cmStore.getDocumentById(record.documentId)].filter(Boolean)
        : [];
      const actor = {
        userId: req.user?.id || req.user?.email || 'owner',
        role: 'owner',
        via: 'cm-promote',
      };
      try {
        const result = await promoteRecordToCfo({ record, documents, cfoExpenseStore, actor });
        if (!result.ok) return res.status(502).json(result);
        cmStore.markHandedOff(record.id, {
          cfoExpenseId: result.cfoExpense.id,
          actor: actor.userId,
        });
        await cmStore.persist();
        return res.json({
          ok: true,
          cfoExpense: result.cfoExpense,
          record: cmStore.getExpenseRecordById(record.id),
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // Mail sync — ORD-64: äkta delta-sync + bilagor + originalarkiv
  router.post('/cm/mail-sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({ graphReadConnector, cmStore, secureStorage });
    const mailboxId =
      req.body?.mailboxId || process.env.CM_MAIL_ACCOUNT || process.env.ARCANA_GRAPH_USER_ID || '';
    if (!mailboxId)
      return res
        .status(400)
        .json({ ok: false, error: 'Inget mailkonto konfigurerat (CM_MAIL_ACCOUNT)' });
    const folderTypes =
      Array.isArray(req.body?.folderTypes) && req.body.folderTypes.length
        ? req.body.folderTypes.map((f) => String(f))
        : DEFAULT_FOLDER_TYPES;
    const result = await mailSync.syncAll(mailboxId, folderTypes);
    return res.json({ ok: true, ...result });
  });

  // AI extraction — skicka bild eller text, få strukturerad data tillbaka
  router.post('/cm/extract', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const { imageBase64, mimeType, text, source } = req.body || {};
    if (!imageBase64 && !text) {
      return res.status(400).json({ ok: false, error: 'Skicka imageBase64 eller text' });
    }
    const result = await extractDocument({ imageBase64, mimeType, text, source });
    if (!result.ok) return res.status(502).json(result);

    // Auto-create expense record if confidence >= 70
    if (result.extraction?.confidenceScore >= 70 && result.extraction?.documentType !== 'unknown') {
      const record = cmStore.createExpenseRecord({
        expenseType: result.extraction.documentType,
        supplierName: result.extraction.supplier,
        invoiceNumber: result.extraction.invoiceNumber,
        receiptNumber: result.extraction.receiptNumber,
        orderNumber: result.extraction.orderNumber,
        date: result.extraction.date,
        dueDate: result.extraction.dueDate,
        amountExVat: result.extraction.amountExVat,
        vatAmount: result.extraction.vatAmount,
        amountIncVat: result.extraction.amountIncVat,
        currency: result.extraction.currency,
        category: result.extraction.category,
        confidenceScore: result.extraction.confidenceScore,
      });
      await cmStore.persist();
      result.expenseRecord = record;
    }

    return res.json(result);
  });

  // Full pipeline: import + extract in one call
  router.post('/cm/process', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const {
      sourceType,
      subject,
      fromEmail,
      receivedAt,
      rawBodyText,
      imageBase64,
      mimeType,
      hasPdf,
      hasImage,
      metadata,
    } = req.body || {};

    // Step 1: Import raw
    const importResult = cmStore.importRawItem({
      sourceType: sourceType || 'manual',
      subject,
      fromEmail,
      receivedAt,
      rawBodyText,
      hasAttachments: Boolean(imageBase64 || hasPdf),
      hasPdf: Boolean(hasPdf),
      hasImage: Boolean(hasImage || imageBase64),
      metadata,
    });
    if (!importResult.ok) return res.status(409).json(importResult);

    // Step 2: Extract
    const extractResult = await extractDocument({
      imageBase64,
      mimeType,
      text: rawBodyText,
      source: sourceType || 'manual',
    });

    // Step 3: Create expense record if extraction succeeded
    let expenseRecord = null;
    if (extractResult.ok && extractResult.extraction?.confidenceScore >= 50) {
      expenseRecord = cmStore.createExpenseRecord({
        expenseType: extractResult.extraction.documentType,
        supplierName: extractResult.extraction.supplier,
        invoiceNumber: extractResult.extraction.invoiceNumber,
        receiptNumber: extractResult.extraction.receiptNumber,
        orderNumber: extractResult.extraction.orderNumber,
        date: extractResult.extraction.date,
        dueDate: extractResult.extraction.dueDate,
        amountExVat: extractResult.extraction.amountExVat,
        vatAmount: extractResult.extraction.vatAmount,
        amountIncVat: extractResult.extraction.amountIncVat,
        currency: extractResult.extraction.currency,
        category: extractResult.extraction.category,
        confidenceScore: extractResult.extraction.confidenceScore,
        flags:
          extractResult.extraction.confidenceScore < 70
            ? ['NEEDS_MANUAL_REVIEW', 'LOW_CONFIDENCE_EXTRACTION']
            : [],
      });
    }

    await cmStore.persist();

    return res.json({
      ok: true,
      import: importResult,
      extraction: extractResult.ok ? extractResult.extraction : null,
      expenseRecord,
      needsReview: !expenseRecord || (expenseRecord?.confidenceScore || 0) < 70,
    });
  });

  return router;
}

module.exports = { createCmRouter };
