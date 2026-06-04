// @ts-nocheck

const REVIEW_REQUIRED_FIELDS = Object.freeze([
  'internetMessageId',
  'subjectHash',
  'receivedAt',
  'mailbox',
  'conversationId',
  'fromHash',
  'toHash',
]);

const CLOSURE_BUCKETS = Object.freeze([
  'ambiguous_multiple_matches_review_queue',
  'unresolved_missing_graphMessageId',
  'non_actionable_system_or_duplicate',
  'unsupported_shape',
  'should_exclude_from_denominator',
  'true_blocker',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

function sanitizeGapRow(row = {}, { repairStatus = null } = {}) {
  const parsed = parseConversationKey(row.conversationKey || row.threadKey);
  return {
    conversationKey: parsed.conversationKey || null,
    mailboxId: row.mailboxId || parsed.mailboxId || null,
    conversationId: parsed.conversationId || null,
    closureBucket: classifyFinalClosureBucket(row, { repairStatus }),
    primaryBucket: row.primaryBucket || null,
    actionBucket: row.actionBucket || null,
    repairStatus: repairStatus || null,
    customerIdPresent: Boolean(row.customerIdPresent),
    customerEmailPresent: Boolean(row.customerEmailPresent),
    graphMessageIdPresent: Boolean(row.graphMessageIdPresent),
    direction: row.direction || null,
    latestDate: row.latestDate || null,
    messageClassification: row.messageClassification || null,
    isSystemScrap: Boolean(row.isSystemScrap),
    duplicate: Boolean(row.duplicate),
    deletedOnly: Boolean(row.deletedOnly),
    canFallbackEnrich: Boolean(row.canFallbackEnrich),
    shouldExcludeFromDenominator: Boolean(row.shouldExcludeFromDenominator),
    shouldExcludeFromThreshold: Boolean(row.shouldExcludeFromThreshold),
    countsTowardEffectiveGap: !(row.shouldExcludeFromDenominator || row.shouldExcludeFromThreshold),
    whyEnrichmentMissing: row.whyEnrichmentMissing || null,
    subjectToken: row.subjectToken || null,
    reviewRequiredFields: [...REVIEW_REQUIRED_FIELDS],
    autoWriteAllowed: false,
  };
}

function classifyFinalClosureBucket(row = {}, { repairStatus = null } = {}) {
  const primaryBucket = normalizeText(row.primaryBucket);
  const exclude =
    Boolean(row.shouldExcludeFromDenominator || row.shouldExcludeFromThreshold) ||
    primaryBucket === 'system_scrap_should_exclude' ||
    primaryBucket === 'duplicate_or_alias' ||
    primaryBucket === 'outside_supported_mailbox' ||
    primaryBucket === 'corrupted_or_incomplete_truth_row' ||
    Boolean(row.isSystemScrap) ||
    Boolean(row.duplicate) ||
    Boolean(row.deletedOnly);

  if (exclude) {
    return row.duplicate || primaryBucket === 'duplicate_or_alias'
      ? 'non_actionable_system_or_duplicate'
      : 'should_exclude_from_denominator';
  }

  if (primaryBucket === 'missing_graphMessageId') {
    if (repairStatus === 'ambiguous_multiple_matches') {
      return 'ambiguous_multiple_matches_review_queue';
    }
    if (repairStatus === 'no_candidate' || repairStatus === 'should_remain_unresolved') {
      return 'unresolved_missing_graphMessageId';
    }
    if (repairStatus === 'repairable_single_match') {
      return 'unresolved_missing_graphMessageId';
    }
    return 'ambiguous_multiple_matches_review_queue';
  }

  if (primaryBucket === 'unsupported_message_shape') {
    return 'unsupported_shape';
  }

  if (
    primaryBucket === 'enrichment_parser_empty' ||
    row.actionBucket === 'parser_empty_but_fallback_possible' ||
    row.canFallbackEnrich
  ) {
    return 'true_blocker';
  }

  if (primaryBucket === 'no_truth_body_or_headers' || row.trueBlocker) {
    return 'true_blocker';
  }

  return 'true_blocker';
}

function summarizeClosureBuckets(rows = []) {
  const counts = Object.fromEntries(CLOSURE_BUCKETS.map((bucket) => [bucket, 0]));
  for (const row of rows) {
    const bucket = row.closureBucket || 'true_blocker';
    counts[bucket] = (counts[bucket] || 0) + 1;
  }
  return counts;
}

function buildAmbiguousReviewQueue(rows = [], repairStatusByKey = new Map()) {
  return rows
    .filter((row) => {
      const repairStatus = repairStatusByKey.get(normalizeText(row.conversationKey).toLowerCase());
      const bucket = classifyFinalClosureBucket(row, { repairStatus });
      return bucket === 'ambiguous_multiple_matches_review_queue';
    })
    .map((row) => {
      const repairStatus =
        repairStatusByKey.get(normalizeText(row.conversationKey).toLowerCase()) ||
        'ambiguous_multiple_matches';
      return sanitizeGapRow(row, { repairStatus });
    });
}

function buildRemainderBreakdown(rows = [], repairStatusByKey = new Map()) {
  const effectiveRows = rows.filter(
    (row) => !row.shouldExcludeFromDenominator && !row.shouldExcludeFromThreshold
  );
  const groups = {
    parser_empty_fallback_candidate: [],
    unresolved_missing_graphMessageId: [],
    unsupported_shape: [],
    true_blocker_other: [],
  };

  for (const row of effectiveRows) {
    const repairStatus = repairStatusByKey.get(normalizeText(row.conversationKey).toLowerCase());
    const closureBucket = classifyFinalClosureBucket(row, { repairStatus });
    if (closureBucket === 'ambiguous_multiple_matches_review_queue') continue;

    const sanitized = sanitizeGapRow(row, { repairStatus });
    if (
      row.primaryBucket === 'enrichment_parser_empty' ||
      row.actionBucket === 'parser_empty_but_fallback_possible'
    ) {
      groups.parser_empty_fallback_candidate.push({
        ...sanitized,
        recommendation: 'owner_decision',
        options: ['approved_fallback_enrich', 'exclude_from_denominator', 'leave_unresolved'],
        rationale:
          'AnalyzeInbox-rad saknar workflow-signaler trots snapshot-viable truth; fallback möjlig men inget auto-pass.',
      });
    } else if (closureBucket === 'unresolved_missing_graphMessageId') {
      groups.unresolved_missing_graphMessageId.push(sanitized);
    } else if (closureBucket === 'unsupported_shape') {
      groups.unsupported_shape.push(sanitized);
    } else if (closureBucket === 'true_blocker') {
      groups.true_blocker_other.push(sanitized);
    }
  }

  return {
    effectiveGapRowCount: effectiveRows.length,
    parserEmptyFallbackCandidateCount: groups.parser_empty_fallback_candidate.length,
    unresolvedMissingGraphMessageIdCount: groups.unresolved_missing_graphMessageId.length,
    unsupportedShapeCount: groups.unsupported_shape.length,
    trueBlockerOtherCount: groups.true_blocker_other.length,
    groups,
  };
}

function assessOperationalReadiness({
  closureBucketCounts = {},
  effectiveGapCount = 0,
  ambiguousReviewQueueCount = 0,
  excludedCount = 0,
} = {}) {
  const reviewQueue = Number(closureBucketCounts.ambiguous_multiple_matches_review_queue || 0);
  const nonActionable =
    Number(closureBucketCounts.non_actionable_system_or_duplicate || 0) +
    Number(closureBucketCounts.should_exclude_from_denominator || 0);
  const trueBlockers = Number(closureBucketCounts.true_blocker || 0);
  const unsupported = Number(closureBucketCounts.unsupported_shape || 0);
  const unresolvedMissing = Number(closureBucketCounts.unresolved_missing_graphMessageId || 0);

  const accountedForEffective = reviewQueue + trueBlockers + unsupported + unresolvedMissing;
  const operationalBlockers = trueBlockers + unsupported + unresolvedMissing;
  const ready =
    effectiveGapCount > 0 &&
    operationalBlockers === 0 &&
    accountedForEffective >= effectiveGapCount - excludedCount;

  return {
    operationalReadiness: ready,
    operationalReadinessReason: ready
      ? 'all_effective_gaps_in_review_queue_or_accepted_categories'
      : operationalBlockers > 0
        ? 'effective_gaps_include_true_blockers_or_fallback_candidates_pending_owner_decision'
        : 'effective_gap_accounting_incomplete',
    metrics: {
      effectiveGapCount,
      ambiguousReviewQueueCount: ambiguousReviewQueueCount || reviewQueue,
      trueBlockerCount: trueBlockers,
      unsupportedShapeCount: unsupported,
      unresolvedMissingGraphMessageIdCount: unresolvedMissing,
      nonActionableOrExcludedCount: nonActionable,
      parserEmptyFallbackCandidates: trueBlockers,
    },
    ownerDecisionRequired: operationalBlockers > 0 || reviewQueue > 0,
    ownerOptions: ['A', 'B', 'C', 'D'],
  };
}

function buildFinalGapClosureReport({
  gapAnalysis = {},
  coverage = {},
  repairPlan = {},
  worklist = null,
  repairRows = [],
} = {}) {
  const repairStatusByKey = new Map();
  for (const row of repairRows) {
    const key = normalizeText(row.conversationKey).toLowerCase();
    if (key) repairStatusByKey.set(key, row.repairStatus || null);
  }

  const details = Array.isArray(gapAnalysis.details) ? gapAnalysis.details : [];
  const sanitizedRows = details.map((row) => {
    const repairStatus = repairStatusByKey.get(normalizeText(row.conversationKey).toLowerCase());
    return sanitizeGapRow(row, { repairStatus });
  });

  const closureBucketCounts = summarizeClosureBuckets(sanitizedRows);
  const effectiveGapCount =
    coverage?.denominatorExclusions?.effectiveGapCount ??
    coverage?.gapCount ??
    gapAnalysis.totalGap;
  const ambiguousReviewQueue = buildAmbiguousReviewQueue(details, repairStatusByKey);
  const remainder = buildRemainderBreakdown(details, repairStatusByKey);

  const technicalEnrichmentCoverage = {
    enriched: coverage.enrichedConversationCount,
    truthConversationCount: coverage.truthConversationCount,
    rawGapCount: coverage.denominatorExclusions?.excludedUnenrichedGapCount
      ? Number(coverage.gapConversationIdsCount || gapAnalysis.totalGap || 0)
      : coverage.gapCount,
    effectiveGapCount,
    adjustedCoveragePercent:
      coverage.adjustedCoveragePercent ??
      coverage.coveragePercent ??
      gapAnalysis.coverage?.coveragePercent,
    readyForWork: coverage.readyForWork,
    readyThresholdPercent: coverage.readyThresholdPercent ?? 99.5,
    thresholdLowered: false,
  };

  const operational = assessOperationalReadiness({
    closureBucketCounts,
    effectiveGapCount,
    ambiguousReviewQueueCount: ambiguousReviewQueue.length,
    excludedCount: Number(coverage?.denominatorExclusions?.excludedUnenrichedGapCount || 0),
  });

  return {
    generatedAt: new Date().toISOString(),
    tenantId: gapAnalysis.tenantId || coverage.tenantId || null,
    rules: {
      noRawMailText: true,
      noAutoRepair: true,
      noAutoWriteOnAmbiguous: true,
      noGraphFetch: true,
      noNewMailImport: true,
      reviewRequiredFieldCount: 3,
      reviewRequiredFields: [...REVIEW_REQUIRED_FIELDS],
    },
    technicalEnrichmentCoverage,
    operationalReadiness: operational,
    closureBucketCounts,
    effectiveGapClosureCounts: summarizeClosureBuckets(
      sanitizedRows.filter((row) => row.countsTowardEffectiveGap)
    ),
    repairPlanSummary: {
      missingGraphMessageIdAnalyzed: repairPlan.missingGraphMessageIdAnalyzed ?? null,
      statusCounts: repairPlan.statusCounts ?? null,
      repairableCount: repairPlan.repairableCount ?? 0,
      ambiguousCount: repairPlan.ambiguousCount ?? ambiguousReviewQueue.length,
      noCandidateCount: repairPlan.noCandidateCount ?? 0,
      mailboxCounts: repairPlan.mailboxCounts ?? null,
    },
    ambiguousReviewQueue: {
      count: ambiguousReviewQueue.length,
      rows: ambiguousReviewQueue,
    },
    remainderAfterAmbiguous: {
      summary: {
        parserEmptyFallbackCandidateCount: remainder.parserEmptyFallbackCandidateCount,
        unresolvedMissingGraphMessageIdCount: remainder.unresolvedMissingGraphMessageIdCount,
        unsupportedShapeCount: remainder.unsupportedShapeCount,
        trueBlockerOtherCount: remainder.trueBlockerOtherCount,
      },
      parserEmptyFallbackCandidates: remainder.groups.parser_empty_fallback_candidate,
    },
    worklist: worklist || null,
    rows: sanitizedRows,
    rowCount: sanitizedRows.length,
    source: {
      gapAnalysisGeneratedAt: gapAnalysis.generatedAt || null,
      coverageEntryId: coverage.lastEnrichmentEntryId || null,
    },
  };
}

module.exports = {
  CLOSURE_BUCKETS,
  REVIEW_REQUIRED_FIELDS,
  classifyFinalClosureBucket,
  sanitizeGapRow,
  summarizeClosureBuckets,
  buildAmbiguousReviewQueue,
  buildRemainderBreakdown,
  assessOperationalReadiness,
  buildFinalGapClosureReport,
};
