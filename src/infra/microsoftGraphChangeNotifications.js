function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function addHours(date, hours = 48) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function buildWebhookUrl(config = {}) {
  const base = normalizeText(config.publicBaseUrl).replace(/\/+$/, '');
  return `${base}/api/v1/cco/mail-ingestion/graph/webhook`;
}

function validateClientState(received = '', expected = '') {
  const safeReceived = normalizeText(received);
  const safeExpected = normalizeText(expected);
  if (!safeExpected) return true;
  return safeReceived === safeExpected;
}

function parseNotificationMailboxEmail(notification = {}) {
  const resource = normalizeText(notification.resource);
  const quotedMatch = resource.match(/users\('([^']+)'\)/i);
  if (quotedMatch?.[1]?.includes('@')) {
    return normalizeEmail(quotedMatch[1]);
  }
  const match = resource.match(/users\/([^/]+)/i);
  if (!match) return normalizeEmail(notification.clientStateMailbox || '');
  const raw = decodeURIComponent(match[1]).replace(/^'|'$/g, '');
  if (raw.includes('@')) return normalizeEmail(raw);
  return normalizeEmail(notification.clientStateMailbox || '');
}

function createMicrosoftGraphChangeNotifications({
  config = {},
  graphReadConnector = null,
  ingestionStore = null,
  syncService = null,
  logger = console,
} = {}) {
  async function createInboxSubscription({ mailboxEmail = '', graphUserId = '' } = {}) {
    if (!graphReadConnector || typeof graphReadConnector.fetchAccessToken !== 'function') {
      throw new Error('graph_read_connector_unavailable');
    }
    const userId = normalizeText(graphUserId) || normalizeEmail(mailboxEmail);
    if (!userId) {
      throw new Error('mailbox_user_id_missing');
    }

    const accessToken = await graphReadConnector.fetchAccessToken();
    const notificationUrl = buildWebhookUrl(config);
    const clientState = normalizeText(config.graphChangeNotificationClientState);
    const expirationDateTime = addHours(new Date(), 48);
    const resource = `/users/${encodeURIComponent(userId)}/mailFolders('Inbox')/messages`;

    const response = await fetch(`${normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'}/subscriptions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        changeType: 'created,updated',
        notificationUrl,
        resource,
        expirationDateTime,
        clientState,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        normalizeText(payload?.error?.message) || `graph_subscription_failed_${response.status}`
      );
    }

    if (ingestionStore) {
      await ingestionStore.saveGraphSubscription({
        id: payload.id,
        mailboxEmail: normalizeEmail(mailboxEmail),
        graphUserId: userId,
        resource,
        expirationDateTime: payload.expirationDateTime || expirationDateTime,
        notificationUrl,
      });
    }

    return payload;
  }

  async function renewSubscription(subscriptionId = '') {
    if (!graphReadConnector || typeof graphReadConnector.fetchAccessToken !== 'function') {
      throw new Error('graph_read_connector_unavailable');
    }
    const safeId = normalizeText(subscriptionId);
    if (!safeId) throw new Error('subscription_id_missing');

    const accessToken = await graphReadConnector.fetchAccessToken();
    const expirationDateTime = addHours(new Date(), 48);
    const response = await fetch(
      `${normalizeText(config.graphBaseUrl) || 'https://graph.microsoft.com/v1.0'}/subscriptions/${encodeURIComponent(safeId)}`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expirationDateTime }),
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        normalizeText(payload?.error?.message) || `graph_subscription_renew_failed_${response.status}`
      );
    }
    if (ingestionStore) {
      await ingestionStore.saveGraphSubscription({
        id: payload.id || safeId,
        expirationDateTime: payload.expirationDateTime || expirationDateTime,
      });
    }
    return payload;
  }

  async function handleValidationRequest(validationToken = '') {
    return normalizeText(validationToken);
  }

  async function handleNotifications(body = {}) {
    const notifications = Array.isArray(body?.value) ? body.value : [];
    const expectedClientState = normalizeText(config.graphChangeNotificationClientState);
    const triggered = [];

    for (const notification of notifications) {
      if (!validateClientState(notification?.clientState, expectedClientState)) {
        logger?.warn?.('[graph-webhook] clientState mismatch — notification ignored');
        continue;
      }

      const mailboxEmail = parseNotificationMailboxEmail(notification);
      if (!mailboxEmail || !syncService) {
        continue;
      }

      logger?.log?.(`[graph-webhook] trigger sync mailbox=${mailboxEmail}`);
      const result = await syncService.runMailboxCycle({
        mailboxEmail,
        mode: config.ccoMailIngestionMode || 'read_only',
        trigger: 'webhook',
        createdBy: 'graph_webhook',
      });
      triggered.push({ mailboxEmail, result });
    }

    return { accepted: notifications.length, triggered };
  }

  return {
    buildWebhookUrl,
    createInboxSubscription,
    renewSubscription,
    handleValidationRequest,
    handleNotifications,
    validateClientState,
  };
}

module.exports = {
  buildWebhookUrl,
  createMicrosoftGraphChangeNotifications,
  parseNotificationMailboxEmail,
  validateClientState,
};
