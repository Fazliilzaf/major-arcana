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

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasCheckpointEnrichmentSignals(row = {}) {
  const intent = normalizeText(row.intent).toLowerCase();
  if (intent && !['unknown', 'unspecified', 'none'].includes(intent)) {
    return true;
  }
  if (normalizeText(row.workflowLane)) return true;
  if (normalizeText(row.dominantRisk)) return true;
  if (normalizeText(row.priorityLevel)) return true;
  if (normalizeText(row.messageClassification)) return true;
  if (normalizeText(row.recommendedAction)) return true;
  if (normalizeText(row.slaStatus)) return true;
  return false;
}

async function writeJsonAtomic(filePath, data) {
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function resolveCheckpointPath(stateRoot = '', tenantId = '') {
  const safeTenantId = normalizeText(tenantId).replace(/[^\w.-]+/g, '_') || 'default';
  return path.join(
    path.resolve(String(stateRoot || '').trim() || process.cwd()),
    `cco-inbox-enrichment-checkpoint.${safeTenantId}.json`
  );
}

function countEnrichedRows(outputData = {}) {
  const rows = [
    ...asArray(outputData.conversationWorklist),
    ...asArray(outputData.needsReplyToday),
  ];
  return rows.filter((row) => hasCheckpointEnrichmentSignals(row)).length;
}

async function saveCcoInboxEnrichmentCheckpoint({
  stateRoot = '',
  tenantId = '',
  outputData = null,
  metadata = {},
} = {}) {
  if (!outputData || typeof outputData !== 'object') {
    return { ok: false, reason: 'output_missing' };
  }
  const filePath = resolveCheckpointPath(stateRoot, tenantId);
  const payload = {
    version: 1,
    tenantId: normalizeText(tenantId) || null,
    savedAt: new Date().toISOString(),
    enrichedRowCount: countEnrichedRows(outputData),
    rowCount:
      asArray(outputData.conversationWorklist).length + asArray(outputData.needsReplyToday).length,
    outputData,
    metadata: asObject(metadata),
  };
  await writeJsonAtomic(filePath, payload);
  return {
    ok: true,
    filePath,
    enrichedRowCount: payload.enrichedRowCount,
    rowCount: payload.rowCount,
    savedAt: payload.savedAt,
  };
}

async function loadCcoInboxEnrichmentCheckpoint({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveCheckpointPath(stateRoot, tenantId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const outputData = asObject(parsed?.outputData);
    if (
      !Array.isArray(outputData.conversationWorklist) &&
      !Array.isArray(outputData.needsReplyToday)
    ) {
      return { ok: false, reason: 'checkpoint_empty', filePath };
    }
    return {
      ok: true,
      filePath,
      savedAt: normalizeText(parsed?.savedAt) || null,
      enrichedRowCount: Number(parsed?.enrichedRowCount || countEnrichedRows(outputData)),
      rowCount: Number(parsed?.rowCount || 0),
      outputData,
      metadata: asObject(parsed?.metadata),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: false, reason: 'checkpoint_missing', filePath };
    }
    return {
      ok: false,
      reason: 'checkpoint_read_failed',
      filePath,
      error: error?.message || String(error),
    };
  }
}

async function clearCcoInboxEnrichmentCheckpoint({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveCheckpointPath(stateRoot, tenantId);
  try {
    await fs.unlink(filePath);
    return { ok: true, filePath };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: true, filePath, missing: true };
    }
    return { ok: false, filePath, error: error?.message || String(error) };
  }
}

module.exports = {
  resolveCheckpointPath,
  saveCcoInboxEnrichmentCheckpoint,
  loadCcoInboxEnrichmentCheckpoint,
  clearCcoInboxEnrichmentCheckpoint,
  countEnrichedRows,
};
