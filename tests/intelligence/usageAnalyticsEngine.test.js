const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeUsageAnalytics,
  computeHealthScore,
  computeWorklistSnapshotMetrics,
} = require('../../src/intelligence/usageAnalyticsEngine');

test('Usage analytics computes core metrics and trend deltas', () => {
  const auditEvents = [
    {
      ts: '2026-03-01T08:00:00.000Z',
      action: 'cco.sprint.start',
      metadata: {},
    },
    {
      ts: '2026-03-01T08:30:00.000Z',
      action: 'cco.sprint.item_completed',
      metadata: { slaAgeHours: 6, priorityLevel: 'High' },
    },
    {
      ts: '2026-03-01T08:31:00.000Z',
      action: 'cco.draft.mode_selected',
      metadata: {
        selectedMode: 'warm',
        recommendedMode: 'warm',
        ignoredRecommended: false,
      },
    },
    {
      ts: '2026-03-02T08:00:00.000Z',
      action: 'cco.sprint.complete',
      metadata: {},
    },
  ];
  const currentWorklist = [
    {
      conversationId: 'c1',
      needsReplyStatus: 'needs_reply',
      slaStatus: 'breach',
      intent: 'complaint',
      tone: 'frustrated',
      escalationRequired: true,
      hoursSinceInbound: 52,
    },
    {
      conversationId: 'c2',
      needsReplyStatus: 'needs_reply',
      slaStatus: 'safe',
      intent: 'booking_request',
      tone: 'neutral',
      escalationRequired: false,
      hoursSinceInbound: 8,
    },
  ];
  const previousWorklist = [
    {
      conversationId: 'p1',
      needsReplyStatus: 'needs_reply',
      slaStatus: 'safe',
      intent: 'booking_request',
      tone: 'neutral',
      escalationRequired: false,
      hoursSinceInbound: 6,
    },
  ];

  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents,
    analysisEntries: [{ ts: '2026-03-01T07:59:00.000Z' }],
    currentConversationWorklist: currentWorklist,
    previousConversationWorklist: previousWorklist,
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 78 },
      { ts: '2026-02-28T10:00:00.000Z', score: 74 },
      { ts: '2026-03-01T10:00:00.000Z', score: 69 },
    ],
  });

  assert.equal(metrics.avgResponseTimeHours, 6);
  assert.equal(metrics.systemRecommendationFollowRate, 1);
  assert.equal(metrics.sprintCompletionRate, 1);
  assert.equal(metrics.unansweredOver48hCount, 1);
  assert.equal(typeof metrics.slaBreachTrend, 'string');
  assert.equal(metrics.ccoUsageRate > 0, true);
  assert.equal(metrics.healthScore <= 100, true);
  assert.equal(metrics.healthScore >= 0, true);
});

test('Worklist snapshot metrics ignore handled rows', () => {
  const snapshot = computeWorklistSnapshotMetrics([
    { conversationId: 'a', needsReplyStatus: 'handled', slaStatus: 'breach', hoursSinceInbound: 55 },
    { conversationId: 'b', needsReplyStatus: 'needs_reply', slaStatus: 'warning', hoursSinceInbound: 20 },
  ]);
  assert.equal(snapshot.unresolvedCount, 1);
  assert.equal(snapshot.slaBreachCount, 0);
  assert.equal(snapshot.unansweredOver48hCount, 0);
});

test('Health score clamps into 0-100', () => {
  const high = computeHealthScore({
    snapshotMetrics: {
      unansweredOver48hCount: 0,
      slaBreachRate: 0,
      complaintRate: 0,
      frustratedRate: 0,
      escalationRate: 0,
    },
    avgResponseTimeHours: 2,
    recommendationFollowRate: 1,
    ccoUsageRate: 1,
    sprintCompletionRate: 1,
  });
  const low = computeHealthScore({
    snapshotMetrics: {
      unansweredOver48hCount: 40,
      slaBreachRate: 1,
      complaintRate: 1,
      frustratedRate: 1,
      escalationRate: 1,
    },
    avgResponseTimeHours: 72,
    recommendationFollowRate: 0,
    ccoUsageRate: 0,
    sprintCompletionRate: 0,
  });
  assert.equal(high <= 100, true);
  assert.equal(low >= 0, true);
});

