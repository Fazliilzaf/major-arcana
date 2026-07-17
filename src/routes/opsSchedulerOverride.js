'use strict';

// ORD-74c: Ägar-styrd scheduler-override via API (komplement till ORD-74b).
//
// Bakgrund: Blueprint-sync pausad + Render env-editor/ssh onåbara maskinellt.
// Ägaren styr override-filen (se src/ops/schedulerOverride.js) via HTTP:
//   GET    /api/v1/ops/scheduler/override  → nuvarande fil + path
//   POST   /api/v1/ops/scheduler/override  → skriver validerade nycklar
//   DELETE /api/v1/ops/scheduler/override  → tar bort filen (ren env-styrning)
// Endast owner-rollen. Skriver ENDAST den fasta filen; exakt tre nycklar
// släpps igenom. Schedulern läser filen vid boot → restart krävs efter POST.

const express = require('express');
const fs = require('fs');
const { resolveOverridePath } = require('../ops/schedulerOverride');

function createOpsSchedulerOverrideRouter({
  requireCcoAuthenticated,
  attachRole,
  requireAnyRole,
  auditLog = null,
  logger = console,
}) {
  const router = express.Router();
  router.use(requireCcoAuthenticated, attachRole, requireAnyRole(['owner']));

  function audit(action, req, extra = {}) {
    if (!auditLog?.append) return;
    try {
      auditLog.append({
        action,
        actor: {
          role: 'owner',
          userId: req.ccoUser?.id || req.headers['x-cco-user'] || null,
          ip: req.ip || null,
        },
        ...extra,
      });
    } catch (err) {
      logger.warn(`[ops/scheduler-override] audit misslyckades: ${err.message}`);
    }
  }

  router.get('/scheduler/override', (req, res) => {
    const overridePath = resolveOverridePath();
    try {
      const raw = fs.readFileSync(overridePath, 'utf8');
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (_) {
        return res.json({ ok: true, path: overridePath, exists: true, valid: false });
      }
      return res.json({ ok: true, path: overridePath, exists: true, valid: true, override: parsed });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.json({ ok: true, path: overridePath, exists: false });
      }
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post('/scheduler/override', express.json(), (req, res) => {
    const body = req.body || {};
    const override = {};
    if (typeof body.schedulerEnabled === 'boolean') override.schedulerEnabled = body.schedulerEnabled;
    if (typeof body.schedulerJobs === 'string') override.schedulerJobs = body.schedulerJobs;
    if (typeof body.schedulerRunOnStartup === 'boolean') {
      override.schedulerRunOnStartup = body.schedulerRunOnStartup;
    }
    if (Object.keys(override).length === 0) {
      return res.status(400).json({
        ok: false,
        error:
          'Inga giltiga nycklar. Tillåtna: schedulerEnabled (bool), schedulerJobs (string), schedulerRunOnStartup (bool).',
      });
    }
    const overridePath = resolveOverridePath();
    try {
      fs.writeFileSync(overridePath, JSON.stringify(override));
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
    logger.warn(`[ops/scheduler-override] skriven via API: ${JSON.stringify(override)}`);
    audit('scheduler_override_write', req, { detail: override });
    return res.json({
      ok: true,
      path: overridePath,
      override,
      note: 'Restart krävs — schedulern läser filen vid boot.',
    });
  });

  router.delete('/scheduler/override', (req, res) => {
    const overridePath = resolveOverridePath();
    try {
      fs.unlinkSync(overridePath);
    } catch (err) {
      if (err.code !== 'ENOENT') return res.status(500).json({ ok: false, error: err.message });
    }
    logger.warn('[ops/scheduler-override] raderad via API — ren env-styrning igen');
    audit('scheduler_override_delete', req);
    return res.json({ ok: true, path: overridePath, deleted: true });
  });

  return router;
}

module.exports = { createOpsSchedulerOverrideRouter };
