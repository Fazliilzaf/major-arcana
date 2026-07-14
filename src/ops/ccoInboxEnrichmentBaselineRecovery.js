// @ts-nocheck
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  mergeWorklistEnrichmentOutput,
  resolveLatestWorklistEnrichmentBaseline,
  clearWorklistConsumerResponseCache,
} = require('../routes/capabilities');
const { computeCcoInboxEnrichmentCoverage } = require('./ccoInboxEnrichmentCoverage');
const {
  saveCcoInboxEnrichmentCheckpoint,
  countEnrichedRows,
} = require('./ccoInboxEnrichmentCheckpoint');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function extractOutputData(entry = {}) {
  const direct = asObject(entry?.output?.data);
  const nested = asObject(direct.data);
  if (
    Array.isArray(direct.conversationWorklist) ||
    Array.isArray(direct.needsReplyToday) ||
    Array.isArray(direct.conversationEnrichment)
  ) {
    return direct;
  }
  return nested;
}

function isWorklistEntry(entry = {}) {
  const capabilityName = normalizeText(
    entry?.capability?.name || entry?.capabilityName
  ).toLowerCase();
  return capabilityName === 'analyzeinbox' || capabilityName === 'cco.inboxanalysis';
}

function outputConversationIds(outputData = {}) {
  return Array.from(
    new Set(
      [
        ...asArray(outputData.conversationEnrichment),
        ...asArray(outputData.conversationWorklist),
        ...asArray(outputData.needsReplyToday),
      ]
        .map((row) =>
          normalizeText(row?.conversationId || row?.conversationKey || row?.messageId || row?.id)
        )
        .filter(Boolean)
    )
  );
}

function validateBackupLabel(label = '') {
  const safeLabel = normalizeText(label);
  if (
    !safeLabel.startsWith('pre-enrichment-backfill-') ||
    path.basename(safeLabel) !== safeLabel
  ) {
    const error = new Error('Ogiltig enrichment-backupetikett.');
    error.statusCode = 422;
    throw error;
  }
  return safeLabel;
}

async function recoverCcoInboxEnrichmentBaseline({
  tenantId = '',
  mailboxIds = [],
  stateRoot = '',
  backupDir = '',
  capabilityAnalysisStorePath = '',
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  label = '',
  actorUserId = '',
  dryRun = true,
} = {}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
    throw new Error('Capability analysis store saknas.');
  }
  if (!ccoMailboxTruthStore) throw new Error('Mailbox truth store saknas.');

  if (typeof ccoMailboxTruthStore.ensureMailboxLoaded === 'function') {
    for (const mailboxId of asArray(mailboxIds)) {
      await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
    }
  }

  const safeLabel = validateBackupLabel(label);
  const sourcePath = path.join(
    path.resolve(backupDir || path.join(stateRoot, 'backups')),
    safeLabel,
    path.basename(capabilityAnalysisStorePath || 'capability-analysis.json')
  );
  const parsed = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
  const rawCandidates = asArray(parsed.entries)
    .filter((entry) => !tenantId || normalizeText(entry?.tenantId) === tenantId)
    .filter(isWorklistEntry)
    .map((entry) => ({
      entry,
      outputData: extractOutputData(entry),
    }))
    .map((candidate) => ({
      ...candidate,
      enrichedRowCount: countEnrichedRows(candidate.outputData),
    }))
    .filter((candidate) => candidate.enrichedRowCount > 0)
    .sort((left, right) => {
      if (right.enrichedRowCount !== left.enrichedRowCount) {
        return right.enrichedRowCount - left.enrichedRowCount;
      }
      return normalizeText(right.entry?.ts).localeCompare(normalizeText(left.entry?.ts));
    })
    .slice(0, 10);

  if (rawCandidates.length === 0) {
    const error = new Error('Backupen innehåller ingen enrichment-baseline.');
    error.statusCode = 404;
    throw error;
  }

  const currentBaseline = await resolveLatestWorklistEnrichmentBaseline({
    capabilityAnalysisStore,
    tenantId,
    mailboxIds,
  });
  const currentOutputData = asObject(currentBaseline?.selectedOutputData);
  const currentCoverage = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    baselineOutputDataOverride: currentOutputData,
    stateRoot,
  });

  const assessedCandidates = [];
  for (const candidate of rawCandidates) {
    const coverage = await computeCcoInboxEnrichmentCoverage({
      tenantId,
      mailboxIds,
      capabilityAnalysisStore,
      ccoMailboxTruthStore,
      ccoCustomerStore,
      baselineOutputDataOverride: candidate.outputData,
      stateRoot,
    });
    assessedCandidates.push({ ...candidate, coverage });
  }
  assessedCandidates.sort((left, right) => {
    const coverageDiff =
      Number(right.coverage?.enrichedConversationCount || 0) -
      Number(left.coverage?.enrichedConversationCount || 0);
    if (coverageDiff !== 0) return coverageDiff;
    return right.enrichedRowCount - left.enrichedRowCount;
  });

  const selected = assessedCandidates[0];
  const mergedOutputData = mergeWorklistEnrichmentOutput(
    selected.outputData,
    currentOutputData,
    { scopeConversationIds: outputConversationIds(currentOutputData) }
  );
  const mergedCoverage = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    baselineOutputDataOverride: mergedOutputData,
    stateRoot,
  });
  const currentEnriched = Number(currentCoverage.enrichedConversationCount || 0);
  const mergedEnriched = Number(mergedCoverage.enrichedConversationCount || 0);
  if (mergedEnriched <= currentEnriched) {
    const error = new Error(
      `Recovery stoppad: merged baseline förbättrar inte dagens coverage (${currentEnriched} -> ${mergedEnriched}).`
    );
    error.statusCode = 409;
    throw error;
  }

  const result = {
    ok: true,
    dryRun: dryRun !== false,
    label: safeLabel,
    sourcePath,
    selectedEntryId: normalizeText(selected.entry?.id) || null,
    selectedRawEnrichedRowCount: selected.enrichedRowCount,
    candidateCount: assessedCandidates.length,
    current: {
      entryId: normalizeText(currentBaseline?.selectedEntry?.id) || null,
      enrichedConversationCount: currentEnriched,
      gapCount: Number(currentCoverage.gapCount || 0),
    },
    selectedBackup: {
      enrichedConversationCount: Number(selected.coverage?.enrichedConversationCount || 0),
      gapCount: Number(selected.coverage?.gapCount || 0),
    },
    merged: {
      enrichedConversationCount: mergedEnriched,
      gapCount: Number(mergedCoverage.gapCount || 0),
      coveragePercent: Number(mergedCoverage.coveragePercent || 0),
      enrichedRowCount: countEnrichedRows(mergedOutputData),
    },
  };
  if (dryRun !== false) return result;

  const requestId = require('node:crypto').randomUUID();
  const entry = await capabilityAnalysisStore.append({
    tenantId,
    capabilityName: 'AnalyzeInbox',
    capabilityVersion: 'v1',
    persistStrategy: 'analysis',
    decision: 'allow',
    actor: { id: normalizeText(actorUserId) || 'recovery', role: 'OWNER' },
    runId: requestId,
    correlationId: requestId,
    input: {
      mailboxIds,
      trigger: 'verified_baseline_recovery',
      mode: 'recovered_published_baseline',
      sourceLabel: safeLabel,
      sourceEntryId: result.selectedEntryId,
    },
    output: { data: mergedOutputData, metadata: {}, warnings: [] },
    metadata: {
      source: 'verified_baseline_recovery',
      mailboxIds,
      sourceLabel: safeLabel,
      sourceEntryId: result.selectedEntryId,
    },
  });
  const checkpoint = await saveCcoInboxEnrichmentCheckpoint({
    stateRoot,
    tenantId,
    outputData: mergedOutputData,
    metadata: {
      phase: 'published_baseline',
      entryId: entry.id,
      mailboxIds,
      recoveryLabel: safeLabel,
      recoverySourceEntryId: result.selectedEntryId,
    },
  });
  clearWorklistConsumerResponseCache();
  return {
    ...result,
    dryRun: false,
    publishedEntryId: entry.id,
    checkpoint,
  };
}

module.exports = {
  recoverCcoInboxEnrichmentBaseline,
  extractOutputData,
  validateBackupLabel,
};
