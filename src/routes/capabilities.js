const crypto = require('node:crypto');
const express = require('express');

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { createExecutionGateway } = require('../gateway/executionGateway');
const { createCapabilityExecutor } = require('../capabilities/executionService');
const { createMicrosoftGraphReadConnector } = require('../infra/microsoftGraphReadConnector');
const { createMicrosoftGraphSendConnector } = require('../infra/microsoftGraphSendConnector');
const {
  isValidEmail,
  normalizeMailboxAddress,
  toWritingProfile,
} = require('../intelligence/writingIdentityRegistry');
const {
  listWritingIdentityProfiles,
  upsertWritingIdentityProfile,
} = require('../intelligence/writingIdentityStore');
const {
  extractAndPersistWritingIdentityProfiles,
} = require('../intelligence/writingProfileExtractor');
const {
  computeUsageAnalytics,
  computeWorklistSnapshotMetrics,
  computeHealthScore,
} = require('../intelligence/usageAnalyticsEngine');
const { evaluateRedFlag } = require('../intelligence/redFlagEngine');
const { resolveAdaptiveFocusState } = require('../intelligence/adaptiveFocusController');
const { evaluateRecovery } = require('../intelligence/recoveryEngine');

const CCO_LIFECYCLE_AUDIT_STATES = new Set([
  'NEW',
  'ACTIVE_DIALOGUE',
  'AWAITING_REPLY',
  'FOLLOW_UP_PENDING',
  'DORMANT',
  'HANDLED',
  'ARCHIVED',
]);
const ccoLifecycleTrackerByTenant = new Map();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function normalizeGraphUserScope(value, fallback = 'single') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'all' || normalized === 'single') return normalized;
  return fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLifecycleAuditState(value = '') {
  const normalized = normalizeText(value).toUpperCase();
  if (CCO_LIFECYCLE_AUDIT_STATES.has(normalized)) return normalized;
  if (normalized === 'NEW_LEAD') return 'NEW';
  if (normalized === 'WAITING' || normalized === 'WAITING_ON_CUSTOMER') return 'AWAITING_REPLY';
  if (normalized === 'FOLLOW_UP_SCHEDULED') return 'FOLLOW_UP_PENDING';
  if (normalized === 'CLOSED' || normalized === 'RESOLVED') return 'HANDLED';
  return '';
}

function extractCcoWorklistRowsFromResult(result = {}) {
  const payload = asObject(result?.gatewayResult?.response_payload);
  const output = asObject(payload.output);
  const directData = asObject(payload.data);
  const outputData = asObject(output.data);
  const fallbackData = asObject(payload);
  const candidates = [outputData, directData, fallbackData];
  for (const candidate of candidates) {
    const rows = asArray(candidate.conversationWorklist);
    if (rows.length > 0) return rows;
  }
  return [];
}

async function maybeWriteCcoLifecycleAuditEvents({
  authStore,
  tenantId = '',
  actorUserId = '',
  correlationId = '',
  result = {},
} = {}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  const safeTenantId = normalizeText(tenantId);
  if (!safeTenantId) return;
  const rows = extractCcoWorklistRowsFromResult(result);
  if (!rows.length) return;

  const tracker = ccoLifecycleTrackerByTenant.get(safeTenantId) || new Map();
  const safeActorUserId = normalizeText(actorUserId) || 'system';
  const safeCorrelationId = normalizeText(correlationId) || null;

  for (const row of rows.slice(0, 500)) {
    const conversationId = normalizeText(row?.conversationId);
    if (!conversationId) continue;
    const state = normalizeLifecycleAuditState(
      row?.lifecycleStatus || row?.customerSummary?.lifecycleStatus
    );
    if (!state) continue;
    const previousState = normalizeLifecycleAuditState(tracker.get(conversationId));
    const metadata = {
      correlationId: safeCorrelationId,
      conversationId,
      lifecycleState: state,
      lastInboundAt: toIso(row?.lastInboundAt),
      lastOutboundAt: toIso(row?.lastOutboundAt),
    };

    if (!previousState) {
      await authStore.addAuditEvent({
        tenantId: safeTenantId,
        actorUserId: safeActorUserId,
        action: 'cco.lifecycle.enter',
        outcome: 'success',
        targetType: 'cco_conversation',
        targetId: conversationId,
        metadata,
      });
      tracker.set(conversationId, state);
      continue;
    }

    if (previousState === state) continue;
    await authStore.addAuditEvent({
      tenantId: safeTenantId,
      actorUserId: safeActorUserId,
      action: 'cco.lifecycle.exit',
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        ...metadata,
        lifecycleState: previousState,
        nextLifecycleState: state,
      },
    });
    await authStore.addAuditEvent({
      tenantId: safeTenantId,
      actorUserId: safeActorUserId,
      action: 'cco.lifecycle.enter',
      outcome: 'success',
      targetType: 'cco_conversation',
      targetId: conversationId,
      metadata: {
        ...metadata,
        previousLifecycleState: previousState,
      },
    });
    tracker.set(conversationId, state);
  }

  ccoLifecycleTrackerByTenant.set(safeTenantId, tracker);
}

function pickErrorStatus(errorCode = '') {
  const code = normalizeText(errorCode).toUpperCase();
  if (code === 'CAPABILITY_NOT_FOUND') return 404;
  if (code === 'CAPABILITY_AGENT_NOT_FOUND') return 404;
  if (code === 'CAPABILITY_ROLE_DENIED' || code === 'CAPABILITY_CHANNEL_DENIED') return 403;
  if (code === 'CAPABILITY_AGENT_ROLE_DENIED' || code === 'CAPABILITY_AGENT_CHANNEL_DENIED') {
    return 403;
  }
  if (code === 'CAPABILITY_AGENT_DEPENDENCY_BLOCKED') return 403;
  if (code === 'CAPABILITY_INPUT_INVALID' || code === 'CAPABILITY_OUTPUT_INVALID') return 422;
  if (code === 'CAPABILITY_AGENT_INPUT_INVALID' || code === 'CAPABILITY_AGENT_OUTPUT_INVALID') {
    return 422;
  }
  if (code === 'CAPABILITY_AGENT_NOT_IMPLEMENTED') return 400;
  if (code === 'CAPABILITY_INVALID_TENANT') return 400;
  if (code === 'CCO_SEND_INPUT_INVALID') return 422;
  if (code === 'CCO_SEND_REQUIRES_ALLOW') return 403;
  if (code === 'CCO_SEND_ALLOWLIST_BLOCKED') return 403;
  if (code === 'CCO_SEND_ALLOWLIST_EMPTY') return 503;
  if (code === 'CCO_SEND_DISABLED') return 503;
  if (code === 'CCO_SEND_CONNECTOR_UNAVAILABLE') return 503;
  return 500;
}

function toTemplateChangeSnapshot(template = {}) {
  return {
    templateId: normalizeText(template.id) || null,
    templateName: normalizeText(template.name) || null,
    category: normalizeText(template.category) || null,
    updatedAt: normalizeText(template.updatedAt) || null,
    currentActiveVersionId: normalizeText(template.currentActiveVersionId) || null,
  };
}

function toOpenReviewSnapshot(evaluation = {}) {
  return {
    id: normalizeText(evaluation.id) || null,
    templateId: normalizeText(evaluation.templateId) || null,
    templateVersionId: normalizeText(evaluation.templateVersionId) || null,
    category: normalizeText(evaluation.category) || null,
    decision: normalizeText(evaluation.decision) || null,
    ownerDecision: normalizeText(evaluation.ownerDecision) || null,
    riskLevel: Number(evaluation.riskLevel || 0),
    riskScore: Number(evaluation.riskScore || 0),
    evaluatedAt: normalizeText(evaluation.evaluatedAt) || null,
    reasonCodes: Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes.slice(0, 6) : [],
  };
}

function toIncidentSnapshot(incident = {}) {
  return {
    id: normalizeText(incident.id) || null,
    category: normalizeText(incident.category) || null,
    riskLevel: Number(incident.riskLevel || 0),
    decision: normalizeText(incident.decision) || null,
    reasonCodes: Array.isArray(incident.reasonCodes) ? incident.reasonCodes.slice(0, 10) : [],
    severity: normalizeText(incident.severity) || null,
    status: normalizeText(incident.status) || null,
    ownerDecision: normalizeText(incident.ownerDecision) || null,
    openedAt: normalizeText(incident.openedAt) || null,
    updatedAt: normalizeText(incident.updatedAt) || null,
    sla:
      incident?.sla && typeof incident.sla === 'object'
        ? {
            state: normalizeText(incident.sla.state) || null,
            breached: incident.sla.breached === true,
            deadline: normalizeText(incident.sla.deadline) || null,
          }
        : null,
  };
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toTimestampMs(value) {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function toIncidentSeverityWeight(incident = {}) {
  const severity = normalizeText(incident?.severity).toUpperCase();
  if (severity === 'L5') return 5;
  if (severity === 'L4') return 4;
  if (severity === 'L3') return 3;
  const riskLevel = toNumber(incident?.riskLevel, 0);
  if (riskLevel >= 5) return 5;
  if (riskLevel >= 4) return 4;
  if (riskLevel >= 3) return 3;
  return 0;
}

function toIncidentWindowCounts(incidents = [], windowDays = 14) {
  const safeWindowDays = Math.max(1, Math.min(90, toNumber(windowDays, 14)));
  const thresholdMs = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  const windowItems = safeIncidents.filter((incident) => {
    const tsMs = toTimestampMs(incident?.updatedAt || incident?.openedAt);
    if (!Number.isFinite(tsMs)) return false;
    return tsMs >= thresholdMs;
  });

  const breakdown = { L3: 0, L4: 0, L5: 0 };
  let highRisk = 0;
  let escalated = 0;
  for (const incident of windowItems) {
    const severityWeight = toIncidentSeverityWeight(incident);
    if (severityWeight >= 5) breakdown.L5 += 1;
    else if (severityWeight >= 4) breakdown.L4 += 1;
    else if (severityWeight >= 3) breakdown.L3 += 1;
    if (severityWeight >= 4) highRisk += 1;
    const ownerDecision = normalizeText(incident?.ownerDecision).toLowerCase();
    if (ownerDecision === 'escalate_to_owner' || ownerDecision === 'escalate_to_medical') {
      escalated += 1;
    }
  }

  return {
    windowDays: safeWindowDays,
    total: windowItems.length,
    ...breakdown,
    highRisk,
    escalated,
  };
}

function toReviewWindowCounts(openReviews = [], windowDays = 14) {
  const safeWindowDays = Math.max(1, Math.min(90, toNumber(windowDays, 14)));
  const thresholdMs = Date.now() - safeWindowDays * 24 * 60 * 60 * 1000;
  const safeReviews = Array.isArray(openReviews) ? openReviews : [];
  const windowItems = safeReviews.filter((review) => {
    const tsMs = toTimestampMs(review?.evaluatedAt || review?.updatedAt);
    if (!Number.isFinite(tsMs)) return false;
    return tsMs >= thresholdMs;
  });

  let highCritical = 0;
  let blocked = 0;
  for (const review of windowItems) {
    if (toNumber(review?.riskLevel, 0) >= 4) highCritical += 1;
    if (normalizeText(review?.decision).toLowerCase() === 'blocked') blocked += 1;
  }

  return {
    windowDays: safeWindowDays,
    total: windowItems.length,
    highCritical,
    blocked,
  };
}

function toIncidentAgeBuckets(incidents = []) {
  const buckets = {
    lt1d: 0,
    d1to3: 0,
    d4to7: 0,
    gt7: 0,
    unknown: 0,
  };
  const safeIncidents = Array.isArray(incidents) ? incidents : [];
  for (const incident of safeIncidents) {
    const tsMs = toTimestampMs(incident?.openedAt || incident?.updatedAt);
    if (!Number.isFinite(tsMs)) {
      buckets.unknown += 1;
      continue;
    }
    const ageDays = (Date.now() - tsMs) / (24 * 60 * 60 * 1000);
    if (ageDays < 1) buckets.lt1d += 1;
    else if (ageDays < 4) buckets.d1to3 += 1;
    else if (ageDays < 8) buckets.d4to7 += 1;
    else buckets.gt7 += 1;
  }
  return buckets;
}

function toTemplateHistorySummary(latestTemplateChanges = []) {
  const safeChanges = Array.isArray(latestTemplateChanges) ? latestTemplateChanges : [];
  const byCategory = {};
  let newestUpdatedAt = null;
  let oldestUpdatedAt = null;
  for (const change of safeChanges) {
    const category = normalizeText(change?.category) || 'unknown';
    byCategory[category] = (byCategory[category] || 0) + 1;
    const updatedIso = toIso(change?.updatedAt);
    if (!updatedIso) continue;
    if (!newestUpdatedAt || Date.parse(updatedIso) > Date.parse(newestUpdatedAt)) {
      newestUpdatedAt = updatedIso;
    }
    if (!oldestUpdatedAt || Date.parse(updatedIso) < Date.parse(oldestUpdatedAt)) {
      oldestUpdatedAt = updatedIso;
    }
  }

  return {
    totalRecentChanges: safeChanges.length,
    byCategory,
    newestUpdatedAt,
    oldestUpdatedAt,
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function toWritingIdentityProfilesMap(source = null) {
  const map = {};
  if (!source || typeof source !== 'object') return map;
  const profileMap =
    source.profilesByMailbox && typeof source.profilesByMailbox === 'object'
      ? source.profilesByMailbox
      : source;
  if (!profileMap || typeof profileMap !== 'object') return map;
  for (const [rawMailbox, rawProfile] of Object.entries(profileMap)) {
    const mailbox = normalizeMailboxAddress(rawMailbox);
    if (!isValidEmail(mailbox)) continue;
    if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) continue;
    map[mailbox] = toWritingProfile(rawProfile.profile || rawProfile);
  }
  return map;
}

function mergeWritingIdentityProfiles({
  storedProfiles = {},
  inputProfiles = {},
}) {
  const merged = {
    ...toWritingIdentityProfilesMap(storedProfiles),
    ...toWritingIdentityProfilesMap(inputProfiles),
  };
  if (!Object.keys(merged).length) return null;
  return { profilesByMailbox: merged };
}

function toMailboxAddress(value = '') {
  const mailbox = normalizeMailboxAddress(value);
  return isValidEmail(mailbox) ? mailbox : '';
}

function parseMailboxList(raw = null) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => toMailboxAddress(item))
    .filter(Boolean);
}

function parseMailboxIndexes(rawValue = '', maxItems = 200) {
  const tokens = String(rawValue || '')
    .split(/[,\s]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
  const seen = new Set();
  const indexes = [];
  for (const token of tokens) {
    const parsed = Number.parseInt(token, 10);
    if (!Number.isFinite(parsed)) continue;
    if (parsed < 1 || parsed > maxItems) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    indexes.push(parsed);
  }
  return indexes;
}

function parseMailboxIds(rawValue = '', maxItems = 200) {
  const tokens = String(rawValue || '')
    .split(/[,\s]+/)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
  const seen = new Set();
  const mailboxIds = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    if (mailboxIds.length >= maxItems) break;
    seen.add(token);
    mailboxIds.push(token);
  }
  return mailboxIds;
}

function mergeUniqueMailboxIds(...collections) {
  const merged = [];
  const seen = new Set();
  for (const collection of collections) {
    const source = Array.isArray(collection) ? collection : [];
    for (const rawValue of source) {
      const value = normalizeText(rawValue).toLowerCase();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      merged.push(value);
    }
  }
  return merged;
}

function toGraphReadOptionsFromEnv() {
  const allowlistMailboxIds = parseMailboxIds(process.env.ARCANA_MAILBOX_ALLOWLIST, 500);
  const allowlistMode = allowlistMailboxIds.length > 0;
  const fullTenant = allowlistMode
    ? true
    : toBoolean(process.env.ARCANA_GRAPH_FULL_TENANT, false);
  const userScope = allowlistMode
    ? 'all'
    : normalizeGraphUserScope(
        process.env.ARCANA_GRAPH_USER_SCOPE,
        fullTenant ? 'all' : 'single'
      );
  const configuredMailboxIds = parseMailboxIds(process.env.ARCANA_GRAPH_MAILBOX_IDS);
  const mailboxIds = mergeUniqueMailboxIds(allowlistMailboxIds, configuredMailboxIds);
  const defaultMailboxIndexes =
    allowlistMode ? '' : (fullTenant && userScope === 'all' ? '1,2,3,5,8' : '');
  const maxMessages = clampInteger(process.env.ARCANA_GRAPH_MAX_MESSAGES, 1, 200, 100);
  const maxMessagesPerUser = clampInteger(
    process.env.ARCANA_GRAPH_MAX_MESSAGES_PER_USER,
    1,
    200,
    50
  );
  const splitWindow = Math.max(1, Math.floor(maxMessages / 2));
  const splitWindowPerUser = Math.max(1, Math.floor(maxMessagesPerUser / 2));
  return {
    days: clampInteger(process.env.ARCANA_GRAPH_WINDOW_DAYS, 1, 30, 14),
    maxMessages,
    maxInboxMessages: clampInteger(
      process.env.ARCANA_GRAPH_MAX_INBOX_MESSAGES,
      1,
      200,
      Math.max(1, maxMessages - splitWindow)
    ),
    maxSentMessages: clampInteger(
      process.env.ARCANA_GRAPH_MAX_SENT_MESSAGES,
      1,
      200,
      splitWindow
    ),
    includeRead: toBoolean(process.env.ARCANA_GRAPH_INCLUDE_READ, false),
    fullTenant,
    allowlistMode,
    allowlistMailboxIds,
    userScope,
    maxUsers: clampInteger(process.env.ARCANA_GRAPH_MAX_USERS, 1, 200, 50),
    maxMessagesPerUser,
    maxInboxMessagesPerUser: clampInteger(
      process.env.ARCANA_GRAPH_MAX_INBOX_MESSAGES_PER_USER,
      1,
      200,
      Math.max(1, maxMessagesPerUser - splitWindowPerUser)
    ),
    maxSentMessagesPerUser: clampInteger(
      process.env.ARCANA_GRAPH_MAX_SENT_MESSAGES_PER_USER,
      1,
      200,
      splitWindowPerUser
    ),
    mailboxTimeoutMs: clampInteger(
      process.env.ARCANA_GRAPH_MAILBOX_TIMEOUT_MS,
      1000,
      15000,
      5000
    ),
    runTimeoutMs: clampInteger(
      process.env.ARCANA_GRAPH_RUN_TIMEOUT_MS,
      5000,
      120000,
      30000
    ),
    maxMailboxErrors: clampInteger(
      process.env.ARCANA_GRAPH_MAX_MAILBOX_ERRORS,
      1,
      20,
      5
    ),
    requestMaxRetries: clampInteger(
      process.env.ARCANA_GRAPH_REQUEST_MAX_RETRIES,
      0,
      6,
      2
    ),
    retryBaseDelayMs: clampInteger(
      process.env.ARCANA_GRAPH_RETRY_BASE_DELAY_MS,
      100,
      10000,
      500
    ),
    retryMaxDelayMs: clampInteger(
      process.env.ARCANA_GRAPH_RETRY_MAX_DELAY_MS,
      200,
      30000,
      5000
    ),
    maxPagesPerCollection: clampInteger(
      process.env.ARCANA_GRAPH_PAGINATION_MAX_PAGES,
      1,
      2000,
      200
    ),
    mailboxIndexes: allowlistMode
      ? []
      : parseMailboxIndexes(process.env.ARCANA_GRAPH_MAILBOX_INDEXES || defaultMailboxIndexes),
    mailboxIds,
  };
}

function toSnapshotMessageCount(snapshot = {}) {
  const conversations = asArray(snapshot.conversations);
  return conversations.reduce((sum, conversation) => {
    const count = asArray(conversation?.messages).length;
    return sum + count;
  }, 0);
}

async function writeMailboxReadAuditEvent({
  authStore,
  tenantId,
  actorUserId = null,
  action,
  outcome = 'success',
  mailboxReadId,
  correlationId = null,
  metadata = {},
}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  await authStore.addAuditEvent({
    tenantId,
    actorUserId,
    action,
    outcome,
    targetType: 'mailbox_read',
    targetId: normalizeText(mailboxReadId) || crypto.randomUUID(),
    metadata: {
      mailboxReadId: normalizeText(mailboxReadId) || null,
      correlationId: normalizeText(correlationId) || null,
      ...(metadata || {}),
    },
  });
}

async function hydrateAnalyzeInboxInput({
  tenantId,
  input = {},
  systemStateSnapshot = {},
  graphReadConnector = null,
  capabilityAnalysisStore = null,
  authStore = null,
  actorUserId = null,
  correlationId = null,
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);
  const normalizedInput = {};

  if (typeof safeInput.includeClosed === 'boolean') {
    normalizedInput.includeClosed = safeInput.includeClosed;
  }
  if (Number.isFinite(Number(safeInput.maxDrafts))) {
    normalizedInput.maxDrafts = clampInteger(safeInput.maxDrafts, 1, 5, 5);
  }
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }

  const storedWritingProfiles = capabilityAnalysisStore
    ? await listWritingIdentityProfiles({
        analysisStore: capabilityAnalysisStore,
        tenantId,
        limit: 500,
      })
    : [];
  const storedWritingProfilesMap = {};
  for (const record of asArray(storedWritingProfiles)) {
    const mailbox = toMailboxAddress(record?.mailbox);
    if (!mailbox) continue;
    storedWritingProfilesMap[mailbox] = toWritingProfile(record?.profile || {});
  }
  const mergedWritingProfiles = mergeWritingIdentityProfiles({
    storedProfiles: { profilesByMailbox: storedWritingProfilesMap },
    inputProfiles: safeInput.writingIdentityProfiles,
  });
  if (mergedWritingProfiles) {
    normalizedInput.writingIdentityProfiles = mergedWritingProfiles;
  }

  if (Array.isArray(safeSnapshot.conversations)) {
    return {
      input: normalizedInput,
      systemStateSnapshot: safeSnapshot,
    };
  }

  if (!graphReadConnector || typeof graphReadConnector.fetchInboxSnapshot !== 'function') {
    return {
      input: normalizedInput,
      systemStateSnapshot: safeSnapshot,
    };
  }

  const mailboxReadId = crypto.randomUUID();
  const mailboxSentReadId = crypto.randomUUID();
  const graphReadOptions = toGraphReadOptionsFromEnv();
  const capturedAt = new Date().toISOString();

  await writeMailboxReadAuditEvent({
    authStore,
    tenantId,
    actorUserId,
    action: 'mailbox.read.start',
    outcome: 'success',
    mailboxReadId,
    correlationId,
    metadata: {
      source: 'microsoft_graph',
      capabilityName: 'AnalyzeInbox',
      windowDays: graphReadOptions.days,
      maxMessages: graphReadOptions.maxMessages,
      maxInboxMessages: graphReadOptions.maxInboxMessages,
      maxSentMessages: graphReadOptions.maxSentMessages,
      includeRead: graphReadOptions.includeRead,
      fullTenant: graphReadOptions.fullTenant,
      allowlistMode: graphReadOptions.allowlistMode === true,
      allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
      userScope: graphReadOptions.userScope,
      maxUsers: graphReadOptions.maxUsers,
      maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
      maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
      maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
      mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
      runTimeoutMs: graphReadOptions.runTimeoutMs,
      maxMailboxErrors: graphReadOptions.maxMailboxErrors,
      requestMaxRetries: graphReadOptions.requestMaxRetries,
      retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
      retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
      maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
      mailboxIndexes: graphReadOptions.mailboxIndexes,
      mailboxIds: graphReadOptions.mailboxIds,
      capturedAt,
    },
  });

  await writeMailboxReadAuditEvent({
    authStore,
    tenantId,
    actorUserId,
    action: 'mailbox.sent.read.start',
    outcome: 'success',
    mailboxReadId: mailboxSentReadId,
    correlationId,
    metadata: {
      source: 'microsoft_graph',
      capabilityName: 'AnalyzeInbox',
      windowDays: graphReadOptions.days,
      maxSentMessages: graphReadOptions.maxSentMessages,
      maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
      fullTenant: graphReadOptions.fullTenant,
      allowlistMode: graphReadOptions.allowlistMode === true,
      allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
      userScope: graphReadOptions.userScope,
      maxUsers: graphReadOptions.maxUsers,
      mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
      runTimeoutMs: graphReadOptions.runTimeoutMs,
      requestMaxRetries: graphReadOptions.requestMaxRetries,
      retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
      retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
      maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
      mailboxIndexes: graphReadOptions.mailboxIndexes,
      mailboxIds: graphReadOptions.mailboxIds,
      capturedAt,
    },
  });

  try {
    const graphSnapshot = asObject(
      await graphReadConnector.fetchInboxSnapshot(graphReadOptions)
    );
    const graphTimestamps = asObject(graphSnapshot.timestamps);
    const mergedSnapshot = {
      ...safeSnapshot,
      ...graphSnapshot,
      conversations: asArray(graphSnapshot.conversations),
      timestamps: {
        capturedAt: normalizeText(graphTimestamps.capturedAt) || capturedAt,
        sourceGeneratedAt: normalizeText(graphTimestamps.sourceGeneratedAt) || null,
      },
      snapshotVersion:
        normalizeText(graphSnapshot.snapshotVersion) ||
        normalizeText(safeSnapshot.snapshotVersion) ||
        'graph.inbox.snapshot.v1',
    };

    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.read.complete',
      outcome: 'success',
      mailboxReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxMessages: graphReadOptions.maxMessages,
        maxInboxMessages: graphReadOptions.maxInboxMessages,
        maxSentMessages: graphReadOptions.maxSentMessages,
        includeRead: graphReadOptions.includeRead,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
        maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
        runTimeoutMs: graphReadOptions.runTimeoutMs,
        maxMailboxErrors: graphReadOptions.maxMailboxErrors,
        requestMaxRetries: graphReadOptions.requestMaxRetries,
        retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
        retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
        maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        mailboxCount: toNumber(graphSnapshot?.metadata?.mailboxCount, 0),
        mailboxErrors: toNumber(graphSnapshot?.metadata?.mailboxErrors, 0),
        conversationCount: asArray(mergedSnapshot.conversations).length,
        messageCount: toSnapshotMessageCount(mergedSnapshot),
        inboundMessageCount: toNumber(graphSnapshot?.metadata?.inboundMessageCount, 0),
        outboundMessageCount: toNumber(graphSnapshot?.metadata?.outboundMessageCount, 0),
        snapshotVersion: normalizeText(mergedSnapshot.snapshotVersion) || null,
        capturedAt: normalizeText(mergedSnapshot.timestamps?.capturedAt) || capturedAt,
      },
    });

    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.sent.read.complete',
      outcome: 'success',
      mailboxReadId: mailboxSentReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxSentMessages: graphReadOptions.maxSentMessages,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        mailboxCount: toNumber(graphSnapshot?.metadata?.mailboxCount, 0),
        outboundMessageCount: toNumber(graphSnapshot?.metadata?.outboundMessageCount, 0),
        snapshotVersion: normalizeText(mergedSnapshot.snapshotVersion) || null,
        capturedAt: normalizeText(mergedSnapshot.timestamps?.capturedAt) || capturedAt,
      },
    });

    if (authStore && typeof authStore.addAuditEvent === 'function') {
      const answeredConversations = asArray(mergedSnapshot.conversations).filter((conversation) => {
        const inboundAt = toIso(conversation?.lastInboundAt);
        const outboundAt = toIso(conversation?.lastOutboundAt);
        if (!inboundAt || !outboundAt) return false;
        return Date.parse(outboundAt) >= Date.parse(inboundAt);
      });
      for (const conversation of answeredConversations.slice(0, 200)) {
        await authStore.addAuditEvent({
          tenantId,
          actorUserId,
          action: 'cco.conversation.answered.detected',
          outcome: 'success',
          targetType: 'cco_conversation',
          targetId:
            normalizeText(conversation?.conversationId) ||
            normalizeText(conversation?.customerEmail) ||
            crypto.randomUUID(),
          metadata: {
            correlationId: normalizeText(correlationId) || null,
            conversationId: normalizeText(conversation?.conversationId) || null,
            customerId:
              normalizeText(conversation?.customerId) ||
              normalizeText(conversation?.customerEmail) ||
              null,
            customerEmail: normalizeText(conversation?.customerEmail) || null,
            lastInboundAt: toIso(conversation?.lastInboundAt) || null,
            lastOutboundAt: toIso(conversation?.lastOutboundAt) || null,
          },
        });
      }
    }

    return {
      input: normalizedInput,
      systemStateSnapshot: mergedSnapshot,
    };
  } catch (error) {
    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.read.error',
      outcome: 'error',
      mailboxReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxMessages: graphReadOptions.maxMessages,
        maxInboxMessages: graphReadOptions.maxInboxMessages,
        maxSentMessages: graphReadOptions.maxSentMessages,
        includeRead: graphReadOptions.includeRead,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        maxMessagesPerUser: graphReadOptions.maxMessagesPerUser,
        maxInboxMessagesPerUser: graphReadOptions.maxInboxMessagesPerUser,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        mailboxTimeoutMs: graphReadOptions.mailboxTimeoutMs,
        runTimeoutMs: graphReadOptions.runTimeoutMs,
        maxMailboxErrors: graphReadOptions.maxMailboxErrors,
        requestMaxRetries: graphReadOptions.requestMaxRetries,
        retryBaseDelayMs: graphReadOptions.retryBaseDelayMs,
        retryMaxDelayMs: graphReadOptions.retryMaxDelayMs,
        maxPagesPerCollection: graphReadOptions.maxPagesPerCollection,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        errorMessage: normalizeText(error?.message) || 'graph_read_failed',
      },
    });
    await writeMailboxReadAuditEvent({
      authStore,
      tenantId,
      actorUserId,
      action: 'mailbox.sent.read.error',
      outcome: 'error',
      mailboxReadId: mailboxSentReadId,
      correlationId,
      metadata: {
        source: 'microsoft_graph',
        capabilityName: 'AnalyzeInbox',
        windowDays: graphReadOptions.days,
        maxSentMessages: graphReadOptions.maxSentMessages,
        maxSentMessagesPerUser: graphReadOptions.maxSentMessagesPerUser,
        fullTenant: graphReadOptions.fullTenant,
        allowlistMode: graphReadOptions.allowlistMode === true,
        allowlistMailboxIds: graphReadOptions.allowlistMailboxIds,
        userScope: graphReadOptions.userScope,
        maxUsers: graphReadOptions.maxUsers,
        mailboxIndexes: graphReadOptions.mailboxIndexes,
        mailboxIds: graphReadOptions.mailboxIds,
        errorMessage: normalizeText(error?.message) || 'graph_sent_read_failed',
      },
    });
    const wrappedError = new Error(
      `AnalyzeInbox Graph read failed: ${
        normalizeText(error?.message) || 'mailbox_source_unavailable'
      }.`
    );
    wrappedError.code = 'CAPABILITY_INBOX_SOURCE_UNAVAILABLE';
    throw wrappedError;
  }
}

async function hydrateGenerateTaskPlanInput({
  tenantId,
  templateStore,
  input = {},
  systemStateSnapshot = {},
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);

  const inputSnapshotOverride = {
    openReviews: Array.isArray(safeInput.openReviews) ? safeInput.openReviews : null,
    incidents: Array.isArray(safeInput.incidents) ? safeInput.incidents : null,
    latestTemplateChanges: Array.isArray(safeInput.latestTemplateChanges)
      ? safeInput.latestTemplateChanges
      : null,
    kpi: asObject(safeInput.kpi),
  };
  const explicitSnapshotOverride = {
    openReviews: Array.isArray(safeSnapshot.openReviews) ? safeSnapshot.openReviews : null,
    incidents: Array.isArray(safeSnapshot.incidents) ? safeSnapshot.incidents : null,
    latestTemplateChanges: Array.isArray(safeSnapshot.latestTemplateChanges)
      ? safeSnapshot.latestTemplateChanges
      : null,
    kpi: asObject(safeSnapshot.kpi),
  };

  const normalizedInput = {};
  if (Number.isFinite(Number(safeInput.maxTasks))) {
    normalizedInput.maxTasks = Number(safeInput.maxTasks);
  }
  if (typeof safeInput.includeEvidence === 'boolean') {
    normalizedInput.includeEvidence = safeInput.includeEvidence;
  }
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }

  if (!templateStore) {
    return {
      input: normalizedInput,
      systemStateSnapshot: {
        openReviews:
          explicitSnapshotOverride.openReviews || inputSnapshotOverride.openReviews || [],
        incidents:
          explicitSnapshotOverride.incidents || inputSnapshotOverride.incidents || [],
        kpi: Object.keys(explicitSnapshotOverride.kpi).length
          ? explicitSnapshotOverride.kpi
          : inputSnapshotOverride.kpi,
        latestTemplateChanges:
          explicitSnapshotOverride.latestTemplateChanges ||
          inputSnapshotOverride.latestTemplateChanges ||
          [],
      },
    };
  }

  const [
    defaultOpenReviews,
    defaultIncidents,
    riskSummary,
    incidentSummary,
    latestTemplates,
    activeSnapshots,
  ] = await Promise.all([
    typeof templateStore.listEvaluations === 'function'
      ? templateStore.listEvaluations({
          tenantId,
          state: 'open',
          limit: 80,
        })
      : [],
    typeof templateStore.listIncidents === 'function'
      ? templateStore.listIncidents({
          tenantId,
          status: 'open',
          limit: 80,
        })
      : [],
    typeof templateStore.summarizeRisk === 'function'
      ? templateStore.summarizeRisk({
          tenantId,
          minRiskLevel: 1,
        })
      : null,
    typeof templateStore.summarizeIncidents === 'function'
      ? templateStore.summarizeIncidents({
          tenantId,
        })
      : null,
    typeof templateStore.listTemplates === 'function'
      ? templateStore.listTemplates({
          tenantId,
        })
      : [],
    typeof templateStore.listActiveVersionSnapshots === 'function'
      ? templateStore.listActiveVersionSnapshots({
          tenantId,
        })
      : [],
  ]);

  const kpiDefault = {
    triggeredNoGoCount: Number(inputSnapshotOverride?.kpi?.triggeredNoGoCount || 0),
    sloBreaches: Number(inputSnapshotOverride?.kpi?.sloBreaches || 0),
    openUnresolvedIncidents: Number(incidentSummary?.totals?.openUnresolved || 0),
    highCriticalOpenReviews: Number(riskSummary?.totals?.highCriticalOpen || 0),
    readinessScore: Number(inputSnapshotOverride?.kpi?.readinessScore || 0),
    templatesTotal: Number(Array.isArray(latestTemplates) ? latestTemplates.length : 0),
    activeTemplates: Number(Array.isArray(activeSnapshots) ? activeSnapshots.length : 0),
  };

  return {
    input: normalizedInput,
    systemStateSnapshot: {
      openReviews:
      explicitSnapshotOverride.openReviews ||
      inputSnapshotOverride.openReviews ||
      (Array.isArray(defaultOpenReviews) ? defaultOpenReviews : []).map(toOpenReviewSnapshot),
      incidents:
      explicitSnapshotOverride.incidents ||
      inputSnapshotOverride.incidents ||
      (Array.isArray(defaultIncidents) ? defaultIncidents : []).map(toIncidentSnapshot),
      kpi:
      Object.keys(explicitSnapshotOverride.kpi).length > 0
        ? explicitSnapshotOverride.kpi
        : (Object.keys(inputSnapshotOverride.kpi).length > 0
          ? inputSnapshotOverride.kpi
          : kpiDefault),
      latestTemplateChanges:
      explicitSnapshotOverride.latestTemplateChanges ||
      inputSnapshotOverride.latestTemplateChanges ||
      (Array.isArray(latestTemplates) ? latestTemplates : [])
        .slice(0, 25)
        .map(toTemplateChangeSnapshot),
    },
  };
}

async function hydrateSummarizeIncidentsInput({
  tenantId,
  templateStore,
  input = {},
  systemStateSnapshot = {},
}) {
  const safeInput = asObject(input);
  const safeSnapshot = asObject(systemStateSnapshot);
  const normalizedInput = {
    includeClosed: safeInput.includeClosed === true,
    timeframeDays: Math.max(1, Math.min(90, toNumber(safeInput.timeframeDays, 14))),
  };
  if (safeInput.debug === true) {
    normalizedInput.debug = true;
  }

  const snapshotIncidents = Array.isArray(safeSnapshot.incidents)
    ? safeSnapshot.incidents
    : null;
  const snapshotSlaStatus =
    safeSnapshot.slaStatus && typeof safeSnapshot.slaStatus === 'object'
      ? safeSnapshot.slaStatus
      : null;
  const snapshotTimestamps =
    safeSnapshot.timestamps && typeof safeSnapshot.timestamps === 'object'
      ? safeSnapshot.timestamps
      : null;

  if (!templateStore || typeof templateStore.listIncidents !== 'function') {
    return {
      input: normalizedInput,
      systemStateSnapshot: {
        incidents: snapshotIncidents || [],
        slaStatus: snapshotSlaStatus || {},
        timestamps: {
          capturedAt: new Date().toISOString(),
          ...(snapshotTimestamps || {}),
        },
      },
    };
  }

  const [defaultIncidents, incidentSummary] = await Promise.all([
    templateStore.listIncidents({
      tenantId,
      status: normalizedInput.includeClosed ? 'all' : 'open',
      limit: 300,
      sinceDays: normalizedInput.timeframeDays,
    }),
    typeof templateStore.summarizeIncidents === 'function'
      ? templateStore.summarizeIncidents({ tenantId })
      : null,
  ]);

  return {
    input: normalizedInput,
    systemStateSnapshot: {
      incidents:
        snapshotIncidents ||
        (Array.isArray(defaultIncidents) ? defaultIncidents : []).map(toIncidentSnapshot),
      slaStatus:
        snapshotSlaStatus ||
        (incidentSummary?.bySlaState && typeof incidentSummary.bySlaState === 'object'
          ? incidentSummary.bySlaState
          : {}),
      timestamps: {
        capturedAt: new Date().toISOString(),
        sourceGeneratedAt: normalizeText(incidentSummary?.generatedAt) || null,
        ...(snapshotTimestamps || {}),
      },
    },
  };
}

async function maybeHydrateCapabilityPayload({
  capabilityName,
  tenantId,
  templateStore,
  input,
  systemStateSnapshot,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
  actorUserId = null,
  correlationId = null,
}) {
  const normalizedName = normalizeText(capabilityName).toLowerCase();
  if (normalizedName === 'generatetaskplan') {
    return hydrateGenerateTaskPlanInput({
      tenantId,
      templateStore,
      input,
      systemStateSnapshot,
    });
  }
  if (normalizedName === 'summarizeincidents') {
    return hydrateSummarizeIncidentsInput({
      tenantId,
      templateStore,
      input,
      systemStateSnapshot,
    });
  }
  if (normalizedName === 'analyzeinbox') {
    return hydrateAnalyzeInboxInput({
      tenantId,
      input,
      systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      authStore,
      actorUserId,
      correlationId,
    });
  }
  return {
    input: asObject(input),
    systemStateSnapshot: asObject(systemStateSnapshot),
  };
}

async function maybeHydrateAgentPayload({
  agentName,
  tenantId,
  templateStore,
  input,
  systemStateSnapshot,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
  actorUserId,
  correlationId,
}) {
  const safeInput = asObject(input);
  const normalizedAgentName = normalizeText(agentName).toLowerCase();
  if (normalizedAgentName === 'coo') {
    const [incidentPayload, taskPlanPayload] = await Promise.all([
      hydrateSummarizeIncidentsInput({
        tenantId,
        templateStore,
        input,
        systemStateSnapshot,
      }),
      hydrateGenerateTaskPlanInput({
        tenantId,
        templateStore,
        input,
        systemStateSnapshot,
      }),
    ]);

    const incidentInput = asObject(incidentPayload.input);
    const taskPlanInput = asObject(taskPlanPayload.input);
    const incidentSnapshot = asObject(incidentPayload.systemStateSnapshot);
    const taskPlanSnapshot = asObject(taskPlanPayload.systemStateSnapshot);
    const incidents = Array.isArray(incidentSnapshot.incidents) ? incidentSnapshot.incidents : [];
    const openReviews = Array.isArray(taskPlanSnapshot.openReviews) ? taskPlanSnapshot.openReviews : [];
    const latestTemplateChanges = Array.isArray(taskPlanSnapshot.latestTemplateChanges)
      ? taskPlanSnapshot.latestTemplateChanges
      : [];
    const baseSnapshotVersion =
      normalizeText(incidentSnapshot.snapshotVersion) ||
      normalizeText(taskPlanSnapshot.snapshotVersion) ||
      'coo.snapshot.v1';
    const baseTimestamps =
      incidentSnapshot.timestamps && typeof incidentSnapshot.timestamps === 'object'
        ? incidentSnapshot.timestamps
        : { capturedAt: new Date().toISOString() };
    const timestamps = {
      ...baseTimestamps,
      capturedAt: normalizeText(baseTimestamps.capturedAt) || new Date().toISOString(),
      sourceGeneratedAt: normalizeText(baseTimestamps.sourceGeneratedAt) || null,
      version: normalizeText(baseTimestamps.version) || baseSnapshotVersion,
    };
    const effectiveTimeframeDays = Math.max(1, Math.min(90, toNumber(incidentInput.timeframeDays, 14)));
    const incidentTrend7d = toIncidentWindowCounts(incidents, 7);
    const incidentTrend14d = toIncidentWindowCounts(incidents, Math.max(14, effectiveTimeframeDays));
    const riskTrend7d = toReviewWindowCounts(openReviews, 7);
    const riskTrend14d = toReviewWindowCounts(openReviews, Math.max(14, effectiveTimeframeDays));
    const incidentAgeBuckets = toIncidentAgeBuckets(incidents);
    const templateHistory = toTemplateHistorySummary(latestTemplateChanges);

    const normalizedAgentInput = {
      includeClosed: incidentInput.includeClosed === true,
      timeframeDays: effectiveTimeframeDays,
      maxTasks: Math.max(1, Math.min(5, toNumber(taskPlanInput.maxTasks, 5))),
      includeEvidence: taskPlanInput.includeEvidence !== false,
    };
    if (safeInput.debug === true || incidentInput.debug === true || taskPlanInput.debug === true) {
      normalizedAgentInput.debug = true;
    }

    return {
      input: normalizedAgentInput,
      systemStateSnapshot: {
        incidents,
        slaStatus:
          incidentSnapshot.slaStatus && typeof incidentSnapshot.slaStatus === 'object'
            ? incidentSnapshot.slaStatus
            : {},
        timestamps,
        openReviews,
        latestTemplateChanges,
        kpi: taskPlanSnapshot.kpi && typeof taskPlanSnapshot.kpi === 'object'
          ? taskPlanSnapshot.kpi
          : {},
        incidentTrend7d,
        incidentTrend14d,
        riskTrend7d,
        riskTrend14d,
        incidentAgeBuckets,
        templateHistory,
        snapshotVersion: baseSnapshotVersion,
      },
    };
  }

  if (normalizedAgentName === 'cco') {
    return hydrateAnalyzeInboxInput({
      tenantId,
      input,
      systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      authStore,
      actorUserId,
      correlationId,
    });
  }

  return {
    input: asObject(input),
    systemStateSnapshot: asObject(systemStateSnapshot),
  };
}

function toRequestMetadata(req) {
  return {
    path: req.path,
    method: req.method,
  };
}

function toChannel(req) {
  return normalizeText(req.body?.channel || 'admin') || 'admin';
}

function toCorrelationId(req) {
  return normalizeText(req.correlationId) || normalizeText(req.get('x-correlation-id')) || null;
}

function toIdempotencyKey(req) {
  return (
    normalizeText(req.get('x-idempotency-key')) ||
    normalizeText(req.body?.idempotencyKey) ||
    null
  );
}

function isDebugRequested(req) {
  if (req?.body?.debug === true) return true;
  if (req?.body?.input?.debug === true) return true;
  return toBoolean(req?.query?.debug, false);
}

function toActor(req) {
  return {
    id: req.auth.userId,
    role: req.auth.role,
  };
}

function toTenantId(req) {
  return req.auth.tenantId;
}

function toGatewayBlockedResponse(gatewayResult = {}) {
  return (
    gatewayResult.safe_response || {
      error:
        'Capability-resultatet blockerades av risk/policy. Granska körningen i riskpanelen.',
    }
  );
}

function toSuccessPayload(result = {}) {
  const gatewayResult = result.gatewayResult || {};
  return gatewayResult.response_payload || {};
}

function toErrorPayload(error) {
  return {
    error: error?.message || 'Kunde inte exekvera capability.',
    code: error?.code || 'CAPABILITY_RUN_FAILED',
    details: error?.details || null,
  };
}

function isBlockedDecision(gatewayResult = {}) {
  return (
    gatewayResult.decision === 'blocked' || gatewayResult.decision === 'critical_escalate'
  );
}

function isRoleAllowed(req) {
  return Boolean(req?.auth?.role);
}

function ensureRoleContext(req, res) {
  if (isRoleAllowed(req)) return true;
  res.status(401).json({ error: 'Ingen auth context.' });
  return false;
}

function toCapabilityName(req) {
  return normalizeText(req.params?.capabilityName);
}

function validateCapabilityName(capabilityName, res) {
  if (capabilityName) return true;
  res.status(400).json({ error: 'capabilityName krävs.' });
  return false;
}

function toAgentName(req) {
  return normalizeText(req.params?.agentName);
}

function validateAgentName(agentName, res) {
  if (agentName) return true;
  res.status(400).json({ error: 'agentName kravs.' });
  return false;
}

function toMetaPayload(executor) {
  return {
    capabilities: executor.listCapabilities(),
    agentBundles: executor.listAgentBundles(),
  };
}

function toAnalysisQuery(req) {
  return {
    capabilityName: normalizeText(req.query?.capability),
    agentName: normalizeText(req.query?.agent),
    limit: Math.max(1, Math.min(500, Number(req.query?.limit || 50) || 50)),
  };
}

const AGENT_ANALYSIS_CAPABILITY_MAP = Object.freeze({
  COO: 'COO.DailyBrief',
  CCO: 'CCO.InboxAnalysis',
});

function resolveAnalysisCapabilityName(query = {}) {
  const capabilityName = normalizeText(query?.capabilityName);
  if (capabilityName) return capabilityName;
  const agentName = normalizeText(query?.agentName).toUpperCase();
  if (!agentName) return '';
  if (AGENT_ANALYSIS_CAPABILITY_MAP[agentName]) {
    return AGENT_ANALYSIS_CAPABILITY_MAP[agentName];
  }
  return `${agentName}.DailyBrief`;
}

function toAnalysisPayload(entries = [], capabilityName = '', agentName = '') {
  return {
    entries,
    count: entries.length,
    capability: capabilityName || null,
    agent: agentName || null,
  };
}

function toAnalysisUnavailable(res) {
  return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
}

function toAnalysisError(res) {
  return res.status(500).json({ error: 'Kunde inte läsa capability analysis.' });
}

function toCcoSprintEventType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'start' || normalized === 'cco.sprint.start') return 'start';
  if (
    normalized === 'item_completed' ||
    normalized === 'item-completed' ||
    normalized === 'itemcompleted' ||
    normalized === 'cco.sprint.item_completed'
  ) {
    return 'item_completed';
  }
  if (normalized === 'complete' || normalized === 'cco.sprint.complete') return 'complete';
  return '';
}

function toCcoUsageEventType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'workspace_open' || normalized === 'cco.workspace.open') {
    return 'workspace_open';
  }
  if (normalized === 'draft_mode_selected' || normalized === 'cco.draft.mode_selected') {
    return 'draft_mode_selected';
  }
  if (normalized === 'focus_mode_toggled' || normalized === 'cco.focus.toggled') {
    return 'focus_mode_toggled';
  }
  return '';
}

function toSinceWindow(rawValue) {
  const fallback = { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 };
  const normalized = normalizeText(rawValue).toLowerCase();
  if (!normalized) {
    const startAtMs = Date.now() - fallback.ms;
    return {
      since: fallback.label,
      durationMs: fallback.ms,
      startAtMs,
      startAt: new Date(startAtMs).toISOString(),
    };
  }

  const match = normalized.match(/^(\d+)\s*([dh])$/);
  if (!match) {
    const startAtMs = Date.now() - fallback.ms;
    return {
      since: fallback.label,
      durationMs: fallback.ms,
      startAtMs,
      startAt: new Date(startAtMs).toISOString(),
    };
  }

  const amount = clampInteger(match[1], 1, match[2] === 'd' ? 90 : 24 * 30, 7);
  const unit = match[2] === 'h' ? 'h' : 'd';
  const durationMs = unit === 'h'
    ? amount * 60 * 60 * 1000
    : amount * 24 * 60 * 60 * 1000;
  const startAtMs = Date.now() - durationMs;
  return {
    since: `${amount}${unit}`,
    durationMs,
    startAtMs,
    startAt: new Date(startAtMs).toISOString(),
  };
}

function toEventTimestampMs(event = {}) {
  const iso = toIso(event?.ts || event?.metadata?.timestamp);
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function toAverage(numbers = [], precision = 2) {
  const list = (Array.isArray(numbers) ? numbers : [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!list.length) return 0;
  const sum = list.reduce((acc, value) => acc + value, 0);
  return Number((sum / list.length).toFixed(precision));
}

function toSprintSlaAgeHours(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStressLevel(score = 0) {
  const safeScore = Number.isFinite(Number(score)) ? Number(score) : 0;
  if (safeScore <= 3) return 'Low';
  if (safeScore <= 7) return 'Medium';
  return 'High';
}

function toPriorityLevel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function toNeedsReplyStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === 'handled' ? 'handled' : 'needs_reply';
}

function toSlaAgeHours(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return 0;
}

function buildLatestCcoSprintFeedback({ startEvents = [], completeEvents = [] } = {}) {
  const latestComplete = (Array.isArray(completeEvents) ? completeEvents : [])
    .slice()
    .sort((left, right) => String(right?.ts || '').localeCompare(String(left?.ts || '')))[0] || null;
  if (!latestComplete) return null;

  const completeMeta = asObject(latestComplete.metadata);
  const sprintId = normalizeText(completeMeta.sprintId || latestComplete.targetId);
  const startBySprintId = new Map();
  for (const event of Array.isArray(startEvents) ? startEvents : []) {
    const eventMeta = asObject(event?.metadata);
    const eventSprintId = normalizeText(eventMeta.sprintId || event?.targetId);
    if (!eventSprintId) continue;
    if (!startBySprintId.has(eventSprintId)) {
      startBySprintId.set(eventSprintId, eventMeta);
    }
  }
  const startMeta = asObject(startBySprintId.get(sprintId));
  const startCritical = Math.max(0, toNumber(startMeta.criticalCount, 0));
  const startHigh = Math.max(0, toNumber(startMeta.highCount, 0));
  const remainingCritical = Math.max(0, toNumber(completeMeta.remainingCritical, 0));
  const remainingHigh = Math.max(0, toNumber(completeMeta.remainingHigh, 0));
  const resolvedCritical = Math.max(0, startCritical - remainingCritical);
  const initialSlaLoad = startCritical + startHigh;
  const remainingSlaLoad = remainingCritical + remainingHigh;

  return {
    sprintId: sprintId || null,
    itemsCompleted: Math.max(0, toNumber(completeMeta.itemsCompleted, 0)),
    resolvedCritical,
    remainingCritical,
    remainingHigh,
    slaImproved: initialSlaLoad > 0 ? remainingSlaLoad < initialSlaLoad : false,
    completedAt: normalizeText(latestComplete.ts) || normalizeText(completeMeta.timestamp) || null,
  };
}

async function runCcoSprintEventHandler({ req, res, authStore }) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit writer.' });
  }

  const rawPayload = asObject(req.body);
  const input = asObject(
    rawPayload.input && typeof rawPayload.input === 'object'
      ? rawPayload.input
      : rawPayload
  );
  const eventType = toCcoSprintEventType(input.eventType || input.type || input.action);
  if (!eventType) {
    return res.status(422).json({ error: 'eventType måste vara start, item_completed eller complete.' });
  }

  const sprintId = normalizeText(input.sprintId);
  if (!sprintId) {
    return res.status(422).json({ error: 'sprintId krävs.' });
  }

  const actor = toActor(req);
  const tenantId = toTenantId(req);
  const correlationId = toCorrelationId(req);
  const nowIso = new Date().toISOString();
  const timestamp = toIso(input.timestamp) || nowIso;

  let action = '';
  let targetType = 'cco_sprint';
  let targetId = sprintId;
  let metadata = {
    sprintId,
    timestamp,
    correlationId,
  };

  if (eventType === 'start') {
    action = 'cco.sprint.start';
    metadata = {
      ...metadata,
      queueSize: Math.max(0, clampInteger(input.queueSize, 0, 100, 0)),
      criticalCount: Math.max(0, clampInteger(input.criticalCount, 0, 100, 0)),
      highCount: Math.max(0, clampInteger(input.highCount, 0, 100, 0)),
    };
  } else if (eventType === 'item_completed') {
    const conversationId = normalizeText(input.conversationId);
    if (!conversationId) {
      return res.status(422).json({ error: 'conversationId krävs för item_completed.' });
    }
    action = 'cco.sprint.item_completed';
    targetType = 'cco_conversation';
    targetId = conversationId;
    metadata = {
      ...metadata,
      conversationId,
      priorityLevel: toPriorityLevel(input.priorityLevel),
      slaAge: normalizeText(input.slaAge),
      slaAgeHours: Number.isFinite(Number(input.slaAgeHours))
        ? Number(input.slaAgeHours)
        : (toSprintSlaAgeHours(input.slaAge) ?? null),
      handledAt: toIso(input.handledAt) || timestamp,
    };
  } else if (eventType === 'complete') {
    action = 'cco.sprint.complete';
    metadata = {
      ...metadata,
      durationMs: Math.max(0, toNumber(input.durationMs, 0)),
      itemsCompleted: Math.max(0, clampInteger(input.itemsCompleted, 0, 100, 0)),
      remainingHigh: Math.max(0, clampInteger(input.remainingHigh, 0, 100, 0)),
      remainingCritical: Math.max(0, clampInteger(input.remainingCritical, 0, 100, 0)),
    };
  }

  const event = await authStore.addAuditEvent({
    tenantId,
    actorUserId: actor.id,
    action,
    outcome: 'success',
    targetType,
    targetId,
    metadata,
  });

  return res.json({
    ok: true,
    action,
    sprintId,
    auditRef: event?.id || null,
    loggedAt: event?.ts || timestamp,
  });
}

async function runCcoUsageEventHandler({ req, res, authStore }) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit writer.' });
  }

  const rawPayload = asObject(req.body);
  const input = asObject(
    rawPayload.input && typeof rawPayload.input === 'object'
      ? rawPayload.input
      : rawPayload
  );
  const eventType = toCcoUsageEventType(input.eventType || input.type || input.action);
  if (!eventType) {
    return res.status(422).json({
      error: 'eventType måste vara workspace_open, draft_mode_selected eller focus_mode_toggled.',
    });
  }

  const actor = toActor(req);
  const tenantId = toTenantId(req);
  const correlationId = toCorrelationId(req);
  const nowIso = new Date().toISOString();
  const timestamp = toIso(input.timestamp) || nowIso;
  const conversationId = normalizeText(input.conversationId);
  const selectedMode = normalizeText(input.selectedMode).toLowerCase();
  const recommendedMode = normalizeText(input.recommendedMode).toLowerCase();
  const ignoredRecommended =
    input.ignoredRecommended === true ||
    (selectedMode &&
      recommendedMode &&
      ['short', 'warm', 'professional'].includes(selectedMode) &&
      ['short', 'warm', 'professional'].includes(recommendedMode) &&
      selectedMode !== recommendedMode);

  let action = '';
  let targetType = 'cco_workspace';
  let targetId = normalizeText(input.workspaceId) || 'cco';
  let metadata = {
    timestamp,
    correlationId,
  };

  if (eventType === 'workspace_open') {
    action = 'cco.workspace.open';
    metadata = {
      ...metadata,
      route: normalizeText(input.route) || '/cco',
    };
  } else if (eventType === 'draft_mode_selected') {
    action = 'cco.draft.mode_selected';
    targetType = 'cco_conversation';
    targetId = conversationId || targetId;
    metadata = {
      ...metadata,
      conversationId: conversationId || null,
      selectedMode: ['short', 'warm', 'professional'].includes(selectedMode) ? selectedMode : null,
      recommendedMode: ['short', 'warm', 'professional'].includes(recommendedMode)
        ? recommendedMode
        : null,
      ignoredRecommended,
    };
  } else if (eventType === 'focus_mode_toggled') {
    action = 'cco.focus.toggled';
    metadata = {
      ...metadata,
      isActive: input.isActive === true,
      source: normalizeText(input.source) || 'ui',
    };
  }

  const event = await authStore.addAuditEvent({
    tenantId,
    actorUserId: actor.id,
    action,
    outcome: 'success',
    targetType,
    targetId,
    metadata,
  });

  return res.json({
    ok: true,
    action,
    eventType,
    auditRef: event?.id || null,
    loggedAt: event?.ts || timestamp,
  });
}

async function readCcoMetricsHandler({ req, res, authStore, capabilityAnalysisStore }) {
  if (!authStore || typeof authStore.listAuditEvents !== 'function') {
    return res.status(503).json({ error: 'Auth store saknar audit reader.' });
  }

  const tenantId = toTenantId(req);
  const window = toSinceWindow(req.query?.since);
  const auditEvents = await authStore.listAuditEvents({
    tenantId,
    limit: 500,
  });
  const recentAuditEvents = asArray(auditEvents).filter((event) => {
    const tsMs = toEventTimestampMs(event);
    return Number.isFinite(tsMs) && tsMs >= window.startAtMs;
  });

  const sprintStartEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.start'
  );
  const sprintItemCompletedEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.item_completed'
  );
  const sprintCompleteEvents = recentAuditEvents.filter(
    (event) => normalizeText(event?.action) === 'cco.sprint.complete'
  );

  const itemSlaAgeHours = sprintItemCompletedEvents
    .map((event) => toSprintSlaAgeHours(event?.metadata?.slaAgeHours ?? event?.metadata?.slaAge))
    .filter((value) => Number.isFinite(value));
  const sprintDurationsMinutes = sprintCompleteEvents
    .map((event) => Number(event?.metadata?.durationMs) / (60 * 1000))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const sprintItemsCompleted = sprintCompleteEvents
    .map((event) => Number(event?.metadata?.itemsCompleted))
    .filter((value) => Number.isFinite(value) && value >= 0);

  let analysisEntries = [];
  let recentEntries = [];
  let previousEntry = null;
  let conversationWorklist = [];
  let previousConversationWorklist = [];
  if (capabilityAnalysisStore && typeof capabilityAnalysisStore.list === 'function') {
    analysisEntries = await capabilityAnalysisStore.list({
      tenantId,
      capabilityName: 'CCO.InboxAnalysis',
      limit: 400,
    });
    recentEntries = asArray(analysisEntries).filter((entry) => {
      const tsMs = toEventTimestampMs(entry);
      return Number.isFinite(tsMs) && tsMs >= window.startAtMs;
    });
    const sourceEntries = recentEntries.length > 0 ? recentEntries : asArray(analysisEntries);
    const latestEntry = sourceEntries[0] || null;
    conversationWorklist = asArray(latestEntry?.output?.data?.conversationWorklist);
    previousEntry =
      asArray(analysisEntries)
        .filter((entry) => {
          const tsMs = toEventTimestampMs(entry);
          return Number.isFinite(tsMs) && tsMs < window.startAtMs;
        })
        .sort((left, right) => String(right?.ts || '').localeCompare(String(left?.ts || '')))[0] ||
      sourceEntries[1] ||
      null;
    previousConversationWorklist = asArray(previousEntry?.output?.data?.conversationWorklist);
  }

  const unresolved = conversationWorklist.filter(
    (row) => toNeedsReplyStatus(row?.needsReplyStatus) !== 'handled'
  );
  const criticalOver48hCount = unresolved.filter((row) => {
    return (
      toPriorityLevel(row?.priorityLevel) === 'Critical' &&
      toSlaAgeHours(row?.hoursSinceInbound) >= 48
    );
  }).length;
  const highOver24hCount = unresolved.filter((row) => {
    return (
      toPriorityLevel(row?.priorityLevel) === 'High' &&
      toSlaAgeHours(row?.hoursSinceInbound) >= 24
    );
  }).length;
  const unansweredCount = unresolved.length;

  const stressScore = criticalOver48hCount * 3 + highOver24hCount * 2 + unansweredCount;
  const latestSprintFeedback = buildLatestCcoSprintFeedback({
    startEvents: sprintStartEvents,
    completeEvents: sprintCompleteEvents,
  });
  const avgResponseTimeHours = toAverage(itemSlaAgeHours, 2);
  const avgSprintDurationMinutes = toAverage(sprintDurationsMinutes, 2);
  const avgItemsPerSprint = toAverage(sprintItemsCompleted, 2);
  const sprintCompletionRate = sprintStartEvents.length
    ? Number(((sprintCompleteEvents.length / sprintStartEvents.length) * 100).toFixed(1))
    : 0;

  const windowDays = Math.max(1, Math.round(window.durationMs / (24 * 60 * 60 * 1000)));
  const followRateSeed = (() => {
    const modeEvents = recentAuditEvents.filter(
      (event) => normalizeText(event?.action).toLowerCase() === 'cco.draft.mode_selected'
    );
    if (!modeEvents.length) return 0;
    const followed = modeEvents.filter((event) => event?.metadata?.ignoredRecommended !== true).length;
    return clampInteger((followed / modeEvents.length) * 100, 0, 100, 0) / 100;
  })();
  const activeDaySeed = new Set();
  recentAuditEvents.forEach((event) => {
    const action = normalizeText(event?.action).toLowerCase();
    if (!action.startsWith('cco.')) return;
    const tsMs = toEventTimestampMs(event);
    if (!Number.isFinite(tsMs)) return;
    activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
  });
  recentEntries.forEach((entry) => {
    const tsMs = toEventTimestampMs(entry);
    if (!Number.isFinite(tsMs)) return;
    activeDaySeed.add(new Date(tsMs).toISOString().slice(0, 10));
  });
  const ccoUsageRateSeed = Math.max(0, Math.min(1, activeDaySeed.size / windowDays));
  const sprintCompletionRateSeed = sprintCompletionRate / 100;
  const sortedAnalysisEntries = asArray(analysisEntries)
    .slice()
    .sort((left, right) => String(left?.ts || '').localeCompare(String(right?.ts || '')));
  const healthHistory = sortedAnalysisEntries
    .map((entry) => {
      const ts = toIso(entry?.ts);
      if (!ts) return null;
      const snapshotMetrics = computeWorklistSnapshotMetrics(
        asArray(entry?.output?.data?.conversationWorklist)
      );
      const score = computeHealthScore({
        snapshotMetrics,
        avgResponseTimeHours,
        recommendationFollowRate: followRateSeed,
        ccoUsageRate: ccoUsageRateSeed,
        sprintCompletionRate: sprintCompletionRateSeed,
      });
      return {
        ts,
        score,
        slaBreachRate: snapshotMetrics.slaBreachRate,
      };
    })
    .filter(Boolean)
    .slice(-30);

  const usageAnalytics = computeUsageAnalytics({
    windowDays,
    auditEvents: recentAuditEvents,
    analysisEntries: recentEntries,
    currentConversationWorklist: conversationWorklist,
    previousConversationWorklist,
    healthHistory,
  });

  const clusterSignals = {
    slaBreachRateUp: usageAnalytics.slaBreachTrendPercent > 0,
    complaintSpike: usageAnalytics.complaintTrendPercent > 0,
    conversionDrop: usageAnalytics.conversionTrendPercent < 0,
    volatilityIndex: usageAnalytics.volatilityIndex,
  };
  const redFlagState = evaluateRedFlag({
    healthHistory,
    currentHealthScore: usageAnalytics.healthScore,
    clusterSignals,
    usageMetrics: usageAnalytics,
  });
  const volatilityHistory = healthHistory.map((point, index, list) => {
    if (index === 0) return { ts: point.ts, index: 0 };
    const previous = list[index - 1];
    const delta = Math.abs(toNumber(point.score, 0) - toNumber(previous?.score, 0));
    return {
      ts: point.ts,
      index: Number((Math.min(1, delta / 20)).toFixed(3)),
    };
  });
  const recoveryState = evaluateRecovery({
    redFlagState,
    healthHistory,
    slaBreachHistory: healthHistory.map((point) => ({
      ts: point.ts,
      rate: point.slaBreachRate,
    })),
    volatilityHistory,
    driverDeltas: {
      health_drop: redFlagState.delta,
      sla_breach: usageAnalytics.slaBreachTrendPercent,
      complaint_spike: usageAnalytics.complaintTrendPercent,
      conversion_drop: usageAnalytics.conversionTrendPercent,
      volatility: usageAnalytics.volatilityIndex - 0.6,
      health_threshold: usageAnalytics.healthScore - 60,
    },
  });
  const adaptiveFocusState = resolveAdaptiveFocusState({
    redFlagState,
    recoveryState,
    nowMs: Date.now(),
    durationHours: 48,
  });

  return res.json({
    avgResponseTimeHours,
    criticalOver48hCount,
    avgSprintDurationMinutes,
    avgItemsPerSprint,
    sprintCompletionRate,
    stressProxyIndex: {
      score: stressScore,
      level: toStressLevel(stressScore),
      factors: {
        criticalOver48h: criticalOver48hCount,
        highOver24h: highOver24hCount,
        unansweredCount,
      },
    },
    usageAnalytics,
    redFlagState,
    adaptiveFocusState,
    recoveryState,
    healthScore: usageAnalytics.healthScore,
    latestSprintFeedback,
    since: window.since,
    generatedAt: new Date().toISOString(),
  });
}

function toCapabilityRunError(res, error) {
  const status = pickErrorStatus(error?.code);
  return res.status(status).json(toErrorPayload(error));
}

function toCapabilityRunBlocked(res, result = {}) {
  return res.status(403).json(toGatewayBlockedResponse(result.gatewayResult || {}));
}

function toCapabilityRunSuccess(res, result = {}) {
  return res.json(toSuccessPayload(result));
}

function toRoleGuardedHandler(handler) {
  return async (req, res) => {
    if (!ensureRoleContext(req, res)) return;
    return handler(req, res);
  };
}

async function runCapabilityHandler({
  req,
  res,
  executor,
  capabilityName,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const payload = await maybeHydrateCapabilityPayload({
    capabilityName,
    tenantId: toTenantId(req),
    templateStore,
      input: req.body?.input,
      systemStateSnapshot: req.body?.systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      authStore,
      actorUserId: actor.id,
      correlationId,
  });
  if (isDebugRequested(req)) {
    payload.input = {
      ...asObject(payload.input),
      debug: true,
    };
  }

  const result = await executor.runCapability({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    capabilityName,
    input: payload.input,
    systemStateSnapshot: payload.systemStateSnapshot,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
  });

  if (isBlockedDecision(result.gatewayResult || {})) {
    return toCapabilityRunBlocked(res, result);
  }
  await maybeWriteCcoLifecycleAuditEvents({
    authStore,
    tenantId: toTenantId(req),
    actorUserId: actor.id,
    correlationId,
    result,
  });
  return toCapabilityRunSuccess(res, result);
}

async function runAgentHandler({
  req,
  res,
  executor,
  agentName,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const payload = await maybeHydrateAgentPayload({
    agentName,
    tenantId: toTenantId(req),
    templateStore,
      input: req.body?.input,
      systemStateSnapshot: req.body?.systemStateSnapshot,
      graphReadConnector,
      capabilityAnalysisStore,
      authStore,
      actorUserId: actor.id,
      correlationId,
  });
  if (isDebugRequested(req)) {
    payload.input = {
      ...asObject(payload.input),
      debug: true,
    };
  }

  const result = await executor.runAgent({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    agentName,
    input: payload.input,
    systemStateSnapshot: payload.systemStateSnapshot,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
  });

  if (isBlockedDecision(result.gatewayResult || {})) {
    return toCapabilityRunBlocked(res, result);
  }
  await maybeWriteCcoLifecycleAuditEvents({
    authStore,
    tenantId: toTenantId(req),
    actorUserId: actor.id,
    correlationId,
    result,
  });
  return toCapabilityRunSuccess(res, result);
}

async function runCcoSendHandler({
  req,
  res,
  executor,
  graphSendConnector,
  graphSendEnabled,
  graphSendAllowlist,
}) {
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const rawPayload = asObject(req.body);
  const input = asObject(rawPayload.input && typeof rawPayload.input === 'object'
    ? rawPayload.input
    : rawPayload);

  const result = await executor.runCcoSend({
    tenantId: toTenantId(req),
    actor,
    channel: toChannel(req),
    input,
    correlationId,
    idempotencyKey: toIdempotencyKey(req),
    requestMetadata: toRequestMetadata(req),
    graphSendConnector,
    graphSendEnabled,
    graphSendAllowlist,
  });

  if (isBlockedDecision(result.gatewayResult || {})) {
    return toCapabilityRunBlocked(res, result);
  }
  return toCapabilityRunSuccess(res, result);
}

async function readAnalysisHandler({ req, res, capabilityAnalysisStore }) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return toAnalysisUnavailable(res);
  }
  const query = toAnalysisQuery(req);
  const resolvedCapabilityName = resolveAnalysisCapabilityName(query);
  const entries = await capabilityAnalysisStore.list({
    tenantId: toTenantId(req),
    capabilityName: resolvedCapabilityName,
    limit: query.limit,
  });
  return res.json(toAnalysisPayload(entries, resolvedCapabilityName, query.agentName));
}

async function readWritingIdentitiesHandler({ req, res, capabilityAnalysisStore }) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const queryMailbox = toMailboxAddress(req.query?.mailbox);
  const records = await listWritingIdentityProfiles({
    analysisStore: capabilityAnalysisStore,
    tenantId,
    limit: 500,
  });
  const filtered = queryMailbox
    ? records.filter((record) => toMailboxAddress(record?.mailbox) === queryMailbox)
    : records;
  return res.json({
    count: filtered.length,
    profiles: filtered.map((record) => ({
      mailbox: toMailboxAddress(record?.mailbox),
      version: Number(record?.version || 1),
      profile: toWritingProfile(record?.profile || {}),
      source: normalizeText(record?.source) || 'auto',
      createdAt: toIso(record?.createdAt) || null,
      updatedAt: toIso(record?.updatedAt) || null,
    })),
    generatedAt: new Date().toISOString(),
  });
}

async function saveWritingIdentityProfileHandler({
  req,
  res,
  capabilityAnalysisStore,
  authStore,
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const mailbox =
    toMailboxAddress(req.params?.mailbox) ||
    toMailboxAddress(req.body?.mailbox) ||
    toMailboxAddress(req.body?.input?.mailbox);
  if (!mailbox) {
    return res.status(422).json({ error: 'mailbox måste vara en giltig email/UPN.' });
  }
  const sourceProfile = asObject(
    req.body?.profile && typeof req.body.profile === 'object'
      ? req.body.profile
      : req.body?.input?.profile && typeof req.body.input.profile === 'object'
      ? req.body.input.profile
      : req.body
  );
  const profile = toWritingProfile(sourceProfile);
  const record = await upsertWritingIdentityProfile({
    analysisStore: capabilityAnalysisStore,
    authStore,
    tenantId,
    actorUserId: actor.id,
    mailboxAddress: mailbox,
    profile,
    source: 'manual',
    correlationId,
  });
  return res.json({
    ok: true,
    mailbox,
    profile: {
      mailbox: record.mailbox,
      version: record.version,
      profile: record.profile,
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    },
  });
}

async function autoExtractWritingIdentityProfilesHandler({
  req,
  res,
  capabilityAnalysisStore,
  authStore,
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.list !== 'function') {
    return res.status(503).json({ error: 'Capability analysis store är inte konfigurerad.' });
  }
  const tenantId = toTenantId(req);
  const actor = toActor(req);
  const correlationId = toCorrelationId(req);
  const payload = asObject(req.body);
  const input = asObject(
    payload.input && typeof payload.input === 'object' ? payload.input : payload
  );
  const sampleSize = clampInteger(input.sampleSize, 30, 50, 40);
  const mailboxes = parseMailboxList(input.mailboxes);
  const result = await extractAndPersistWritingIdentityProfiles({
    analysisStore: capabilityAnalysisStore,
    authStore,
    tenantId,
    mailboxes,
    actorUserId: actor.id,
    correlationId,
    sampleSize,
  });
  return res.json({
    ok: true,
    sampleSize: result.sampleSize,
    requestedMailboxes: result.requestedMailboxes,
    updatedProfiles: result.updatedProfiles.map((item) => ({
      mailbox: item.mailbox,
      sampleCount: item.sampleCount,
      version: Number(item?.record?.version || 1),
      source: normalizeText(item?.record?.source) || 'auto',
      profile: toWritingProfile(item?.profile || {}),
      updatedAt: toIso(item?.record?.updatedAt) || null,
    })),
    skipped: asArray(result.skipped),
    generatedAt: new Date().toISOString(),
  });
}

function toMetaHandler({ executor }) {
  return async (_req, res) => res.json(toMetaPayload(executor));
}

function toCapabilityRunHandler({
  executor,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
}) {
  return async (req, res) => {
    const capabilityName = toCapabilityName(req);
    if (!validateCapabilityName(capabilityName, res)) return;
    try {
      return await runCapabilityHandler({
        req,
        res,
        executor,
        capabilityName,
        templateStore,
        graphReadConnector,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toAgentRunHandler({
  executor,
  templateStore,
  graphReadConnector,
  capabilityAnalysisStore,
  authStore,
}) {
  return async (req, res) => {
    const agentName = toAgentName(req);
    if (!validateAgentName(agentName, res)) return;
    try {
      return await runAgentHandler({
        req,
        res,
        executor,
        agentName,
        templateStore,
        graphReadConnector,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toAnalysisHandler({ capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readAnalysisHandler({ req, res, capabilityAnalysisStore });
    } catch (error) {
      console.error(error);
      return toAnalysisError(res);
    }
  };
}

function toCcoSendHandler({
  executor,
  graphSendConnector,
  graphSendEnabled,
  graphSendAllowlist,
}) {
  return async (req, res) => {
    try {
      return await runCcoSendHandler({
        req,
        res,
        executor,
        graphSendConnector,
        graphSendEnabled,
        graphSendAllowlist,
      });
    } catch (error) {
      return toCapabilityRunError(res, error);
    }
  };
}

function toCcoSprintEventHandler({ authStore }) {
  return async (req, res) => {
    try {
      return await runCcoSprintEventHandler({ req, res, authStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte logga sprint-event.',
        code: error?.code || 'CCO_SPRINT_EVENT_FAILED',
      });
    }
  };
}

function toCcoUsageEventHandler({ authStore }) {
  return async (req, res) => {
    try {
      return await runCcoUsageEventHandler({ req, res, authStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte logga usage-event.',
        code: error?.code || 'CCO_USAGE_EVENT_FAILED',
      });
    }
  };
}

function toCcoMetricsHandler({ authStore, capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readCcoMetricsHandler({ req, res, authStore, capabilityAnalysisStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte läsa CCO metrics.',
        code: error?.code || 'CCO_METRICS_READ_FAILED',
      });
    }
  };
}

function toWritingIdentitiesReadHandler({ capabilityAnalysisStore }) {
  return async (req, res) => {
    try {
      return await readWritingIdentitiesHandler({ req, res, capabilityAnalysisStore });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte läsa Writing Identity-profiler.',
        code: error?.code || 'CCO_WRITING_PROFILE_READ_FAILED',
      });
    }
  };
}

function toWritingIdentitySaveHandler({ capabilityAnalysisStore, authStore }) {
  return async (req, res) => {
    try {
      return await saveWritingIdentityProfileHandler({
        req,
        res,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte spara Writing Identity-profil.',
        code: error?.code || 'CCO_WRITING_PROFILE_SAVE_FAILED',
      });
    }
  };
}

function toWritingIdentityAutoExtractHandler({ capabilityAnalysisStore, authStore }) {
  return async (req, res) => {
    try {
      return await autoExtractWritingIdentityProfilesHandler({
        req,
        res,
        capabilityAnalysisStore,
        authStore,
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Kunde inte auto-extrahera Writing Identity-profiler.',
        code: error?.code || 'CCO_WRITING_PROFILE_AUTO_EXTRACT_FAILED',
      });
    }
  };
}

function createCapabilitiesRouter({
  authStore,
  tenantConfigStore,
  requireAuth,
  requireRole,
  executionGateway = null,
  capabilityAnalysisStore = null,
  templateStore = null,
  graphReadConnector = null,
  graphReadConnectorFactory = createMicrosoftGraphReadConnector,
  graphSendConnector = null,
  graphSendConnectorFactory = createMicrosoftGraphSendConnector,
}) {
  const router = express.Router();
  const gateway =
    executionGateway ||
    createExecutionGateway({
      buildVersion: process.env.npm_package_version || 'dev',
    });
  const shouldEnableGraphRead = toBoolean(process.env.ARCANA_GRAPH_READ_ENABLED, false);
  const graphReadAllowlist = parseMailboxIds(process.env.ARCANA_MAILBOX_ALLOWLIST, 500);
  const graphReadAllowlistMode = graphReadAllowlist.length > 0;
  const graphReadFullTenant = graphReadAllowlistMode
    ? true
    : toBoolean(process.env.ARCANA_GRAPH_FULL_TENANT, false);
  const graphReadUserScope = graphReadAllowlistMode
    ? 'all'
    : normalizeGraphUserScope(
        process.env.ARCANA_GRAPH_USER_SCOPE,
        graphReadFullTenant ? 'all' : 'single'
      );
  const graphReadRequiresUserId = !(graphReadFullTenant && graphReadUserScope === 'all');
  const shouldEnableGraphSend = toBoolean(process.env.ARCANA_GRAPH_SEND_ENABLED, false);
  const graphSendAllowlist = normalizeText(process.env.ARCANA_GRAPH_SEND_ALLOWLIST);
  const resolvedGraphReadConnector = (() => {
    if (graphReadConnector && typeof graphReadConnector.fetchInboxSnapshot === 'function') {
      return graphReadConnector;
    }
    if (!shouldEnableGraphRead) return null;
    const tenantId = normalizeText(process.env.ARCANA_GRAPH_TENANT_ID);
    const clientId = normalizeText(process.env.ARCANA_GRAPH_CLIENT_ID);
    const clientSecret = normalizeText(process.env.ARCANA_GRAPH_CLIENT_SECRET);
    const userId = normalizeText(process.env.ARCANA_GRAPH_USER_ID);
    const missing = [];
    if (!tenantId) missing.push('ARCANA_GRAPH_TENANT_ID');
    if (!clientId) missing.push('ARCANA_GRAPH_CLIENT_ID');
    if (!clientSecret) missing.push('ARCANA_GRAPH_CLIENT_SECRET');
    if (graphReadRequiresUserId && !userId) missing.push('ARCANA_GRAPH_USER_ID');
    if (missing.length > 0) {
      throw new Error(
        `ARCANA_GRAPH_READ_ENABLED=true requires: ${missing.join(', ')}.`
      );
    }
    return graphReadConnectorFactory({
      tenantId,
      clientId,
      clientSecret,
      userId,
      fullTenant: graphReadFullTenant,
      userScope: graphReadUserScope,
      authorityHost: normalizeText(process.env.ARCANA_GRAPH_AUTHORITY_HOST) || undefined,
      graphBaseUrl: normalizeText(process.env.ARCANA_GRAPH_BASE_URL) || undefined,
      scope: normalizeText(process.env.ARCANA_GRAPH_SCOPE) || undefined,
    });
  })();
  const resolvedGraphSendConnector = (() => {
    if (graphSendConnector && typeof graphSendConnector.sendReply === 'function') {
      return graphSendConnector;
    }
    if (!shouldEnableGraphSend) return null;
    const tenantId = normalizeText(process.env.ARCANA_GRAPH_TENANT_ID);
    const clientId = normalizeText(process.env.ARCANA_GRAPH_CLIENT_ID);
    const clientSecret = normalizeText(process.env.ARCANA_GRAPH_CLIENT_SECRET);
    const missing = [];
    if (!tenantId) missing.push('ARCANA_GRAPH_TENANT_ID');
    if (!clientId) missing.push('ARCANA_GRAPH_CLIENT_ID');
    if (!clientSecret) missing.push('ARCANA_GRAPH_CLIENT_SECRET');
    if (!graphSendAllowlist) missing.push('ARCANA_GRAPH_SEND_ALLOWLIST');
    if (missing.length > 0) {
      throw new Error(
        `ARCANA_GRAPH_SEND_ENABLED=true requires: ${missing.join(', ')}.`
      );
    }
    return graphSendConnectorFactory({
      tenantId,
      clientId,
      clientSecret,
      authorityHost: normalizeText(process.env.ARCANA_GRAPH_AUTHORITY_HOST) || undefined,
      graphBaseUrl: normalizeText(process.env.ARCANA_GRAPH_BASE_URL) || undefined,
      scope: normalizeText(process.env.ARCANA_GRAPH_SCOPE) || undefined,
      requestTimeoutMs: clampInteger(
        process.env.ARCANA_GRAPH_SEND_TIMEOUT_MS,
        1000,
        60000,
        8000
      ),
    });
  })();
  const executor = createCapabilityExecutor({
    executionGateway: gateway,
    authStore,
    tenantConfigStore,
    capabilityAnalysisStore,
    buildVersion: process.env.npm_package_version || 'dev',
  });

  router.get(
    '/capabilities/meta',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toMetaHandler({ executor }))
  );

  router.get(
    '/agents/meta',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toMetaHandler({ executor }))
  );

  router.get(
    '/capabilities/analysis',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toAnalysisHandler({ capabilityAnalysisStore }))
  );

  router.get(
    '/agents/analysis',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toAnalysisHandler({ capabilityAnalysisStore }))
  );

  router.post(
    '/capabilities/:capabilityName/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCapabilityRunHandler({
        executor,
        templateStore,
        graphReadConnector: resolvedGraphReadConnector,
        capabilityAnalysisStore,
        authStore,
      })
    )
  );

  router.post(
    '/cco/sprint/event',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toCcoSprintEventHandler({ authStore }))
  );

  router.post(
    '/cco/usage/event',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(toCcoUsageEventHandler({ authStore }))
  );

  router.get(
    '/cco/metrics',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoMetricsHandler({ authStore, capabilityAnalysisStore })
    )
  );

  router.get(
    '/cco/writing-identities',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentitiesReadHandler({ capabilityAnalysisStore })
    )
  );

  router.post(
    '/cco/writing-identities/auto-extract',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentityAutoExtractHandler({ capabilityAnalysisStore, authStore })
    )
  );

  router.put(
    '/cco/writing-identities/:mailbox',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toWritingIdentitySaveHandler({ capabilityAnalysisStore, authStore })
    )
  );

  router.post(
    '/cco/send',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toCcoSendHandler({
        executor,
        graphSendConnector: resolvedGraphSendConnector,
        graphSendEnabled: shouldEnableGraphSend,
        graphSendAllowlist,
      })
    )
  );

  router.post(
    '/agents/:agentName/run',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    toRoleGuardedHandler(
      toAgentRunHandler({
        executor,
        templateStore,
        graphReadConnector: resolvedGraphReadConnector,
        capabilityAnalysisStore,
        authStore,
      })
    )
  );

  return router;
}

module.exports = {
  createCapabilitiesRouter,
};
