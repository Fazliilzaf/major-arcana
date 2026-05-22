const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

const requestContextStorage = new AsyncLocalStorage();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCorrelationId(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length > 120) return '';
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) return '';
  return normalized;
}

function getRequestContext() {
  return requestContextStorage.getStore() || null;
}

function requestContextMiddleware({
  headerName = 'x-correlation-id',
} = {}) {
  const normalizedHeaderName = normalizeText(headerName).toLowerCase() || 'x-correlation-id';
  return function applyRequestContext(req, res, next) {
    const incomingHeader = normalizeCorrelationId(req.get(normalizedHeaderName));
    const correlationId = incomingHeader || crypto.randomUUID();
    const context = {
      correlationId,
      startedAt: new Date().toISOString(),
    };
    req.correlationId = correlationId;
    res.setHeader(normalizedHeaderName, correlationId);
    return requestContextStorage.run(context, () => next());
  };
}

module.exports = {
  requestContextMiddleware,
  getRequestContext,
};
