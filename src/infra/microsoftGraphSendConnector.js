function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function requiredConfig(name, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`MicrosoftGraphSendConnector requires ${name}.`);
  }
  return normalized;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseRetryAfterSeconds(response) {
  const raw =
    normalizeText(response?.headers?.get?.('retry-after')) ||
    normalizeText(response?.headers?.get?.('x-ms-retry-after-ms'));
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  if (String(raw).includes('.') || asNumber > 1000) return Math.round(asNumber / 1000);
  return Math.round(asNumber);
}

function parseGraphError(payload = {}, fallback = 'request_failed') {
  const graphError = payload && typeof payload.error === 'object' ? payload.error : {};
  return (
    normalizeText(graphError.message) ||
    normalizeText(payload?.error_description) ||
    normalizeText(payload?.message) ||
    fallback
  );
}

function createGraphError(message, { code = '', status = 0, retryAfterSeconds = null, details = null } = {}) {
  const error = new Error(normalizeText(message) || 'graph_request_failed');
  if (code) error.code = code;
  if (Number.isFinite(Number(status)) && Number(status) > 0) error.status = Number(status);
  if (Number.isFinite(Number(retryAfterSeconds)) && Number(retryAfterSeconds) >= 0) {
    error.retryAfterSeconds = Number(retryAfterSeconds);
  }
  if (details && typeof details === 'object') error.details = details;
  return error;
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 5000) {
  const safeTimeoutMs = clampInteger(timeoutMs, 500, 120000, 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createGraphError(`Request timeout after ${safeTimeoutMs}ms`, {
        code: 'GRAPH_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(response, label = 'request') {
  let payload = {};
  try {
    payload = (await response.json()) || {};
  } catch (_error) {
    payload = {};
  }
  if (response?.ok) return payload;
  const status = Number(response?.status || 0);
  const message = parseGraphError(payload, 'graph_request_failed');
  throw createGraphError(`${label} failed (${status || 'n/a'}): ${message}`, {
    code: 'GRAPH_REQUEST_FAILED',
    status,
    details: payload,
  });
}

function createMicrosoftGraphSendConnector(config = {}) {
  const tenantId = requiredConfig('tenantId', config.tenantId);
  const clientId = requiredConfig('clientId', config.clientId);
  const clientSecret = requiredConfig('clientSecret', config.clientSecret);
  const fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('MicrosoftGraphSendConnector requires fetch implementation.');
  }

  const authorityHost = trimTrailingSlash(
    normalizeText(config.authorityHost) || 'https://login.microsoftonline.com'
  );
  const graphBaseUrl = trimTrailingSlash(
    normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'
  );
  const scope = normalizeText(config.scope) || 'https://graph.microsoft.com/.default';
  const tokenTimeoutMs = clampInteger(config.tokenTimeoutMs, 1000, 30000, 5000);
  const requestTimeoutMs = clampInteger(config.requestTimeoutMs, 1000, 60000, 8000);

  async function fetchAccessToken() {
    const tokenUrl = `${authorityHost}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      grant_type: 'client_credentials',
    });
    const response = await fetchWithTimeout(
      fetchImpl,
      tokenUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
      tokenTimeoutMs
    );
    const payload = await parseJsonResponse(response, 'Microsoft Graph token request');
    const accessToken = normalizeText(payload.access_token);
    if (!accessToken) {
      throw createGraphError('Microsoft Graph token request succeeded but access_token is missing.', {
        code: 'GRAPH_TOKEN_MISSING',
      });
    }
    return accessToken;
  }

  async function sendReply({
    mailboxId,
    replyToMessageId,
    body = '',
    subject = '',
    to = [],
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedMailboxId = requiredConfig('mailboxId', mailboxId);
    const normalizedMessageId = requiredConfig('replyToMessageId', replyToMessageId);
    const normalizedBody = normalizeText(body);
    if (!normalizedBody) {
      throw new Error('MicrosoftGraphSendConnector sendReply requires body.');
    }
    const accessToken = await fetchAccessToken();
    const replyUrl = `${graphBaseUrl}/users/${encodeURIComponent(
      normalizedMailboxId
    )}/messages/${encodeURIComponent(normalizedMessageId)}/reply`;
    const response = await fetchWithTimeout(
      fetchImpl,
      replyUrl,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          comment: normalizedBody,
        }),
      },
      timeoutMs
    );

    if (Number(response?.status || 0) === 429) {
      throw createGraphError('Microsoft Graph reply failed (429): rate_limit_hit', {
        code: 'GRAPH_RATE_LIMITED',
        status: 429,
        retryAfterSeconds: parseRetryAfterSeconds(response),
      });
    }

    if (!response?.ok) {
      await parseJsonResponse(response, 'Microsoft Graph reply');
    }

    return {
      provider: 'microsoft_graph',
      mailboxId: normalizedMailboxId,
      replyToMessageId: normalizedMessageId,
      subject: normalizeText(subject) || null,
      to: Array.isArray(to) ? to.map((item) => normalizeText(item)).filter(Boolean).slice(0, 20) : [],
      sentAt: new Date().toISOString(),
    };
  }

  return {
    sendReply,
  };
}

module.exports = {
  createMicrosoftGraphSendConnector,
};
