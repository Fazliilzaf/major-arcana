const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_WORKSPACE_ID = 'major-arcana-preview';
const MAX_NOTIFICATION_HISTORY = 50;
const MAX_EVENT_HISTORY = 100;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fallback to JSON clone below.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    tenants: {},
  };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function normalizeCollection(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (value && typeof value === 'object') {
    return cloneValue(value);
  }
  return null;
}

function resolveCustomerKey(input = {}) {
  return (
    normalizeKey(input.customerKey) ||
    normalizeKey(input.customerEmail) ||
    normalizeKey(input.customerId) ||
    normalizeKey(input.customerName)
  );
}

function normalizePortalDraft(input = {}) {
  const now = nowIso();
  const draftId = normalizeText(input.draftId) || crypto.randomUUID();
  return {
    draftId,
    customerKey: normalizeKey(input.customerKey),
    customerName: normalizeText(input.customerName),
    customerEmail: normalizeText(input.customerEmail).toLowerCase(),
    customerPhone: normalizeText(input.customerPhone),
    workspaceId: normalizeText(input.workspaceId) || DEFAULT_WORKSPACE_ID,
    title: normalizeText(input.title),
    summary: normalizeText(input.summary),
    note: normalizeText(input.note),
    layers: normalizeCollection(input.layers),
    librarySnapshot: normalizeCollection(input.librarySnapshot),
    ownerUserId: normalizeText(input.ownerUserId),
    ownerName: normalizeText(input.ownerName),
    source: normalizeText(input.source) || 'workspace_draft',
    status: 'draft',
    publishedVersionId: normalizeText(input.publishedVersionId),
    publishedAt: normalizeText(input.publishedAt),
    createdAt: normalizeText(input.createdAt) || now,
    updatedAt: normalizeText(input.updatedAt) || now,
  };
}

function normalizePortalVersion(input = {}) {
  const now = nowIso();
  return {
    versionId: normalizeText(input.versionId) || crypto.randomUUID(),
    versionNumber: Math.max(1, Number.parseInt(String(input.versionNumber ?? ''), 10) || 1),
    customerKey: normalizeKey(input.customerKey),
    customerName: normalizeText(input.customerName),
    customerEmail: normalizeText(input.customerEmail).toLowerCase(),
    customerPhone: normalizeText(input.customerPhone),
    workspaceId: normalizeText(input.workspaceId) || DEFAULT_WORKSPACE_ID,
    title: normalizeText(input.title),
    summary: normalizeText(input.summary),
    note: normalizeText(input.note),
    layers: normalizeCollection(input.layers),
    librarySnapshot: normalizeCollection(input.librarySnapshot),
    ownerUserId: normalizeText(input.ownerUserId),
    ownerName: normalizeText(input.ownerName),
    source: normalizeText(input.source) || 'published_layer',
    publishedAt: normalizeText(input.publishedAt) || now,
    draftId: normalizeText(input.draftId),
  };
}

function normalizeNotification(input = {}) {
  const now = nowIso();
  return {
    notificationId: normalizeText(input.notificationId) || crypto.randomUUID(),
    type: normalizeText(input.type) || 'layer_version_published',
    title: normalizeText(input.title),
    message: normalizeText(input.message),
    versionId: normalizeText(input.versionId),
    versionNumber: Math.max(1, Number.parseInt(String(input.versionNumber ?? ''), 10) || 1),
    readAt: normalizeText(input.readAt),
    createdAt: normalizeText(input.createdAt) || now,
    actorUserId: normalizeText(input.actorUserId),
  };
}

function normalizeEvent(input = {}) {
  const now = nowIso();
  return {
    eventId: normalizeText(input.eventId) || crypto.randomUUID(),
    type: normalizeText(input.type),
    message: normalizeText(input.message),
    payload: input.payload && typeof input.payload === 'object' ? cloneValue(input.payload) : {},
    createdAt: normalizeText(input.createdAt) || now,
    actorUserId: normalizeText(input.actorUserId),
  };
}

function normalizeCustomerRecord(input = {}) {
  const now = nowIso();
  const drafts = Array.isArray(input.drafts)
    ? input.drafts.map((item) => normalizePortalDraft(item))
    : [];
  const versions = Array.isArray(input.versions)
    ? input.versions.map((item) => normalizePortalVersion(item))
    : [];
  const notifications = Array.isArray(input.notifications)
    ? input.notifications.map((item) => normalizeNotification(item))
    : [];
  const events = Array.isArray(input.events)
    ? input.events.map((item) => normalizeEvent(item))
    : [];
  const currentDraftId =
    normalizeText(input.currentDraftId) ||
    drafts.find((item) => item.status === 'draft')?.draftId ||
    drafts.at(-1)?.draftId ||
    '';
  const currentPublishedVersionId =
    normalizeText(input.currentPublishedVersionId) || versions.at(-1)?.versionId || '';

  return {
    customerKey: normalizeKey(input.customerKey),
    customerName: normalizeText(input.customerName),
    customerEmail: normalizeText(input.customerEmail).toLowerCase(),
    customerPhone: normalizeText(input.customerPhone),
    workspaceId: normalizeText(input.workspaceId) || DEFAULT_WORKSPACE_ID,
    currentDraftId,
    currentPublishedVersionId,
    lastPublishedAt: normalizeText(input.lastPublishedAt),
    lastViewedAt: normalizeText(input.lastViewedAt),
    lastAcknowledgedAt: normalizeText(input.lastAcknowledgedAt),
    drafts,
    versions,
    notifications,
    events,
    createdAt: normalizeText(input.createdAt) || now,
    updatedAt: normalizeText(input.updatedAt) || now,
  };
}

function buildCustomerSummary(record) {
  const latestVersion = record.versions.at(-1) || null;
  const currentDraft =
    record.drafts.find((item) => item.draftId === record.currentDraftId) ||
    record.drafts.find((item) => item.status === 'draft') ||
    null;
  const unreadNotificationCount = record.notifications.filter((item) => !item.readAt).length;
  const publishedVersionCount = record.versions.length;
  const draftCount = record.drafts.length;
  const portalStatus = latestVersion
    ? unreadNotificationCount > 0
      ? 'published_unread'
      : 'published'
    : currentDraft
      ? 'draft'
      : 'empty';

  return {
    customerKey: record.customerKey,
    customerName: record.customerName,
    customerEmail: record.customerEmail,
    customerPhone: record.customerPhone,
    workspaceId: record.workspaceId,
    portalStatus,
    draftCount,
    publishedVersionCount,
    unreadNotificationCount,
    lastPublishedAt: record.lastPublishedAt || null,
    lastViewedAt: record.lastViewedAt || null,
    lastAcknowledgedAt: record.lastAcknowledgedAt || null,
    currentDraftId: record.currentDraftId || null,
    currentPublishedVersionId: record.currentPublishedVersionId || null,
    currentDraftTitle: currentDraft?.title || null,
    currentPublishedVersionTitle: latestVersion?.title || null,
    currentPublishedVersionNumber: latestVersion?.versionNumber || null,
    notificationCount: record.notifications.length,
    updatedAt: record.updatedAt,
  };
}

function buildCustomerPortalView(record, { viewerScope = 'owner' } = {}) {
  const summary = buildCustomerSummary(record);
  const latestVersion = record.versions.at(-1) || null;
  const visibleNotifications = record.notifications.map((item) => ({ ...item }));

  if (viewerScope === 'customer') {
    return {
      ...summary,
      currentDraft: null,
      drafts: [],
      versions: record.versions.map((item) => ({ ...item })),
      currentPublishedVersion: latestVersion ? { ...latestVersion } : null,
      notifications: visibleNotifications,
      events: [],
    };
  }

  return {
    ...summary,
    currentDraft:
      record.drafts.find((item) => item.draftId === record.currentDraftId) ||
      record.drafts.find((item) => item.status === 'draft') ||
      null,
    drafts: record.drafts.map((item) => ({ ...item })),
    versions: record.versions.map((item) => ({ ...item })),
    currentPublishedVersion: latestVersion ? { ...latestVersion } : null,
    notifications: visibleNotifications,
    events: record.events.map((item) => ({ ...item })),
  };
}

function ensureTenant(state, tenantId) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) {
    throw new Error('tenantId krävs.');
  }
  if (!state.tenants[normalizedTenantId]) {
    state.tenants[normalizedTenantId] = {
      createdAt: nowIso(),
      updatedAt: nowIso(),
      customers: {},
    };
  }
  const tenantState = state.tenants[normalizedTenantId];
  tenantState.customers =
    tenantState.customers && typeof tenantState.customers === 'object' ? tenantState.customers : {};
  return tenantState;
}

function findCustomerRecord(tenantState, input = {}) {
  const targetKey = resolveCustomerKey(input);
  if (!targetKey) return null;
  return tenantState.customers[targetKey] || null;
}

function touchState(state, tenantState) {
  const now = nowIso();
  tenantState.updatedAt = now;
  state.updatedAt = now;
}

function appendBounded(list, item, maxItems) {
  list.unshift(item);
  if (list.length > maxItems) {
    list.length = maxItems;
  }
}

async function createCcoPortalStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoPortalStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    tenants: state && typeof state.tenants === 'object' && state.tenants ? state.tenants : {},
  };

  for (const tenantId of Object.keys(state.tenants)) {
    const tenantState = ensureTenant(state, tenantId);
    tenantState.customers = Object.fromEntries(
      Object.entries(tenantState.customers || {})
        .map(([customerKey, record]) => [
          normalizeKey(customerKey),
          normalizeCustomerRecord(record),
        ])
        .filter(([customerKey]) => customerKey)
    );
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureCustomerRecord(input) {
    const tenantState = ensureTenant(state, input.tenantId);
    const customerKey = resolveCustomerKey(input);
    if (!customerKey) {
      throw new Error('customerKey krävs.');
    }

    if (!tenantState.customers[customerKey]) {
      tenantState.customers[customerKey] = normalizeCustomerRecord({
        customerKey,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        workspaceId: input.workspaceId || DEFAULT_WORKSPACE_ID,
      });
    }

    const record = tenantState.customers[customerKey];
    record.customerKey = customerKey;
    record.customerName = normalizeText(input.customerName) || record.customerName || customerKey;
    record.customerEmail = normalizeText(input.customerEmail).toLowerCase() || record.customerEmail;
    record.customerPhone = normalizeText(input.customerPhone) || record.customerPhone || '';
    record.workspaceId =
      normalizeText(input.workspaceId) || record.workspaceId || DEFAULT_WORKSPACE_ID;
    record.updatedAt = nowIso();
    touchState(state, tenantState);
    return { tenantState, record };
  }

  function pushEvent(record, type, message, payload, actorUserId) {
    appendBounded(
      record.events,
      normalizeEvent({
        type,
        message,
        payload,
        actorUserId,
      }),
      MAX_EVENT_HISTORY
    );
  }

  function upsertDraftRecord(record, input) {
    const draftId = normalizeText(input.draftId) || record.currentDraftId || crypto.randomUUID();
    const nextDraft = normalizePortalDraft({
      draftId,
      customerKey: record.customerKey,
      customerName: input.customerName || record.customerName,
      customerEmail: input.customerEmail || record.customerEmail,
      customerPhone: input.customerPhone || record.customerPhone,
      workspaceId: input.workspaceId || record.workspaceId,
      title: input.title || record.drafts.find((item) => item.draftId === draftId)?.title || '',
      summary: input.summary || '',
      note: input.note || '',
      layers:
        input.layers !== undefined
          ? input.layers
          : record.drafts.find((item) => item.draftId === draftId)?.layers || [],
      librarySnapshot:
        input.librarySnapshot !== undefined
          ? input.librarySnapshot
          : record.drafts.find((item) => item.draftId === draftId)?.librarySnapshot || [],
      ownerUserId: input.ownerUserId,
      ownerName: input.ownerName,
      source: input.source,
      publishedVersionId:
        record.drafts.find((item) => item.draftId === draftId)?.publishedVersionId || '',
      createdAt: record.drafts.find((item) => item.draftId === draftId)?.createdAt || nowIso(),
      updatedAt: nowIso(),
      publishedAt: record.drafts.find((item) => item.draftId === draftId)?.publishedAt || '',
    });

    const existingIndex = record.drafts.findIndex((item) => item.draftId === draftId);
    if (existingIndex >= 0) {
      const existing = record.drafts[existingIndex];
      record.drafts[existingIndex] = {
        ...existing,
        ...nextDraft,
        status: 'draft',
        createdAt: existing.createdAt || nextDraft.createdAt,
        updatedAt: nowIso(),
      };
      return record.drafts[existingIndex];
    }

    const created = {
      ...nextDraft,
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    record.drafts.push(created);
    return created;
  }

  async function saveTenantPortalDraft(input) {
    const { tenantState, record } = ensureCustomerRecord(input);
    const draft = upsertDraftRecord(record, input);
    record.currentDraftId = draft.draftId;
    record.customerName = normalizeText(input.customerName) || record.customerName;
    record.customerEmail = normalizeText(input.customerEmail).toLowerCase() || record.customerEmail;
    record.customerPhone = normalizeText(input.customerPhone) || record.customerPhone;
    record.workspaceId =
      normalizeText(input.workspaceId) || record.workspaceId || DEFAULT_WORKSPACE_ID;
    pushEvent(
      record,
      'layer_draft_saved',
      'Layer draft sparades.',
      {
        draftId: draft.draftId,
        customerKey: record.customerKey,
        workspaceId: record.workspaceId,
      },
      input.ownerUserId
    );
    await save();
    return {
      portalOverview: await getTenantPortalOverview({ tenantId: input.tenantId }),
      portal: buildCustomerPortalView(record, { viewerScope: 'owner' }),
      draft: { ...draft },
      customerSummary: buildCustomerSummary(record),
    };
  }

  async function publishTenantPortalDraft(input) {
    const saveResult = await saveTenantPortalDraft(input);
    const tenantState = ensureTenant(state, input.tenantId);
    const record = findCustomerRecord(tenantState, input);
    if (!record) {
      throw new Error('Kundens portal kunde inte hittas.');
    }

    const draft = record.drafts.find((item) => item.draftId === record.currentDraftId) || null;
    if (!draft) {
      throw new Error('Inget utkast finns att publicera.');
    }

    const nextVersionNumber = (record.versions.at(-1)?.versionNumber || 0) + 1;
    const version = normalizePortalVersion({
      versionId: crypto.randomUUID(),
      versionNumber: nextVersionNumber,
      customerKey: record.customerKey,
      customerName: record.customerName,
      customerEmail: record.customerEmail,
      customerPhone: record.customerPhone,
      workspaceId: record.workspaceId,
      title: draft.title || input.title,
      summary: draft.summary || input.summary,
      note: draft.note || input.note,
      layers: draft.layers,
      librarySnapshot: draft.librarySnapshot,
      ownerUserId: input.ownerUserId,
      ownerName: input.ownerName,
      source: input.source || 'workspace_publish',
      draftId: draft.draftId,
      publishedAt: nowIso(),
    });

    record.versions.push(version);
    record.currentPublishedVersionId = version.versionId;
    record.lastPublishedAt = version.publishedAt;
    draft.status = 'published';
    draft.publishedVersionId = version.versionId;
    draft.publishedAt = version.publishedAt;
    draft.updatedAt = nowIso();

    const notification = normalizeNotification({
      notificationId: crypto.randomUUID(),
      type: 'layer_version_published',
      title: version.title || 'Ny layers-skiss publicerad',
      message:
        normalizeText(input.notificationMessage) ||
        `Ny skissversion ${version.versionNumber} är publicerad i kundportalen.`,
      versionId: version.versionId,
      versionNumber: version.versionNumber,
      actorUserId: input.ownerUserId,
    });
    appendBounded(record.notifications, notification, MAX_NOTIFICATION_HISTORY);
    pushEvent(
      record,
      'layer_version_published',
      'Layer-version publicerades.',
      {
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        draftId: draft.draftId,
      },
      input.ownerUserId
    );
    pushEvent(
      record,
      'customer_notified',
      'Kunden notifierades om ny version.',
      {
        notificationId: notification.notificationId,
        versionId: version.versionId,
      },
      input.ownerUserId
    );

    record.updatedAt = nowIso();
    tenantState.updatedAt = nowIso();
    state.updatedAt = nowIso();
    await save();

    return {
      portalOverview: await getTenantPortalOverview({ tenantId: input.tenantId }),
      portal: buildCustomerPortalView(record, { viewerScope: 'owner' }),
      draft: { ...draft },
      version: { ...version },
      notification: { ...notification },
      customerSummary: buildCustomerSummary(record),
      savedDraft: saveResult?.draft ? { ...saveResult.draft } : null,
    };
  }

  async function getTenantPortalOverview({ tenantId }) {
    const tenantState = ensureTenant(state, tenantId);
    const customers = Object.values(tenantState.customers || {})
      .map((record) => {
        const summary = buildCustomerSummary(record);
        const latestVersion = record.versions.at(-1) || null;
        const currentDraft =
          record.drafts.find((item) => item.draftId === record.currentDraftId) ||
          record.drafts.find((item) => item.status === 'draft') ||
          null;
        return {
          ...summary,
          currentDraft,
          currentPublishedVersion: latestVersion,
        };
      })
      .sort((left, right) => {
        const leftStamp = Date.parse(left.updatedAt || left.lastPublishedAt || 0) || 0;
        const rightStamp = Date.parse(right.updatedAt || right.lastPublishedAt || 0) || 0;
        return rightStamp - leftStamp;
      });

    return {
      tenantId: normalizeText(tenantId),
      customerCount: customers.length,
      customers,
      updatedAt: tenantState.updatedAt,
      createdAt: tenantState.createdAt,
    };
  }

  async function getTenantCustomerPortal({
    tenantId,
    customerKey,
    customerEmail,
    customerId,
    customerName,
    viewerScope = 'owner',
  }) {
    const tenantState = ensureTenant(state, tenantId);
    const targetKey = resolveCustomerKey({
      customerKey,
      customerEmail,
      customerId,
      customerName,
    });
    if (!targetKey) return null;
    const record = tenantState.customers[targetKey];
    if (!record) return null;
    return buildCustomerPortalView(record, { viewerScope });
  }

  async function markTenantPortalViewed({
    tenantId,
    customerKey,
    customerEmail,
    customerId,
    customerName,
    actorUserId,
    viewerScope = 'customer',
  }) {
    const tenantState = ensureTenant(state, tenantId);
    const targetKey = resolveCustomerKey({
      customerKey,
      customerEmail,
      customerId,
      customerName,
    });
    if (!targetKey || !tenantState.customers[targetKey]) {
      throw new Error('Kundens portal kunde inte hittas.');
    }
    const record = tenantState.customers[targetKey];
    record.lastViewedAt = nowIso();
    pushEvent(
      record,
      'customer_viewed',
      viewerScope === 'customer' ? 'Kunden öppnade portalen.' : 'Portalen öppnades i ägarläge.',
      {
        viewerScope,
      },
      actorUserId
    );
    record.updatedAt = nowIso();
    tenantState.updatedAt = nowIso();
    state.updatedAt = nowIso();
    await save();
    return {
      portal: buildCustomerPortalView(record, { viewerScope: viewerScope || 'customer' }),
      customerSummary: buildCustomerSummary(record),
    };
  }

  async function acknowledgeTenantPortalNotification({
    tenantId,
    customerKey,
    customerEmail,
    customerId,
    customerName,
    notificationId,
    actorUserId,
  }) {
    const tenantState = ensureTenant(state, tenantId);
    const targetKey = resolveCustomerKey({
      customerKey,
      customerEmail,
      customerId,
      customerName,
    });
    if (!targetKey || !tenantState.customers[targetKey]) {
      throw new Error('Kundens portal kunde inte hittas.');
    }
    const record = tenantState.customers[targetKey];
    const notification = record.notifications.find(
      (item) => item.notificationId === normalizeText(notificationId)
    );
    if (!notification) {
      throw new Error('Notifieringen kunde inte hittas.');
    }
    if (!notification.readAt) {
      notification.readAt = nowIso();
    }
    record.lastAcknowledgedAt = nowIso();
    pushEvent(
      record,
      'customer_acknowledged',
      'Kunden kvitterade notifieringen.',
      {
        notificationId: notification.notificationId,
      },
      actorUserId
    );
    record.updatedAt = nowIso();
    tenantState.updatedAt = nowIso();
    state.updatedAt = nowIso();
    await save();
    return {
      portal: buildCustomerPortalView(record, { viewerScope: 'customer' }),
      notification: { ...notification },
      customerSummary: buildCustomerSummary(record),
    };
  }

  return {
    getTenantPortalOverview,
    getTenantCustomerPortal,
    saveTenantPortalDraft,
    publishTenantPortalDraft,
    markTenantPortalViewed,
    acknowledgeTenantPortalNotification,
  };
}

module.exports = {
  createCcoPortalStore,
};
