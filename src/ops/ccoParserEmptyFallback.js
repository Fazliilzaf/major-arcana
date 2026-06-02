// @ts-nocheck
const crypto = require('node:crypto');
const { classifyConversationMessage } = require('../intelligence/messageClassification');
const { createCcoMailboxTruthWorklistReadModel } = require('./ccoMailboxTruthWorklistReadModel');
const { analyzeCcoInboxEnrichmentGaps } = require('./ccoInboxEnrichmentGapAnalysis');
const {
  computeCcoInboxEnrichmentCoverage,
  hasCcoEnrichmentSignals,
} = require('./ccoInboxEnrichmentCoverage');
const {
  loadDenominatorExclusions,
  saveDenominatorExclusions,
  applyDenominatorExclusionsToCoverage,
} = require('./ccoInboxEnrichmentDenominatorExclusions');
const {
  mergeWorklistEnrichmentOutput,
  resolveLatestWorklistEnrichmentBaseline,
} = require('../routes/capabilities');
const { AnalyzeInboxCapability } = require('../capabilities/analyzeInbox');
const {
  saveCcoInboxEnrichmentCheckpoint,
  loadCcoInboxEnrichmentCheckpoint,
  clearCcoInboxEnrichmentCheckpoint,
  countEnrichedRows,
} = require('./ccoInboxEnrichmentCheckpoint');

const PARSER_EMPTY_POLICIES = Object.freeze([
  'true_unanswered_candidate',
  'non_actionable_outbound',
  'exclude_non_actionable',
  'unresolved_review',
]);

const CANARY_SAFE_POLICIES = new Set(['true_unanswered_candidate', 'non_actionable_outbound']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseConversationKey(conversationKey = '') {
  const normalized = normalizeText(conversationKey);
  const colon = normalized.lastIndexOf(':');
  if (colon <= 0) {
    return { mailboxId: null, conversationId: null, conversationKey: normalized };
  }
  return {
    mailboxId: normalized.slice(0, colon).toLowerCase(),
    conversationId: normalized.slice(colon + 1),
    conversationKey: normalized,
  };
}

function hashToken(value = '', maxLen = 120) {
  const raw = normalizeText(value).slice(0, maxLen);
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16);
}

function compareIso(left = '', right = '') {
  const leftMs = Date.parse(normalizeText(left));
  const rightMs = Date.parse(normalizeText(right));
  if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) return 0;
  return leftMs === rightMs ? 0 : leftMs > rightMs ? 1 : -1;
}

function resolveInboundAfterOutbound(lastInboundAt = '', lastOutboundAt = '') {
  const inbound = normalizeText(lastInboundAt);
  const outbound = normalizeText(lastOutboundAt);
  if (!inbound) return false;
  if (!outbound) return true;
  return compareIso(inbound, outbound) > 0;
}

function resolveWhyParserEmpty(gapRow = {}) {
  if (gapRow.enrichmentRowPresent && !gapRow.enrichmentSignalsPresent) {
    return 'analyze_inbox_row_exists_without_workflow_signals';
  }
  if (gapRow.whyEnrichmentMissing) return gapRow.whyEnrichmentMissing;
  return 'snapshot_viable_but_no_enrichment_signals_after_batches';
}

function classifyParserEmptyPolicy({ gapRow = {}, truthRow = {}, operatorState = null } = {}) {
  const parsed = parseConversationKey(gapRow.conversationKey || gapRow.threadKey);
  const truthFields = {
    graphMessageIdPresent: Boolean(gapRow.graphMessageIdPresent),
    bodyOrSubjectPresent: Boolean(gapRow.snapshotViable),
    customerIdPresent: Boolean(gapRow.customerIdPresent),
    customerEmailPresent: Boolean(gapRow.customerEmailPresent),
    conversationIdPresent: Boolean(parsed.conversationId),
    truthRowPresent: Boolean(gapRow.truthRowPresent),
  };

  const actionState = normalizeText(operatorState?.actionState).toLowerCase();
  const handled = actionState === 'handled';
  const snoozed = actionState === 'reply_later';
  const lastInboundAt =
    normalizeText(truthRow.lastInboundAt) || normalizeText(truthRow.timing?.lastInboundAt) || null;
  const lastOutboundAt =
    normalizeText(truthRow.lastOutboundAt) ||
    normalizeText(truthRow.timing?.lastOutboundAt) ||
    null;
  const inboundAfterOutbound = resolveInboundAfterOutbound(lastInboundAt, lastOutboundAt);

  const diagnostics = {
    mailboxId: parsed.mailboxId,
    direction: gapRow.direction || null,
    truthFields,
    handled,
    snoozed,
    lastInboundAt,
    lastOutboundAt,
    inboundAfterOutbound,
    whyParserEmpty: resolveWhyParserEmpty(gapRow),
    canFallbackSetSafeLane: false,
    canFallbackSetNeedsAction: false,
    recommendedDisposition: 'unresolved_review',
  };

  if (gapRow.isSystemScrap || gapRow.messageClassification === 'system_mail') {
    return {
      ...diagnostics,
      policy: 'exclude_non_actionable',
      applyAction: 'exclude_from_denominator',
      recommendedDisposition: 'exclude_non_actionable',
      canFallbackSetSafeLane: false,
      canFallbackSetNeedsAction: false,
    };
  }

  if (gapRow.direction === 'outbound') {
    return {
      ...diagnostics,
      policy: 'non_actionable_outbound',
      applyAction: 'fallback_enrich',
      recommendedDisposition: 'non_actionable',
      canFallbackSetSafeLane: true,
      canFallbackSetNeedsAction: false,
      fallbackSignals: {
        intent: 'admin',
        workflowLane: 'admin_low',
        needsReplyStatus: 'handled',
        messageClassification: gapRow.messageClassification || 'actionable',
        recommendedAction: 'Archive outbound thread',
        priorityLevel: 'Low',
      },
    };
  }

  const hasCustomerIdentity = truthFields.customerIdPresent || truthFields.customerEmailPresent;
  const inboundLike =
    gapRow.direction === 'inbound' || (gapRow.direction === 'mixed' && inboundAfterOutbound);

  if (
    inboundLike &&
    hasCustomerIdentity &&
    !handled &&
    !snoozed &&
    inboundAfterOutbound &&
    truthFields.graphMessageIdPresent &&
    truthFields.bodyOrSubjectPresent
  ) {
    return {
      ...diagnostics,
      policy: 'true_unanswered_candidate',
      applyAction: 'fallback_enrich',
      recommendedDisposition: 'needs_action_candidate',
      canFallbackSetSafeLane: true,
      canFallbackSetNeedsAction: true,
      fallbackSignals: {
        intent: 'follow_up',
        workflowLane: 'action_now',
        needsReplyStatus: 'needs_reply',
        messageClassification: gapRow.messageClassification || 'actionable',
        recommendedAction: 'Review unanswered thread',
        priorityLevel: 'Medium',
        slaStatus: 'warning',
      },
    };
  }

  return {
    ...diagnostics,
    policy: 'unresolved_review',
    applyAction: 'leave_unresolved',
    recommendedDisposition: 'no_signal_unresolved',
    canFallbackSetSafeLane: false,
    canFallbackSetNeedsAction: false,
  };
}

function sanitizePlanRow(row = {}) {
  const parsed = parseConversationKey(row.conversationKey);
  return {
    conversationKey: parsed.conversationKey || null,
    mailboxId: parsed.mailboxId || row.mailboxId || null,
    conversationId: parsed.conversationId || null,
    policy: row.policy || null,
    applyAction: row.applyAction || null,
    recommendedDisposition: row.recommendedDisposition || null,
    direction: row.direction || null,
    truthFields: row.truthFields || null,
    handled: Boolean(row.handled),
    snoozed: Boolean(row.snoozed),
    inboundAfterOutbound: Boolean(row.inboundAfterOutbound),
    whyParserEmpty: row.whyParserEmpty || null,
    canFallbackSetSafeLane: Boolean(row.canFallbackSetSafeLane),
    canFallbackSetNeedsAction: Boolean(row.canFallbackSetNeedsAction),
    subjectToken: row.subjectToken || null,
  };
}

function buildFallbackEnrichmentRow({ gapRow = {}, truthRow = {}, policyRow = {} } = {}) {
  const parsed = parseConversationKey(gapRow.conversationKey || gapRow.threadKey);
  const signals = policyRow.fallbackSignals || {};
  const conversationId =
    normalizeText(truthRow.conversationId) ||
    normalizeText(truthRow.mailboxConversationId) ||
    parsed.conversationId ||
    null;
  const mailboxId =
    normalizeText(truthRow.mailboxId || truthRow.mailboxAddress)?.toLowerCase() ||
    parsed.mailboxId ||
    null;
  const messageId =
    normalizeText(truthRow.messageId) ||
    normalizeText(truthRow.latestMessageId) ||
    hashToken(`${parsed.conversationKey}:fallback`) ||
    'parser-empty-fallback';

  return {
    conversationId,
    mailboxId,
    mailboxAddress: mailboxId,
    messageId,
    intent: signals.intent || 'follow_up',
    workflowLane: signals.workflowLane || null,
    needsReplyStatus: signals.needsReplyStatus || 'needs_reply',
    messageClassification: signals.messageClassification || 'actionable',
    recommendedAction: signals.recommendedAction || 'Review',
    priorityLevel: signals.priorityLevel || 'Medium',
    slaStatus: signals.slaStatus || 'normal',
    dominantRisk: signals.dominantRisk || null,
    parserEmptyPolicy: policyRow.policy || null,
    parserEmptyFallbackSource: 'parser_empty_rule_v1',
    subjectToken: gapRow.subjectToken || hashToken(normalizeText(truthRow.subject)),
    lastInboundAt:
      normalizeText(truthRow.lastInboundAt) ||
      normalizeText(truthRow.timing?.lastInboundAt) ||
      gapRow.latestDate ||
      null,
    lastOutboundAt:
      normalizeText(truthRow.lastOutboundAt) ||
      normalizeText(truthRow.timing?.lastOutboundAt) ||
      null,
    customerIdPresent: Boolean(gapRow.customerIdPresent),
  };
}

async function buildTruthRowIndex({
  ccoMailboxTruthStore,
  ccoCustomerStore,
  conversationStateStore,
  tenantId,
  mailboxIds,
}) {
  const customerState =
    ccoCustomerStore && typeof ccoCustomerStore.getTenantCustomerState === 'function'
      ? await ccoCustomerStore.getTenantCustomerState({ tenantId })
      : null;
  const readModel = createCcoMailboxTruthWorklistReadModel({
    store: ccoMailboxTruthStore,
    customerState,
    tenantId,
    conversationStateStore,
  });
  const rows = readModel.listWorklistRows({ mailboxIds, includeOutOfScopeDraftReview: true });
  const byKey = new Map();
  for (const row of rows) {
    const key = normalizeText(row.conversationKey).toLowerCase();
    if (key) byKey.set(key, row);
    const colon = key.lastIndexOf(':');
    if (colon > 0) byKey.set(key.slice(colon + 1), row);
  }
  return byKey;
}

async function buildParserEmptyFallbackPlan({
  tenantId,
  mailboxIds,
  capabilityAnalysisStore,
  ccoMailboxTruthStore,
  ccoCustomerStore,
  ccoMailIngestionStore,
  conversationStateStore = null,
  stateRoot = '',
  limit = null,
  canaryOnly = false,
} = {}) {
  const analysis = await analyzeCcoInboxEnrichmentGaps({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    ccoMailIngestionStore,
    supportedMailboxIds: mailboxIds,
    stateRoot,
    detailLimit: 10000,
    snapshotProbeLimit: 0,
  });

  const parserEmptyRows = asArray(analysis.details).filter(
    (row) =>
      normalizeText(row.primaryBucket) === 'enrichment_parser_empty' &&
      row.canFallbackEnrich &&
      !row.shouldExcludeFromDenominator
  );

  const truthIndex = await buildTruthRowIndex({
    ccoMailboxTruthStore,
    ccoCustomerStore,
    conversationStateStore,
    tenantId,
    mailboxIds,
  });

  let operatorStateMap = {};
  if (conversationStateStore && typeof conversationStateStore.getActiveStateMap === 'function') {
    operatorStateMap = conversationStateStore.getActiveStateMap({
      tenantId,
      canonicalConversationKeys: parserEmptyRows.map((row) => row.conversationKey).filter(Boolean),
    });
  }

  const planRows = parserEmptyRows.map((gapRow) => {
    const key = normalizeText(gapRow.conversationKey).toLowerCase();
    const truthRow = truthIndex.get(key) || {};
    const operatorState = operatorStateMap[normalizeText(gapRow.conversationKey)] || null;
    const classified = classifyParserEmptyPolicy({ gapRow, truthRow, operatorState });
    return sanitizePlanRow({
      ...classified,
      conversationKey: gapRow.conversationKey,
      mailboxId: gapRow.mailboxId,
      direction: gapRow.direction,
      subjectToken: gapRow.subjectToken || hashToken(normalizeText(truthRow.subject)),
      gapRow,
      truthRow,
      operatorState,
      fallbackSignals: classified.fallbackSignals,
    });
  });

  const policyCounts = Object.fromEntries(PARSER_EMPTY_POLICIES.map((item) => [item, 0]));
  const applyActionCounts = {
    fallback_enrich: 0,
    exclude_from_denominator: 0,
    leave_unresolved: 0,
  };
  for (const row of planRows) {
    policyCounts[row.policy] = (policyCounts[row.policy] || 0) + 1;
    applyActionCounts[row.applyAction] = (applyActionCounts[row.applyAction] || 0) + 1;
  }

  let selected = planRows;
  if (canaryOnly) {
    selected = planRows.filter((row) => CANARY_SAFE_POLICIES.has(row.policy));
  }
  if (Number.isFinite(limit) && limit > 0) {
    selected = selected.slice(0, Math.max(1, Math.min(500, limit)));
  }

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    dryRun: true,
    parserEmptyTotal: planRows.length,
    policyCounts,
    applyActionCounts,
    canarySafeCount: planRows.filter((row) => CANARY_SAFE_POLICIES.has(row.policy)).length,
    unresolvedReviewCount: policyCounts.unresolved_review || 0,
    rows: selected.map((row) => sanitizePlanRow(row)),
    allRows: planRows.map((row) => sanitizePlanRow(row)),
  };
}

async function applyParserEmptyFallbackBatch({
  tenantId,
  mailboxIds,
  capabilityAnalysisStore,
  ccoMailboxTruthStore,
  ccoCustomerStore,
  ccoMailIngestionStore,
  conversationStateStore = null,
  stateRoot = '',
  planRows = [],
  actorUserId = null,
  runId = null,
  dryRun = true,
} = {}) {
  const repairRunId = runId || crypto.randomUUID();
  const analysis = await analyzeCcoInboxEnrichmentGaps({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    ccoMailIngestionStore,
    supportedMailboxIds: mailboxIds,
    stateRoot,
    detailLimit: 10000,
    snapshotProbeLimit: 0,
  });
  const gapByKey = new Map(
    asArray(analysis.details)
      .filter((row) => normalizeText(row.primaryBucket) === 'enrichment_parser_empty')
      .map((row) => [normalizeText(row.conversationKey).toLowerCase(), row])
  );
  const truthIndex = await buildTruthRowIndex({
    ccoMailboxTruthStore,
    ccoCustomerStore,
    conversationStateStore,
    tenantId,
    mailboxIds,
  });

  const coverageBeforeRaw = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    stateRoot,
  });
  const exclusionsBefore = await loadDenominatorExclusions({ stateRoot, tenantId });
  const coverageBefore = applyDenominatorExclusionsToCoverage(
    coverageBeforeRaw,
    exclusionsBefore.conversationKeys
  );

  const enrichRows = [];
  const enrichScopeKeys = [];
  const excludeKeys = [];
  const unresolvedKeys = [];
  const results = [];

  for (const planRow of asArray(planRows)) {
    const key = normalizeText(planRow.conversationKey).toLowerCase();
    const gapRow = gapByKey.get(key);
    const truthRow = truthIndex.get(key) || {};
    if (!gapRow) {
      results.push({
        conversationKey: planRow.conversationKey,
        outcome: 'skipped_missing_gap_row',
      });
      continue;
    }

    const classified = classifyParserEmptyPolicy({
      gapRow,
      truthRow,
      operatorState: planRow.operatorState || null,
    });

    if (classified.applyAction === 'exclude_from_denominator') {
      excludeKeys.push(planRow.conversationKey);
      results.push({
        conversationKey: planRow.conversationKey,
        outcome: dryRun ? 'would_exclude_from_denominator' : 'excluded_from_denominator',
        policy: classified.policy,
      });
      continue;
    }

    if (classified.applyAction === 'leave_unresolved') {
      unresolvedKeys.push(planRow.conversationKey);
      results.push({
        conversationKey: planRow.conversationKey,
        outcome: 'left_unresolved',
        policy: classified.policy,
      });
      continue;
    }

    if (classified.applyAction !== 'fallback_enrich') {
      results.push({
        conversationKey: planRow.conversationKey,
        outcome: 'skipped_unsupported_action',
        policy: classified.policy,
      });
      continue;
    }

    const enrichmentRow = buildFallbackEnrichmentRow({
      gapRow,
      truthRow,
      policyRow: classified,
    });
    if (!hasCcoEnrichmentSignals(enrichmentRow)) {
      results.push({
        conversationKey: planRow.conversationKey,
        outcome: 'skipped_no_signals',
        policy: classified.policy,
      });
      continue;
    }

    enrichRows.push(enrichmentRow);
    enrichScopeKeys.push(planRow.conversationKey);
    results.push({
      conversationKey: planRow.conversationKey,
      outcome: dryRun ? 'would_fallback_enrich' : 'fallback_enriched',
      policy: classified.policy,
      parserEmptyPolicy: classified.policy,
    });
  }

  let registrySave = null;
  let persistResult = null;
  let checkpointSave = null;
  if (!dryRun && enrichRows.length > 0) {
    const baseline = await resolveLatestWorklistEnrichmentBaseline({
      capabilityAnalysisStore,
      tenantId,
      mailboxIds,
    });
    const checkpoint = await loadCcoInboxEnrichmentCheckpoint({ stateRoot, tenantId });
    const baselineOutput = asObject(baseline?.selectedOutputData);
    const checkpointOutput = checkpoint?.ok ? asObject(checkpoint.outputData) : {};
    const baselineEnriched = countEnrichedRows(baselineOutput);
    const checkpointEnriched = countEnrichedRows(checkpointOutput);
    const mergeBase = checkpointEnriched > baselineEnriched ? checkpointOutput : baselineOutput;

    const scopeConversationIds = enrichScopeKeys.map((item) => normalizeText(item)).filter(Boolean);
    const mergedOutput = mergeWorklistEnrichmentOutput(
      mergeBase,
      {
        conversationWorklist: enrichRows,
        needsReplyToday: enrichRows.filter(
          (row) => normalizeText(row.needsReplyStatus) === 'needs_reply'
        ),
        generatedAt: new Date().toISOString(),
        parserEmptyFallbackRunId: repairRunId,
      },
      { scopeConversationIds }
    );

    checkpointSave = await saveCcoInboxEnrichmentCheckpoint({
      stateRoot,
      tenantId,
      outputData: mergedOutput,
      metadata: {
        source: 'parser_empty_fallback',
        runId: repairRunId,
        scopedConversationCount: scopeConversationIds.length,
        enrichedRowCount: countEnrichedRows(mergedOutput),
      },
    });

    if (capabilityAnalysisStore && typeof capabilityAnalysisStore.append === 'function') {
      const entry = await capabilityAnalysisStore.append({
        tenantId,
        capabilityName: 'AnalyzeInbox',
        capabilityVersion: AnalyzeInboxCapability.version || 'v1',
        persistStrategy: 'analysis',
        decision: 'allow',
        actor: {
          id: normalizeText(actorUserId) || 'ops_parser_empty_fallback',
          role: 'SYSTEM',
        },
        runId: repairRunId,
        correlationId: repairRunId,
        input: {
          mailboxIds,
          trigger: 'manual_api_parser_empty_fallback',
          scopedConversationCount: scopeConversationIds.length,
        },
        output: {
          data: mergedOutput,
          metadata: { parserEmptyFallback: true, runId: repairRunId },
          warnings: [],
        },
        metadata: {
          source: 'ops_parser_empty_fallback',
          mailboxIds,
          trigger: 'manual_api_parser_empty_fallback',
          scopedConversationCount: scopeConversationIds.length,
        },
        riskSummary: {},
        policySummary: {},
      });
      persistResult = {
        ok: true,
        entryId: entry?.id || null,
        capturedAt: entry?.ts || null,
        enrichedRowCount: countEnrichedRows(mergedOutput),
      };
      if (persistResult.ok) {
        await clearCcoInboxEnrichmentCheckpoint({ stateRoot, tenantId });
      }
    }
  }

  if (!dryRun && excludeKeys.length > 0) {
    const mergedExclusions = new Set(exclusionsBefore.conversationKeys || []);
    for (const key of excludeKeys) mergedExclusions.add(normalizeText(key));
    registrySave = await saveDenominatorExclusions({
      stateRoot,
      tenantId,
      conversationKeys: Array.from(mergedExclusions),
      summary: {
        source: 'parser_empty_fallback',
        runId: repairRunId,
        addedCount: excludeKeys.length,
      },
    });
  }

  const coverageAfterRaw = await computeCcoInboxEnrichmentCoverage({
    tenantId,
    mailboxIds,
    capabilityAnalysisStore,
    ccoMailboxTruthStore,
    ccoCustomerStore,
    stateRoot,
  });
  const exclusionsAfter = await loadDenominatorExclusions({ stateRoot, tenantId });
  const coverageAfter = applyDenominatorExclusionsToCoverage(
    coverageAfterRaw,
    exclusionsAfter.conversationKeys
  );

  return {
    ok: true,
    dryRun,
    runId: repairRunId,
    processedCount: planRows.length,
    fallbackEnrichedCount: dryRun
      ? results.filter((row) => row.outcome === 'would_fallback_enrich').length
      : results.filter((row) => row.outcome === 'fallback_enriched').length,
    excludedCount: dryRun
      ? results.filter((row) => row.outcome === 'would_exclude_from_denominator').length
      : results.filter((row) => row.outcome === 'excluded_from_denominator').length,
    unresolvedCount: results.filter((row) => row.outcome === 'left_unresolved').length,
    results: results.slice(0, 50),
    resultCount: results.length,
    persistResult,
    checkpointSave,
    registrySave,
    coverageBefore: {
      enriched: coverageBefore.enrichedConversationCount,
      adjustedCoveragePercent: coverageBefore.coveragePercent,
      effectiveGapCount: coverageBefore.gapCount,
      readyForWork: coverageBefore.readyForWork,
    },
    coverageAfter: {
      enriched: coverageAfter.enrichedConversationCount,
      adjustedCoveragePercent: coverageAfter.coveragePercent,
      effectiveGapCount: coverageAfter.gapCount,
      readyForWork: coverageAfter.readyForWork,
    },
  };
}

module.exports = {
  PARSER_EMPTY_POLICIES,
  CANARY_SAFE_POLICIES,
  classifyParserEmptyPolicy,
  buildParserEmptyFallbackPlan,
  applyParserEmptyFallbackBatch,
  buildFallbackEnrichmentRow,
  sanitizePlanRow,
};
