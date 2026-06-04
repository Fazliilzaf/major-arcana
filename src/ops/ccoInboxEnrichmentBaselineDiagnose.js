// @ts-nocheck
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  loadCcoInboxEnrichmentCheckpoint,
  countEnrichedRows,
} = require('./ccoInboxEnrichmentCheckpoint');
const { computeCcoInboxEnrichmentCoverage } = require('./ccoInboxEnrichmentCoverage');
const { resolveLatestWorklistEnrichmentBaseline } = require('../routes/capabilities');

const TARGET_ENRICHED = 8563;
const TARGET_GAP = 775;
const TARGET_COVERAGE = 91.7;
const PRE_BACKFILL_ENRICHED_MAX = 250;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ok: false, reason: 'missing', filePath };
    }
    return { ok: false, reason: 'read_failed', filePath, error: error?.message || String(error) };
  }
}

function summarizeCapabilityStoreFile(parsed, { tenantId = '', targetEntryIdPrefix = '' } = {}) {
  if (!parsed || parsed.ok === false) {
    return {
      ok: false,
      reason: parsed?.reason || 'invalid',
      filePath: parsed?.filePath || null,
      entryCount: 0,
      bestEnrichedCount: 0,
      targetEntry: null,
      isPreBackfillLike: false,
    };
  }
  const entries = asArray(parsed.entries).filter(
    (entry) => !tenantId || normalizeText(entry?.tenantId) === tenantId
  );
  let bestEnrichedCount = 0;
  let bestEntryId = null;
  let targetEntry = null;
  for (const entry of entries) {
    const summary = summarizeWorklistEntry(entry);
    const enrichedCount = summary.enrichedCount;
    if (enrichedCount > bestEnrichedCount) {
      bestEnrichedCount = enrichedCount;
      bestEntryId = entry?.id || null;
    }
    const entryId = normalizeText(entry?.id);
    if (
      targetEntryIdPrefix &&
      (entryId === targetEntryIdPrefix || entryId.startsWith(targetEntryIdPrefix))
    ) {
      targetEntry = {
        id: entryId,
        ts: normalizeText(entry?.ts) || null,
        enrichedCount,
        rowCount: summary.rowCount,
      };
    }
  }
  return {
    ok: true,
    entryCount: entries.length,
    bestEnrichedCount,
    bestEntryId,
    targetEntry,
    isPreBackfillLike: bestEnrichedCount > 0 && bestEnrichedCount <= PRE_BACKFILL_ENRICHED_MAX,
    matchesPass6:
      bestEnrichedCount >= TARGET_ENRICHED - 120 && bestEnrichedCount <= TARGET_ENRICHED + 120,
  };
}

function summarizeWorklistEntry(entry = {}) {
  const directOutputData = asObject(entry?.output?.data);
  const nestedOutputData = asObject(directOutputData.data);
  const outputData =
    Array.isArray(directOutputData.conversationWorklist) ||
    Array.isArray(directOutputData.needsReplyToday)
      ? directOutputData
      : Array.isArray(nestedOutputData.conversationWorklist) ||
          Array.isArray(nestedOutputData.needsReplyToday)
        ? nestedOutputData
        : directOutputData;
  const conversationWorklist = asArray(outputData.conversationWorklist);
  const needsReplyToday = asArray(outputData.needsReplyToday);
  return {
    outputData,
    rowCount: conversationWorklist.length + needsReplyToday.length,
    enrichedCount: countEnrichedRows(outputData),
  };
}

async function summarizeCheckpointFile(filePath) {
  const parsed = await readJsonFile(filePath);
  if (!parsed || parsed.ok === false) {
    return {
      ok: false,
      reason: parsed?.reason || 'missing',
      filePath,
      enrichedRowCount: 0,
      matchesPass6: false,
      isPreBackfillLike: false,
    };
  }
  const outputData = asObject(parsed?.outputData);
  const enrichedRowCount = Number(parsed?.enrichedRowCount || countEnrichedRows(outputData));
  return {
    ok: true,
    filePath,
    savedAt: normalizeText(parsed?.savedAt) || null,
    enrichedRowCount,
    rowCount: Number(parsed?.rowCount || 0),
    matchesPass6:
      enrichedRowCount >= TARGET_ENRICHED - 120 && enrichedRowCount <= TARGET_ENRICHED + 120,
    isPreBackfillLike: enrichedRowCount > 0 && enrichedRowCount <= PRE_BACKFILL_ENRICHED_MAX,
  };
}

async function listEnrichmentBackupLabels(backupRoot) {
  try {
    const names = await fs.readdir(backupRoot);
    return names
      .filter((name) => name.startsWith('pre-enrichment-backfill-'))
      .sort((left, right) => right.localeCompare(left));
  } catch {
    return [];
  }
}

function scoreRecoverySource(source = {}) {
  let score = 0;
  if (source.matchesPass6) score += 1000;
  if (source.targetEntry?.enrichedCount >= TARGET_ENRICHED - 120) score += 500;
  if (source.enrichedRowCount >= TARGET_ENRICHED - 120) score += 500;
  if (source.bestEnrichedCount >= TARGET_ENRICHED - 120) score += 400;
  if (source.isPreBackfillLike) score -= 2000;
  if (source.kind === 'live_disk') score += 50;
  if (source.kind === 'live_checkpoint') score += 40;
  return score;
}

function buildRecommendation(sources = []) {
  const ranked = [...sources]
    .filter((source) => source.ok !== false && !source.isPreBackfillLike)
    .sort((left, right) => scoreRecoverySource(right) - scoreRecoverySource(left));
  const best = ranked[0] || null;
  if (!best || scoreRecoverySource(best) < 400) {
    return {
      action: 'stop',
      reason: 'no_pass6_source_found',
      label: null,
      phase: null,
    };
  }
  return {
    action: 'restore',
    reason: best.matchesPass6 ? 'pass6_match' : 'best_available_enriched_source',
    label: best.label || null,
    phase: best.restorePhase || 'reload-capability',
    sourceKind: best.kind,
    expectedEnriched:
      best.enrichedRowCount || best.bestEnrichedCount || best.targetEntry?.enrichedCount,
    targetEntryId: best.targetEntry?.id || best.bestEntryId || null,
  };
}

async function diagnoseEnrichmentBaselineRecovery({
  tenantId = '',
  mailboxIds = [],
  stateRoot = '',
  backupDir = '',
  capabilityAnalysisStorePath = '',
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  targetEntryIdPrefix = '05dd08b4',
} = {}) {
  const resolvedBackupDir =
    normalizeText(backupDir) || path.join(path.resolve(stateRoot || ''), 'backups');
  const capabilityFileName = path.basename(
    capabilityAnalysisStorePath || 'capability-analysis.json'
  );
  const checkpointFileName = `cco-inbox-enrichment-checkpoint.${normalizeText(tenantId).replace(/[^\w.-]+/g, '_') || 'default'}.json`;
  const liveCapabilityPath = path.resolve(capabilityAnalysisStorePath || '');
  const liveCheckpointPath = path.join(path.resolve(stateRoot || ''), checkpointFileName);

  const memoryBaseline = capabilityAnalysisStore
    ? await resolveLatestWorklistEnrichmentBaseline({
        capabilityAnalysisStore,
        tenantId,
        mailboxIds,
      })
    : null;
  const memoryCoverage = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    stateRoot,
  });

  const liveDiskParsed = await readJsonFile(liveCapabilityPath);
  const liveDisk = {
    kind: 'live_disk',
    label: null,
    restorePhase: 'reload-capability',
    filePath: liveCapabilityPath,
    ...summarizeCapabilityStoreFile(liveDiskParsed, { tenantId, targetEntryIdPrefix }),
  };

  const liveCheckpointRaw = await summarizeCheckpointFile(liveCheckpointPath);
  const liveCheckpoint = {
    kind: 'live_checkpoint',
    label: null,
    restorePhase: 'restore-capability',
    ...liveCheckpointRaw,
    enrichedRowCount: liveCheckpointRaw.enrichedRowCount,
  };

  const backupLabels = await listEnrichmentBackupLabels(resolvedBackupDir);
  const backups = [];
  for (const label of backupLabels) {
    const dir = path.join(resolvedBackupDir, label);
    const capabilityPath = path.join(dir, capabilityFileName);
    const checkpointPath = path.join(dir, checkpointFileName);
    const capabilityParsed = await readJsonFile(capabilityPath);
    const capabilitySummary = summarizeCapabilityStoreFile(capabilityParsed, {
      tenantId,
      targetEntryIdPrefix,
    });
    const checkpointSummary = await summarizeCheckpointFile(checkpointPath);
    backups.push({
      label,
      dir,
      capability: {
        filePath: capabilityPath,
        ...capabilitySummary,
      },
      checkpoint: checkpointSummary,
    });
  }

  const flatSources = [
    liveDisk,
    {
      ...liveCheckpoint,
      bestEnrichedCount: liveCheckpoint.enrichedRowCount,
      targetEntry: liveCheckpoint.matchesPass6
        ? { id: 'checkpoint', enrichedCount: liveCheckpoint.enrichedRowCount }
        : null,
    },
    ...backups.flatMap((backup) => [
      {
        kind: 'backup_capability',
        label: backup.label,
        restorePhase: 'restore-capability',
        filePath: backup.capability.filePath,
        ...backup.capability,
        enrichedRowCount: backup.capability.bestEnrichedCount,
      },
      {
        kind: 'backup_checkpoint',
        label: backup.label,
        restorePhase: 'restore-capability',
        filePath: backup.checkpoint.filePath,
        ok: backup.checkpoint.ok,
        enrichedRowCount: backup.checkpoint.enrichedRowCount,
        bestEnrichedCount: backup.checkpoint.enrichedRowCount,
        matchesPass6: backup.checkpoint.matchesPass6,
        isPreBackfillLike: backup.checkpoint.isPreBackfillLike,
        targetEntry: backup.checkpoint.matchesPass6
          ? { id: 'checkpoint', enrichedCount: backup.checkpoint.enrichedRowCount }
          : null,
      },
    ]),
  ];

  const recommendation = buildRecommendation(flatSources);
  const unsafeSources = flatSources.filter((source) => source.isPreBackfillLike);

  return {
    generatedAt: new Date().toISOString(),
    tenantId: normalizeText(tenantId) || null,
    targets: {
      enrichedConversationCount: TARGET_ENRICHED,
      gapCount: TARGET_GAP,
      coveragePercent: TARGET_COVERAGE,
      entryIdPrefix: targetEntryIdPrefix,
    },
    memory: {
      enrichedConversationCount: memoryCoverage.enrichedConversationCount,
      gapCount: memoryCoverage.gapCount,
      coveragePercent: memoryCoverage.coveragePercent,
      lastEnrichmentEntryId: memoryCoverage.lastEnrichmentEntryId,
      baselineEntryId: normalizeText(memoryBaseline?.selectedEntry?.id) || null,
    },
    liveDisk,
    liveCheckpoint,
    backups,
    unsafePreBackfillSources: unsafeSources.map((source) => ({
      kind: source.kind,
      label: source.label || null,
      enriched: source.enrichedRowCount || source.bestEnrichedCount || 0,
    })),
    recommendation,
  };
}

module.exports = {
  TARGET_ENRICHED,
  TARGET_GAP,
  TARGET_COVERAGE,
  PRE_BACKFILL_ENRICHED_MAX,
  diagnoseEnrichmentBaselineRecovery,
};
