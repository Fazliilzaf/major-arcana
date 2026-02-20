const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeTenantId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidTenantId(tenantId) {
  if (!tenantId) return false;
  return /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(tenantId);
}

function pickTenantConfigPatch(input = {}) {
  const patch = {};
  const fields = [
    'assistantName',
    'toneStyle',
    'brandProfile',
    'riskSensitivityModifier',
    'templateVariableAllowlistByCategory',
    'templateRequiredVariablesByCategory',
    'templateSignaturesByChannel',
  ];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      patch[field] = input[field];
    }
  }
  return patch;
}

async function attachTenantConfigs(tenantConfigStore, memberships = []) {
  const rows = [];
  for (const membership of memberships) {
    if (!membership?.tenantId) continue;
    const config = await tenantConfigStore.getTenantConfig(membership.tenantId);
    rows.push({
      tenantId: membership.tenantId,
      role: membership.role,
      status: membership.status,
      membershipId: membership.id,
      config,
    });
  }
  rows.sort((a, b) => String(a.tenantId).localeCompare(String(b.tenantId)));
  return rows;
}

function createTenantsRouter({
  tenantConfigStore,
  authStore,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.get('/tenants/my', requireAuth, requireRole(ROLE_OWNER, ROLE_STAFF), async (req, res) => {
    try {
      const memberships = await authStore.listMembershipsForUser(req.auth.userId, {
        includeDisabled: false,
      });
      const tenants = await attachTenantConfigs(tenantConfigStore, memberships);

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'tenants.my.read',
        outcome: 'success',
        targetType: 'user',
        targetId: req.auth.userId,
        metadata: { count: tenants.length },
      });

      return res.json({
        currentTenantId: req.auth.tenantId,
        count: tenants.length,
        tenants,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa tenants.' });
    }
  });

  router.post('/tenants/onboard', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const tenantId = normalizeTenantId(req.body?.tenantId);
      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId krävs.' });
      }
      if (!isValidTenantId(tenantId)) {
        return res.status(400).json({
          error:
            'tenantId måste vara slug-format (a-z, 0-9, bindestreck) och 3-63 tecken.',
        });
      }

      const ownerEmail = normalizeEmail(req.body?.ownerEmail || req.currentUser?.email);
      if (!ownerEmail) {
        return res.status(400).json({ error: 'ownerEmail saknas.' });
      }
      const ownerPassword = normalizeText(req.body?.ownerPassword);

      let ownerUser = req.currentUser;
      let ownerMembership = null;
      let createdUser = false;

      if (ownerEmail === normalizeEmail(req.currentUser?.email)) {
        ownerMembership = await authStore.ensureMembership({
          userId: req.auth.userId,
          tenantId,
          role: ROLE_OWNER,
          createdBy: req.auth.userId,
        });
        if (ownerPassword) {
          await authStore.setUserPassword(req.auth.userId, ownerPassword);
        }
      } else {
        if (!ownerPassword) {
          return res.status(400).json({
            error:
              'ownerPassword krävs när ownerEmail inte är din nuvarande inloggade användare.',
          });
        }

        const upsert = await authStore.upsertOwnerMember({
          tenantId,
          email: ownerEmail,
          password: ownerPassword,
          actorUserId: req.auth.userId,
        });
        ownerUser = upsert.user;
        ownerMembership = upsert.membership;
        createdUser = Boolean(upsert.createdUser);
      }

      const configPatch = pickTenantConfigPatch(req.body || {});
      await tenantConfigStore.getTenantConfig(tenantId);
      if (Object.keys(configPatch).length > 0) {
        await tenantConfigStore.updateTenantConfig({
          tenantId,
          patch: configPatch,
          actorUserId: req.auth.userId,
        });
      }
      const tenantConfig = await tenantConfigStore.getTenantConfig(tenantId);

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'tenants.onboard',
        outcome: 'success',
        targetType: 'tenant',
        targetId: tenantId,
        metadata: {
          ownerEmail,
          createdUser,
          configuredFields: Object.keys(configPatch),
        },
      });

      return res.status(201).json({
        tenant: {
          tenantId,
          config: tenantConfig,
        },
        owner: {
          user: ownerUser,
          membership: ownerMembership,
        },
      });
    } catch (error) {
      if (error?.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte onboarda tenant.' });
    }
  });

  return router;
}

module.exports = {
  createTenantsRouter,
};
