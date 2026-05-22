const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function createCcoSettingsRouter({
  settingsStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get(
    '/cco/settings',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const settings = await settingsStore.getTenantSettings({ tenantId: req.auth.tenantId });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.settings.read',
          outcome: 'success',
          targetType: 'cco_settings',
          targetId: req.auth.tenantId,
        });
        return res.json({ settings });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa inställningarna.' });
      }
    },
  );

  router.put(
    '/cco/settings',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const settings = await settingsStore.saveTenantSettings({
          tenantId: req.auth.tenantId,
          settings: req.body || {},
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.settings.update',
          outcome: 'success',
          targetType: 'cco_settings',
          targetId: req.auth.tenantId,
          metadata: {
            theme: settings.theme,
            density: settings.density,
          },
        });
        return res.json({ ok: true, settings });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte spara inställningarna.' });
      }
    },
  );

  router.post(
    '/cco/settings/request-delete-account',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const result = await settingsStore.requestDeleteAccount({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
        });
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'cco.settings.request_delete_account',
          outcome: 'success',
          targetType: 'cco_settings',
          targetId: req.auth.tenantId,
        });
        return res.status(202).json({
          ok: true,
          deleteRequestedAt: result.deleteRequestedAt,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte flagga kontot för radering.' });
      }
    },
  );

  return router;
}

module.exports = {
  createCcoSettingsRouter,
};
