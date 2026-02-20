const express = require('express');

const { getPermissionsForRole, ROLE_OWNER, ROLE_STAFF } = require('../security/roles');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeTenantId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseLimit(value, fallback = 100) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function createAuthRouter({
  authStore,
  requireAuth,
  requireRole,
  requireTenantScope,
  loginRateLimiter = null,
  selectTenantRateLimiter = null,
}) {
  const router = express.Router();

  const applyLoginRateLimit = typeof loginRateLimiter === 'function' ? loginRateLimiter : (_req, _res, next) => next();
  const applySelectTenantRateLimit =
    typeof selectTenantRateLimiter === 'function' ? selectTenantRateLimiter : (_req, _res, next) => next();

  router.post('/auth/login', applyLoginRateLimit, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const tenantId = normalizeTenantId(req.body?.tenantId);

      if (!email || !password) {
        return res.status(400).json({ error: 'E-postadress och lösenord krävs.' });
      }

      const user = await authStore.authenticateUser({ email, password });
      if (!user) {
        await authStore.addAuditEvent({
          action: 'auth.login',
          outcome: 'denied',
          metadata: { email },
        });
        return res.status(401).json({ error: 'Fel e-postadress eller lösenord.' });
      }

      const memberships = await authStore.listMembershipsForUser(user.id, {
        includeDisabled: false,
      });
      if (memberships.length === 0) {
        await authStore.addAuditEvent({
          actorUserId: user.id,
          action: 'auth.login',
          outcome: 'denied',
          metadata: { reason: 'no_active_memberships' },
        });
        return res.status(403).json({ error: 'Inga aktiva medlemskap hittades.' });
      }

      let selectedMembership = null;
      if (tenantId) {
        selectedMembership =
          memberships.find((membership) => membership.tenantId === tenantId) || null;
        if (!selectedMembership) {
          await authStore.addAuditEvent({
            actorUserId: user.id,
            action: 'auth.login',
            outcome: 'denied',
            metadata: { reason: 'tenant_not_allowed', tenantId },
          });
          return res.status(403).json({ error: 'Du har inte åtkomst till denna tenant.' });
        }
      } else if (memberships.length === 1) {
        selectedMembership = memberships[0];
      } else {
        const pending = await authStore.createPendingLoginTicket({
          userId: user.id,
          membershipIds: memberships.map((membership) => membership.id),
        });

        await authStore.addAuditEvent({
          actorUserId: user.id,
          action: 'auth.login.pending_tenant_selection',
          outcome: 'success',
          targetType: 'pending_login',
          targetId: pending.ticket,
        });

        return res.json({
          requiresTenantSelection: true,
          loginTicket: pending.ticket,
          expiresAt: pending.expiresAt,
          tenants: memberships.map((membership) => ({
            tenantId: membership.tenantId,
            role: membership.role,
          })),
        });
      }

      const created = await authStore.createSession({
        userId: user.id,
        membershipId: selectedMembership.id,
      });

      await authStore.addAuditEvent({
        tenantId: selectedMembership.tenantId,
        actorUserId: user.id,
        action: 'auth.login',
        outcome: 'success',
        targetType: 'session',
        targetId: created.session.id,
        metadata: { role: selectedMembership.role },
      });

      return res.json({
        token: created.token,
        expiresAt: created.session.expiresAt,
        user,
        membership: selectedMembership,
        permissions: getPermissionsForRole(selectedMembership.role),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel vid inloggning.' });
    }
  });

  router.post('/auth/select-tenant', applySelectTenantRateLimit, async (req, res) => {
    try {
      const loginTicket =
        typeof req.body?.loginTicket === 'string' ? req.body.loginTicket.trim() : '';
      const tenantId = normalizeTenantId(req.body?.tenantId);
      if (!loginTicket || !tenantId) {
        return res.status(400).json({ error: 'loginTicket och tenantId krävs.' });
      }

      const pending = await authStore.consumePendingLoginTicket(loginTicket);
      if (!pending) {
        return res.status(400).json({ error: 'loginTicket är ogiltig eller har gått ut.' });
      }

      const memberships = await authStore.listMembershipsForUser(pending.userId, {
        includeDisabled: false,
      });
      const membership = memberships.find(
        (item) =>
          item.tenantId === tenantId && Array.isArray(pending.membershipIds) && pending.membershipIds.includes(item.id)
      );

      if (!membership) {
        await authStore.addAuditEvent({
          actorUserId: pending.userId,
          action: 'auth.select_tenant',
          outcome: 'denied',
          metadata: { tenantId },
        });
        return res.status(403).json({ error: 'Du har inte åtkomst till denna tenant.' });
      }

      const created = await authStore.createSession({
        userId: pending.userId,
        membershipId: membership.id,
      });

      const user = await authStore.getUserById(pending.userId);
      await authStore.addAuditEvent({
        tenantId: membership.tenantId,
        actorUserId: pending.userId,
        action: 'auth.select_tenant',
        outcome: 'success',
        targetType: 'session',
        targetId: created.session.id,
      });

      return res.json({
        token: created.token,
        expiresAt: created.session.expiresAt,
        user,
        membership,
        permissions: getPermissionsForRole(membership.role),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel vid tenant-val.' });
    }
  });

  router.post(
    '/auth/switch-tenant',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    applySelectTenantRateLimit,
    async (req, res) => {
      try {
        const tenantId = normalizeTenantId(req.body?.tenantId);
        if (!tenantId) {
          return res.status(400).json({ error: 'tenantId krävs.' });
        }

        const memberships = await authStore.listMembershipsForUser(req.auth.userId, {
          includeDisabled: false,
        });
        const membership =
          memberships.find((item) => normalizeTenantId(item.tenantId) === tenantId) || null;
        if (!membership) {
          await authStore.addAuditEvent({
            tenantId: req.auth.tenantId,
            actorUserId: req.auth.userId,
            action: 'auth.switch_tenant',
            outcome: 'denied',
            metadata: { tenantId, reason: 'tenant_not_allowed' },
          });
          return res.status(403).json({ error: 'Du har inte åtkomst till denna tenant.' });
        }

        const created = await authStore.createSession({
          userId: req.auth.userId,
          membershipId: membership.id,
        });

        await authStore.revokeSession(req.auth.sessionId, { reason: 'switch_tenant' });

        await authStore.addAuditEvent({
          tenantId: membership.tenantId,
          actorUserId: req.auth.userId,
          action: 'auth.switch_tenant',
          outcome: 'success',
          targetType: 'session',
          targetId: created.session.id,
          metadata: {
            previousTenantId: req.auth.tenantId,
            previousSessionId: req.auth.sessionId,
          },
        });

        return res.json({
          token: created.token,
          expiresAt: created.session.expiresAt,
          user: req.currentUser,
          membership,
          permissions: getPermissionsForRole(membership.role),
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Något gick fel vid tenant-byte.' });
      }
    }
  );

  router.post('/auth/logout', requireAuth, async (req, res) => {
    try {
      await authStore.revokeSession(req.auth.sessionId, { reason: 'logout' });
      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'auth.logout',
        outcome: 'success',
        targetType: 'session',
        targetId: req.auth.sessionId,
      });
      return res.json({ ok: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Något gick fel vid utloggning.' });
    }
  });

  router.get('/auth/me', requireAuth, async (req, res) => {
    const memberships = await authStore.listMembershipsForUser(req.auth.userId, {
      includeDisabled: false,
    });
    return res.json({
      user: req.currentUser,
      membership: req.currentMembership,
      memberships,
      session: req.currentSession,
      permissions: getPermissionsForRole(req.auth.role),
    });
  });

  router.get(
    '/auth/sessions',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const scope = typeof req.query?.scope === 'string' ? req.query.scope.trim().toLowerCase() : 'me';
        const includeRevoked = parseBoolean(req.query?.includeRevoked, false);
        const limit = parseLimit(req.query?.limit, 100);

        const isOwner = req.auth.role === ROLE_OWNER;
        if (scope === 'tenant' && !isOwner) {
          return res.status(403).json({ error: 'Endast OWNER kan läsa tenant-sessions.' });
        }

        const sessionRows = await authStore.listSessionsDetailed({
          tenantId: req.auth.tenantId,
          userId: scope === 'tenant' ? '' : req.auth.userId,
          includeRevoked,
          limit,
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'auth.sessions.read',
          outcome: 'success',
          targetType: 'sessions',
          targetId: req.auth.tenantId,
          metadata: { scope, includeRevoked, count: sessionRows.length },
        });

        return res.json({
          tenantId: req.auth.tenantId,
          scope: scope === 'tenant' ? 'tenant' : 'me',
          includeRevoked,
          currentSessionId: req.auth.sessionId,
          count: sessionRows.length,
          sessions: sessionRows,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa sessions.' });
      }
    }
  );

  router.post(
    '/auth/sessions/:sessionId/revoke',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const sessionId = typeof req.params?.sessionId === 'string' ? req.params.sessionId.trim() : '';
        if (!sessionId) return res.status(400).json({ error: 'sessionId saknas.' });

        const details = await authStore.getSessionDetailsById(sessionId);
        if (!details?.session) {
          return res.status(404).json({ error: 'Sessionen hittades inte.' });
        }
        if (details.session.tenantId !== req.auth.tenantId) {
          return res.status(403).json({ error: 'Du har inte åtkomst till denna session.' });
        }

        if (req.auth.role !== ROLE_OWNER && details.session.userId !== req.auth.userId) {
          return res.status(403).json({ error: 'Du får bara avsluta dina egna sessioner.' });
        }

        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        const revoked = await authStore.revokeSession(sessionId, {
          reason: reason || 'owner_panel_revoke',
        });

        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'auth.sessions.revoke',
          outcome: revoked ? 'success' : 'noop',
          targetType: 'session',
          targetId: sessionId,
          metadata: {
            reason: reason || 'owner_panel_revoke',
            revokedSessionUserId: details.session.userId,
          },
        });

        return res.json({
          ok: true,
          revoked,
          sessionId,
          currentSessionRevoked: req.auth.sessionId === sessionId,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte avsluta session.' });
      }
    }
  );

  router.get(
    '/tenants/:tenantId/access-check',
    requireAuth,
    requireTenantScope({ paramKey: 'tenantId', optional: false }),
    async (req, res) => {
      return res.json({
        ok: true,
        tenantId: req.auth.tenantId,
        role: req.auth.role,
      });
    }
  );

  router.get('/users/staff', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const members = await authStore.listTenantMembers(req.auth.tenantId);
      return res.json({
        tenantId: req.auth.tenantId,
        members,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa användare.' });
    }
  });

  router.post('/users/staff', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const tenantId = normalizeTenantId(req.body?.tenantId) || req.auth.tenantId;

      if (!email || !password) {
        return res.status(400).json({ error: 'E-postadress och lösenord krävs.' });
      }

      if (tenantId !== req.auth.tenantId) {
        return res.status(403).json({ error: 'Du kan bara skapa staff i din tenant.' });
      }

      const result = await authStore.upsertStaffMember({
        tenantId,
        email,
        password,
        actorUserId: req.auth.userId,
      });

      await authStore.addAuditEvent({
        tenantId,
        actorUserId: req.auth.userId,
        action: 'users.staff.upsert',
        outcome: 'success',
        targetType: 'membership',
        targetId: result.membership.id,
        metadata: {
          email,
          createdUser: result.createdUser,
        },
      });

      return res.status(result.createdUser ? 201 : 200).json(result);
    } catch (error) {
      if (error && error.message) {
        return res.status(400).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte spara staff-användare.' });
    }
  });

  router.patch('/users/staff/:membershipId', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    try {
      const membershipId = String(req.params.membershipId || '').trim();
      if (!membershipId) {
        return res.status(400).json({ error: 'membershipId saknas.' });
      }

      const existing = await authStore.getMembershipById(membershipId);
      if (!existing) {
        return res.status(404).json({ error: 'Medlemskapet hittades inte.' });
      }
      if (existing.tenantId !== req.auth.tenantId) {
        return res.status(403).json({ error: 'Du har inte åtkomst till detta medlemskap.' });
      }
      if (existing.role === ROLE_OWNER) {
        return res.status(400).json({ error: 'Owner-medlemskap kan inte ändras här.' });
      }

      const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
      if (!['active', 'disabled'].includes(nextStatus)) {
        return res.status(400).json({ error: 'status måste vara active eller disabled.' });
      }

      const updated = await authStore.updateMembership(membershipId, { status: nextStatus });
      if (!updated) {
        return res.status(404).json({ error: 'Medlemskapet hittades inte.' });
      }

      if (nextStatus === 'disabled') {
        await authStore.revokeSessionsByMembership(membershipId, {
          reason: 'membership_disabled',
        });
      }

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'users.staff.update',
        outcome: 'success',
        targetType: 'membership',
        targetId: membershipId,
        metadata: { status: nextStatus },
      });

      return res.json({ membership: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte uppdatera staff-medlemskap.' });
    }
  });

  router.get(
    '/audit/events',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    requireTenantScope({ queryKey: 'tenantId', optional: true }),
    async (req, res) => {
      try {
        const tenantId = normalizeTenantId(req.query?.tenantId) || req.auth.tenantId;
        const outcome = typeof req.query?.outcome === 'string' ? req.query.outcome : '';
        const limit = parseLimit(req.query?.limit, 100);

        const events = await authStore.listAuditEvents({
          tenantId,
          outcome,
          limit,
        });

        return res.json({
          tenantId,
          count: events.length,
          events,
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte läsa audit-loggen.' });
      }
    }
  );

  return router;
}

module.exports = {
  createAuthRouter,
};
