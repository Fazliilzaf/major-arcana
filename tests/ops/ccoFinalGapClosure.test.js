'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyFinalClosureBucket,
  buildFinalGapClosureReport,
  assessOperationalReadiness,
} = require('../../src/ops/ccoFinalGapClosure');

test('classifyFinalClosureBucket maps ambiguous missing graph ids to review queue', () => {
  const bucket = classifyFinalClosureBucket(
    { primaryBucket: 'missing_graphMessageId' },
    { repairStatus: 'ambiguous_multiple_matches' }
  );
  assert.equal(bucket, 'ambiguous_multiple_matches_review_queue');
});

test('classifyFinalClosureBucket maps parser empty to true blocker', () => {
  const bucket = classifyFinalClosureBucket({
    primaryBucket: 'enrichment_parser_empty',
    canFallbackEnrich: true,
    actionBucket: 'parser_empty_but_fallback_possible',
  });
  assert.equal(bucket, 'true_blocker');
});

test('buildFinalGapClosureReport splits effective gap into review queue and parser empty', () => {
  const report = buildFinalGapClosureReport({
    gapAnalysis: {
      tenantId: 'hair-tp-clinic',
      totalGap: 3,
      details: [
        {
          conversationKey: 'a@x.com:conv1',
          mailboxId: 'a@x.com',
          primaryBucket: 'missing_graphMessageId',
        },
        {
          conversationKey: 'a@x.com:conv2',
          mailboxId: 'a@x.com',
          primaryBucket: 'enrichment_parser_empty',
          canFallbackEnrich: true,
          actionBucket: 'parser_empty_but_fallback_possible',
        },
        {
          conversationKey: 'a@x.com:conv3',
          mailboxId: 'a@x.com',
          primaryBucket: 'duplicate_or_alias',
          duplicate: true,
          shouldExcludeFromDenominator: true,
        },
      ],
    },
    coverage: {
      enrichedConversationCount: 10,
      truthConversationCount: 13,
      gapCount: 2,
      adjustedCoveragePercent: 83.33,
      readyForWork: false,
      readyThresholdPercent: 99.5,
      denominatorExclusions: { effectiveGapCount: 2, excludedUnenrichedGapCount: 1 },
      gapConversationIdsCount: 3,
    },
    repairPlan: {
      ambiguousCount: 1,
      statusCounts: { ambiguous_multiple_matches: 1 },
    },
    worklist: { rowCount: 1 },
    repairRows: [{ conversationKey: 'a@x.com:conv1', repairStatus: 'ambiguous_multiple_matches' }],
  });

  assert.equal(report.ambiguousReviewQueue.count, 1);
  assert.equal(report.remainderAfterAmbiguous.summary.parserEmptyFallbackCandidateCount, 1);
  assert.equal(report.closureBucketCounts.non_actionable_system_or_duplicate, 1);
  assert.equal(report.operationalReadiness.operationalReadiness, false);
});

test('assessOperationalReadiness is true when only review queue remains in effective gap', () => {
  const result = assessOperationalReadiness({
    closureBucketCounts: {
      ambiguous_multiple_matches_review_queue: 5,
      true_blocker: 0,
    },
    effectiveGapCount: 5,
    ambiguousReviewQueueCount: 5,
    excludedCount: 0,
  });
  assert.equal(result.operationalReadiness, true);
});
