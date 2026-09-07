'use strict';

/**
 * staffApprovals.js — Approval Center backend (WP-010, DEL B/C).
 *
 * Server-side auktoritet. Klienten kan ALDRIG skicka approved=true som bevis —
 * varje approve/reject verifieras här: approver identity, tenant, OWNER-roll
 * (staff.manage), request PENDING, ej expired, samt TOCTOU (snapshot match).
 * Approval binds till exakt action + repo + worktree + base SHA.
 */

const express = require('express');
const { requirePermission } = require('../security/ccoRbac');
const { getAuthContext } = require('../security/requireAgentEntitlement');

const APPROVABLE_CLASSES = new Set(['OWNER_APPROVAL', 'RELEASE_APPROVAL']);

function createStaffApprovalsRouter({ requireAuth, approvalStore, repoAdapter } = {}) {
  const router = express.Router();
  const auth = typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  function resolveStore(req, res) {
    if (!approvalStore || typeof approvalStore.get !== 'function') {
      res.status(503).json({ error: 'approval_store_unavailable' });
      return null;
    }
    return approvalStore;
  }

  // Lista pending approvals för aktörens tenant (endast approvable classes).
  router.get('/staff/approvals', auth, requirePermission('staff.manage'), (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const actor = getAuthContext(req);
    const all = s.listPending({ tenant: actor.tenantId });
    const visible = all.filter((a) => APPROVABLE_CLASSES.has(a.approvalClass));
    res.json({ approvals: visible });
  });

  // Godkänn + exekvera exakt den registrerade WRITE-operationen.
  router.post('/staff/approvals/:id/approve', auth, requirePermission('staff.manage'), async (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const actor = getAuthContext(req);
    const approval = s.get(req.params.id);

    if (!approval) return res.status(404).json({ error: 'not_found' });
    if (approval.tenant !== actor.tenantId) return res.status(403).json({ error: 'cross_tenant' });
    if (!APPROVABLE_CLASSES.has(approval.approvalClass)) return res.status(403).json({ error: 'approval_class_not_allowed' });
    if (approval.status !== 'PENDING') return res.status(409).json({ error: `not_pending_${String(approval.status).toLowerCase()}` });

    // TOCTOU (DEL F/G): snapshot måste matcha INNAN godkännandet.
    if (repoAdapter && typeof repoAdapter.checkCandidateSnapshot === 'function') {
      const check = repoAdapter.checkCandidateSnapshot(approval);
      if (!check.ok) return res.status(409).json({ error: check.reason, detail: 'Kandidaten har ändrats — kräver nytt approval.' });
    }

    const approved = await s.approve(approval.id, { approver: actor.userId });
    if (!approved) {
      const current = s.get(approval.id);
      return res.status(409).json({ error: current?.status === 'EXPIRED' ? 'expired' : 'approve_failed' });
    }

    if (!repoAdapter || typeof repoAdapter.executeApprovedWrite !== 'function') {
      return res.status(503).json({ error: 'repo_adapter_unavailable' });
    }
    const receipt = await repoAdapter.executeApprovedWrite({ approvalId: approval.id, approvalStore: s });
    return res.json({ receipt });
  });

  // Avvisa (historik behålls).
  router.post('/staff/approvals/:id/reject', auth, requirePermission('staff.manage'), async (req, res) => {
    const s = resolveStore(req, res);
    if (!s) return;
    const actor = getAuthContext(req);
    const approval = s.get(req.params.id);

    if (!approval) return res.status(404).json({ error: 'not_found' });
    if (approval.tenant !== actor.tenantId) return res.status(403).json({ error: 'cross_tenant' });
    if (approval.status !== 'PENDING') return res.status(409).json({ error: `not_pending_${String(approval.status).toLowerCase()}` });

    const rejected = await s.reject(approval.id, { approver: actor.userId, reason: req.body?.reason });
    return res.json({ ok: true, status: 'REJECTED', approval: rejected });
  });

  return router;
}

module.exports = { createStaffApprovalsRouter, APPROVABLE_CLASSES };
