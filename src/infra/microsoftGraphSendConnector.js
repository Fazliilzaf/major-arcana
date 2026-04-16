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

function decodeJwtPayload(token = '') {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return {};
  try {
    const encoded = parts[1];
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64url').toString('utf8'));
  } catch (_error) {
    return {};
  }
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

async function patchGraphJson({
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
      method: 'PATCH',
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

function normalizeComposeRecipients(recipients = {}) {
  return {
    to: (Array.isArray(recipients?.to) ? recipients.to : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20),
    cc: (Array.isArray(recipients?.cc) ? recipients.cc : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20),
    bcc: (Array.isArray(recipients?.bcc) ? recipients.bcc : [])
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 20),
  };
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

  async function inspectPermissions({ timeoutMs = tokenTimeoutMs } = {}) {
    const accessToken = await fetchAccessToken(timeoutMs);
    const claims = decodeJwtPayload(accessToken);
    const roles = Array.isArray(claims.roles)
      ? claims.roles.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const scopes = normalizeText(claims.scp)
      .split(/\s+/)
      .map((item) => normalizeText(item))
      .filter(Boolean);
    return {
      aud: normalizeText(claims.aud) || null,
      appId: normalizeText(claims.appid) || null,
      idType: normalizeText(claims.idtyp) || null,
      roles,
      scopes,
      hasMailReadWrite:
        roles.includes('Mail.ReadWrite') || scopes.includes('Mail.ReadWrite'),
    };
  }

  async function sendReply({
    mailboxId,
    sourceMailboxId = '',
    conversationId = '',
    replyToMessageId,
    body = '',
    bodyHtml = '',
    subject = '',
    to = [],
    cc = [],
    bcc = [],
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedSenderMailboxId = requiredConfig('mailboxId', mailboxId);
    const normalizedSourceMailboxId =
      normalizeText(sourceMailboxId) || normalizedSenderMailboxId;
    const shouldReplyInThread = normalizedSenderMailboxId === normalizedSourceMailboxId;
    return sendComposeDocument({
      composeDocument: {
        version: 'phase_5',
        kind: 'mail_compose_document',
        mode: 'reply',
        sourceMailboxId: normalizedSourceMailboxId,
        senderMailboxId: normalizedSenderMailboxId,
        replyContext: {
          conversationId: normalizeText(conversationId) || '__legacy_reply__',
          replyToMessageId: normalizeText(replyToMessageId),
        },
        recipients: {
          to: Array.isArray(to) ? to : [],
          cc: Array.isArray(cc) ? cc : [],
          bcc: Array.isArray(bcc) ? bcc : [],
        },
        subject: normalizeText(subject),
        content: {
          bodyText: normalizeText(body),
          bodyHtml: normalizeText(bodyHtml) || null,
        },
        delivery: {
          sendStrategy: shouldReplyInThread ? 'reply_draft' : 'send_mail',
        },
      },
      timeoutMs,
    });
  }

  async function sendComposeDocument({ composeDocument, timeoutMs = requestTimeoutMs } = {}) {
    if (!composeDocument || typeof composeDocument !== 'object') {
      throw new Error('MicrosoftGraphSendConnector sendComposeDocument requires composeDocument.');
    }
    if (normalizeText(composeDocument.kind) !== 'mail_compose_document') {
      throw new Error(
        'MicrosoftGraphSendConnector sendComposeDocument requires mail_compose_document.'
      );
    }
    const normalizedSenderMailboxId = requiredConfig(
      'senderMailboxId',
      composeDocument.senderMailboxId || composeDocument.mailboxId
    );
    const normalizedSourceMailboxId =
      normalizeText(composeDocument.sourceMailboxId) || normalizedSenderMailboxId;
    const normalizedMode = normalizeText(composeDocument.mode).toLowerCase() || 'compose';
    const normalizedMessageId = normalizeText(composeDocument.replyContext?.replyToMessageId);
    const normalizedBody = normalizeText(
      composeDocument.content?.bodyText || composeDocument.body || ''
    );
    const normalizedBodyHtml = normalizeText(
      composeDocument.content?.bodyHtml || composeDocument.bodyHtml || ''
    );
    const normalizedSubject = normalizeText(composeDocument.subject);
    const normalizedRecipients = normalizeComposeRecipients(composeDocument.recipients);
    const recipientPayload = {
      toRecipients: toRecipients(normalizedRecipients.to),
      ccRecipients: toRecipients(normalizedRecipients.cc),
      bccRecipients: toRecipients(normalizedRecipients.bcc),
    };
    const shouldReplyInThread =
      (normalizeText(composeDocument.delivery?.sendStrategy) || '') === 'reply_draft' &&
      normalizedMode === 'reply';
    const normalizedHtmlContent = normalizedBodyHtml || formatPlainTextAsHtml(normalizedBody);
    if (!normalizedBody) {
      throw new Error('MicrosoftGraphSendConnector sendComposeDocument requires body.');
    }
    if (normalizedMode === 'compose' && !normalizedSubject) {
      throw new Error('MicrosoftGraphSendConnector sendComposeDocument requires subject.');
    }
    if (normalizedMode === 'reply' && !normalizedMessageId) {
      throw new Error('MicrosoftGraphSendConnector sendComposeDocument requires replyToMessageId.');
    }
    if (!shouldReplyInThread && !recipientPayload.toRecipients.length) {
      throw new Error('MicrosoftGraphSendConnector sendComposeDocument requires to[].');
    }
    const accessToken = await fetchAccessToken();
    let sendMode = 'send_mail';
    if (shouldReplyInThread) {
      requiredConfig('replyToMessageId', normalizedMessageId);
      const createReplyUrl = `${graphBaseUrl}/users/${encodeURIComponent(
        normalizedSenderMailboxId
      )}/messages/${encodeURIComponent(normalizedMessageId)}/createReply`;
      const createReplyResponse = await postGraphJson({
        fetchImpl,
        url: createReplyUrl,
        accessToken,
        payload: {},
        timeoutMs,
        label: 'Microsoft Graph createReply',
      });
      const replyDraft = await parseJsonResponse(
        createReplyResponse,
        'Microsoft Graph createReply response'
      );
      const draftId = requiredConfig('replyDraftId', replyDraft?.id);
      const draftUrl = `${graphBaseUrl}/users/${encodeURIComponent(
        normalizedSenderMailboxId
      )}/messages/${encodeURIComponent(draftId)}`;
      await patchGraphJson({
        fetchImpl,
        url: draftUrl,
        accessToken,
        payload: {
          body: {
            contentType: 'HTML',
            content: normalizedHtmlContent,
          },
        },
        timeoutMs,
        label: 'Microsoft Graph updateReplyDraft',
      });
      const sendDraftUrl = `${draftUrl}/send`;
      await postGraphJson({
        fetchImpl,
        url: sendDraftUrl,
        accessToken,
        payload: {},
        timeoutMs,
        label: 'Microsoft Graph sendReplyDraft',
      });
      sendMode = 'reply_draft';
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
              content: normalizedHtmlContent,
            },
            toRecipients: recipientPayload.toRecipients,
            ...(recipientPayload.ccRecipients.length
              ? { ccRecipients: recipientPayload.ccRecipients }
              : {}),
            ...(recipientPayload.bccRecipients.length
              ? { bccRecipients: recipientPayload.bccRecipients }
              : {}),
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
      replyToMessageId: normalizedMessageId || null,
      subject: normalizedSubject || null,
      to: normalizedRecipients.to,
      cc: normalizedRecipients.cc,
      bcc: normalizedRecipients.bcc,
      sentAt: new Date().toISOString(),
      sendMode,
      composeDocumentVersion: normalizeText(composeDocument.version) || null,
      composeMode: normalizedMode === 'compose',
    };
  }

  async function sendNewMessage({
    mailboxId,
    sourceMailboxId = '',
    body = '',
    bodyHtml = '',
    subject = '',
    to = [],
    cc = [],
    bcc = [],
    timeoutMs = requestTimeoutMs,
  } = {}) {
    return sendComposeDocument({
      composeDocument: {
        version: 'phase_5',
        kind: 'mail_compose_document',
        mode: 'compose',
        sourceMailboxId: normalizeText(sourceMailboxId) || normalizeText(mailboxId),
        senderMailboxId: normalizeText(mailboxId),
        replyContext: null,
        recipients: {
          to: Array.isArray(to) ? to : [],
          cc: Array.isArray(cc) ? cc : [],
          bcc: Array.isArray(bcc) ? bcc : [],
        },
        subject: normalizeText(subject),
        content: {
          bodyText: normalizeText(body),
          bodyHtml: normalizeText(bodyHtml) || null,
        },
        delivery: {
          sendStrategy: 'send_mail',
        },
      },
      timeoutMs,
    });
  }

  async function moveMessageToFolder({
    mailboxId,
    messageId,
    destinationId = 'deleteditems',
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const normalizedMailboxId = requiredConfig('mailboxId', mailboxId);
    const normalizedMessageId = requiredConfig('messageId', messageId);
    const normalizedDestinationId = requiredConfig('destinationId', destinationId);
    const accessToken = await fetchAccessToken();
    const moveUrl = `${graphBaseUrl}/users/${encodeURIComponent(
      normalizedMailboxId
    )}/messages/${encodeURIComponent(normalizedMessageId)}/move`;
    const response = await postGraphJson({
      fetchImpl,
      url: moveUrl,
      accessToken,
      payload: {
        destinationId: normalizedDestinationId,
      },
      timeoutMs,
      label: 'Microsoft Graph moveMessageToFolder',
    });
    const payload = await parseJsonResponse(response, 'Microsoft Graph moveMessageToFolder response');
    const now = new Date().toISOString();
    return {
      provider: 'microsoft_graph',
      mailboxId: normalizedMailboxId,
      messageId: normalizedMessageId,
      movedMessageId: normalizeText(payload?.id) || normalizedMessageId,
      conversationId: normalizeText(payload?.conversationId) || null,
      destinationFolderId: normalizeText(payload?.parentFolderId) || normalizedDestinationId,
      movedAt: now,
      deletedAt: normalizedDestinationId === 'deleteditems' ? now : null,
      moveMode: normalizedDestinationId === 'deleteditems' ? 'soft_delete' : 'folder_move',
    };
  }

  async function moveMessageToDeletedItems({
    mailboxId,
    messageId,
    timeoutMs = requestTimeoutMs,
  } = {}) {
    const moveResult = await moveMessageToFolder({
      mailboxId,
      messageId,
      destinationId: 'deleteditems',
      timeoutMs,
    });
    return {
      ...moveResult,
      deleteMode: 'soft_delete',
    };
  }

  return {
    sendComposeDocument,
    sendNewMessage,
    sendReply,
    moveMessageToFolder,
    moveMessageToDeletedItems,
    inspectPermissions,
  };
}

module.exports = {
  createMicrosoftGraphSendConnector,
};
