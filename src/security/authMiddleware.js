const { normalizeRole } = require('./roles');

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

function createAuthMiddleware({ authStore }) {
  async function requireAuth(req, res, next) {
    try {
      const token = getAuthToken(req);
      if (!token) {
        return res.status(401).json({ error: 'Inloggning krävs.' });
      }

      const context = await authStore.getSessionContextByToken(token);
      if (!context) {
        return res.status(401).json({ error: 'Sessionen är ogiltig eller har gått ut.' });
      }

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
    return (req, res, next) => {
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
