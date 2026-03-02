const {
  isValidEmail,
  normalizeMailboxAddress,
  toWritingProfile,
} = require('./writingIdentityRegistry');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toSource(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'manual') return 'manual';
  return 'auto';
}

const WRITING_PROFILE_CAPABILITY_NAME = 'WritingIdentityProfile';
const WRITING_PROFILE_TYPE = 'WritingIdentityProfile';

function normalizeStoredProfileRecord(source = {}, fallbackTs = '') {
  const safe = asObject(source);
  const mailbox = normalizeMailboxAddress(safe.mailbox || safe.mailboxAddress || safe.mailboxId);
  if (!isValidEmail(mailbox)) return null;
  const versionRaw = Number(safe.version);
  const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.round(versionRaw) : 1;
  const createdAt = toIso(safe.createdAt) || toIso(fallbackTs) || new Date().toISOString();
  const updatedAt = toIso(safe.updatedAt) || toIso(fallbackTs) || createdAt;
  return {
    type: WRITING_PROFILE_TYPE,
    mailbox,
    version,
    profile: toWritingProfile(safe.profile),
    source: toSource(safe.source),
    createdAt,
    updatedAt,
  };
}

function toStoredProfileRecordFromEntry(entry = {}) {
  const safeEntry = asObject(entry);
  const output = asObject(safeEntry.output);
  const outputType = normalizeText(output.type);
  if (outputType !== WRITING_PROFILE_TYPE) return null;
  return normalizeStoredProfileRecord(output, safeEntry.ts);
}

function toProfilesByMailboxMap(records = []) {
  const map = {};
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const mailbox = normalizeMailboxAddress(record.mailbox);
    if (!isValidEmail(mailbox)) continue;
    if (!map[mailbox]) {
      map[mailbox] = record;
      continue;
    }
    const existingVersion = Number(map[mailbox].version || 0);
    const nextVersion = Number(record.version || 0);
    if (nextVersion > existingVersion) {
      map[mailbox] = record;
      continue;
    }
    if (nextVersion === existingVersion) {
      const existingTs = Date.parse(map[mailbox].updatedAt || map[mailbox].createdAt || '');
      const nextTs = Date.parse(record.updatedAt || record.createdAt || '');
      if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs)) {
        map[mailbox] = record;
      }
    }
  }
  return map;
}

async function listWritingIdentityProfiles({
  analysisStore = null,
  tenantId = '',
  limit = 500,
} = {}) {
  if (!analysisStore || typeof analysisStore.list !== 'function') return [];
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) return [];
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const entries = await analysisStore.list({
    tenantId: normalizedTenantId,
    capabilityName: WRITING_PROFILE_CAPABILITY_NAME,
    limit: safeLimit,
  });
  const records = (Array.isArray(entries) ? entries : [])
    .map((entry) => toStoredProfileRecordFromEntry(entry))
    .filter(Boolean);
  const map = toProfilesByMailboxMap(records);
  return Object.values(map)
    .sort((left, right) => String(left.mailbox).localeCompare(String(right.mailbox)));
}

async function getWritingIdentityProfile({
  analysisStore = null,
  tenantId = '',
  mailboxAddress = '',
} = {}) {
  const mailbox = normalizeMailboxAddress(mailboxAddress);
  if (!isValidEmail(mailbox)) return null;
  const profiles = await listWritingIdentityProfiles({
    analysisStore,
    tenantId,
    limit: 2000,
  });
  return profiles.find((item) => item.mailbox === mailbox) || null;
}

async function writeWritingProfileAuditEvent({
  authStore = null,
  tenantId = '',
  actorUserId = null,
  mailbox = '',
  source = 'manual',
  version = 1,
  correlationId = null,
}) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return null;
  return authStore.addAuditEvent({
    tenantId: normalizeText(tenantId),
    actorUserId: normalizeText(actorUserId) || null,
    action: 'writing.profile.updated',
    outcome: 'success',
    targetType: 'writing_profile',
    targetId: mailbox,
    metadata: {
      mailbox,
      source: toSource(source),
      version: Number(version || 1),
      correlationId: normalizeText(correlationId) || null,
    },
  });
}

async function upsertWritingIdentityProfile({
  analysisStore = null,
  authStore = null,
  tenantId = '',
  actorUserId = null,
  mailboxAddress = '',
  profile = null,
  source = 'manual',
  correlationId = null,
} = {}) {
  if (!analysisStore || typeof analysisStore.append !== 'function') {
    throw new Error('analysisStore saknas för Writing Identity persist.');
  }
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) {
    throw new Error('tenantId krävs för Writing Identity persist.');
  }

  const mailbox = normalizeMailboxAddress(mailboxAddress);
  if (!isValidEmail(mailbox)) {
    throw new Error('Ogiltig mailbox-adress för Writing Identity.');
  }

  const existing = await getWritingIdentityProfile({
    analysisStore,
    tenantId: normalizedTenantId,
    mailboxAddress: mailbox,
  });
  const nowIso = new Date().toISOString();
  const record = {
    type: WRITING_PROFILE_TYPE,
    mailbox,
    version: Number(existing?.version || 0) + 1,
    profile: toWritingProfile(profile || existing?.profile || {}),
    source: toSource(source),
    createdAt: toIso(existing?.createdAt) || nowIso,
    updatedAt: nowIso,
  };

  await analysisStore.append({
    tenantId: normalizedTenantId,
    capability: {
      name: WRITING_PROFILE_CAPABILITY_NAME,
      version: '1.0.0',
      persistStrategy: 'analysis',
    },
    decision: 'allow',
    runId: `writing_profile:${mailbox}:${Date.now()}`,
    capabilityRunId: `writing_profile:${mailbox}:${record.version}`,
    correlationId: normalizeText(correlationId) || null,
    actor: {
      id: normalizeText(actorUserId) || null,
      role: 'owner',
    },
    input: {
      mailbox,
      source: record.source,
    },
    output: record,
    metadata: {
      mailbox,
      source: record.source,
      eventType: 'writing.identity.profile',
    },
  });

  await writeWritingProfileAuditEvent({
    authStore,
    tenantId: normalizedTenantId,
    actorUserId,
    mailbox,
    source: record.source,
    version: record.version,
    correlationId,
  });

  return record;
}

module.exports = {
  WRITING_PROFILE_CAPABILITY_NAME,
  WRITING_PROFILE_TYPE,
  getWritingIdentityProfile,
  listWritingIdentityProfiles,
  toProfilesByMailboxMap,
  toStoredProfileRecordFromEntry,
  upsertWritingIdentityProfile,
};
