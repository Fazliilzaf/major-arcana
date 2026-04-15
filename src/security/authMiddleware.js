const { normalizeRole } = require('./roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getAuthToken(req) {
  const fromHeader = req.get('authorization') || '';
  if (fromHeader.toLowerCase().startsWith('bearer ')) {
    const token = fromHeader.slice(7).trim();
    if (token) return token;
  }

  const fromCustomHeader = req.get('x-auth-token');
  if (fromCustomHeader && String(fromCustomHeader).trim()) {
    return String(fromCustomHeader).trim();
  }

  return '';
}

function isLocalPreviewRequest(req) {
  const host = normalizeText(req.hostname || req.get('host')).split(':')[0].toLowerCase();
  const ip = normalizeText(req.ip || req.socket?.remoteAddress || '').toLowerCase();
  return (
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
  );
}

function buildPreviewAuthContext({ config = {}, previewAuthContext = null } = {}) {
  const bootstrapUser = previewAuthContext?.user || null;
  const bootstrapMembership = previewAuthContext?.membership || null;
  const tenantId = normalizeText(
    bootstrapMembership?.tenantId || config.defaultTenantId || 'preview-local'
  );
  const userId = normalizeText(bootstrapUser?.id || 'preview-local-user');
  const membershipId = normalizeText(bootstrapMembership?.id || 'preview-local-membership');
  const role = normalizeRole(bootstrapMembership?.role || 'OWNER') || 'OWNER';
  const previewUser =
    bootstrapUser && typeof bootstrapUser === 'object'
      ? bootstrapUser
      : {
          id: userId,
          email: normalizeText(config.bootstrapOwnerEmail) || 'preview@localhost',
          displayName: 'Local Preview',
          status: 'active',
        };
  const previewMembership =
    bootstrapMembership && typeof bootstrapMembership === 'object'
      ? {
          ...bootstrapMembership,
          role,
        }
      : {
          id: membershipId,
          tenantId,
          userId,
          role,
          status: 'ACTIVE',
        };

  return {
    token: '__preview_local__',
    sessionId: 'preview-local-session',
    userId: previewUser.id,
    membershipId: previewMembership.id,
    tenantId: previewMembership.tenantId,
    role,
    authMode: 'preview_local',
    currentUser: previewUser,
    currentMembership: previewMembership,
    currentSession: {
      id: 'preview-local-session',
      userId: previewUser.id,
      membershipId: previewMembership.id,
      tenantId: previewMembership.tenantId,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      authMode: 'preview_local',
      isPreview: true,
    },
  };
}

function createAuthMiddleware({ authStore, config = {}, previewAuthContext = null }) {
  const localPreviewAuthContext = buildPreviewAuthContext({ config, previewAuthContext });

  async function requireAuth(req, res, next) {
    try {
      const token = getAuthToken(req);
      if (token) {
        const context = await authStore.getSessionContextByToken(token);
        if (context) {
          await authStore.touchSession(context.session.id);

          req.auth = {
            token,
            sessionId: context.session.id,
            userId: context.user.id,
            membershipId: context.membership.id,
            tenantId: context.membership.tenantId,
            role: context.membership.role,
          };

          req.currentUser = context.user;
          req.currentMembership = context.membership;
          req.currentSession = context.session;
          return next();
        }
      }

      if (isLocalPreviewRequest(req)) {
        req.auth = {
          token: localPreviewAuthContext.token,
          sessionId: localPreviewAuthContext.sessionId,
          userId: localPreviewAuthContext.userId,
          membershipId: localPreviewAuthContext.membershipId,
          tenantId: localPreviewAuthContext.tenantId,
          role: localPreviewAuthContext.role,
          authMode: localPreviewAuthContext.authMode,
        };
        req.currentUser = localPreviewAuthContext.currentUser;
        req.currentMembership = localPreviewAuthContext.currentMembership;
        req.currentSession = localPreviewAuthContext.currentSession;
        return next();
      }

      if (!token) {
        return res.status(401).json({ error: 'Inloggning krävs.' });
      }
      return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut.' });
    } catch (error) {
      return next(error);
    }
  }

  function requireRole(...roles) {
    const allowed = new Set(roles.map(normalizeRole).filter(Boolean));
    return (req, res, next) => {
      if (!req.auth) {
        return res.status(401).json({ error: 'Inloggning krävs.' });
      }
      const role = normalizeRole(req.auth.role);
      if (!allowed.has(role)) {
        return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
      }
      return next();
    };
  }

  function requireTenantScope({
    paramKey = 'tenantId',
    queryKey = 'tenantId',
    bodyKey = 'tenantId',
    optional = true,
  } = {}) {
    return async (req, res, next) => {
      if (!req.auth) {
        return res.status(401).json({ error: 'Inloggning krävs.' });
      }

      const tenantId =
        (req.params && req.params[paramKey]) ||
        (req.query && req.query[queryKey]) ||
        (req.body && req.body[bodyKey]) ||
        '';

      const normalized = typeof tenantId === 'string' ? tenantId.trim() : '';
      if (!normalized) {
        if (optional) return next();
        return res.status(400).json({ error: 'tenantId saknas.' });
      }

      if (normalized !== req.auth.tenantId) {
        if (authStore && typeof authStore.addAuditEvent === 'function') {
          try {
            await authStore.addAuditEvent({
              tenantId: req.auth.tenantId || null,
              actorUserId: req.auth.userId || null,
              action: 'tenant.scope.denied',
              outcome: 'forbidden',
              targetType: 'tenant',
              targetId: normalized,
              metadata: {
                expectedTenantId: req.auth.tenantId || null,
                providedTenantId: normalized,
                path: req.path || null,
              },
            });
          } catch {
            // Ignore audit write errors for middleware deny path.
          }
        }
        return res.status(403).json({ error: 'Du har inte åtkomst till denna tenant.' });
      }

      return next();
    };
  }

  return {
    requireAuth,
    requireRole,
    requireTenantScope,
  };
}

module.exports = {
  createAuthMiddleware,
};
