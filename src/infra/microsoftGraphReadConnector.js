const { maskInboxText } = require('../privacy/inboxMasking');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.floor(toNumber(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return fallback;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeUserScope(value, fallback = 'single') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'all' || normalized === 'single') return normalized;
  return fallback;
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function toIsoFromMs(value) {
  if (!Number.isFinite(value)) return '';
  return toIso(new Date(value));
}

function compareIsoDesc(a = '', b = '') {
  return String(b || '').localeCompare(String(a || ''));
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

function requiredConfig(name, value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`MicrosoftGraphReadConnector requires ${name}.`);
  }
  return normalized;
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

function parseRetryAfterSeconds(response) {
  const raw =
    normalizeText(response?.headers?.get?.('retry-after')) ||
    normalizeText(response?.headers?.get?.('x-ms-retry-after-ms'));
  if (!raw) return null;
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  if (String(raw).includes('.') || asNumber > 1000) {
    return Math.round(asNumber / 1000);
  }
  return Math.round(asNumber);
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

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 5000) {
  const safeTimeoutMs = clampInt(timeoutMs, 500, 120000, 5000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), safeTimeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    if (isAbort) {
      throw createGraphError(`Request timeout after ${safeTimeoutMs}ms`, {
        code: 'GRAPH_TIMEOUT',
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const RISK_WORD_DEFS = Object.freeze([
  { code: 'akut', pattern: /\bakut\b/i },
  { code: 'andningssvarigheter', pattern: /\bandningssvarigheter\b/i },
  { code: 'feber', pattern: /\bfeber\b/i },
  { code: 'infektion', pattern: /\binfektion\b/i },
  { code: 'smarta', pattern: /\bsmarta\b/i },
  { code: 'svullnad', pattern: /\bsvullnad\b/i },
]);

function extractRiskWords(text = '') {
  const source = normalizeText(text);
  if (!source) return [];
  const hits = [];
  for (const definition of RISK_WORD_DEFS) {
    if (!definition.pattern.test(source)) continue;
    hits.push(definition.code);
  }
  return hits;
}

function toScopedConversationId(conversationId, mailboxKey) {
  const normalizedConversationId = normalizeText(conversationId);
  const normalizedMailboxKey = normalizeText(mailboxKey);
  if (!normalizedConversationId) return '';
  if (!normalizedMailboxKey) return normalizedConversationId;
  return `${normalizedMailboxKey}:${normalizedConversationId}`;
}

function toNormalizedMessage(raw = {}, { mailboxId = '', mailboxKey = '' } = {}) {
  const messageId = normalizeText(raw.id);
  if (!messageId) return null;
  const rawConversationId = normalizeText(raw.conversationId) || `message:${messageId}`;
  const conversationId = toScopedConversationId(rawConversationId, mailboxKey) || rawConversationId;
  const subject = maskInboxText(raw.subject, 180) || '(utan amne)';
  const bodyPreview = maskInboxText(raw.bodyPreview, 360);
  const sentAt = toIso(raw.receivedDateTime || raw.sentDateTime) || null;
  const senderEmail = normalizeText(raw?.from?.emailAddress?.address);
  const senderName = normalizeText(raw?.from?.emailAddress?.name);
  const riskWords = extractRiskWords(`${subject}\n${bodyPreview}`);

  return {
    messageId,
    conversationId,
    subject,
    bodyPreview,
    sentAt,
    senderEmail: senderEmail || null,
    senderName: senderName || null,
    riskWords,
    mailboxId: normalizeText(mailboxId) || null,
  };
}

function toConversationSnapshots(messages = []) {
  const map = new Map();
  for (const message of messages) {
    if (!message) continue;
    if (!map.has(message.conversationId)) {
      map.set(message.conversationId, {
        conversationId: message.conversationId,
        subject: message.subject,
        status: 'open',
        lastInboundAt: message.sentAt || null,
        messages: [],
        riskWords: [],
        mailboxId: normalizeText(message.mailboxId) || null,
      });
    }
    const entry = map.get(message.conversationId);
    entry.messages.push({
      messageId: message.messageId,
      direction: 'inbound',
      sentAt: message.sentAt,
      bodyPreview: message.bodyPreview,
      mailboxId: normalizeText(message.mailboxId) || null,
    });
    if (message.sentAt && compareIsoDesc(entry.lastInboundAt, message.sentAt) > 0) {
      entry.lastInboundAt = message.sentAt;
    }
    if (
      normalizeText(entry.subject) === '(utan amne)' &&
      normalizeText(message.subject) &&
      normalizeText(message.subject) !== '(utan amne)'
    ) {
      entry.subject = message.subject;
    }
    const riskWordSet = new Set([...(entry.riskWords || []), ...(message.riskWords || [])]);
    entry.riskWords = Array.from(riskWordSet).slice(0, 20);
  }

  const conversations = Array.from(map.values());
  for (const conversation of conversations) {
    conversation.messages.sort((a, b) => compareIsoDesc(a.sentAt, b.sentAt));
  }
  conversations.sort((a, b) => {
    const lastInboundComparison = compareIsoDesc(a.lastInboundAt, b.lastInboundAt);
    if (lastInboundComparison !== 0) return lastInboundComparison;
    return String(a.conversationId).localeCompare(String(b.conversationId));
  });
  return conversations;
}

function toMailboxIdentity(user = {}, fallback = '') {
  const safeUser = user && typeof user === 'object' ? user : {};
  const id = normalizeText(safeUser.id) || normalizeText(fallback);
  const mail = normalizeText(safeUser.mail);
  const userPrincipalName = normalizeText(safeUser.userPrincipalName);
  const mailboxId = mail || userPrincipalName || id;
  const mailboxKey = normalizeText(mailboxId).replace(/[^a-zA-Z0-9._@-]/g, '_').slice(0, 120) || 'mailbox';
  return {
    id,
    mailboxId,
    mailboxKey,
    mail,
    userPrincipalName,
  };
}

function toMessagesUrl({ graphBaseUrl, userId, maxMessages, receivedSinceIso, includeReadMessages }) {
  const messagesUrl = new URL(
    `${graphBaseUrl}/users/${encodeURIComponent(userId)}/mailFolders/inbox/messages`
  );
  messagesUrl.searchParams.set('$top', String(maxMessages));
  messagesUrl.searchParams.set(
    '$select',
    'id,conversationId,subject,bodyPreview,receivedDateTime,sentDateTime,isRead,from'
  );
  messagesUrl.searchParams.set('$orderby', 'receivedDateTime desc');
  const filterParts = [`receivedDateTime ge ${receivedSinceIso}`];
  if (!includeReadMessages) filterParts.push('isRead eq false');
  messagesUrl.searchParams.set('$filter', filterParts.join(' and '));
  return messagesUrl;
}

function createMicrosoftGraphReadConnector(config = {}) {
  const tenantId = requiredConfig('tenantId', config.tenantId);
  const clientId = requiredConfig('clientId', config.clientId);
  const clientSecret = requiredConfig('clientSecret', config.clientSecret);
  const configuredFullTenant = toBoolean(config.fullTenant, false);
  const configuredUserScope = normalizeUserScope(config.userScope, configuredFullTenant ? 'all' : 'single');
  const userId = normalizeText(config.userId);
  if (!(configuredFullTenant && configuredUserScope === 'all')) {
    requiredConfig('userId', userId);
  }

  const fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('MicrosoftGraphReadConnector requires fetch implementation.');
  }

  const authorityHost = trimTrailingSlash(
    normalizeText(config.authorityHost) || 'https://login.microsoftonline.com'
  );
  const graphBaseUrl = trimTrailingSlash(
    normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'
  );
  const scope = normalizeText(config.scope) || 'https://graph.microsoft.com/.default';
  const now = typeof config.now === 'function' ? config.now : () => Date.now();

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
      clampInt(config.tokenTimeoutMs, 1000, 30000, 5000)
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

  async function fetchGraphJson({ url, accessToken, label, timeoutMs }) {
    const response = await fetchWithTimeout(
      fetchImpl,
      url,
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
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

    const payload = await parseJsonResponse(response, label);
    if (normalizeText(payload?.['@odata.nextLink'])) {
      throw createGraphError(`${label} returned @odata.nextLink; pagination not implemented.`, {
        code: 'GRAPH_PAGINATION_UNSUPPORTED',
      });
    }
    return payload;
  }

  async function fetchInboxSnapshot(options = {}) {
    const nowMs = Number(now());
    if (!Number.isFinite(nowMs)) {
      throw new Error('MicrosoftGraphReadConnector now() must return a finite timestamp.');
    }

    const windowDays = clampInt(options.days, 1, 30, 14);
    const maxMessages = clampInt(options.maxMessages, 1, 200, 100);
    const includeReadMessages = options.includeRead === true;
    const receivedSinceIso = toIsoFromMs(nowMs - windowDays * 24 * 60 * 60 * 1000);

    const fullTenant = toBoolean(options.fullTenant, configuredFullTenant);
    const userScope = normalizeUserScope(options.userScope, configuredUserScope);
    const fullTenantMode = fullTenant && userScope === 'all';
    const maxUsers = clampInt(options.maxUsers, 1, 200, 50);
    const maxMessagesPerUser = clampInt(options.maxMessagesPerUser, 1, 200, 50);
    const mailboxTimeoutMs = clampInt(options.mailboxTimeoutMs, 1000, 15000, 5000);
    const runTimeoutMs = clampInt(options.runTimeoutMs, 5000, 120000, 30000);
    const maxMailboxErrors = clampInt(options.maxMailboxErrors, 1, 20, 5);

    const accessToken = await fetchAccessToken();
    const capturedAt = toIsoFromMs(nowMs) || new Date(nowMs).toISOString();

    let conversations = [];
    let fetchedMessages = 0;
    let mailboxCount = 0;
    let mailboxErrors = 0;
    const warnings = [];

    if (!fullTenantMode) {
      const identity = toMailboxIdentity({}, userId);
      const messagesPayload = await fetchGraphJson({
        url: toMessagesUrl({
          graphBaseUrl,
          userId: userId,
          maxMessages,
          receivedSinceIso,
          includeReadMessages,
        }).toString(),
        accessToken,
        label: 'Microsoft Graph inbox request',
        timeoutMs: mailboxTimeoutMs,
      });

      const normalizedMessages = Array.isArray(messagesPayload.value)
        ? messagesPayload.value
            .map((raw) =>
              toNormalizedMessage(raw, {
                mailboxId: identity.mailboxId,
                mailboxKey: '',
              })
            )
            .filter(Boolean)
        : [];

      conversations = toConversationSnapshots(normalizedMessages);
      fetchedMessages = normalizedMessages.length;
      mailboxCount = 1;
    } else {
      const runStartedAt = Date.now();
      const usersUrl = new URL(`${graphBaseUrl}/users`);
      usersUrl.searchParams.set('$top', String(maxUsers));
      usersUrl.searchParams.set('$select', 'id,mail,userPrincipalName');

      const usersPayload = await fetchGraphJson({
        url: usersUrl.toString(),
        accessToken,
        label: 'Microsoft Graph user listing request',
        timeoutMs: mailboxTimeoutMs,
      });

      const users = Array.isArray(usersPayload.value)
        ? usersPayload.value.map((rawUser) => toMailboxIdentity(rawUser)).filter((item) => item.id)
        : [];
      const selectedUsers = users.slice(0, maxUsers);

      for (const user of selectedUsers) {
        const elapsedMs = Date.now() - runStartedAt;
        if (elapsedMs > runTimeoutMs) {
          throw createGraphError(`Full-tenant ingest exceeded run timeout (${runTimeoutMs}ms).`, {
            code: 'GRAPH_RUN_TIMEOUT',
          });
        }

        try {
          const messagesPayload = await fetchGraphJson({
            url: toMessagesUrl({
              graphBaseUrl,
              userId: user.id,
              maxMessages: maxMessagesPerUser,
              receivedSinceIso,
              includeReadMessages,
            }).toString(),
            accessToken,
            label: `Microsoft Graph inbox request (${user.mailboxId || user.id})`,
            timeoutMs: mailboxTimeoutMs,
          });

          const normalizedMessages = Array.isArray(messagesPayload.value)
            ? messagesPayload.value
                .map((raw) => toNormalizedMessage(raw, user))
                .filter(Boolean)
            : [];

          fetchedMessages += normalizedMessages.length;
          mailboxCount += 1;
          conversations.push(...toConversationSnapshots(normalizedMessages));
        } catch (error) {
          mailboxErrors += 1;

          if (
            error?.code === 'GRAPH_PAGINATION_UNSUPPORTED' ||
            error?.code === 'GRAPH_RATE_LIMITED' ||
            error?.code === 'GRAPH_TIMEOUT' ||
            error?.code === 'GRAPH_RUN_TIMEOUT'
          ) {
            throw error;
          }

          warnings.push(
            `Mailbox ${normalizeText(user.mailboxId) || 'unknown'} kunde inte lasas (${normalizeText(
              error?.message
            ) || 'request_failed'}).`
          );

          if (mailboxErrors > maxMailboxErrors) {
            throw createGraphError(
              `Full-tenant ingest aborted: mailbox error budget exceeded (${mailboxErrors}/${maxMailboxErrors}).`,
              {
                code: 'GRAPH_MAILBOX_ERROR_BUDGET_EXCEEDED',
              }
            );
          }
        }
      }

      conversations.sort((a, b) => {
        const lastInboundComparison = compareIsoDesc(a.lastInboundAt, b.lastInboundAt);
        if (lastInboundComparison !== 0) return lastInboundComparison;
        return String(a.conversationId || '').localeCompare(String(b.conversationId || ''));
      });

      if (selectedUsers.length === 0) {
        warnings.push('Full-tenant ingest hittade inga mailbox-anvandare i user-listing.');
      }
    }

    const snapshot = {
      snapshotVersion: 'graph.inbox.snapshot.v1',
      source: 'microsoft-graph',
      timestamps: {
        capturedAt,
        sourceGeneratedAt: capturedAt,
      },
      conversations,
      metadata: {
        connector: 'MicrosoftGraphReadConnector',
        windowDays,
        maxMessages,
        maxMessagesPerUser,
        includeReadMessages,
        fullTenantMode,
        userScope,
        maxUsers,
        mailboxTimeoutMs,
        runTimeoutMs,
        maxMailboxErrors,
        mailboxErrors,
        mailboxCount,
        fetchedMessages,
        messageCount: fetchedMessages,
      },
    };

    if (warnings.length > 0) {
      snapshot.warnings = warnings.slice(0, 20);
    }

    return snapshot;
  }

  return {
    fetchInboxSnapshot,
  };
}

module.exports = {
  createMicrosoftGraphReadConnector,
};
