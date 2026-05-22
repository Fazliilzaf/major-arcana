const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const ALLOWED_EVENT_TYPES = new Set(['beta_denied', 'chat_response', 'chat_error']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeHost(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return '';
  try {
    if (raw.includes('://')) return normalizeText(new URL(raw).hostname).toLowerCase();
    return normalizeText(new URL(`https://${raw}`).hostname).toLowerCase();
  } catch {
    return raw.replace(/^\.+|\.+$/g, '');
  }
}

function normalizeIntent(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9_]+/g, '_').slice(0, 40);
}

function normalizeIntentList(values) {
  const intents = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeIntent(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    intents.push(normalized);
  }
  return intents;
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    const key = normalizeText(rawKey).slice(0, 60);
    if (!key) continue;
    if (rawVal === null) {
      metadata[key] = null;
      continue;
    }
    const valType = typeof rawVal;
    if (valType === 'string') {
      metadata[key] = rawVal.slice(0, 200);
      continue;
    }
    if (valType === 'number' || valType === 'boolean') {
      metadata[key] = rawVal;
    }
  }
  return metadata;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Number((Math.round((Number(value) + Number.EPSILON) * factor) / factor).toFixed(digits));
}

function toPercent(part, total) {
  const p = Number(part || 0);
  const t = Number(total || 0);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return round((p / t) * 100, 2);
}

function toAgeHoursSince(isoTs, nowMs = Date.now()) {
  const ts = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(ts)) return null;
  if (ts > nowMs) return 0;
  return round((nowMs - ts) / (60 * 60 * 1000), 2);
}

function dayKey(isoTs) {
  const parsed = toIso(isoTs);
  if (!parsed) return '';
  return parsed.slice(0, 10);
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

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    events: [],
  };
}

function normalizeEvent(input) {
  const source = input && typeof input === 'object' ? input : {};
  const eventType = normalizeText(source.eventType).toLowerCase();
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return null;

  const ts = toIso(source.ts) || nowIso();
  const intents = normalizeIntentList(source.intents || source?.signal?.intents);
  const intentScoreRaw = Number(source.intentScore ?? source?.signal?.score ?? 0);
  const intentScore = Number.isFinite(intentScoreRaw) ? Math.max(0, Math.min(20, intentScoreRaw)) : 0;

  const responseMsRaw = Number(source.responseMs);
  const responseMs = Number.isFinite(responseMsRaw) && responseMsRaw >= 0
    ? round(responseMsRaw, 2)
    : null;

  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    ts,
    eventType,
    tenantId: normalizeText(source.tenantId) || null,
    brand: normalizeText(source.brand) || null,
    conversationId: normalizeText(source.conversationId) || null,
    allowed: source.allowed === true,
    gateEnabled: source.gateEnabled === true,
    gateReason: normalizeText(source.gateReason).toLowerCase() || null,
    sourceHost: normalizeHost(source.sourceHost) || null,
    originHost: normalizeHost(source.originHost) || null,
    refererHost: normalizeHost(source.refererHost) || null,
    requestHost: normalizeHost(source.requestHost) || null,
    correlationId: normalizeText(source.correlationId) || null,
    responseMs,
    fallbackUsed: source.fallbackUsed === true,
    intents,
    intentScore,
    metadata: sanitizeMetadata(source.metadata),
  };
}

function pruneEvents(events, { maxEvents, retentionDays, nowMs = Date.now() }) {
  const cutoff = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const kept = (Array.isArray(events) ? events : [])
    .map((item) => normalizeEvent(item))
    .filter((item) => {
      if (!item) return false;
      const ts = Date.parse(item.ts);
      if (!Number.isFinite(ts)) return false;
      return ts >= cutoff;
    })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  if (kept.length <= maxEvents) return kept;
  return kept.slice(kept.length - maxEvents);
}

function selectTenantEvents(events, tenantId) {
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) return Array.isArray(events) ? events : [];
  return (Array.isArray(events) ? events : []).filter((item) => {
    const eventTenant = normalizeText(item?.tenantId);
    const eventBrand = normalizeText(item?.brand);
    return eventTenant === normalizedTenantId || (!eventTenant && eventBrand === normalizedTenantId);
  });
}

function buildCounters(events) {
  const counters = {
    totalRequests: 0,
    allowedRequests: 0,
    deniedRequests: 0,
    responses: 0,
    errors: 0,
    fallbackResponses: 0,
    conversionIntentRequests: 0,
    bookingIntentRequests: 0,
    contactIntentRequests: 0,
    pricingIntentRequests: 0,
    financeIntentRequests: 0,
    uniqueConversations: 0,
    deniedRatePct: 0,
    responseRatePct: 0,
    fallbackResponseRatePct: 0,
    conversionIntentRatePct: 0,
  };

  const conversationIds = new Set();

  for (const event of Array.isArray(events) ? events : []) {
    counters.totalRequests += 1;
    if (event?.allowed === true) counters.allowedRequests += 1;
    else counters.deniedRequests += 1;

    if (event?.eventType === 'chat_response') counters.responses += 1;
    if (event?.eventType === 'chat_error') counters.errors += 1;
    if (event?.fallbackUsed === true) counters.fallbackResponses += 1;

    const intents = Array.isArray(event?.intents) ? event.intents : [];
    if (intents.length > 0) counters.conversionIntentRequests += 1;
    if (intents.includes('booking')) counters.bookingIntentRequests += 1;
    if (intents.includes('contact')) counters.contactIntentRequests += 1;
    if (intents.includes('pricing')) counters.pricingIntentRequests += 1;
    if (intents.includes('finance')) counters.financeIntentRequests += 1;

    const conversationId = normalizeText(event?.conversationId);
    if (conversationId) conversationIds.add(conversationId);
  }

  counters.uniqueConversations = conversationIds.size;
  counters.deniedRatePct = toPercent(counters.deniedRequests, counters.totalRequests);
  counters.responseRatePct = toPercent(counters.responses, counters.allowedRequests);
  counters.fallbackResponseRatePct = toPercent(counters.fallbackResponses, counters.responses);
  counters.conversionIntentRatePct = toPercent(
    counters.conversionIntentRequests,
    counters.allowedRequests
  );

  return counters;
}

function buildTopList(map, limit = 6) {
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return String(a[0]).localeCompare(String(b[0]));
  });
  return entries.slice(0, Math.max(1, Math.min(20, Number(limit) || 6))).map(([key, count]) => ({
    key,
    count,
  }));
}

function findLatestEventAt(events) {
  const latest = (Array.isArray(events) ? events : []).reduce((acc, item) => {
    const ts = Date.parse(String(item?.ts || ''));
    if (!Number.isFinite(ts)) return acc;
    if (acc === null || ts > acc) return ts;
    return acc;
  }, null);
  if (latest === null) return null;
  return new Date(latest).toISOString();
}

function buildWindowExtras(events, nowMs, freshnessHours, topLimit) {
  const deniedHostMap = new Map();
  const signalMap = new Map();
  const dailyMap = new Map();

  for (const event of Array.isArray(events) ? events : []) {
    const host =
      normalizeHost(event?.sourceHost) ||
      normalizeHost(event?.originHost) ||
      normalizeHost(event?.refererHost) ||
      normalizeHost(event?.requestHost) ||
      'unknown';

    if (event?.allowed !== true) {
      deniedHostMap.set(host, Number(deniedHostMap.get(host) || 0) + 1);
    }

    const intents = Array.isArray(event?.intents) ? event.intents : [];
    for (const intent of intents) {
      signalMap.set(intent, Number(signalMap.get(intent) || 0) + 1);
    }

    const key = dayKey(event?.ts);
    if (!key) continue;
    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        date: key,
        totalRequests: 0,
        deniedRequests: 0,
        conversionIntentRequests: 0,
      });
    }
    const day = dailyMap.get(key);
    day.totalRequests += 1;
    if (event?.allowed !== true) day.deniedRequests += 1;
    if (intents.length > 0) day.conversionIntentRequests += 1;
  }

  const latestEventAt = findLatestEventAt(events);
  const ageHoursSinceLatest = latestEventAt ? toAgeHoursSince(latestEventAt, nowMs) : null;

  return {
    latestEventAt,
    ageHoursSinceLatest,
    freshnessHoursTarget: freshnessHours,
    topDeniedHosts: buildTopList(deniedHostMap, topLimit),
    topIntentSignals: buildTopList(signalMap, topLimit),
    daily: Array.from(dailyMap.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

async function createPatientConversionStore({
  filePath,
  maxEvents = 20000,
  retentionDays = 180,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('patientConversionStore filePath saknas.');
  }

  const safeMaxEvents = Math.max(200, Math.min(200000, parsePositiveInt(maxEvents) || 20000));
  const safeRetentionDays = Math.max(7, Math.min(3650, parsePositiveInt(retentionDays) || 180));

  const loaded = await readJson(filePath, emptyState());
  const state = loaded && typeof loaded === 'object' ? loaded : emptyState();
  if (!Array.isArray(state.events)) state.events = [];
  if (!state.createdAt) state.createdAt = nowIso();

  state.events = pruneEvents(state.events, {
    maxEvents: safeMaxEvents,
    retentionDays: safeRetentionDays,
  });
  state.updatedAt = nowIso();
  await writeJsonAtomic(filePath, state);

  async function save() {
    state.events = pruneEvents(state.events, {
      maxEvents: safeMaxEvents,
      retentionDays: safeRetentionDays,
    });
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function recordEvent(event) {
    const normalized = normalizeEvent(event);
    if (!normalized) {
      throw new Error('Ogiltig patient conversion-event payload.');
    }
    state.events.push(normalized);
    await save();
    return normalized;
  }

  async function getSummary({
    tenantId = '',
    windowDays = 14,
    freshnessHours = 72,
    topLimit = 6,
  } = {}) {
    const nowMs = Date.now();
    const safeWindowDays = Math.max(1, Math.min(365, parsePositiveInt(windowDays) || 14));
    const safeFreshnessHours = Math.max(1, Math.min(720, parsePositiveInt(freshnessHours) || 72));
    const safeTopLimit = Math.max(1, Math.min(20, parsePositiveInt(topLimit) || 6));

    const tenantEvents = selectTenantEvents(state.events, tenantId);
    const cutoff = nowMs - safeWindowDays * 24 * 60 * 60 * 1000;
    const windowEvents = tenantEvents.filter((item) => {
      const ts = Date.parse(String(item?.ts || ''));
      return Number.isFinite(ts) && ts >= cutoff;
    });

    const allTime = buildCounters(tenantEvents);
    const window = buildCounters(windowEvents);
    const allTimeLatestEventAt = findLatestEventAt(tenantEvents);
    const windowExtras = buildWindowExtras(windowEvents, nowMs, safeFreshnessHours, safeTopLimit);
    const feedbackHealthy =
      window.totalRequests > 0 &&
      window.conversionIntentRequests > 0 &&
      window.deniedRatePct <= 85 &&
      windowExtras.ageHoursSinceLatest !== null &&
      windowExtras.ageHoursSinceLatest <= safeFreshnessHours;

    return {
      generatedAt: nowIso(),
      tenantId: normalizeText(tenantId) || null,
      settings: {
        filePath,
        maxEvents: safeMaxEvents,
        retentionDays: safeRetentionDays,
      },
      totalStoredEvents: state.events.length,
      totalTenantEvents: tenantEvents.length,
      windowDays: safeWindowDays,
      allTime: {
        ...allTime,
        latestEventAt: allTimeLatestEventAt,
      },
      window: {
        ...window,
        latestEventAt: windowExtras.latestEventAt,
        ageHoursSinceLatest: windowExtras.ageHoursSinceLatest,
        freshnessHoursTarget: windowExtras.freshnessHoursTarget,
        feedbackHealthy,
        topDeniedHosts: windowExtras.topDeniedHosts,
        topIntentSignals: windowExtras.topIntentSignals,
        daily: windowExtras.daily,
      },
    };
  }

  return {
    filePath,
    maxEvents: safeMaxEvents,
    retentionDays: safeRetentionDays,
    recordEvent,
    getSummary,
  };
}

module.exports = {
  createPatientConversionStore,
};
