const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function createTenantConfigRouter({
  tenantConfigStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/tenant-config', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const tenantConfig = await tenantConfigStore.getTenantConfig(req.auth.tenantId);

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'tenant_config.read',
        outcome: 'success',
        targetType: 'tenant_config',
        targetId: req.auth.tenantId,
      });

      return res.json({
        tenantId: req.auth.tenantId,
        config: tenantConfig,
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa tenant config.' });
    }
  });

  router.patch('/tenant-config', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const patchInput = req.body || {};
      const changedFields = Object.keys(patchInput);
      const previousConfig = await tenantConfigStore.getTenantConfig(req.auth.tenantId);
      const updated = await tenantConfigStore.updateTenantConfig({
        tenantId: req.auth.tenantId,
        patch: patchInput,
        actorUserId: req.auth.userId,
      });

      const before = {};
      const after = {};
      const diff = [];
      for (const field of changedFields) {
        const previousValue = previousConfig?.[field] ?? null;
        const nextValue = updated?.[field] ?? null;
        before[field] = previousValue;
        after[field] = nextValue;
        if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
          diff.push({
            field,
            before: previousValue,
            after: nextValue,
          });
        }
      }

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'tenant_config.update',
        outcome: 'success',
        targetType: 'tenant_config',
        targetId: req.auth.tenantId,
        metadata: {
          fields: changedFields,
          before,
          after,
          diff,
        },
      });

      return res.json({
        tenantId: req.auth.tenantId,
        config: updated,
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte uppdatera tenant config.' });
    }
  });

  return router;
}

module.exports = {
  createTenantConfigRouter,
};
