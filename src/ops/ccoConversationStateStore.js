const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function toIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createHash(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
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

function normalizeActionState(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'reply_later') return 'reply_later';
  return '';
}

function normalizeNeedsReplyStatusOverride(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'handled') return 'handled';
  if (normalized === 'needs_reply') return 'needs_reply';
  return '';
}

function normalizeCanonicalConversationSource(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'merge_identity') return 'merge_identity';
  if (normalized === 'mailbox_conversation_fallback') return 'mailbox_conversation_fallback';
  return 'mailbox_conversation_fallback';
}

function normalizeCanonicalConversationType(value = '') {
  const normalized = normalizeText(value);
  if (
    [
      'explicitMergeGroupId',
      'canonicalContactId',
      'canonicalCustomerId',
      'conversationKey',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return 'conversationKey';
}

function normalizeWaitingOn(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'customer') return 'customer';
  if (normalized === 'owner') return 'owner';
  return null;
}

function normalizeSupersededReason(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (
    [
      'new_inbound',
      'reply_sent',
      'merge_migrated',
      'merge_conflict_lost',
      'manual_clear',
    ].includes(normalized)
  ) {
    return normalized;
  }
  return null;
}

function toStateKey(tenantId, canonicalConversationKey) {
  const safeTenantId = normalizeText(tenantId);
  const safeConversationKey = normalizeText(canonicalConversationKey);
  if (!safeTenantId || !safeConversationKey) return '';
  return `${safeTenantId}:${safeConversationKey}`;
}

function toIdempotencyRecordKey({
  tenantId,
  routeKey,
  actorUserId,
  canonicalConversationKey,
  idempotencyKey,
}) {
  const safeTenantId = normalizeText(tenantId);
  const safeRouteKey = normalizeText(routeKey).toLowerCase();
  const safeActorUserId = normalizeText(actorUserId);
  const safeConversationKey = normalizeText(canonicalConversationKey);
  const safeIdempotencyKey = normalizeText(idempotencyKey);
  if (!safeTenantId || !safeRouteKey || !safeActorUserId || !safeConversationKey || !safeIdempotencyKey) {
    return '';
  }
  return [
    safeTenantId,
    safeRouteKey,
    safeActorUserId,
    safeConversationKey,
    safeIdempotencyKey,
  ].join('::');
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    conversationStates: {},
    idempotencyRecords: {},
  };
}

function normalizeConversationStateRecord(input = {}, existingRecord = null) {
  const tenantId = normalizeText(input.tenantId);
  const canonicalConversationKey = normalizeText(input.canonicalConversationKey);
  const key = toStateKey(tenantId, canonicalConversationKey);
  const actionState = normalizeActionState(input.actionState);
  const needsReplyStatusOverride = normalizeNeedsReplyStatusOverride(input.needsReplyStatusOverride);
  if (!tenantId || !canonicalConversationKey || !key || !actionState || !needsReplyStatusOverride) {
    return null;
  }
  const createdAt = normalizeText(existingRecord?.createdAt || input.createdAt) || nowIso();
  const updatedAt = nowIso();
  const existingVersion = Number.parseInt(String(existingRecord?.version ?? '0'), 10);
  const nextVersion = Number.isFinite(existingVersion) && existingVersion > 0 ? existingVersion + 1 : 1;
  return {
    key,
    tenantId,
    canonicalConversationKey,
    canonicalConversationSource: normalizeCanonicalConversationSource(
      input.canonicalConversationSource || existingRecord?.canonicalConversationSource
    ),
    canonicalConversationType: normalizeCanonicalConversationType(
      input.canonicalConversationType || existingRecord?.canonicalConversationType
    ),
    primaryConversationId:
      normalizeText(input.primaryConversationId || existingRecord?.primaryConversationId) || null,
    underlyingConversationIds: asArray(
      input.underlyingConversationIds || existingRecord?.underlyingConversationIds
    )
      .map((item) => normalizeText(item))
      .filter(Boolean),
    underlyingMailboxIds: asArray(input.underlyingMailboxIds || existingRecord?.underlyingMailboxIds)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean),
    actionState,
    needsReplyStatusOverride,
    followUpDueAt: toIso(input.followUpDueAt),
    waitingOn: normalizeWaitingOn(input.waitingOn),
    nextActionLabel: normalizeText(input.nextActionLabel) || null,
    nextActionSummary: normalizeText(input.nextActionSummary) || null,
    actionAt: toIso(input.actionAt) || nowIso(),
    actionByUserId: normalizeText(input.actionByUserId) || null,
    actionByEmail: normalizeText(input.actionByEmail).toLowerCase() || null,
    source: 'cco_action_route',
    idempotencyKey: normalizeText(input.idempotencyKey) || null,
    version: nextVersion,
    superseded: false,
    supersededAt: null,
    supersededReason: null,
    supersededByMessageId: null,
    createdAt,
    updatedAt,
  };
}

function normalizeIdempotencyRecord(record = {}) {
  const key = normalizeText(record.key);
  if (!key) return null;
  const status = normalizeText(record.status).toLowerCase();
  if (!['pending', 'resolved'].includes(status)) return null;
  const expiresAt = toIso(record.expiresAt);
  if (!expiresAt) return null;
  return {
    key,
    tenantId: normalizeText(record.tenantId),
    routeKey: normalizeText(record.routeKey).toLowerCase(),
    actorUserId: normalizeText(record.actorUserId),
    canonicalConversationKey: normalizeText(record.canonicalConversationKey),
    idempotencyKey: normalizeText(record.idempotencyKey),
    payloadHash: normalizeText(record.payloadHash),
    payloadSnapshot: cloneJson(record.payloadSnapshot) || null,
    status,
    responseSnapshot: cloneJson(record.responseSnapshot) || null,
    createdAt: toIso(record.createdAt) || nowIso(),
    updatedAt: toIso(record.updatedAt) || nowIso(),
    expiresAt,
  };
}

function normalizeLoadedConversationStateRecord(record = {}) {
  const tenantId = normalizeText(record.tenantId);
  const canonicalConversationKey = normalizeText(record.canonicalConversationKey);
  const key = normalizeText(record.key) || toStateKey(tenantId, canonicalConversationKey);
  const actionState = normalizeActionState(record.actionState);
  const needsReplyStatusOverride = normalizeNeedsReplyStatusOverride(record.needsReplyStatusOverride);
  if (!tenantId || !canonicalConversationKey || !key || !actionState || !needsReplyStatusOverride) {
    return null;
  }
  return {
    key,
    tenantId,
    canonicalConversationKey,
    canonicalConversationSource: normalizeCanonicalConversationSource(
      record.canonicalConversationSource
    ),
    canonicalConversationType: normalizeCanonicalConversationType(record.canonicalConversationType),
    primaryConversationId: normalizeText(record.primaryConversationId) || null,
    underlyingConversationIds: asArray(record.underlyingConversationIds)
      .map((item) => normalizeText(item))
      .filter(Boolean),
    underlyingMailboxIds: asArray(record.underlyingMailboxIds)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean),
    actionState,
    needsReplyStatusOverride,
    followUpDueAt: toIso(record.followUpDueAt),
    waitingOn: normalizeWaitingOn(record.waitingOn),
    nextActionLabel: normalizeText(record.nextActionLabel) || null,
    nextActionSummary: normalizeText(record.nextActionSummary) || null,
    actionAt: toIso(record.actionAt) || nowIso(),
    actionByUserId: normalizeText(record.actionByUserId) || null,
    actionByEmail: normalizeText(record.actionByEmail).toLowerCase() || null,
    source: 'cco_action_route',
    idempotencyKey: normalizeText(record.idempotencyKey) || null,
    version: Math.max(1, Number.parseInt(String(record.version ?? '1'), 10) || 1),
    superseded: record.superseded === true,
    supersededAt: toIso(record.supersededAt),
    supersededReason: normalizeSupersededReason(record.supersededReason),
    supersededByMessageId: normalizeText(record.supersededByMessageId) || null,
    createdAt: toIso(record.createdAt) || nowIso(),
    updatedAt: toIso(record.updatedAt) || nowIso(),
  };
}

async function createCcoConversationStateStore({ filePath, idempotencyTtlHours = 24 }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoConversationStateStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    conversationStates:
      state?.conversationStates && typeof state.conversationStates === 'object'
        ? Object.fromEntries(
            Object.entries(state.conversationStates)
              .map(([key, value]) => {
                const normalized = normalizeLoadedConversationStateRecord({ ...value, key });
                return normalized ? [key, normalized] : null;
              })
              .filter(Boolean)
          )
        : {},
    idempotencyRecords:
      state?.idempotencyRecords && typeof state.idempotencyRecords === 'object'
        ? Object.fromEntries(
            Object.entries(state.idempotencyRecords)
              .map(([key, value]) => {
                const normalized = normalizeIdempotencyRecord({ ...value, key });
                return normalized ? [key, normalized] : null;
              })
              .filter(Boolean)
          )
        : {},
  };

  function purgeExpiredIdempotencyRecords() {
    const nowMs = Date.now();
    let changed = false;
    for (const [key, record] of Object.entries(state.idempotencyRecords || {})) {
      const expiresMs = Date.parse(record?.expiresAt || '');
      if (Number.isFinite(expiresMs) && expiresMs > nowMs) continue;
      delete state.idempotencyRecords[key];
      changed = true;
    }
    return changed;
  }

  async function save() {
    purgeExpiredIdempotencyRecords();
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function getConversationState({ tenantId, canonicalConversationKey } = {}) {
    const key = toStateKey(tenantId, canonicalConversationKey);
    const record = key ? state.conversationStates[key] : null;
    return record ? cloneJson(record) : null;
  }

  function getActiveState({ tenantId, canonicalConversationKey } = {}) {
    const record = getConversationState({ tenantId, canonicalConversationKey });
    if (!record || record.superseded === true) return null;
    return record;
  }

  function getActiveStateMap({ tenantId, canonicalConversationKeys = [] } = {}) {
    const safeTenantId = normalizeText(tenantId);
    const result = {};
    for (const conversationKey of asArray(canonicalConversationKeys)) {
      const record = getActiveState({
        tenantId: safeTenantId,
        canonicalConversationKey: conversationKey,
      });
      if (record) result[normalizeText(conversationKey)] = record;
    }
    return result;
  }

  async function writeConversationState(input = {}) {
    const tenantId = normalizeText(input.tenantId);
    const canonicalConversationKey = normalizeText(input.canonicalConversationKey);
    const key = toStateKey(tenantId, canonicalConversationKey);
    if (!key) {
      throw new Error('tenantId och canonicalConversationKey krävs för conversation state.');
    }
    const existingRecord = state.conversationStates[key] || null;
    const nextRecord = normalizeConversationStateRecord(input, existingRecord);
    if (!nextRecord) {
      throw new Error('Conversation state saknar obligatoriska fält.');
    }
    state.conversationStates[key] = nextRecord;
    await save();
    return cloneJson(nextRecord);
  }

  async function supersedeConversationState({
    tenantId,
    canonicalConversationKey,
    supersededReason,
    supersededByMessageId = null,
    supersededAt = null,
  } = {}) {
    const key = toStateKey(tenantId, canonicalConversationKey);
    const existingRecord = key ? state.conversationStates[key] : null;
    if (!existingRecord) return null;
    existingRecord.superseded = true;
    existingRecord.supersededAt = toIso(supersededAt) || nowIso();
    existingRecord.supersededReason =
      normalizeSupersededReason(supersededReason) || 'manual_clear';
    existingRecord.supersededByMessageId = normalizeText(supersededByMessageId) || null;
    existingRecord.version = Number.parseInt(String(existingRecord.version || '0'), 10) + 1;
    existingRecord.updatedAt = nowIso();
    await save();
    return cloneJson(existingRecord);
  }

  async function migrateConversationState({
    tenantId,
    fromCanonicalConversationKey,
    toCanonicalConversationKey,
    canonicalConversationSource = 'merge_identity',
    canonicalConversationType = 'conversationKey',
    primaryConversationId = null,
    underlyingConversationIds = [],
    underlyingMailboxIds = [],
  } = {}) {
    const fromKey = toStateKey(tenantId, fromCanonicalConversationKey);
    const toKey = toStateKey(tenantId, toCanonicalConversationKey);
    if (!fromKey || !toKey || fromKey === toKey) return null;
    const existingRecord = state.conversationStates[fromKey];
    if (!existingRecord || existingRecord.superseded === true) return null;
    const targetRecord = normalizeConversationStateRecord(
      {
        ...existingRecord,
        tenantId,
        canonicalConversationKey: toCanonicalConversationKey,
        canonicalConversationSource,
        canonicalConversationType,
        primaryConversationId:
          normalizeText(primaryConversationId) || existingRecord.primaryConversationId,
        underlyingConversationIds:
          asArray(underlyingConversationIds).length > 0
            ? underlyingConversationIds
            : existingRecord.underlyingConversationIds,
        underlyingMailboxIds:
          asArray(underlyingMailboxIds).length > 0
            ? underlyingMailboxIds
            : existingRecord.underlyingMailboxIds,
        actionAt: existingRecord.actionAt,
        idempotencyKey: existingRecord.idempotencyKey,
      },
      state.conversationStates[toKey] || null
    );
    if (!targetRecord) return null;
    state.conversationStates[toKey] = targetRecord;
    existingRecord.superseded = true;
    existingRecord.supersededAt = nowIso();
    existingRecord.supersededReason = 'merge_migrated';
    existingRecord.updatedAt = nowIso();
    await save();
    return cloneJson(targetRecord);
  }

  async function reserveIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
    payload = {},
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    if (!key) {
      throw new Error('Idempotency-scope saknar obligatoriska fält.');
    }
    purgeExpiredIdempotencyRecords();
    const payloadSnapshot = cloneJson(payload) || {};
    const payloadHash = createHash(stableSerialize(payloadSnapshot));
    const existing = state.idempotencyRecords[key];
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        return {
          status: 'mismatch',
          existing: cloneJson(existing),
        };
      }
      if (existing.status === 'pending') {
        return {
          status: 'in_progress',
          existing: cloneJson(existing),
        };
      }
      if (existing.status === 'resolved') {
        return {
          status: 'replay',
          existing: cloneJson(existing),
        };
      }
    }
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(1, Number(idempotencyTtlHours || 24)) * 60 * 60 * 1000)
      .toISOString();
    state.idempotencyRecords[key] = {
      key,
      tenantId: normalizeText(tenantId),
      routeKey: normalizeText(routeKey).toLowerCase(),
      actorUserId: normalizeText(actorUserId),
      canonicalConversationKey: normalizeText(canonicalConversationKey),
      idempotencyKey: normalizeText(idempotencyKey),
      payloadHash,
      payloadSnapshot,
      status: 'pending',
      responseSnapshot: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
    };
    await save();
    return {
      status: 'started',
      existing: cloneJson(state.idempotencyRecords[key]),
    };
  }

  async function completeIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
    responseSnapshot,
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    const existing = key ? state.idempotencyRecords[key] : null;
    if (!existing) {
      throw new Error('Idempotency-post saknas för completion.');
    }
    existing.status = 'resolved';
    existing.responseSnapshot = cloneJson(responseSnapshot) || null;
    existing.updatedAt = nowIso();
    await save();
    return cloneJson(existing);
  }

  async function clearPendingIdempotency({
    tenantId,
    routeKey,
    actorUserId,
    canonicalConversationKey,
    idempotencyKey,
  } = {}) {
    const key = toIdempotencyRecordKey({
      tenantId,
      routeKey,
      actorUserId,
      canonicalConversationKey,
      idempotencyKey,
    });
    if (!key || !state.idempotencyRecords[key]) return false;
    delete state.idempotencyRecords[key];
    await save();
    return true;
  }

  return {
    getConversationState,
    getActiveState,
    getActiveStateMap,
    writeConversationState,
    supersedeConversationState,
    migrateConversationState,
    reserveIdempotency,
    completeIdempotency,
    clearPendingIdempotency,
  };
}

module.exports = {
  createCcoConversationStateStore,
};
