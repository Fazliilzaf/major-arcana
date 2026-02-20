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
      const updated = await tenantConfigStore.updateTenantConfig({
        tenantId: req.auth.tenantId,
        patch: req.body || {},
        actorUserId: req.auth.userId,
      });

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'tenant_config.update',
        outcome: 'success',
        targetType: 'tenant_config',
        targetId: req.auth.tenantId,
        metadata: {
          fields: Object.keys(req.body || {}),
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
