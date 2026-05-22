const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_HISTORY_PER_SECRET = 200;
const MAX_NOTE_LENGTH = 280;

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

function normalizeMaxAgeDays(value, fallback = 90) {
  const parsed = parsePositiveInt(value);
  if (!parsed) return fallback;
  return Math.max(7, Math.min(3650, parsed));
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true;
}

function normalizeSecretId(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9_]+/g, '_');
}

function normalizeEnvVar(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (!normalized) return '';
  return normalized.replace(/[^A-Z0-9_]+/g, '_');
}

function normalizeNote(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.length <= MAX_NOTE_LENGTH) return normalized;
  return normalized.slice(0, MAX_NOTE_LENGTH);
}

function toAgeDays(isoTs, nowMs = Date.now()) {
  const parsed = Date.parse(String(isoTs || ''));
  if (!Number.isFinite(parsed)) return null;
  if (parsed > nowMs) return 0;
  return Number(((nowMs - parsed) / (24 * 60 * 60 * 1000)).toFixed(2));
}

function hashSecretValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function maskFingerprint(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return null;
  return `sha256:${normalized.slice(0, 12)}`;
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

function buildDefaultDefinitions(config) {
  const sharedMaxAgeDays = normalizeMaxAgeDays(config?.secretRotationMaxAgeDays, 90);
  return [
    {
      id: 'openai_api_key',
      label: 'OpenAI API key',
      category: 'provider',
      envVar: 'OPENAI_API_KEY',
      configKey: 'openaiApiKey',
      maxAgeDays: sharedMaxAgeDays,
      requiredWhen: ({ config: runtimeConfig }) =>
        String(runtimeConfig?.aiProvider || 'openai').toLowerCase() === 'openai',
    },
    {
      id: 'alert_webhook_secret',
      label: 'Alert webhook secret',
      category: 'ops_webhook',
      envVar: 'ARCANA_ALERT_WEBHOOK_SECRET',
      configKey: 'alertWebhookSecret',
      maxAgeDays: sharedMaxAgeDays,
      requiredWhen: ({ config: runtimeConfig }) => Boolean(normalizeText(runtimeConfig?.alertWebhookUrl)),
    },
  ];
}

function normalizeDefinition(input, fallbackMaxAgeDays = 90) {
  const item = input && typeof input === 'object' ? input : {};
  const id = normalizeSecretId(item.id);
  const envVar = normalizeEnvVar(item.envVar);
  if (!id || !envVar) return null;
  return {
    id,
    envVar,
    label: normalizeText(item.label) || id,
    category: normalizeText(item.category) || 'secret',
    configKey: normalizeText(item.configKey) || '',
    maxAgeDays: normalizeMaxAgeDays(item.maxAgeDays, fallbackMaxAgeDays),
    requiredWhen:
      typeof item.requiredWhen === 'function'
        ? item.requiredWhen
        : () => normalizeBool(item.required, false),
  };
}

function normalizeHistoryEntry(item) {
  const source = item && typeof item === 'object' ? item : {};
  const version = parsePositiveInt(source.version);
  if (!version) return null;
  return {
    version,
    fingerprint: normalizeText(source.fingerprint).toLowerCase() || '',
    present: normalizeBool(source.present, false),
    required: normalizeBool(source.required, false),
    changedAt: normalizeText(source.changedAt) || nowIso(),
    changedBy: normalizeText(source.changedBy) || null,
    source: normalizeText(source.source) || 'snapshot',
    note: normalizeNote(source.note),
  };
}

function normalizeSecretRecord(rawRecord, definition) {
  const source = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
  const history = [];
  const seenVersions = new Set();
  for (const item of Array.isArray(source.history) ? source.history : []) {
    const normalized = normalizeHistoryEntry(item);
    if (!normalized) continue;
    if (seenVersions.has(normalized.version)) continue;
    seenVersions.add(normalized.version);
    history.push(normalized);
  }
  history.sort((a, b) => a.version - b.version);

  const currentVersion =
    parsePositiveInt(source.currentVersion) ||
    parsePositiveInt(history[history.length - 1]?.version) ||
    0;

  if (!history.length && currentVersion > 0) {
    history.push({
      version: currentVersion,
      fingerprint: normalizeText(source.currentFingerprint).toLowerCase() || '',
      present: normalizeBool(source.currentPresent, false),
      required: normalizeBool(source.required, false),
      changedAt: normalizeText(source.lastChangedAt) || nowIso(),
      changedBy: normalizeText(source.lastChangedBy) || null,
      source: 'legacy_import',
      note: '',
    });
  }

  const latest = history[history.length - 1] || null;
  return {
    id: definition.id,
    envVar: definition.envVar,
    label: definition.label,
    category: definition.category,
    maxAgeDays: normalizeMaxAgeDays(source.maxAgeDays, definition.maxAgeDays),
    currentVersion:
      parsePositiveInt(source.currentVersion) ||
      parsePositiveInt(latest?.version) ||
      0,
    currentFingerprint: normalizeText(source.currentFingerprint).toLowerCase() || normalizeText(latest?.fingerprint).toLowerCase() || '',
    currentPresent: normalizeBool(source.currentPresent, normalizeBool(latest?.present, false)),
    required: normalizeBool(source.required, normalizeBool(latest?.required, false)),
    firstSeenAt: normalizeText(source.firstSeenAt) || normalizeText(latest?.changedAt) || null,
    lastSeenAt: normalizeText(source.lastSeenAt) || normalizeText(latest?.changedAt) || null,
    lastChangedAt: normalizeText(source.lastChangedAt) || normalizeText(latest?.changedAt) || null,
    lastChangedBy: normalizeText(source.lastChangedBy) || normalizeText(latest?.changedBy) || null,
    history:
      history.length > MAX_HISTORY_PER_SECRET
        ? history.slice(history.length - MAX_HISTORY_PER_SECRET)
        : history,
  };
}

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    secrets: {},
  };
}

function resolveSecretValue(definition, config) {
  if (definition.configKey && typeof config?.[definition.configKey] === 'string') {
    const fromConfig = normalizeText(config[definition.configKey]);
    if (fromConfig) return fromConfig;
  }
  return normalizeText(process.env[definition.envVar] || '');
}

function normalizeRequired(definition, config) {
  try {
    return normalizeBool(definition.requiredWhen({ config }), false);
  } catch {
    return false;
  }
}

function buildRuntimeSnapshot(definition, config) {
  const value = resolveSecretValue(definition, config);
  const present = Boolean(value);
  return {
    id: definition.id,
    envVar: definition.envVar,
    label: definition.label,
    category: definition.category,
    maxAgeDays: definition.maxAgeDays,
    required: normalizeRequired(definition, config),
    present,
    fingerprint: present ? hashSecretValue(value) : '',
  };
}

function buildSecretStatusRecord({
  definition,
  existing,
  runtime,
  dryRun = true,
  force = false,
  maxAgeDaysOverride = null,
}) {
  const hasExisting = Boolean(existing);
  const currentVersion = parsePositiveInt(existing?.currentVersion) || 0;
  const currentFingerprint = normalizeText(existing?.currentFingerprint).toLowerCase();
  const currentPresent = normalizeBool(existing?.currentPresent, false);
  const currentRequired = normalizeBool(existing?.required, false);

  const changed =
    !hasExisting ||
    force ||
    currentFingerprint !== runtime.fingerprint ||
    currentPresent !== runtime.present ||
    currentRequired !== runtime.required;

  const nextVersion = hasExisting ? currentVersion + (changed ? 1 : 0) : 1;
  const lastChangedAt = changed && !dryRun ? nowIso() : normalizeText(existing?.lastChangedAt) || null;
  const effectiveMaxAgeDays = normalizeMaxAgeDays(
    maxAgeDaysOverride,
    normalizeMaxAgeDays(existing?.maxAgeDays, definition.maxAgeDays)
  );
  const ageDays = toAgeDays(lastChangedAt);
  const stale = runtime.required && (ageDays === null || ageDays > effectiveMaxAgeDays);

  return {
    id: definition.id,
    envVar: definition.envVar,
    label: definition.label,
    category: definition.category,
    maxAgeDays: effectiveMaxAgeDays,
    required: runtime.required,
    present: runtime.present,
    fingerprint: maskFingerprint(runtime.fingerprint),
    changed,
    pendingRotation: dryRun && changed,
    version: dryRun ? currentVersion : nextVersion,
    nextVersion: changed ? nextVersion : currentVersion,
    stale,
    ageDays,
    firstSeenAt: normalizeText(existing?.firstSeenAt) || null,
    lastSeenAt: normalizeText(existing?.lastSeenAt) || null,
    lastChangedAt: normalizeText(existing?.lastChangedAt) || null,
  };
}

async function createSecretRotationStore({
  filePath,
  config,
  definitions = null,
}) {
  const sourceDefinitions = Array.isArray(definitions)
    ? definitions
    : buildDefaultDefinitions(config);
  const normalizedDefinitions = [];
  const definitionsById = new Map();
  const fallbackMaxAgeDays = normalizeMaxAgeDays(config?.secretRotationMaxAgeDays, 90);
  for (const item of sourceDefinitions) {
    const normalized = normalizeDefinition(item, fallbackMaxAgeDays);
    if (!normalized) continue;
    if (definitionsById.has(normalized.id)) continue;
    definitionsById.set(normalized.id, normalized);
    normalizedDefinitions.push(normalized);
  }

  const rawState = await readJson(filePath, emptyState());
  const state = rawState && typeof rawState === 'object' ? rawState : emptyState();
  if (!state.secrets || typeof state.secrets !== 'object' || Array.isArray(state.secrets)) {
    state.secrets = {};
  }

  let needsSave = false;
  for (const definition of normalizedDefinitions) {
    const existing = state.secrets[definition.id];
    const normalized = normalizeSecretRecord(existing, definition);
    if (JSON.stringify(existing || null) !== JSON.stringify(normalized)) {
      state.secrets[definition.id] = normalized;
      needsSave = true;
    }
  }

  if (needsSave) {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function getRecord(secretId) {
    const id = normalizeSecretId(secretId);
    if (!id || !definitionsById.has(id)) return null;
    const definition = definitionsById.get(id);
    const existing = state.secrets[id];
    const normalized = normalizeSecretRecord(existing, definition);
    state.secrets[id] = normalized;
    return normalized;
  }

  async function captureSnapshot({
    actorUserId = null,
    source = 'manual_snapshot',
    note = '',
    dryRun = true,
    force = false,
    maxAgeDaysOverride = null,
  } = {}) {
    const snapshotTs = nowIso();
    const normalizedSource = normalizeText(source) || 'manual_snapshot';
    const normalizedNote = normalizeNote(note);
    const statuses = [];
    let changedCount = 0;
    let persistChanges = false;

    for (const definition of normalizedDefinitions) {
      const runtime = buildRuntimeSnapshot(definition, config);
      const existing = getRecord(definition.id);
      const status = buildSecretStatusRecord({
        definition,
        existing,
        runtime,
        dryRun,
        force,
        maxAgeDaysOverride,
      });
      statuses.push(status);

      if (!dryRun) {
        const record = getRecord(definition.id);
        if (!record) continue;

        if (record.label !== definition.label) {
          record.label = definition.label;
          persistChanges = true;
        }
        if (record.envVar !== definition.envVar) {
          record.envVar = definition.envVar;
          persistChanges = true;
        }
        if (record.category !== definition.category) {
          record.category = definition.category;
          persistChanges = true;
        }
        if (record.maxAgeDays !== definition.maxAgeDays) {
          record.maxAgeDays = definition.maxAgeDays;
          persistChanges = true;
        }
        if (record.required !== runtime.required) {
          record.required = runtime.required;
          persistChanges = true;
        }
        if (!record.firstSeenAt) {
          record.firstSeenAt = snapshotTs;
          persistChanges = true;
        }
        if (record.lastSeenAt !== snapshotTs) {
          record.lastSeenAt = snapshotTs;
          persistChanges = true;
        }

        if (status.changed) {
          changedCount += 1;
          record.currentVersion = status.nextVersion;
          record.currentFingerprint = runtime.fingerprint;
          record.currentPresent = runtime.present;
          record.lastChangedAt = snapshotTs;
          record.lastChangedBy = normalizeText(actorUserId) || null;

          const nextHistory = Array.isArray(record.history) ? [...record.history] : [];
          nextHistory.push({
            version: status.nextVersion,
            fingerprint: runtime.fingerprint,
            present: runtime.present,
            required: runtime.required,
            changedAt: snapshotTs,
            changedBy: normalizeText(actorUserId) || null,
            source: normalizedSource,
            note: normalizedNote,
          });
          record.history =
            nextHistory.length > MAX_HISTORY_PER_SECRET
              ? nextHistory.slice(nextHistory.length - MAX_HISTORY_PER_SECRET)
              : nextHistory;
          persistChanges = true;
        } else {
          record.currentVersion = parsePositiveInt(record.currentVersion) || 1;
          if (!record.lastChangedAt) {
            record.lastChangedAt = snapshotTs;
            persistChanges = true;
          }
          if (!record.currentFingerprint && runtime.fingerprint) {
            record.currentFingerprint = runtime.fingerprint;
            record.currentPresent = runtime.present;
            persistChanges = true;
          }
        }
      } else if (status.changed) {
        changedCount += 1;
      }
    }

    if (!dryRun) {
      if (persistChanges || changedCount > 0) {
        await save();
      }
    }

    const totals = {
      tracked: statuses.length,
      required: statuses.filter((item) => item.required).length,
      present: statuses.filter((item) => item.present).length,
      staleRequired: statuses.filter((item) => item.required && item.stale).length,
      pendingRotation: statuses.filter((item) => item.pendingRotation).length,
      changedCount,
    };

    return {
      generatedAt: snapshotTs,
      dryRun: dryRun === true,
      force: force === true,
      totals,
      secrets: statuses,
    };
  }

  async function getSecretsStatus({ maxAgeDays = null } = {}) {
    return captureSnapshot({
      dryRun: true,
      source: 'status_read',
      maxAgeDaysOverride: maxAgeDays,
    });
  }

  async function listSecretHistory({
    secretId = '',
    limit = 50,
  } = {}) {
    const limitInt = Math.max(1, Math.min(500, parsePositiveInt(limit) || 50));
    const normalizedSecretId = normalizeSecretId(secretId);
    const events = [];

    const targetIds = normalizedSecretId
      ? normalizedDefinitions
          .filter((item) => item.id === normalizedSecretId)
          .map((item) => item.id)
      : normalizedDefinitions.map((item) => item.id);

    for (const id of targetIds) {
      const definition = definitionsById.get(id);
      const record = getRecord(id);
      if (!definition || !record) continue;
      const history = Array.isArray(record.history) ? record.history : [];
      for (const item of history) {
        events.push({
          secretId: id,
          label: definition.label,
          envVar: definition.envVar,
          category: definition.category,
          version: parsePositiveInt(item.version) || 0,
          fingerprint: maskFingerprint(item.fingerprint),
          present: normalizeBool(item.present, false),
          required: normalizeBool(item.required, false),
          changedAt: normalizeText(item.changedAt) || null,
          changedBy: normalizeText(item.changedBy) || null,
          source: normalizeText(item.source) || 'snapshot',
          note: normalizeNote(item.note),
        });
      }
    }

    events.sort((a, b) => {
      const aTs = Date.parse(String(a.changedAt || ''));
      const bTs = Date.parse(String(b.changedAt || ''));
      if (Number.isFinite(aTs) && Number.isFinite(bTs)) return bTs - aTs;
      return String(b.changedAt || '').localeCompare(String(a.changedAt || ''));
    });

    return {
      count: Math.min(events.length, limitInt),
      events: events.slice(0, limitInt),
    };
  }

  await captureSnapshot({
    dryRun: false,
    source: 'startup_bootstrap',
    note: 'Startup reconciliation',
  });

  return {
    filePath,
    definitions: normalizedDefinitions.map((item) => ({
      id: item.id,
      envVar: item.envVar,
      label: item.label,
      category: item.category,
      maxAgeDays: item.maxAgeDays,
    })),
    getSecretsStatus,
    captureSnapshot,
    listSecretHistory,
  };
}

module.exports = {
  createSecretRotationStore,
};
