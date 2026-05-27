'use strict';

const express = require('express');
const { computeComplianceStatus } = require('../ops/complianceCommandCenter');

/**
 * Compliance Command Center — read-only status (GDPR/PDL/MDR/ISO 27001/SOC 2/
 * WCAG/audit/MFA) for the OWNER admin dashboard.
 *
 * computeComplianceStatus is a pure function with safe defaults; we feed the
 * signals we have from config and leave the rest at their defaults. Read-only,
 * OWNER-gated — exposes no PHI.
 */
function createComplianceRouter({ authStore, config = {} } = {}) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  router.get('/cco/compliance/status', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const status = computeComplianceStatus({
      corsStrict: Boolean(config.corsStrict),
      patientChatEnabled: Boolean(config.patientChatEnabled),
    });
    return res.json({ ok: true, ...status });
  });

  return router;
}

module.exports = { createComplianceRouter };
