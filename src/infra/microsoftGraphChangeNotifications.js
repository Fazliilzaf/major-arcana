function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function normalizeMailboxEmails(values = []) {
  const raw = Array.isArray(values) ? values : [values];
  return [...new Set(raw.map(normalizeEmail).filter(Boolean))];
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
  mailboxAllowlist = [],
  runtimeStreamRouter = null,
  logger = console,
} = {}) {
  let allowedMailboxEmails = new Set(normalizeMailboxEmails(mailboxAllowlist));
  let activeRuntimeStreamRouter = runtimeStreamRouter;
  const mailboxCycles = new Map();

  function isAllowedMailbox(mailboxEmail = '') {
    const normalized = normalizeEmail(mailboxEmail);
    return allowedMailboxEmails.size === 0 || allowedMailboxEmails.has(normalized);
  }

  function configureRuntime({ mailboxAllowlist: nextMailboxAllowlist, runtimeStreamRouter: nextRouter } = {}) {
    if (nextMailboxAllowlist) {
      allowedMailboxEmails = new Set(normalizeMailboxEmails(nextMailboxAllowlist));
    }
    if (nextRouter) activeRuntimeStreamRouter = nextRouter;
  }

  function isWebhookReady() {
    return Boolean(
      normalizeText(config.publicBaseUrl) && normalizeText(config.graphChangeNotificationClientState)
    );
  }

  function listSubscriptions() {
    const subscriptions = Object.values(ingestionStore?.getState?.()?.graphSubscriptions || {});
    return subscriptions.filter((subscription) =>
      isAllowedMailbox(subscription?.mailboxEmail || subscription?.graphUserId)
    );
  }

  function findSubscription(mailboxEmail = '') {
    const normalized = normalizeEmail(mailboxEmail);
    return listSubscriptions()
      .filter((subscription) => normalizeEmail(subscription.mailboxEmail) === normalized)
      .sort((left, right) =>
        String(right.updatedAt || right.expirationDateTime || '').localeCompare(
          String(left.updatedAt || left.expirationDateTime || '')
        )
      )[0] || null;
  }
  async function createInboxSubscription({ mailboxEmail = '', graphUserId = '' } = {}) {
    if (!graphReadConnector || typeof graphReadConnector.fetchAccessToken !== 'function') {
      throw new Error('graph_read_connector_unavailable');
    }
    const userId = normalizeText(graphUserId) || normalizeEmail(mailboxEmail);
    if (!userId) {
      throw new Error('mailbox_user_id_missing');
    }
    if (!isAllowedMailbox(mailboxEmail || userId)) {
      throw new Error('mailbox_not_allowlisted_for_graph_notifications');
    }

    const accessToken = await graphReadConnector.fetchAccessToken();
    const notificationUrl = buildWebhookUrl(config);
    const clientState = normalizeText(config.graphChangeNotificationClientState);
    if (!isWebhookReady()) {
      throw new Error('graph_change_notification_config_incomplete');
    }
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

  async function ensureInboxSubscriptions({ mailboxEmails = [] } = {}) {
    const requested = normalizeMailboxEmails(
      mailboxEmails.length > 0 ? mailboxEmails : [...allowedMailboxEmails]
    );
    const results = [];
    for (const mailboxEmail of requested) {
      if (!isAllowedMailbox(mailboxEmail)) {
        results.push({ mailboxEmail, skipped: true, reason: 'mailbox_not_allowlisted' });
        continue;
      }

      const existing = findSubscription(mailboxEmail);
      try {
        const subscription = existing
          ? await renewSubscription(existing.id)
          : await createInboxSubscription({ mailboxEmail, graphUserId: mailboxEmail });
        results.push({
          mailboxEmail,
          action: existing ? 'renewed' : 'created',
          subscription,
        });
      } catch (error) {
        // A deleted Graph subscription cannot be renewed. Replace only that one.
        if (existing && /not found|does not exist|resource not found/i.test(normalizeText(error?.message))) {
          const subscription = await createInboxSubscription({
            mailboxEmail,
            graphUserId: mailboxEmail,
          });
          results.push({ mailboxEmail, action: 'recreated', subscription });
          continue;
        }
        throw error;
      }
    }
    return { mailboxEmails: requested, results };
  }

  async function handleValidationRequest(validationToken = '') {
    return normalizeText(validationToken);
  }

  function queueMailboxCycle(mailboxEmail = '') {
    const normalized = normalizeEmail(mailboxEmail);
    if (!isAllowedMailbox(normalized)) {
      return { mailboxEmail: normalized, queued: false, reason: 'mailbox_not_allowlisted' };
    }
    if (!normalized || !syncService?.runMailboxCycle) {
      return { mailboxEmail: normalized, queued: false, reason: 'sync_service_unavailable' };
    }
    if (mailboxCycles.has(normalized)) {
      return { mailboxEmail: normalized, queued: false, coalesced: true };
    }

    const job = { mailboxEmail: normalized, queuedAt: new Date().toISOString() };
    mailboxCycles.set(normalized, job);
    setImmediate(async () => {
      try {
        const result = await syncService.runMailboxCycle({
          mailboxEmail: normalized,
          mode: config.ccoMailIngestionMode || 'read_only',
          trigger: 'webhook',
          createdBy: 'graph_webhook',
        });
        const changed = Number(result?.deltaResult?.affectedConversationIds?.length || 0);
        if (changed > 0 && typeof activeRuntimeStreamRouter?.broadcast === 'function') {
          activeRuntimeStreamRouter.broadcast('worklist_updated', {
            source: 'cco_graph_webhook',
            mailboxIds: [normalized],
            truthChanged: changed,
            completedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger?.error?.(`[graph-webhook] sync failed mailbox=${normalized}`, error);
      } finally {
        mailboxCycles.delete(normalized);
      }
    });
    return { ...job, queued: true };
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
      if (!mailboxEmail) {
        continue;
      }
      const queued = queueMailboxCycle(mailboxEmail);
      if (queued.reason === 'mailbox_not_allowlisted') {
        logger?.warn?.(`[graph-webhook] mailbox utanför allowlist ignorerad: ${mailboxEmail}`);
      }
      triggered.push(queued);
    }

    return { accepted: notifications.length, triggered };
  }

  return {
    buildWebhookUrl,
    createInboxSubscription,
    renewSubscription,
    ensureInboxSubscriptions,
    listSubscriptions,
    queueMailboxCycle,
    configureRuntime,
    isWebhookReady,
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
