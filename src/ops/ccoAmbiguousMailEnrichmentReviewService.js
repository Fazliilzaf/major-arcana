// @ts-nocheck
const crypto = require('node:crypto');
const {
  analyzeCcoInboxEnrichmentGaps,
  buildTruthMessageGroups,
  resolveMessageGroup,
} = require('./ccoInboxEnrichmentGapAnalysis');
const {
  buildGraphMessageIdRepairPlan,
  parseConversationKey,
  hashToken,
  buildCandidateFingerprint,
} = require('./ccoGraphMessageIdRepairPlan');
const { applySingleApprovedGraphMessageIdRepair } = require('./ccoGraphMessageIdRepairApply');
const { computeCcoInboxEnrichmentCoverage } = require('./ccoInboxEnrichmentCoverage');
const {
  loadDenominatorExclusions,
  saveDenominatorExclusions,
  applyDenominatorExclusionsToCoverage,
} = require('./ccoInboxEnrichmentDenominatorExclusions');
const {
  createCcoAmbiguousMailEnrichmentReviewStore,
} = require('./ccoAmbiguousMailEnrichmentReviewStore');
const { assessOperationalReadiness } = require('./ccoFinalGapClosure');
const { loadCcoInboxEnrichmentCheckpoint } = require('./ccoInboxEnrichmentCheckpoint');
const { summarizeWorklistSignals } = require('./ccoInboxEnrichmentBackfillPlan');

const DETERMINISTIC_MATCH_FIELDS = Object.freeze([
  'internetMessageId',
  'subjectHash',
  'receivedAt',
  'mailbox',
  'conversationId',
  'fromHash',
  'toHash',
]);

const MIN_APPROVE_MATCH_FIELDS = 3;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildCandidateId(candidate = {}) {
  return hashToken(buildCandidateFingerprint(candidate));
}

function sanitizeCandidate(candidate = {}, gapRow = {}) {
  const deterministicMatch = scoreDeterministicCandidateMatch(gapRow, candidate);
  return {
    candidateId: buildCandidateId(candidate),
    source: candidate.source || null,
    mailboxId: candidate.mailboxId || null,
    conversationId: candidate.conversationId || null,
    internetMessageIdHash: hashToken(candidate.internetMessageId),
    subjectHash: candidate.subjectHash || null,
    receivedAt: candidate.receivedAt || null,
    sentAt: candidate.sentAt || null,
    fromHash: candidate.fromHash || null,
    toHash: candidate.toHash || null,
    matchedFields: deterministicMatch.matchedFields,
    matchCount: deterministicMatch.matchCount,
    approvable: deterministicMatch.approvable,
  };
}

function enrichGapDeterministicFields(gapRow = {}, messageGroup = null) {
  const messages = asArray(messageGroup?.messages);
  const internetMessageIdHashes = new Set();
  const fromHashes = new Set();
  const toHashes = new Set();
  for (const message of messages) {
    const imHash = hashToken(message?.internetMessageId);
    if (imHash) internetMessageIdHashes.add(imHash);
    const folderType = normalizeText(message?.folderType).toLowerCase();
    const direction =
      folderType === 'sent' || folderType === 'drafts'
        ? 'outbound'
        : folderType === 'inbox'
          ? 'inbound'
          : gapRow.direction || 'unknown';
    const counterparty =
      direction === 'outbound'
        ? asArray(message?.toRecipients)
            .map((item) => normalizeEmail(item?.address || item?.email))
            .filter(Boolean)
            .join(',')
        : normalizeEmail(message?.fromEmail || message?.from?.address);
    const fromHash = hashToken(normalizeEmail(message?.fromEmail || message?.from?.address));
    const toHash = hashToken(
      asArray(message?.toRecipients)
        .map((item) => normalizeEmail(item?.address || item?.email))
        .join(',')
    );
    if (fromHash) fromHashes.add(fromHash);
    if (toHash) toHashes.add(toHash);
    if (counterparty) {
      if (direction === 'outbound') toHashes.add(hashToken(counterparty));
      else fromHashes.add(hashToken(counterparty));
    }
  }
  return {
    ...gapRow,
    internetMessageIdHashes,
    truthFromHashes: fromHashes,
    truthToHashes: toHashes,
  };
}

function scoreDeterministicCandidateMatch(gapRow = {}, candidate = {}) {
  const matchedFields = [];
  const parsed = parseConversationKey(gapRow.conversationKey || gapRow.threadKey);

  if (
    normalizeEmail(gapRow.mailboxId || parsed.mailboxId) &&
    normalizeEmail(candidate.mailboxId) &&
    normalizeEmail(gapRow.mailboxId || parsed.mailboxId) === normalizeEmail(candidate.mailboxId)
  ) {
    matchedFields.push('mailbox');
  }

  const gapConversationId = parsed.conversationId || null;
  if (
    gapConversationId &&
    normalizeText(candidate.conversationId) &&
    normalizeText(candidate.conversationId) === normalizeText(gapConversationId)
  ) {
    matchedFields.push('conversationId');
  }

  if (candidate.subjectHash && gapRow.subjectToken) {
    const gapSubjectHash = normalizeText(gapRow.subjectToken).startsWith('h')
      ? normalizeText(gapRow.subjectToken).slice(1)
      : normalizeText(gapRow.subjectToken);
    if (
      candidate.subjectHash === gapSubjectHash ||
      candidate.subjectHash.startsWith(gapSubjectHash) ||
      gapSubjectHash.startsWith(candidate.subjectHash)
    ) {
      matchedFields.push('subjectHash');
    }
  }

  if (gapRow.latestDate && (candidate.receivedAt || candidate.sentAt)) {
    const gapMs = Date.parse(gapRow.latestDate);
    const candMs = Date.parse(candidate.receivedAt || candidate.sentAt);
    if (Number.isFinite(gapMs) && Number.isFinite(candMs) && Math.abs(gapMs - candMs) <= 86400000) {
      matchedFields.push('receivedAt');
    }
  }

  if (candidate.internetMessageId) {
    const imHash = hashToken(candidate.internetMessageId);
    if (gapRow.internetMessageIdHashes?.has?.(imHash)) {
      matchedFields.push('internetMessageId');
    } else if (gapRow.ingestionMatched) {
      matchedFields.push('internetMessageId');
    }
  }

  if (candidate.fromHash && gapRow.truthFromHashes?.has?.(candidate.fromHash)) {
    matchedFields.push('fromHash');
  } else if (candidate.fromHash && gapRow.customerEmailPresent && gapRow.direction !== 'outbound') {
    matchedFields.push('fromHash');
  }

  if (candidate.toHash && gapRow.truthToHashes?.has?.(candidate.toHash)) {
    matchedFields.push('toHash');
  } else if (candidate.toHash && gapRow.direction === 'outbound') {
    matchedFields.push('toHash');
  }

  const unique = [
    ...new Set(matchedFields.filter((field) => DETERMINISTIC_MATCH_FIELDS.includes(field))),
  ];
  return {
    matchedFields: unique,
    matchCount: unique.length,
    approvable: unique.length >= MIN_APPROVE_MATCH_FIELDS,
  };
}

function explainAmbiguity(repairRow = {}) {
  const strategy = normalizeText(repairRow.matchStrategy);
  const count = Number(repairRow.matchCount || 0);
  if (strategy === 'ingestion_conversation_ambiguous') {
    return `${count} ingestion-kandidater med lika score — ingen unik match.`;
  }
  if (strategy === 'multi_source_ambiguous') {
    return `${count} kandidater från flera källor — ingen unik match.`;
  }
  if (count > 1) return `${count} kandidater — ambiguous_multiple_matches.`;
  return 'ambiguous_multiple_matches';
}

async function buildAmbiguousReviewContext({
  tenantId,
  mailboxIds,
  capabilityAnalysisStore,
  ccoMailboxTruthStore,
  ccoCustomerStore,
  ccoMailIngestionStore,
  stateRoot,
  reviewStore = null,
}) {
  for (const mailboxId of mailboxIds) {
    try {
      await ccoMailboxTruthStore.ensureMailboxLoaded(mailboxId);
    } catch {
      /* optional */
    }
  }

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

  const missingRows = asArray(analysis.details).filter(
    (row) => row.primaryBucket === 'missing_graphMessageId'
  );
  const plan = buildGraphMessageIdRepairPlan({
    gapDetails: missingRows,
    ingestionStore: ccoMailIngestionStore,
    truthStore: ccoMailboxTruthStore,
  });

  const gapByKey = new Map(
    missingRows.map((row) => [normalizeText(row.conversationKey).toLowerCase(), row])
  );

  const ambiguousRows = asArray(plan.rows).filter(
    (row) => row.repairStatus === 'ambiguous_multiple_matches'
  );
  const ambiguousKeys = ambiguousRows.map((row) => row.conversationKey).filter(Boolean);
  const messageGroups = buildTruthMessageGroups(ccoMailboxTruthStore, mailboxIds, ambiguousKeys);

  const store =
    reviewStore || (await createCcoAmbiguousMailEnrichmentReviewStore({ stateRoot, tenantId }));
  const decisionByKey = new Map(
    store.listDecisions().map((row) => [normalizeText(row.conversationKey).toLowerCase(), row])
  );

  const items = ambiguousRows.map((repairRow) => {
    const rawGap = gapByKey.get(normalizeText(repairRow.conversationKey).toLowerCase()) || {};
    const messageGroup = resolveMessageGroup(
      repairRow.conversationKey,
      repairRow.conversationKey,
      messageGroups
    );
    const gapRow = enrichGapDeterministicFields(rawGap, messageGroup);
    const decision =
      decisionByKey.get(normalizeText(repairRow.conversationKey).toLowerCase()) || null;
    const fullCandidates = asArray(repairRow.candidatesFull || repairRow.candidates);
    return serializeQueueItem({ repairRow, gapRow, decision, fullCandidates });
  });

  return { plan, items, gapByKey, reviewStore: store, analysis };
}

function resolveReviewStatus(decision = null) {
  if (!decision) return 'pending';
  return decision.reviewStatus || 'pending';
}

function serializeQueueItem({
  repairRow = {},
  gapRow = {},
  decision = null,
  fullCandidates = [],
} = {}) {
  const rejected = new Set(asArray(decision?.rejectedCandidateIds));
  const candidates = asArray(fullCandidates.length ? fullCandidates : repairRow.candidates).map(
    (candidate) => {
      const sanitized = sanitizeCandidate(candidate, gapRow);
      return {
        ...sanitized,
        rejected: rejected.has(sanitized.candidateId),
      };
    }
  );

  return {
    conversationKey: repairRow.conversationKey,
    mailboxId: repairRow.mailboxId,
    conversationId: repairRow.conversationId,
    reviewStatus: resolveReviewStatus(decision),
    pending: !decision || decision.reviewStatus === 'pending' || !decision.reviewStatus,
    matchCount: Number(repairRow.matchCount || candidates.length || 0),
    matchStrategy: repairRow.matchStrategy || null,
    ambiguityReason: explainAmbiguity(repairRow),
    direction: gapRow.direction || null,
    latestDate: gapRow.latestDate || null,
    customerIdPresent: Boolean(gapRow.customerIdPresent),
    customerEmailPresent: Boolean(gapRow.customerEmailPresent),
    graphMessageIdPresent: Boolean(gapRow.graphMessageIdPresent),
    subjectToken: gapRow.subjectToken || null,
    whyMissing: gapRow.whyEnrichmentMissing || 'truth_messages_lack_graph_message_id',
    deterministicMatchFields: [...DETERMINISTIC_MATCH_FIELDS],
    minApproveMatchFields: MIN_APPROVE_MATCH_FIELDS,
    candidates,
    decision: decision
      ? {
          action: decision.action,
          reviewStatus: decision.reviewStatus,
          reason: decision.reason,
          reviewer: decision.reviewer,
          decidedAt: decision.decidedAt,
          candidateId: decision.candidateId,
          matchedFields: decision.matchedFields,
          enrichTriggered: Boolean(decision.enrichTriggered),
        }
      : null,
  };
}

function summarizeAmbiguousReview({ items = [], reviewStore = null, coverage = null } = {}) {
  const mailboxCounts = {};
  let pending = 0;
  let approved = 0;
  let unresolved = 0;
  let ownerAcceptedUnresolved = 0;
  let excluded = 0;

  for (const item of items) {
    mailboxCounts[item.mailboxId] = (mailboxCounts[item.mailboxId] || 0) + 1;
    if (item.reviewStatus === 'approved') approved += 1;
    else if (item.reviewStatus === 'unresolved_review') unresolved += 1;
    else if (item.reviewStatus === 'owner_accepted_unresolved') ownerAcceptedUnresolved += 1;
    else if (item.reviewStatus === 'excluded_non_actionable') excluded += 1;
    else pending += 1;
  }

  const storeStats = reviewStore?.stats?.() || { counts: {} };

  return {
    ambiguousTotal: items.length,
    pending,
    approved,
    unresolved,
    ownerAcceptedUnresolved,
    excluded,
    remainingAmbiguous: pending,
    mailboxCounts,
    storeStats,
    coverage: coverage
      ? {
          enriched: coverage.enrichedConversationCount,
          adjustedCoveragePercent: coverage.coveragePercent,
          effectiveGapCount: coverage.gapCount,
          readyForWork: coverage.readyForWork,
        }
      : null,
    rules: {
      noFuzzyMerge: true,
      noCustomerMerge: true,
      noAutoWrite: true,
      minApproveMatchFields: MIN_APPROVE_MATCH_FIELDS,
      deterministicMatchFields: [...DETERMINISTIC_MATCH_FIELDS],
    },
  };
}

async function loadAmbiguousReviewSummary(ctx) {
  const coverageRaw = await computeCcoInboxEnrichmentCoverage({
    tenantId: ctx.tenantId,
    mailboxIds: ctx.mailboxIds,
    capabilityAnalysisStore: ctx.capabilityAnalysisStore,
    ccoMailboxTruthStore: ctx.ccoMailboxTruthStore,
    ccoCustomerStore: ctx.ccoCustomerStore,
    stateRoot: ctx.stateRoot,
  });
  const exclusions = await loadDenominatorExclusions({
    stateRoot: ctx.stateRoot,
    tenantId: ctx.tenantId,
  });
  const coverage = applyDenominatorExclusionsToCoverage(coverageRaw, exclusions.conversationKeys);
  const { items, reviewStore } = await buildAmbiguousReviewContext(ctx);
  const summary = summarizeAmbiguousReview({ items, reviewStore, coverage });
  const report = await buildAmbiguousReviewReport(ctx, { items, reviewStore, coverage, summary });
  return { ...summary, report };
}

async function buildAmbiguousReviewReport(
  ctx,
  { items = [], reviewStore: _reviewStore = null, coverage = null, summary = null } = {}
) {
  const checkpoint = await loadCcoInboxEnrichmentCheckpoint({
    stateRoot: ctx.stateRoot,
    tenantId: ctx.tenantId,
  });
  const worklist = checkpoint?.ok ? summarizeWorklistSignals(checkpoint.outputData) : null;
  const remainingAmbiguous = Number(summary?.remainingAmbiguous ?? summary?.pending ?? 0);
  const effectiveGapCount = Number(coverage?.gapCount ?? 0);
  const operational = assessOperationalReadiness({
    closureBucketCounts: {
      ambiguous_multiple_matches_review_queue: remainingAmbiguous,
      true_blocker: 0,
      unsupported_shape: 0,
      unresolved_missing_graphMessageId: 0,
    },
    effectiveGapCount,
    ambiguousReviewQueueCount: remainingAmbiguous,
    excludedCount: Number(coverage?.denominatorExclusions?.excludedUnenrichedGapCount || 0),
  });

  return {
    generatedAt: new Date().toISOString(),
    ambiguousTotal: summary?.ambiguousTotal ?? items.length,
    approved: summary?.approved ?? 0,
    unresolved: (summary?.unresolved ?? 0) + (summary?.ownerAcceptedUnresolved ?? 0),
    unresolvedReview: summary?.unresolved ?? 0,
    ownerAcceptedUnresolved: summary?.ownerAcceptedUnresolved ?? 0,
    excluded: summary?.excluded ?? 0,
    remainingAmbiguous,
    adjustedCoveragePercent: coverage?.coveragePercent ?? null,
    enriched: coverage?.enrichedConversationCount ?? null,
    effectiveGapCount,
    operationalReadiness: operational.operationalReadiness,
    operationalReadinessReason: operational.operationalReadinessReason,
    readyForWork: coverage?.readyForWork ?? false,
    worklist,
    mailboxCounts: summary?.mailboxCounts ?? {},
    stopConditions: {
      noAutoMerge: true,
      noFuzzyMerge: true,
      noCustomerMerge: true,
      noBlindEnrichment: true,
      minApproveMatchFields: MIN_APPROVE_MATCH_FIELDS,
    },
  };
}

async function listAmbiguousReviewQueue(
  ctx,
  { mailboxId = '', status = 'pending', limit = 50, offset = 0 } = {}
) {
  const { items, reviewStore } = await buildAmbiguousReviewContext(ctx);
  let filtered = items;
  if (mailboxId) {
    filtered = filtered.filter(
      (item) => normalizeEmail(item.mailboxId) === normalizeEmail(mailboxId)
    );
  }
  if (status === 'pending') {
    filtered = filtered.filter((item) => item.pending);
  } else if (status && status !== 'all') {
    filtered = filtered.filter((item) => item.reviewStatus === status);
  }

  filtered.sort((left, right) => {
    const mailboxCompare = String(left.mailboxId || '').localeCompare(
      String(right.mailboxId || '')
    );
    if (mailboxCompare !== 0) return mailboxCompare;
    return String(left.conversationKey || '').localeCompare(String(right.conversationKey || ''));
  });

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  return {
    total: filtered.length,
    offset: safeOffset,
    limit: safeLimit,
    items: filtered.slice(safeOffset, safeOffset + safeLimit),
    reviewStorePath: reviewStore.filePath,
  };
}

async function getAmbiguousReviewItem(ctx, conversationKey = '') {
  const key = normalizeText(conversationKey).toLowerCase();
  const { items, gapByKey, plan, reviewStore, analysis } = await buildAmbiguousReviewContext(ctx);
  const item = items.find((row) => normalizeText(row.conversationKey).toLowerCase() === key);
  if (!item) {
    const error = new Error('Ambiguous review item hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  const repairRow = asArray(plan.rows).find(
    (row) => normalizeText(row.conversationKey).toLowerCase() === key
  );
  const rawGap = gapByKey.get(key) || null;
  const messageGroups = buildTruthMessageGroups(ctx.ccoMailboxTruthStore, ctx.mailboxIds, [
    item.conversationKey,
  ]);
  const gapRow = rawGap
    ? enrichGapDeterministicFields(
        rawGap,
        resolveMessageGroup(item.conversationKey, item.conversationKey, messageGroups)
      )
    : null;
  return {
    item,
    repairRow,
    gapRow,
    reviewStore,
    analysis,
  };
}

function findCandidateById(repairRow = {}, gapRow = {}, candidateId = '') {
  const fullCandidates = asArray(repairRow?.candidatesFull || repairRow?.candidates);
  for (const candidate of fullCandidates) {
    if (buildCandidateId(candidate) === normalizeText(candidateId)) {
      return { candidate, match: scoreDeterministicCandidateMatch(gapRow, candidate) };
    }
  }
  return null;
}

async function decideAmbiguousReviewItem(
  ctx,
  {
    conversationKey = '',
    action = '',
    candidateId = '',
    reason = '',
    reviewer = '',
    actorUserId = null,
    ownerAccepted = false,
    go = false,
    scheduler = null,
  } = {}
) {
  if (!go) {
    const error = new Error('decide kräver go=true.');
    error.statusCode = 400;
    throw error;
  }

  const { item, repairRow, gapRow, reviewStore } = await getAmbiguousReviewItem(
    ctx,
    conversationKey
  );
  if (!item.pending && action !== 'reject_candidate') {
    const error = new Error('Item har redan ett beslut.');
    error.statusCode = 409;
    throw error;
  }

  const repairRunId = crypto.randomUUID();
  let repairResult = null;
  let enrichResult = null;
  let registrySave = null;
  let exclusionSave = null;
  let matchedFields = [];

  if (action === 'approve_single_match') {
    const resolved = findCandidateById(repairRow, gapRow, candidateId);
    if (!resolved) {
      const error = new Error('candidateId hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    if (!resolved.match.approvable) {
      const error = new Error(
        `approve_blocker: kräver minst ${MIN_APPROVE_MATCH_FIELDS} deterministiska fält (har ${resolved.match.matchCount}).`
      );
      error.statusCode = 409;
      throw error;
    }
    matchedFields = resolved.match.matchedFields;
    repairResult = await applySingleApprovedGraphMessageIdRepair({
      truthStore: ctx.ccoMailboxTruthStore,
      ingestionStore: ctx.ccoMailIngestionStore,
      conversationKey,
      candidate: resolved.candidate,
      actorUserId: actorUserId || reviewer,
      runId: repairRunId,
      stateRoot: ctx.stateRoot,
      tenantId: ctx.tenantId,
    });
    registrySave = repairResult.registrySave;

    if (scheduler && typeof scheduler.runJob === 'function') {
      enrichResult = await scheduler.runJob('cco_inbox_enrichment_full_backfill', {
        trigger: 'manual_api_ambiguous_review_approve',
        actorUserId: actorUserId || reviewer,
        tenantId: ctx.tenantId,
        phase: 'full',
        targetConversationIds: [conversationKey],
      });
    }
  } else if (action === 'exclude_non_actionable') {
    const exclusions = await loadDenominatorExclusions({
      stateRoot: ctx.stateRoot,
      tenantId: ctx.tenantId,
    });
    const merged = new Set(exclusions.conversationKeys || []);
    merged.add(normalizeText(conversationKey));
    exclusionSave = await saveDenominatorExclusions({
      stateRoot: ctx.stateRoot,
      tenantId: ctx.tenantId,
      conversationKeys: Array.from(merged),
      summary: {
        source: 'ambiguous_review_exclude',
        conversationKey,
        reason: normalizeText(reason).slice(0, 500),
      },
    });
  }

  const decision = await reviewStore.recordDecision({
    conversationKey,
    action,
    candidateId: action === 'approve_single_match' ? candidateId : null,
    reason,
    reviewer: reviewer || actorUserId,
    actorUserId,
    matchedFields,
    matchStrategy: repairRow?.matchStrategy || null,
    repairRunId: action === 'approve_single_match' ? repairRunId : null,
    enrichTriggered: Boolean(enrichResult?.ok),
    ownerAccepted: action === 'leave_unresolved' ? ownerAccepted : false,
    metadata: {
      repairOutcome: repairResult?.outcome || null,
      exclusionCount: exclusionSave?.count || null,
    },
  });

  const coverageRaw = await computeCcoInboxEnrichmentCoverage({
    tenantId: ctx.tenantId,
    mailboxIds: ctx.mailboxIds,
    capabilityAnalysisStore: ctx.capabilityAnalysisStore,
    ccoMailboxTruthStore: ctx.ccoMailboxTruthStore,
    ccoCustomerStore: ctx.ccoCustomerStore,
    stateRoot: ctx.stateRoot,
  });
  const exclusionsAfter = await loadDenominatorExclusions({
    stateRoot: ctx.stateRoot,
    tenantId: ctx.tenantId,
  });
  const coverage = applyDenominatorExclusionsToCoverage(
    coverageRaw,
    exclusionsAfter.conversationKeys
  );

  return {
    ok: true,
    decision,
    repairResult,
    enrichResult: enrichResult
      ? { ok: enrichResult?.ok === true, trigger: 'manual_api_ambiguous_review_approve' }
      : null,
    registrySave,
    exclusionSave,
    coverage: {
      enriched: coverage.enrichedConversationCount,
      adjustedCoveragePercent: coverage.coveragePercent,
      effectiveGapCount: coverage.gapCount,
      readyForWork: coverage.readyForWork,
    },
  };
}

module.exports = {
  DETERMINISTIC_MATCH_FIELDS,
  MIN_APPROVE_MATCH_FIELDS,
  buildCandidateId,
  sanitizeCandidate,
  scoreDeterministicCandidateMatch,
  buildAmbiguousReviewContext,
  summarizeAmbiguousReview,
  loadAmbiguousReviewSummary,
  listAmbiguousReviewQueue,
  getAmbiguousReviewItem,
  decideAmbiguousReviewItem,
  serializeQueueItem,
  buildAmbiguousReviewReport,
  enrichGapDeterministicFields,
};
