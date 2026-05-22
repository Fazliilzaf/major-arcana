const WORKSPACE_ID = 'major-arcana-preview';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function getAuthToken(req) {
  const authHeader = normalizeText(req.get('authorization'));
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  return normalizeText(req.get('x-auth-token'));
}

async function resolveCcoRouteActor(req, { authStore, config }) {
  const token = getAuthToken(req);
  if (token) {
    const context = await authStore.getSessionContextByToken(token);
    if (!context) {
      const error = new Error('Sessionen är ogiltig eller har gått ut.');
      error.statusCode = 401;
      throw error;
    }
    await authStore.touchSession(context.session.id);
    return {
      tenantId: context.membership.tenantId,
      userId: context.user.id,
      role: context.membership.role,
      authMode: 'session',
    };
  }
  if (isLocalPreviewRequest(req)) {
    return {
      tenantId: config.defaultTenantId,
      userId: 'preview-local',
      role: 'OWNER',
      authMode: 'preview_local',
    };
  }
  const error = new Error('Inloggning krävs.');
  error.statusCode = 401;
  throw error;
}

function buildCcoRouteContext(req, actor) {
  return {
    tenantId: actor.tenantId,
    workspaceId:
      normalizeText(req.query.workspaceId) || normalizeText(req.body?.workspaceId) || WORKSPACE_ID,
    conversationId:
      normalizeText(req.query.conversationId) || normalizeText(req.body?.conversationId),
    customerId:
      normalizeText(req.query.customerId) ||
      normalizeText(req.body?.customerId) ||
      normalizeText(req.query.customerEmail) ||
      normalizeText(req.body?.customerEmail),
    customerName: normalizeText(req.query.customerName) || normalizeText(req.body?.customerName),
    actor,
  };
}

function requireCcoRouteContext(context, message) {
  if (context.conversationId && context.customerId) return;
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function serializePatient360(patientRecord) {
  return patientRecord
    ? {
        attention: patientRecord.patient360,
        modules: patientRecord.modules,
        identity: patientRecord.identity,
        timelineCount: Array.isArray(patientRecord.timeline) ? patientRecord.timeline.length : 0,
        updatedAt: patientRecord.updatedAt,
      }
    : null;
}

function buildPatient360SyncContext(context) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    customerEmail: context.customerId,
    customerName: context.customerName,
    actor: context.actor,
  };
}

module.exports = {
  WORKSPACE_ID,
  normalizeText,
  resolveCcoRouteActor,
  buildCcoRouteContext,
  requireCcoRouteContext,
  serializePatient360,
  buildPatient360SyncContext,
};
