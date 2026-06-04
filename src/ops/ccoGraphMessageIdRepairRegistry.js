// @ts-nocheck
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hashToken(value = '', maxLen = 120) {
  const raw = normalizeText(value).slice(0, maxLen);
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

function resolveRegistryFilePath(stateRoot = '', tenantId = '') {
  const safeTenant = normalizeText(tenantId).replace(/[^a-z0-9_-]+/gi, '_') || 'default';
  return path.join(
    normalizeText(stateRoot) || process.cwd(),
    `cco-inbox-graph-message-id-repairs.${safeTenant}.json`
  );
}

async function loadRepairRegistry({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveRegistryFilePath(stateRoot, tenantId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const repairs = asObjectMap(parsed.repairs);
    return {
      ok: true,
      filePath,
      version: parsed.version || 1,
      savedAt: parsed.savedAt || null,
      repairs,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, filePath, version: 1, savedAt: null, repairs: {} };
    }
    throw error;
  }
}

function asObjectMap(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, val] of Object.entries(value)) {
    const normalized = normalizeText(key).toLowerCase();
    if (normalized && val && typeof val === 'object') out[normalized] = val;
  }
  return out;
}

function buildRepairRecord({
  conversationKey = '',
  repairedByRunId = '',
  repairSource = 'ingestion_ledger',
  newGraphMessageId = '',
  oldGraphMessageId = null,
  actorUserId = null,
} = {}) {
  const key = normalizeText(conversationKey);
  return {
    conversationKey: key,
    repairedAt: new Date().toISOString(),
    repairedByRunId: normalizeText(repairedByRunId) || null,
    repairSource: normalizeText(repairSource) || 'ingestion_ledger',
    oldGraphMessageId: normalizeText(oldGraphMessageId) || null,
    newGraphMessageIdHash: hashToken(newGraphMessageId),
    actorUserId: normalizeText(actorUserId) || null,
  };
}

function isConversationRepaired(registry = {}, conversationKey = '', expectedGraphMessageId = '') {
  const normalized = normalizeText(conversationKey).toLowerCase();
  if (!normalized) return false;
  const record = registry?.repairs?.[normalized] || registry?.[normalized] || null;
  if (!record) return false;
  const expectedHash = hashToken(expectedGraphMessageId);
  if (expectedGraphMessageId && record.newGraphMessageIdHash !== expectedHash) return false;
  return Boolean(record.newGraphMessageIdHash);
}

function buildRepairedConversationKeySet(registry = {}) {
  const repairs = registry?.repairs || registry || {};
  return new Set(
    Object.entries(repairs)
      .filter(([, record]) => Boolean(record?.newGraphMessageIdHash))
      .map(([key]) => normalizeText(key).toLowerCase())
      .filter(Boolean)
  );
}

async function saveRepairRegistry({
  stateRoot = '',
  tenantId = '',
  repairs = {},
  metadata = {},
} = {}) {
  const filePath = resolveRegistryFilePath(stateRoot, tenantId);
  const existing = await loadRepairRegistry({ stateRoot, tenantId });
  const merged = { ...existing.repairs, ...asObjectMap(repairs) };
  const payload = {
    version: 1,
    tenantId: normalizeText(tenantId) || null,
    savedAt: new Date().toISOString(),
    repairs: merged,
    metadata,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, filePath, count: Object.keys(merged).length };
}

async function recordRepairBatch({
  stateRoot = '',
  tenantId = '',
  runId = '',
  records = [],
  metadata = {},
} = {}) {
  const existing = await loadRepairRegistry({ stateRoot, tenantId });
  const batch = {};
  for (const item of asArray(records)) {
    const key = normalizeText(item?.conversationKey).toLowerCase();
    if (!key) continue;
    batch[key] = buildRepairRecord({
      conversationKey: key,
      repairedByRunId: runId,
      repairSource: item.repairSource,
      newGraphMessageId: item.newGraphMessageId,
      oldGraphMessageId: item.oldGraphMessageId,
      actorUserId: item.actorUserId,
    });
  }
  return saveRepairRegistry({
    stateRoot,
    tenantId,
    repairs: { ...existing.repairs, ...batch },
    metadata: { ...metadata, runId, batchSize: Object.keys(batch).length },
  });
}

module.exports = {
  hashToken,
  resolveRegistryFilePath,
  loadRepairRegistry,
  saveRepairRegistry,
  buildRepairRecord,
  isConversationRepaired,
  buildRepairedConversationKeySet,
  recordRepairBatch,
};
