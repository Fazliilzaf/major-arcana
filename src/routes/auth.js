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

function normalizeSessionRotationScope(value, fallback = 'none') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'tenant' || normalized === 'user' || normalized === 'none') return normalized;
  return fallback;
}

function normalizeHost(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  const first = withoutScheme.split('/')[0] || '';
  const host = first.split(':')[0] || '';
  return host.trim();
}

function safeEqualText(a, b) {
  return String(a || '') === String(b || '');
}

function createAuthRouter({
  authStore,
  requireAuth,
  requireRole,
  requireTenantScope,
  loginRateLimiter = null,
  selectTenantRateLimiter = null,
  ownerMfaBypassHosts = [],
  loginSessionRotationScope = 'none',
  bootstrapOwnerEmail = '',
  bootstrapOwnerPassword = '',
  bootstrapOwnerTenantId = '',
  ownerCredentialSelfHeal = true,
}) {
  const router = express.Router();

  const applyLoginRateLimit = typeof loginRateLimiter === 'function' ? loginRateLimiter : (_req, _res, next) => next();
  const applySelectTenantRateLimit =
    typeof selectTenantRateLimiter === 'function' ? selectTenantRateLimiter : (_req, _res, next) => next();
  const rotationScope = normalizeSessionRotationScope(loginSessionRotationScope, 'none');
  const ownerMfaBypassHostSet = new Set(
    (Array.isArray(ownerMfaBypassHosts) ? ownerMfaBypassHosts : [])
      .map((item) => normalizeHost(item))
      .filter(Boolean)
  );
  const normalizedBootstrapOwnerEmail = normalizeEmail(bootstrapOwnerEmail);
  const normalizedBootstrapOwnerTenantId = normalizeTenantId(bootstrapOwnerTenantId);
  const selfHealEnabled = ownerCredentialSelfHeal !== false;

  function isOwnerMfaBypassed(req) {
    if (ownerMfaBypassHostSet.size === 0) return false;
    const headerHostsRaw =
      (typeof req.get === 'function' && (req.get('x-forwarded-host') || req.get('host'))) || '';
    const headerHosts = String(headerHostsRaw)
      .split(',')
      .map((item) => normalizeHost(item))
      .filter(Boolean);
    const requestHost = normalizeHost(req?.hostname);
    const candidates = requestHost ? [requestHost, ...headerHosts] : headerHosts;
    return candidates.some((item) => ownerMfaBypassHostSet.has(item));
  }

  async function rotateSessionsAfterLogin({ userId, tenantId, currentSessionId }) {
    if (!userId || !currentSessionId || rotationScope === 'none') return 0;
    const tenantScope = rotationScope === 'tenant' ? tenantId : '';

    if (typeof authStore.revokeSessionsByUser === 'function') {
      const result = await authStore.revokeSessionsByUser(userId, {
        tenantId: tenantScope,
        excludeSessionId: currentSessionId,
        reason: 'login_rotation',
      });
      return Number(result?.count || 0);
    }

    const sessions = await authStore.listSessions({
      tenantId: tenantScope,
      userId,
      includeRevoked: false,
      limit: 500,
    });
    let revokedSessions = 0;
    for (const session of sessions) {
      if (!session?.id || session.id === currentSessionId) continue;
      const revoked = await authStore.revokeSession(session.id, { reason: 'login_rotation' });
      if (revoked) revokedSessions += 1;
    }
    return revokedSessions;
  }

  function toTenantOptions(memberships) {
    return (Array.isArray(memberships) ? memberships : [])
      .filter((membership) => membership?.tenantId)
      .map((membership) => ({
        tenantId: membership.tenantId,
        role: membership.role,
      }));
  }

  router.post('/auth/login', applyLoginRateLimit, async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const tenantId = normalizeTenantId(req.body?.tenantId);

      if (!email || !password) {
        return res.status(400).json({ error: 'E-postadress och lösenord krävs.' });
      }

      let user = await authStore.authenticateUser({ email, password });
      let ownerCredentialSelfHealed = false;
      if (
        !user &&
        selfHealEnabled &&
        normalizedBootstrapOwnerEmail &&
        typeof bootstrapOwnerPassword === 'string' &&
        typeof authStore.bootstrapOwner === 'function' &&
        email === normalizedBootstrapOwnerEmail &&
        safeEqualText(password, bootstrapOwnerPassword)
      ) {
        try {
          await authStore.bootstrapOwner({
            tenantId: normalizedBootstrapOwnerTenantId || tenantId || 'hair-tp-clinic',
            email: normalizedBootstrapOwnerEmail,
            password: bootstrapOwnerPassword,
            forcePasswordReset: true,
            forceMfaReset: false,
          });
          user = await authStore.authenticateUser({ email, password });
          ownerCredentialSelfHealed = Boolean(user);
        } catch (selfHealError) {
          await authStore.addAuditEvent({
            action: 'auth.login.owner_self_heal',
            outcome: 'error',
            metadata: {
              email,
              reason: String(selfHealError?.message || 'unknown'),
            },
          });
        }
      }
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
      }

      const hasOwnerMembership = memberships.some(
        (membership) => String(membership?.role || '').toUpperCase() === ROLE_OWNER
      );
      const ownerMfaBypassed = hasOwnerMembership && isOwnerMfaBypassed(req);
      const requiresMfa = ownerMfaBypassed
        ? false
        : hasOwnerMembership || Boolean(user?.mfaRequired);

      if (requiresMfa) {
        const pendingMfa =
          typeof authStore.createPendingMfaChallenge === 'function'
            ? await authStore.createPendingMfaChallenge({
                userId: user.id,
                membershipIds: memberships.map((membership) => membership.id),
                selectedMembershipId: selectedMembership?.id || '',
                requestedTenantId: tenantId || '',
              })
            : null;
        if (!pendingMfa?.ticket) {
          return res.status(500).json({ error: 'MFA challenge kunde inte initieras.' });
        }

        await authStore.addAuditEvent({
          actorUserId: user.id,
          action: 'auth.login.pending_mfa',
          outcome: 'success',
          targetType: 'pending_mfa',
          targetId: pendingMfa.ticket,
          metadata: {
            tenantRequested: tenantId || null,
            setupRequired: Boolean(pendingMfa.setupRequired),
            tenantCount: memberships.length,
            ownerMfaBypassed: false,
          },
        });

        return res.json({
          requiresMfa: true,
          mfaTicket: pendingMfa.ticket,
          expiresAt: pendingMfa.expiresAt,
          mfa: {
            setupRequired: Boolean(pendingMfa.setupRequired),
            ...(pendingMfa.setup || {}),
          },
          tenants: toTenantOptions(memberships),
        });
      }

      if (!selectedMembership) {
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
          tenants: toTenantOptions(memberships),
        });
      }

      const created = await authStore.createSession({
        userId: user.id,
        membershipId: selectedMembership.id,
      });
      const rotatedSessions = await rotateSessionsAfterLogin({
        userId: user.id,
        tenantId: selectedMembership.tenantId,
        currentSessionId: created.session.id,
      });

      await authStore.addAuditEvent({
        tenantId: selectedMembership.tenantId,
        actorUserId: user.id,
        action: 'auth.login',
        outcome: 'success',
        targetType: 'session',
        targetId: created.session.id,
        metadata: {
          role: selectedMembership.role,
          rotatedSessions,
          rotationScope,
          ownerMfaBypassed,
          ownerCredentialSelfHealed,
        },
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

  router.post('/auth/mfa/verify', applySelectTenantRateLimit, async (req, res) => {
    try {
      const mfaTicket = typeof req.body?.mfaTicket === 'string' ? req.body.mfaTicket.trim() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const tenantId = normalizeTenantId(req.body?.tenantId);

      if (!mfaTicket || !code) {
        return res.status(400).json({ error: 'mfaTicket och code krävs.' });
      }

      if (typeof authStore.verifyMfaChallenge !== 'function') {
        return res.status(503).json({ error: 'MFA verifiering är inte tillgänglig.' });
      }

      const mfaResult = await authStore.verifyMfaChallenge({
        ticket: mfaTicket,
        code,
      });
      if (!mfaResult?.ok) {
        const statusCode =
          mfaResult?.error === 'invalid_ticket' || mfaResult?.error === 'expired_ticket' ? 400 : 401;
        const errorMessage =
          mfaResult?.error === 'too_many_attempts'
            ? 'För många MFA-försök. Logga in igen.'
            : mfaResult?.error === 'expired_ticket'
            ? 'MFA-ticket har gått ut. Logga in igen.'
            : mfaResult?.error === 'invalid_ticket'
            ? 'MFA-ticket är ogiltig.'
            : 'Fel MFA-kod.';

        await authStore.addAuditEvent({
          actorUserId: mfaResult?.userId || null,
          action: 'auth.mfa.verify',
          outcome: 'denied',
          targetType: 'pending_mfa',
          targetId: mfaTicket,
          metadata: {
            error: mfaResult?.error || 'invalid_code',
          },
        });

        return res.status(statusCode).json({ error: errorMessage });
      }

      const user = await authStore.getUserById(mfaResult.userId);
      if (!user) {
        return res.status(404).json({ error: 'Användaren hittades inte.' });
      }

      const membershipsAll = await authStore.listMembershipsForUser(mfaResult.userId, {
        includeDisabled: false,
      });
      const allowedMembershipIds = new Set(
        Array.isArray(mfaResult.membershipIds) ? mfaResult.membershipIds : []
      );
      const memberships = membershipsAll.filter(
        (membership) =>
          allowedMembershipIds.size === 0 || allowedMembershipIds.has(String(membership?.id || ''))
      );

      if (memberships.length === 0) {
        await authStore.addAuditEvent({
          actorUserId: mfaResult.userId,
          action: 'auth.mfa.verify',
          outcome: 'denied',
          targetType: 'pending_mfa',
          targetId: mfaTicket,
          metadata: { reason: 'no_memberships_after_mfa' },
        });
        return res.status(403).json({ error: 'Inga aktiva medlemskap hittades.' });
      }

      let selectedMembership = null;
      const selectedMembershipId = String(mfaResult.selectedMembershipId || '').trim();
      if (selectedMembershipId) {
        selectedMembership =
          memberships.find((membership) => String(membership?.id || '') === selectedMembershipId) ||
          null;
      }
      if (!selectedMembership && tenantId) {
        selectedMembership =
          memberships.find((membership) => normalizeTenantId(membership?.tenantId) === tenantId) ||
          null;
      }
      if (!selectedMembership && memberships.length === 1) {
        selectedMembership = memberships[0];
      }

      await authStore.addAuditEvent({
        actorUserId: mfaResult.userId,
        action: 'auth.mfa.verify',
        outcome: 'success',
        targetType: 'pending_mfa',
        targetId: mfaTicket,
        metadata: {
          usedRecoveryCode: Boolean(mfaResult.usedRecoveryCode),
          setupCompleted: Boolean(mfaResult.setupCompleted),
          recoveryCodesRemaining: Number(mfaResult.recoveryCodesRemaining || 0),
        },
      });

      if (!selectedMembership) {
        const pending = await authStore.createPendingLoginTicket({
          userId: mfaResult.userId,
          membershipIds: memberships.map((membership) => membership.id),
        });

        await authStore.addAuditEvent({
          actorUserId: mfaResult.userId,
          action: 'auth.mfa.verify.pending_tenant_selection',
          outcome: 'success',
          targetType: 'pending_login',
          targetId: pending.ticket,
        });

        return res.json({
          requiresTenantSelection: true,
          loginTicket: pending.ticket,
          expiresAt: pending.expiresAt,
          tenants: toTenantOptions(memberships),
        });
      }

      const created = await authStore.createSession({
        userId: mfaResult.userId,
        membershipId: selectedMembership.id,
      });
      const rotatedSessions = await rotateSessionsAfterLogin({
        userId: mfaResult.userId,
        tenantId: selectedMembership.tenantId,
        currentSessionId: created.session.id,
      });

      await authStore.addAuditEvent({
        tenantId: selectedMembership.tenantId,
        actorUserId: mfaResult.userId,
        action: 'auth.login',
        outcome: 'success',
        targetType: 'session',
        targetId: created.session.id,
        metadata: {
          role: selectedMembership.role,
          rotatedSessions,
          rotationScope,
          mfa: {
            usedRecoveryCode: Boolean(mfaResult.usedRecoveryCode),
            setupCompleted: Boolean(mfaResult.setupCompleted),
            recoveryCodesRemaining: Number(mfaResult.recoveryCodesRemaining || 0),
          },
        },
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
      return res.status(500).json({ error: 'Något gick fel vid MFA-verifiering.' });
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
      const rotatedSessions = await rotateSessionsAfterLogin({
        userId: pending.userId,
        tenantId: membership.tenantId,
        currentSessionId: created.session.id,
      });

      const user = await authStore.getUserById(pending.userId);
      await authStore.addAuditEvent({
        tenantId: membership.tenantId,
        actorUserId: pending.userId,
        action: 'auth.select_tenant',
        outcome: 'success',
        targetType: 'session',
        targetId: created.session.id,
        metadata: {
          rotatedSessions,
          rotationScope,
        },
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

  router.post('/auth/change-password', requireAuth, async (req, res) => {
    try {
      const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
      const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
      const revokeOtherSessions = parseBoolean(req.body?.revokeOtherSessions, true);
      const revokeScopeRaw =
        typeof req.body?.revokeScope === 'string' ? req.body.revokeScope.trim().toLowerCase() : '';
      const revokeScope = revokeScopeRaw === 'tenant' ? 'tenant' : 'all';
      const revokeAllSessions = parseBoolean(req.body?.revokeAllSessions, revokeScope !== 'tenant');
      const revokeCurrentSession = parseBoolean(req.body?.revokeCurrentSession, true);

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword och newPassword krävs.' });
      }
      if (newPassword.trim().length < 10) {
        return res.status(400).json({ error: 'Nytt lösenord måste vara minst 10 tecken.' });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'Nytt lösenord måste skilja sig från nuvarande.' });
      }

      const verifiedUser = await authStore.authenticateUser({
        email: req.currentUser?.email || '',
        password: currentPassword,
      });
      if (!verifiedUser) {
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'auth.password.change',
          outcome: 'denied',
          targetType: 'user',
          targetId: req.auth.userId,
          metadata: { reason: 'invalid_current_password' },
        });
        return res.status(401).json({ error: 'Nuvarande lösenord är fel.' });
      }

      const updatedUser = await authStore.setUserPassword(req.auth.userId, newPassword);
      if (!updatedUser) {
        return res.status(404).json({ error: 'Användaren hittades inte.' });
      }

      let revokedSessions = 0;
      let currentSessionRevoked = false;
      if (revokeOtherSessions) {
        const tenantScope = revokeAllSessions ? '' : req.auth.tenantId;
        const excludeSessionId = revokeCurrentSession && revokeAllSessions ? '' : req.auth.sessionId;

        if (typeof authStore.revokeSessionsByUser === 'function') {
          const revokeResult = await authStore.revokeSessionsByUser(req.auth.userId, {
            tenantId: tenantScope,
            excludeSessionId,
            reason: 'password_changed',
          });
          revokedSessions = Number(revokeResult?.count || 0);
          if (Array.isArray(revokeResult?.revokedSessionIds)) {
            currentSessionRevoked = revokeResult.revokedSessionIds.includes(req.auth.sessionId);
          }
        } else {
          const sessions = await authStore.listSessions({
            tenantId: tenantScope,
            userId: req.auth.userId,
            includeRevoked: false,
            limit: 500,
          });
          for (const session of sessions) {
            if (!session?.id || session.id === excludeSessionId) continue;
            const revoked = await authStore.revokeSession(session.id, {
              reason: 'password_changed',
            });
            if (revoked) {
              revokedSessions += 1;
              if (session.id === req.auth.sessionId) currentSessionRevoked = true;
            }
          }
        }
      }

      await authStore.addAuditEvent({
        tenantId: req.auth.tenantId,
        actorUserId: req.auth.userId,
        action: 'auth.password.change',
        outcome: 'success',
        targetType: 'user',
        targetId: req.auth.userId,
        metadata: {
          revokeOtherSessions,
          revokeAllSessions,
          revokeScope: revokeAllSessions ? 'all' : 'tenant',
          revokeCurrentSession: revokeCurrentSession && revokeAllSessions,
          revokedSessions,
          currentSessionRevoked,
        },
      });

      return res.json({
        ok: true,
        revokedSessions,
        currentSessionRevoked,
        requiresReauth: currentSessionRevoked,
        user: updatedUser,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte byta lösenord.' });
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
      try {
        await authStore.addAuditEvent({
          tenantId: req.auth.tenantId,
          actorUserId: req.auth.userId,
          action: 'tenants.access_check',
          outcome: 'success',
          targetType: 'tenant',
          targetId: req.auth.tenantId,
        });
      } catch (error) {
        console.error(error);
      }
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

      const patch = {};

      const nextStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
      if (nextStatus) {
        if (!['active', 'disabled'].includes(nextStatus)) {
          return res.status(400).json({ error: 'status måste vara active eller disabled.' });
        }
        patch.status = nextStatus;
      }

      const nextRoleRaw = typeof req.body?.role === 'string' ? req.body.role.trim().toUpperCase() : '';
      if (nextRoleRaw) {
        if (![ROLE_STAFF, ROLE_OWNER].includes(nextRoleRaw)) {
          return res.status(400).json({ error: 'role måste vara STAFF eller OWNER.' });
        }
        patch.role = nextRoleRaw;
      }

      if (!Object.keys(patch).length) {
        return res.status(400).json({ error: 'Inget att uppdatera. Ange status och/eller role.' });
      }

      const effectiveRole = typeof patch.role === 'string' ? patch.role : existing.role;
      const effectiveStatus = typeof patch.status === 'string' ? patch.status : existing.status;
      const removesActiveOwner =
        existing.role === ROLE_OWNER &&
        existing.status === 'active' &&
        (effectiveRole !== ROLE_OWNER || effectiveStatus !== 'active');

      if (removesActiveOwner) {
        const members = await authStore.listTenantMembers(req.auth.tenantId);
        const otherActiveOwners = members.filter((item) => {
          const membership = item?.membership;
          if (!membership || membership.id === membershipId) return false;
          return membership.role === ROLE_OWNER && membership.status === 'active';
        }).length;
        if (otherActiveOwners < 1) {
          return res.status(400).json({ error: 'Minst en aktiv OWNER måste finnas i tenant.' });
        }
      }

      const updated = await authStore.updateMembership(membershipId, patch);
      if (!updated) {
        return res.status(404).json({ error: 'Medlemskapet hittades inte.' });
      }

      if (patch.status === 'disabled') {
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
        metadata: {
          patch,
          revokedSessions: patch.status === 'disabled',
          before: {
            role: existing.role,
            status: existing.status,
          },
          after: {
            role: updated.role,
            status: updated.status,
          },
          diff: [
            ...(existing.role !== updated.role
              ? [
                  {
                    field: 'role',
                    before: existing.role,
                    after: updated.role,
                  },
                ]
              : []),
            ...(existing.status !== updated.status
              ? [
                  {
                    field: 'status',
                    before: existing.status,
                    after: updated.status,
                  },
                ]
              : []),
          ],
        },
      });

      return res.json({ membership: updated });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte uppdatera staff-medlemskap.' });
    }
  });

  router.get(
    '/audit/integrity',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      try {
        const maxIssues = parseLimit(req.query?.maxIssues, 25);
        const report = await authStore.verifyAuditIntegrity({ maxIssues });
        return res.json(report);
      } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Kunde inte verifiera auditkedjan.' });
      }
    }
  );

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
