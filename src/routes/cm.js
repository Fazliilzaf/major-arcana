'use strict';

const express = require('express');

function createCmRouter({ authStore, cmStore }) {
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
  router.post('/cm/documents', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const doc = cmStore.createDocument(req.body || {});
    await cmStore.persist();
    return res.json({ ok: true, document: doc });
  });

  // Create expense record from document
  router.post('/cm/expense-records', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    const record = cmStore.createExpenseRecord(req.body || {});
    await cmStore.persist();
    return res.json({ ok: true, record });
  });

  // Approve
  router.post('/cm/expense-records/:id/approve', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const record = cmStore.approve(req.params.id, { approvedBy: req.user?.id || req.body?.approvedBy });
    if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
    await cmStore.persist();
    return res.json({ ok: true, record });
  });

  // Reject
  router.post('/cm/expense-records/:id/reject', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const record = cmStore.reject(req.params.id, { rejectedBy: req.user?.id, reason: req.body?.reason });
    if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
    await cmStore.persist();
    return res.json({ ok: true, record });
  });

  // Mark exported
  router.post('/cm/expense-records/:id/export', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const record = cmStore.markExported(req.params.id, { externalAccountingId: req.body?.externalAccountingId });
    if (!record) return res.status(404).json({ ok: false, error: 'not_found' });
    await cmStore.persist();
    return res.json({ ok: true, record });
  });

  return router;
}

module.exports = { createCmRouter };
