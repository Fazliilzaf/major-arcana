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

  // Dashboard — ORD-70: inkl. auto-intagets senaste körning (statusraden i UI:t)
  router.get('/cm/dashboard', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), (req, res) => {
    const mailbox = process.env.CM_MAIL_ACCOUNT || 'kvitto@hairtpclinic.com';
    const autoSync = cmStore.getSyncState(mailbox, '_scheduler') || null;
    const folderSync = cmStore.getSyncState(mailbox, 'inbox') || null;
    return res.json({
      ok: true,
      ...cmStore.getDashboard(),
      autoSync,
      lastFolderSyncAt: folderSync?.lastSyncAt || null,
      maxExtractPerSync: Math.max(0, Number(process.env.CM_MAX_EXTRACT_PER_SYNC) || 10),
    });
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
      // ORD-75: originalmailet är underlaget — följer med till CFO-utgiften
      const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
      const actor = {
        userId: req.user?.id || req.user?.email || 'owner',
        role: 'owner',
        via: 'cm-promote',
      };
      try {
        const result = await promoteRecordToCfo({
          record,
          documents,
          rawItem,
          cfoExpenseStore,
          actor,
        });
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
    // ORD-67f: kvitto@ = kanonisk CM-mailkälla (ägar-beslut 2026-07-13).
    // Env CM_MAIL_ACCOUNT överrider; fallbacken gör UI-knappen fungerande
    // utan env-deploy. Verifierad läsbar via Graph 2026-07-13 (19 mail import).
    const mailboxId =
      req.body?.mailboxId || process.env.CM_MAIL_ACCOUNT || 'kvitto@hairtpclinic.com';
    if (!mailboxId)
      return res
        .status(400)
        .json({ ok: false, error: 'Inget mailkonto konfigurerat (CM_MAIL_ACCOUNT)' });
    const folderTypes =
      Array.isArray(req.body?.folderTypes) && req.body.folderTypes.length
        ? req.body.folderTypes.map((f) => String(f))
        : DEFAULT_FOLDER_TYPES;
    const result = await mailSync.syncAll(mailboxId, folderTypes);
    // Bugbot PR #831: maska inte folder-fel — ok speglar att ALLA mappar lyckades.
    // (reprocess-routen nedan hanterar items som redan passerat delta-cursorn)
    const allOk = (result.folders || []).every((f) => f?.ok !== false);
    return res.status(allOk ? 200 : 502).json({ ok: allOk, ...result });
  });

  // ORD-68 · Reprocess: läs om rawItems utan expense-record — hämtar bilagor
  // i efterhand (mail som passerat delta-cursorn, t.ex. före ORD-67f) och kör
  // om extraktionen på kombinerat underlag (ämne + mailtext + PDF).
  router.post('/cm/reprocess', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({ graphReadConnector, cmStore, secureStorage });
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    try {
      const result = await mailSync.reprocessUnprocessed({ limit });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-72 · Om-extraktion: records som saknar totalbelopp läses om ur det
  // SPARADE källmailet (mailtext + bilagor). Fyller endast tomma fält och
  // backfillar redan promotade CFO-utgifter vars belopp fortfarande är tomt.
  router.post('/cm/reextract-missing', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const mailSync = createCmMailSync({
      graphReadConnector,
      cmStore,
      secureStorage,
      cfoExpenseStore,
    });
    const limit = Math.min(50, Math.max(1, Number(req.body?.limit) || 10));
    // force=true (UI-knappen): kör om även poster som redan försökts på
    // denna processorversion. Schemakörningar kör utan force.
    const force = req.body?.force === true;
    try {
      const result = await mailSync.reextractMissingAmounts({ limit, force });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-73 · IMAP-intag (info@fazli.se hos one.com — utanför M365-tenanten).
  // Fail-closed: kräver CM_IMAP_ENABLED + user/password i env.
  router.post('/cm/imap-sync', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const { createCmImapSync } = require('../cm/cmImapSync');
      const imapSync = createCmImapSync({ cmStore, secureStorage });
      const result = await imapSync.syncInbox();
      return res.status(result.ok ? 200 : 502).json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ORD-75 · Backfill av underlags-pekare: rawItems från IMAP-skörden som
  // saknar originalStorageKey får sina arkiv-pekare (avdragsbevis-kedjan).
  router.post(
    '/cm/imap-backfill-originals',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      try {
        const { createCmImapSync } = require('../cm/cmImapSync');
        const imapSync = createCmImapSync({ cmStore, secureStorage });
        const limit = Math.min(100, Math.max(1, Number(req.body?.limit) || 50));
        const result = await imapSync.backfillOriginals({ limit });
        return res.status(result.ok ? 200 : 502).json(result);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-75b · Omkoppling: promotade CFO-utgifter som saknar underlag får
  // originalmail + bilagor kopplade i efterhand (avdragsbevis-kedjan bakåt).
  router.post(
    '/cm/relink-expense-attachments',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      if (!cfoExpenseStore?.listExpenses || !cfoExpenseStore?.updateExpense) {
        return res.status(502).json({ ok: false, error: 'cfoExpenseStore saknas' });
      }
      const results = { ok: true, checked: 0, relinked: 0, skipped: 0, errors: [] };
      try {
        const expenses = await cfoExpenseStore.listExpenses({ limit: 500 });
        const list = Array.isArray(expenses) ? expenses : expenses?.items || [];
        for (const e of list) {
          if (Array.isArray(e.attachmentKeys) && e.attachmentKeys.length > 0) continue;
          const recId = (String(e.notes || '').match(/cm-record ([0-9a-f-]{36})/) || [])[1];
          if (!recId) continue;
          results.checked++;
          const record = cmStore.getExpenseRecordById(recId);
          if (!record) {
            results.skipped++;
            continue;
          }
          const keys = [];
          if (record.documentId) {
            const doc = cmStore.getDocumentById(record.documentId);
            if (doc?.storagePath) keys.push(doc.storagePath);
          }
          const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
          if (rawItem?.originalStorageKey && !keys.includes(rawItem.originalStorageKey)) {
            keys.push(rawItem.originalStorageKey);
          }
          if (!keys.length) {
            results.skipped++;
            continue;
          }
          try {
            await cfoExpenseStore.updateExpense({
              id: e.id,
              patch: { attachmentKeys: keys },
              actor: 'cm-relink-ord75',
            });
            results.relinked++;
          } catch (err) {
            results.errors.push({ expenseId: e.id, error: err.message });
          }
        }
        return res.json(results);
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }
  );

  // ORD-CM-4 · Klumphantering: gruppera öppna kandidater per leverantör/avsändare
  function bulkGroupKey(record) {
    const supplier = String(record.supplierName || '')
      .trim()
      .toLowerCase();
    if (supplier) return `s:${supplier}`;
    const raw = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
    const domain = String(raw?.fromEmail || '').split('@')[1] || 'okänd';
    return `d:${domain.toLowerCase()}`;
  }

  function openBulkRecords() {
    return [...cmStore.getInbox(), ...cmStore.getNeedsReview()].filter(
      (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i
    );
  }

  router.get('/cm/groups', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const groups = new Map();
    for (const r of openBulkRecords()) {
      const key = bulkGroupKey(r);
      if (!groups.has(key)) {
        const raw = r.rawItemId ? cmStore.getRawItemById(r.rawItemId) : null;
        groups.set(key, {
          key,
          label: r.supplierName || (raw?.fromEmail || 'okänd').split('@')[1] || 'okänd',
          count: 0,
          sumIncVat: 0,
          medBelopp: 0,
          exempel: r.supplierName || raw?.subject || '',
        });
      }
      const g = groups.get(key);
      g.count++;
      if (r.amountIncVat) {
        g.sumIncVat += r.amountIncVat;
        g.medBelopp++;
      }
    }
    const list = [...groups.values()].sort((a, b) => b.count - a.count);
    return res.json({ ok: true, groups: list, totalOpen: openBulkRecords().length });
  });

  // POST /cm/bulk {action:'promote'|'reject', groupKey, category?, reason?}
  // Bulk skapar/kategoriserar/avvisar — GODKÄNNANDE förblir alltid mänskligt.
  router.post('/cm/bulk', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const { action, groupKey, category, reason } = req.body || {};
    if (!['promote', 'reject'].includes(action) || !groupKey) {
      return res.status(400).json({ ok: false, error: 'action (promote|reject) + groupKey krävs' });
    }
    const targets = openBulkRecords().filter((r) => bulkGroupKey(r) === groupKey);
    const results = { ok: true, action, groupKey, matched: targets.length, done: 0, errors: [] };
    const actor = {
      userId: req.user?.id || req.user?.email || 'owner',
      role: 'owner',
      via: 'cm-bulk',
    };
    for (const record of targets) {
      try {
        if (action === 'reject') {
          cmStore.reject(record.id, {
            rejectedBy: actor.userId,
            reason: reason || 'bulk-avvisad per grupp',
          });
          results.done++;
          continue;
        }
        // promote — hoppa över poster utan belopp (kan inte bli verifikat)
        if (!record.amountIncVat) {
          results.errors.push({ recordId: record.id, error: 'saknar belopp — hoppad' });
          continue;
        }
        const documents = record.documentId
          ? [cmStore.getDocumentById(record.documentId)].filter(Boolean)
          : [];
        const rawItem = record.rawItemId ? cmStore.getRawItemById(record.rawItemId) : null;
        const result = await promoteRecordToCfo({
          record,
          documents,
          rawItem,
          cfoExpenseStore,
          actor,
        });
        if (!result.ok) {
          results.errors.push({ recordId: record.id, error: result.error });
          continue;
        }
        cmStore.markHandedOff(record.id, {
          cfoExpenseId: result.cfoExpense.id,
          actor: actor.userId,
        });
        if (category && cfoExpenseStore?.updateExpense) {
          await cfoExpenseStore
            .updateExpense({ id: result.cfoExpense.id, patch: { category }, actor: actor.userId })
            .catch((err) =>
              results.errors.push({ recordId: record.id, error: `kategori: ${err.message}` })
            );
        }
        results.done++;
      } catch (err) {
        results.errors.push({ recordId: record.id, error: err.message });
      }
    }
    await cmStore.persist();
    return res.json(results);
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
