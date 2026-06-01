// @ts-nocheck
const { computeCcoInboxEnrichmentCoverage } = require('./ccoInboxEnrichmentCoverage');
const { loadCcoInboxEnrichmentCheckpoint } = require('./ccoInboxEnrichmentCheckpoint');
const { countEnrichedRows } = require('./ccoInboxEnrichmentCheckpoint');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function summarizeWorklistSignals(outputData = {}) {
  const rows = [
    ...asArray(outputData.conversationWorklist),
    ...asArray(outputData.needsReplyToday),
  ];
  const lanes = {};
  let sla = 0;
  let risk = 0;
  let needsAction = 0;
  let trueUnanswered = 0;
  for (const row of rows) {
    const lane = String(row?.workflowLane || row?.lane || 'none');
    lanes[lane] = (lanes[lane] || 0) + 1;
    if (row?.slaStatus) sla += 1;
    if (row?.dominantRisk || row?.riskLabel) risk += 1;
    if (row?.recommendedAction || row?.nextActionLabel) needsAction += 1;
    if (row?.needsReply === true || row?.awaitingReply === true) trueUnanswered += 1;
  }
  return {
    worklistRows: rows.length,
    lanes,
    sla,
    risk,
    needsAction,
    trueUnanswered,
  };
}

async function buildCcoInboxEnrichmentBackfillPlan({
  tenantId = '',
  mailboxIds = [],
  capabilityAnalysisStore = null,
  ccoMailboxTruthStore = null,
  ccoCustomerStore = null,
  stateRoot = '',
  canaryLimit = 500,
} = {}) {
  const coverage = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    stateRoot,
  });
  const checkpoint = await loadCcoInboxEnrichmentCheckpoint({ stateRoot, tenantId });
  const checkpointSignals = checkpoint?.ok ? summarizeWorklistSignals(checkpoint.outputData) : null;

  const truthConversationCount = Number(coverage.truthConversationCount || 0);
  const gapCount = Number(coverage.gapCount || 0);
  const enrichedConversationCount = Number(coverage.enrichedConversationCount || 0);
  const effectiveCanary = Math.max(
    1,
    Math.min(gapCount || truthConversationCount, Number(canaryLimit) || 500)
  );

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    mode: 'truth_only',
    graphFetch: false,
    truthConversationCount,
    enrichedConversationCount,
    gapCount,
    coveragePercent: coverage.coveragePercent,
    eligibleConversations: gapCount,
    excludedEstimate: {
      systemScrapDuplicatesOutOfScope: 'computed_after_canary_gap_analysis',
      note: 'Exakta exclude-tal kräver gap-export efter canary/full backfill',
    },
    expectedAfterFullBackfill: {
      enrichedConversationCount: truthConversationCount,
      gapCount: 0,
      coveragePercent: 100,
      readyForWorkTarget: 99.5,
    },
    canary: {
      limit: effectiveCanary,
      expectedEnrichedDeltaMin: Math.floor(effectiveCanary * 0.85),
      expectedEnrichedDeltaMax: effectiveCanary,
    },
    checkpoint: checkpoint?.ok
      ? {
          savedAt: checkpoint.savedAt,
          enrichedRowCount: Number(
            checkpoint.enrichedRowCount || countEnrichedRows(checkpoint.outputData)
          ),
          ...checkpointSignals,
        }
      : null,
    risks: [
      'Parser-empty rader kan kräva fallback efter full backfill',
      'Stopp om customerId mismatch eller duplicate explosion',
      'Stopp om failed batch rate > 1%',
    ],
  };
}

module.exports = {
  buildCcoInboxEnrichmentBackfillPlan,
  summarizeWorklistSignals,
};
