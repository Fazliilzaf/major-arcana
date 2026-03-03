function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPlainTextAsHtml(value = '') {
  const escaped = escapeHtml(value);
  if (!escaped) return '';
  return escaped.replace(/\r?\n/g, '<br />');
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

async function postGraphJson({
  fetchImpl,
  url,
  accessToken,
  payload = null,
  timeoutMs = 5000,
  label = 'request',
}) {
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: payload === null ? null : JSON.stringify(payload),
    },
    timeoutMs
  );

  if (Number(response?.status || 0) === 429) {
    throw createGraphError(`${label} failed (429): rate_limit_hit`, {
      code: 'GRAPH_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: parseRetryAfterSeconds(response),
    });
  }

  if (!response?.ok) {
    await parseJsonResponse(response, label);
  }
  return response;
}

function toRecipients(to = []) {
  return (Array.isArray(to) ? to : [])
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .slice(0, 20)
    .map((address) => ({
      emailAddress: {
        address,
      },
    }));
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
    sourceMailboxId = '',
    replyToMessageId,
    body = '',
    bodyHtml = '',
    subject = '',
    to = [],
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedSenderMailboxId = requiredConfig('mailboxId', mailboxId);
    const normalizedSourceMailboxId =
      normalizeText(sourceMailboxId) || normalizedSenderMailboxId;
    const normalizedMessageId = requiredConfig('replyToMessageId', replyToMessageId);
    const normalizedBody = normalizeText(body);
    const normalizedBodyHtml = normalizeText(bodyHtml);
    const normalizedSubject = normalizeText(subject);
    const normalizedRecipients = toRecipients(to);
    if (!normalizedBody) {
      throw new Error('MicrosoftGraphSendConnector sendReply requires body.');
    }
    if (!normalizedRecipients.length) {
      throw new Error('MicrosoftGraphSendConnector sendReply requires to[].');
    }
    const accessToken = await fetchAccessToken();
    const shouldReplyInThread = normalizedSenderMailboxId === normalizedSourceMailboxId;
    let sendMode = 'send_mail';
    if (shouldReplyInThread) {
      const replyUrl = `${graphBaseUrl}/users/${encodeURIComponent(
        normalizedSenderMailboxId
      )}/messages/${encodeURIComponent(normalizedMessageId)}/reply`;
      await postGraphJson({
        fetchImpl,
        url: replyUrl,
        accessToken,
        payload: {
          comment: normalizedBody,
        },
        timeoutMs,
        label: 'Microsoft Graph reply',
      });
      sendMode = 'reply';
    } else {
      const sendMailUrl = `${graphBaseUrl}/users/${encodeURIComponent(
        normalizedSenderMailboxId
      )}/sendMail`;
      await postGraphJson({
        fetchImpl,
        url: sendMailUrl,
        accessToken,
        payload: {
          message: {
            subject: normalizedSubject || 'Uppfoljning fran Hair TP Clinic',
            body: {
              contentType: 'HTML',
              content: normalizedBodyHtml || formatPlainTextAsHtml(normalizedBody),
            },
            toRecipients: normalizedRecipients,
          },
          saveToSentItems: true,
        },
        timeoutMs,
        label: 'Microsoft Graph sendMail',
      });
      sendMode = 'send_mail';
    }

    return {
      provider: 'microsoft_graph',
      mailboxId: normalizedSenderMailboxId,
      sourceMailboxId: normalizedSourceMailboxId,
      replyToMessageId: normalizedMessageId,
      subject: normalizedSubject || null,
      to: normalizedRecipients.map((item) => item.emailAddress.address),
      sentAt: new Date().toISOString(),
      sendMode,
    };
  }

  async function moveMessageToDeletedItems({
    mailboxId,
    messageId,
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedMailboxId = requiredConfig('mailboxId', mailboxId);
    const normalizedMessageId = requiredConfig('messageId', messageId);
    const accessToken = await fetchAccessToken();
    const moveUrl = `${graphBaseUrl}/users/${encodeURIComponent(
      normalizedMailboxId
    )}/messages/${encodeURIComponent(normalizedMessageId)}/move`;
    const response = await postGraphJson({
      fetchImpl,
      url: moveUrl,
      accessToken,
      payload: {
        destinationId: 'deleteditems',
      },
      timeoutMs,
      label: 'Microsoft Graph moveToDeletedItems',
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph moveToDeletedItems response');
    return {
      provider: 'microsoft_graph',
      mailboxId: normalizedMailboxId,
      messageId: normalizedMessageId,
      movedMessageId: normalizeText(payload?.id) || normalizedMessageId,
      conversationId: normalizeText(payload?.conversationId) || null,
      destinationFolderId: normalizeText(payload?.parentFolderId) || 'deleteditems',
      deletedAt: new Date().toISOString(),
      deleteMode: 'soft_delete',
    };
  }

  return {
    sendReply,
    moveMessageToDeletedItems,
  };
}

module.exports = {
  createMicrosoftGraphSendConnector,
};
