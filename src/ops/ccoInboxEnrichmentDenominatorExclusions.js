// @ts-nocheck
const fs = require('node:fs/promises');
const path = require('node:path');

const EXCLUSION_BUCKETS = Object.freeze([
  'duplicate_or_alias',
  'system_scrap_should_exclude',
  'outside_supported_mailbox',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveExclusionsFilePath(stateRoot = '', tenantId = '') {
  const safeTenant = normalizeText(tenantId).replace(/[^a-z0-9_-]+/gi, '_') || 'default';
  return path.join(
    normalizeText(stateRoot) || process.cwd(),
    `cco-inbox-enrichment-denominator-exclusions.${safeTenant}.json`
  );
}

async function loadDenominatorExclusions({ stateRoot = '', tenantId = '' } = {}) {
  const filePath = resolveExclusionsFilePath(stateRoot, tenantId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const ids = new Set(
      asArray(parsed.conversationKeys)
        .map((item) => normalizeText(item).toLowerCase())
        .filter(Boolean)
    );
    return {
      ok: true,
      filePath,
      conversationKeys: ids,
      summary: parsed.summary || null,
      savedAt: parsed.savedAt || null,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: true, filePath, conversationKeys: new Set(), summary: null, savedAt: null };
    }
    throw error;
  }
}

async function saveDenominatorExclusions({
  stateRoot = '',
  tenantId = '',
  conversationKeys = [],
  summary = {},
} = {}) {
  const filePath = resolveExclusionsFilePath(stateRoot, tenantId);
  const unique = Array.from(
    new Set(
      asArray(conversationKeys)
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ).sort();
  const payload = {
    version: 1,
    tenantId: normalizeText(tenantId) || null,
    savedAt: new Date().toISOString(),
    conversationKeys: unique,
    summary,
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { ok: true, filePath, count: unique.length, summary };
}

function buildDenominatorExclusionsFromGapDetails(details = []) {
  const conversationKeys = [];
  const bucketCounts = Object.fromEntries(EXCLUSION_BUCKETS.map((bucket) => [bucket, 0]));
  for (const row of asArray(details)) {
    const bucket = normalizeText(row.primaryBucket);
    if (!EXCLUSION_BUCKETS.includes(bucket) && !row.shouldExcludeFromDenominator) continue;
    const key = normalizeText(row.conversationKey || row.threadKey);
    if (!key) continue;
    conversationKeys.push(key);
    if (bucketCounts[bucket] !== undefined) bucketCounts[bucket] += 1;
  }
  return {
    conversationKeys,
    bucketCounts,
    totalExcluded: conversationKeys.length,
  };
}

function applyDenominatorExclusionsToCoverage(coverage = {}, exclusionKeys = new Set()) {
  const excludedSet =
    exclusionKeys instanceof Set
      ? exclusionKeys
      : new Set(
          asArray(exclusionKeys)
            .map((item) => normalizeText(item).toLowerCase())
            .filter(Boolean)
        );

  const gapIds = asArray(coverage.gapConversationIds);
  let excludedFromDenominator = 0;
  let excludedUnenriched = 0;
  for (const gapId of gapIds) {
    const normalized = normalizeText(gapId).toLowerCase();
    if (!normalized) continue;
    if (excludedSet.has(normalized)) {
      excludedUnenriched += 1;
      excludedFromDenominator += 1;
      continue;
    }
    const colon = normalized.lastIndexOf(':');
    if (colon > 0 && excludedSet.has(normalized.slice(colon + 1))) {
      excludedUnenriched += 1;
      excludedFromDenominator += 1;
    }
  }

  const truthConversationCount = Number(coverage.truthConversationCount || 0);
  const enrichedConversationCount = Number(coverage.enrichedConversationCount || 0);
  const effectiveDenominator = Math.max(1, truthConversationCount - excludedFromDenominator);
  const effectiveGap = Math.max(0, Number(coverage.gapCount || 0) - excludedUnenriched);
  const adjustedCoveragePercent =
    Math.round((enrichedConversationCount / effectiveDenominator) * 10000) / 100;
  const threshold = Number(coverage.readyThresholdPercent || 99.5);
  const adjustedReadyForWork = effectiveGap === 0 || adjustedCoveragePercent >= threshold;

  return {
    ...coverage,
    denominatorExclusions: {
      excludedConversationCount: excludedFromDenominator,
      excludedUnenrichedGapCount: excludedUnenriched,
      effectiveDenominator,
      effectiveGapCount: effectiveGap,
    },
    adjustedCoveragePercent,
    adjustedReadyForWork,
    readyForWork: adjustedReadyForWork,
    coveragePercent: adjustedCoveragePercent,
    gapCount: effectiveGap,
  };
}

module.exports = {
  EXCLUSION_BUCKETS,
  resolveExclusionsFilePath,
  loadDenominatorExclusions,
  saveDenominatorExclusions,
  buildDenominatorExclusionsFromGapDetails,
  applyDenominatorExclusionsToCoverage,
};
