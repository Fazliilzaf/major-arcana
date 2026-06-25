const crypto = require('crypto');

const { normalizeRole } = require('./roles');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseMachineTokens(raw) {
  const text = normalizeText(raw);
  if (!text) return [];
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries
    .map((entry, index) => {
      const token = normalizeText(entry?.token);
      const tenantId = normalizeText(entry?.tenantId || entry?.tenant_id);
      const role = normalizeRole(entry?.role || 'STAFF') || 'STAFF';
      if (!token || token.length < 32 || !tenantId) return null;
      const label = normalizeText(entry?.label || entry?.name) || `machine-${index + 1}`;
      const allowPathsRaw = Array.isArray(entry?.allowPaths)
        ? entry.allowPaths
        : Array.isArray(entry?.allow_paths)
          ? entry.allow_paths
          : [];
      const allowPaths = allowPathsRaw.map(normalizeText).filter(Boolean);
      return {
        token,
        tenantId,
        role,
        label,
        userId: normalizeText(entry?.userId || entry?.user_id) || `machine:${label}`,
        email: normalizeText(entry?.email) || `${label}@machine.arcana.local`,
        allowPaths: allowPaths.length ? allowPaths : ['/api/v1/orchestrator'],
      };
    })
    .filter(Boolean);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requestPathForScope(req) {
  return normalizeText(req.originalUrl?.split('?')[0] || req.path || '').toLowerCase();
}

function isPathAllowed(req, allowPaths = []) {
  const path = requestPathForScope(req);
  return allowPaths.some((prefix) => {
    const normalized = normalizeText(prefix).toLowerCase();
    return normalized && (path === normalized || path.startsWith(`${normalized}/`));
  });
}

function findMachineTokenContext(req, token, machineTokens = []) {
  if (!token || !Array.isArray(machineTokens) || machineTokens.length === 0) return null;
  for (const entry of machineTokens) {
    if (!safeEqual(token, entry.token)) continue;
    if (!isPathAllowed(req, entry.allowPaths)) return null;
    return {
      token,
      sessionId: `machine:${entry.label}`,
      userId: entry.userId,
      email: entry.email,
      membershipId: `machine:${entry.label}:${entry.tenantId}`,
      tenantId: entry.tenantId,
      role: entry.role,
      authMode: 'machine_token',
      label: entry.label,
    };
  }
  return null;
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
  const host = normalizeText(req.hostname || req.get('host'))
    .split(':')[0]
    .toLowerCase();
  const ip = normalizeText(req.ip || req.socket?.remoteAddress || '').toLowerCase();
  return (
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
  );
}

function isStaffJournalOpenApiPath(req) {
  const path = normalizeText(req.path || req.originalUrl?.split('?')[0] || '').toLowerCase();
  const openPrefixes = [
    '/api/v1/cco-patient-master',
    '/api/v1/cco-journal',
    '/api/v1/cco-journal-quick',
    '/api/v1/cco-forms',
    '/api/v1/cco-photo-consents',
    '/api/v1/cco-commercial',
    '/api/v1/cco-treatment-agreement',
    '/cco-patient-master',
    '/cco-journal',
    '/cco-journal-quick',
    '/cco-forms',
    '/cco-photo-consents',
    '/cco-commercial',
    '/cco-treatment-agreement',
  ];
  return openPrefixes.some((prefix) => path.startsWith(prefix));
}

function shouldUseStaffJournalOpenAccess(req, config = {}) {
  return Boolean(config.staffJournalOpenAccess) && isStaffJournalOpenApiPath(req);
}

function applyPreviewAuthToRequest(req, localPreviewAuthContext) {
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
  const machineTokens = parseMachineTokens(config.machineTokensJson);

  async function requireAuth(req, res, next) {
    try {
      const token = getAuthToken(req);
      // SÄKERHET: all preview/open-access-elevation (oautentiserad OWNER) är
      // HÅRT gatead till non-production. I produktion kan ingen av byggfas-
      // genvägarna ge åtkomst — oavsett ARCANA_STAFF_JOURNAL_OPEN_ACCESS.
      const previewAllowed = !(config.isProduction ?? process.env.NODE_ENV === 'production');
      const staffOpenAccess = previewAllowed && shouldUseStaffJournalOpenAccess(req, config);
      if (
        staffOpenAccess ||
        (previewAllowed && token === '__preview_local__' && isLocalPreviewRequest(req))
      ) {
        applyPreviewAuthToRequest(req, localPreviewAuthContext);
        return next();
      }
      if (previewAllowed && token === '__preview_local__' && config.staffJournalOpenAccess) {
        applyPreviewAuthToRequest(req, localPreviewAuthContext);
        return next();
      }
      if (token) {
        const machineContext = findMachineTokenContext(req, token, machineTokens);
        if (machineContext) {
          req.auth = { ...machineContext };
          req.currentUser = {
            id: machineContext.userId,
            email: machineContext.email,
            displayName: machineContext.label,
            status: 'active',
            isMachine: true,
          };
          req.currentMembership = {
            id: machineContext.membershipId,
            tenantId: machineContext.tenantId,
            userId: machineContext.userId,
            role: machineContext.role,
            status: 'ACTIVE',
            isMachine: true,
          };
          req.currentSession = {
            id: machineContext.sessionId,
            userId: machineContext.userId,
            membershipId: machineContext.membershipId,
            tenantId: machineContext.tenantId,
            createdAt: null,
            lastSeenAt: new Date().toISOString(),
            authMode: 'machine_token',
            isMachine: true,
          };
          return next();
        }
        const context = await authStore.getSessionContextByToken(token);
        if (context) {
          await authStore.touchSession(context.session.id);

          req.auth = {
            token,
            sessionId: context.session.id,
            userId: context.user.id,
            email: normalizeText(context.user.email),
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

      // Efter misslyckad token-verifiering: fall ALDRIG tillbaka till preview-
      // OWNER i produktion (en ogiltig token måste ge 401). staffOpenAccess är
      // redan non-production-gatead ovan.
      if ((previewAllowed && isLocalPreviewRequest(req)) || staffOpenAccess) {
        applyPreviewAuthToRequest(req, localPreviewAuthContext);
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
  parseMachineTokens,
  isStaffJournalOpenApiPath,
  shouldUseStaffJournalOpenAccess,
};
