const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoMacrosRouter({
  macroStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/cco/macros',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macros = await macroStore.listTenantMacros({ tenantId: req.auth.tenantId });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.read',
          outcome: 'success',
          targetType: 'cco_macros',
          targetId: req.auth.tenantId,
          metadata: {
            count: macros.length,
          },
        });
        return res.json({ macros });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa makron.' });
      }
    },
  );

  router.post(
    '/cco/macros',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macro = await macroStore.saveMacro({
          tenantId: req.auth.tenantId,
          macro: req.body || {},
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.create',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macro.id,
          metadata: {
            trigger: macro.trigger,
          },
        });
        return res.status(201).json({ ok: true, macro });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte skapa makrot.' });
      }
    },
  );

  router.put(
    '/cco/macros/:macroId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macro = await macroStore.saveMacro({
          tenantId: req.auth.tenantId,
          macro: {
            ...(req.body || {}),
            id: normalizeText(req.params.macroId),
          },
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.update',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macro.id,
        });
        return res.json({ ok: true, macro });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte uppdatera makrot.' });
      }
    },
  );

  router.delete(
    '/cco/macros/:macroId',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macroId = normalizeText(req.params.macroId);
        const deleted = await macroStore.deleteMacro({
          tenantId: req.auth.tenantId,
          macroId,
        });
        if (!deleted) {
          return res.status(404).json({ error: 'Makrot hittades inte.' });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.delete',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macroId,
        });
        return res.json({
          ok: true,
          deleted: true,
          macroId,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte radera makrot.' });
      }
    },
  );

  router.post(
    '/cco/macros/:macroId/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const macroId = normalizeText(req.params.macroId);
        const macro = await macroStore.runMacro({
          tenantId: req.auth.tenantId,
          macroId,
        });
        if (!macro) {
          return res.status(404).json({ error: 'Makrot hittades inte.' });
        }
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.macros.run',
          outcome: 'success',
          targetType: 'cco_macro',
          targetId: macroId,
          metadata: {
            runCount: macro.runCount,
          },
        });
        return res.json({ ok: true, macro });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte köra makrot.' });
      }
    },
  );

  return router;
}

module.exports = {
  createCcoMacrosRouter,
};
