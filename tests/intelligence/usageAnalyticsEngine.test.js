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

test('Worklist snapshot metrics return zeros for empty worklist', () => {
  const snapshot = computeWorklistSnapshotMetrics([]);
  assert.equal(snapshot.unresolvedCount, 0);
  assert.equal(snapshot.slaBreachRate, 0);
  assert.equal(snapshot.conversionSignal, 0);
  assert.equal(snapshot.bookingCount, 0);
});

test('Worklist snapshot metrics count unanswered at 48h inclusive', () => {
  const below = computeWorklistSnapshotMetrics([
    { needsReplyStatus: 'needs_reply', slaStatus: 'safe', hoursSinceInbound: 47 },
  ]);
  const at = computeWorklistSnapshotMetrics([
    { needsReplyStatus: 'needs_reply', slaStatus: 'safe', hoursSinceInbound: 48 },
  ]);
  assert.equal(below.unansweredOver48hCount, 0);
  assert.equal(at.unansweredOver48hCount, 1);
});

test('Worklist snapshot metrics derive conversion signal from booking intents', () => {
  const snapshot = computeWorklistSnapshotMetrics([
    { needsReplyStatus: 'needs_reply', intent: 'booking_request', slaStatus: 'safe', hoursSinceInbound: 1 },
    { needsReplyStatus: 'needs_reply', intent: 'complaint', slaStatus: 'warning', hoursSinceInbound: 2 },
  ]);
  assert.equal(snapshot.bookingCount, 1);
  assert.equal(snapshot.conversionSignal, 0.5);
});

test('computeHealthScore tolerates null snapshotMetrics', () => {
  const score = computeHealthScore({
    snapshotMetrics: null,
    avgResponseTimeHours: 10,
    recommendationFollowRate: 0.5,
    ccoUsageRate: 0.5,
    sprintCompletionRate: 0.5,
  });
  assert.ok(Number.isFinite(score));
  assert.equal(score <= 100, true);
});

test('computeUsageAnalytics returns +100% trend when previous baseline is zero', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [],
    analysisEntries: [],
    currentConversationWorklist: [
      { needsReplyStatus: 'needs_reply', slaStatus: 'breach', intent: 'complaint' },
    ],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.slaBreachTrendPercent, 100);
  assert.equal(metrics.slaBreachTrend, '+100%');
  assert.equal(metrics.complaintTrendPercent, 100);
});

test('computeUsageAnalytics counts active days from analysisEntries and clamps windowDays max 90', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 999,
    auditEvents: [],
    analysisEntries: [
      { ts: '2026-03-01T10:00:00.000Z' },
      { ts: '2026-03-02T10:00:00.000Z' },
    ],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.windowDays, 90);
  assert.equal(metrics.activeDays, 2);
});

test('computeUsageAnalytics computes follow/ignored rates from draft mode selections', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [
      { ts: '2026-03-01T10:00:00.000Z', action: 'cco.draft.mode_selected', metadata: { ignoredRecommended: false } },
      { ts: '2026-03-01T10:01:00.000Z', action: 'cco.draft.mode_selected', metadata: { ignoredRecommended: true } },
      { ts: '2026-03-01T10:02:00.000Z', action: 'cco.draft.mode_selected', metadata: { ignoredRecommended: false } },
    ],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.systemRecommendationFollowRate, 0.667);
  assert.equal(metrics.ignoredRecommendedRate, 0.333);
});

test('computeWorklistSnapshotMetrics treats non-array worklist as empty', () => {
  const snap = computeWorklistSnapshotMetrics(null);
  assert.equal(snap.unresolvedCount, 0);
  assert.equal(snap.slaBreachCount, 0);
});

test('Worklist snapshot treats spaced handled status as resolved', () => {
  const snap = computeWorklistSnapshotMetrics([
    { needsReplyStatus: '  HANDLED  ', slaStatus: 'breach', hoursSinceInbound: 99, intent: 'complaint' },
  ]);
  assert.equal(snap.unresolvedCount, 0);
});

test('Worklist snapshot counts SLA breach case-insensitively', () => {
  const snap = computeWorklistSnapshotMetrics([
    { needsReplyStatus: 'needs_reply', slaStatus: 'BREACH', hoursSinceInbound: 1 },
  ]);
  assert.equal(snap.slaBreachCount, 1);
});

test('computeUsageAnalytics clamps windowDays minimum to 1', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 0,
    auditEvents: [],
    analysisEntries: [{ ts: '2026-03-01T10:00:00.000Z' }],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.windowDays, 1);
  assert.equal(metrics.activeDays, 1);
});

test('computeHealthScore treats array snapshotMetrics like empty snapshot', () => {
  const fromArray = computeHealthScore({
    snapshotMetrics: [],
    avgResponseTimeHours: 8,
    recommendationFollowRate: 0.5,
    ccoUsageRate: 0.5,
    sprintCompletionRate: 0.5,
  });
  const fromObject = computeHealthScore({
    snapshotMetrics: {},
    avgResponseTimeHours: 8,
    recommendationFollowRate: 0.5,
    ccoUsageRate: 0.5,
    sprintCompletionRate: 0.5,
  });
  assert.equal(fromArray, fromObject);
});

test('computeUsageAnalytics counts capability.run.complete toward active days', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 7,
    auditEvents: [
      { ts: '2026-03-05T10:00:00.000Z', action: 'capability.run.complete', metadata: {} },
    ],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.activeDays, 1);
  assert.ok(metrics.ccoUsageRate > 0);
});

test('computeUsageAnalytics derives positive volatility from multi-point health history', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 60 },
      { ts: '2026-03-02T10:00:00.000Z', score: 90 },
      { ts: '2026-03-03T10:00:00.000Z', score: 70 },
    ],
  });
  assert.ok(metrics.volatilityIndex > 0);
});

test('computeUsageAnalytics highRiskHandledFirstRate counts critical and high sprint items', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [
      { ts: '2026-03-01T10:00:00.000Z', action: 'cco.sprint.item_completed', metadata: { slaAgeHours: 4, priorityLevel: 'Critical' } },
      { ts: '2026-03-01T10:01:00.000Z', action: 'cco.sprint.item_completed', metadata: { slaAgeHours: 5, priorityLevel: 'low' } },
    ],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.highRiskHandledFirstRate, 0.5);
});

test('computeUsageAnalytics volatilityIndex is zero when health history has at most one score', () => {
  const empty = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  const onePoint = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [{ ts: '2026-03-01T10:00:00.000Z', score: 82 }],
  });
  assert.equal(empty.volatilityIndex, 0);
  assert.equal(onePoint.volatilityIndex, 0);
});

test('computeUsageAnalytics counts active day from audit metadata.timestamp when ts is missing', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 7,
    auditEvents: [
      {
        action: 'cco.sprint.start',
        metadata: { timestamp: '2026-04-10T15:30:00.000Z' },
      },
    ],
    analysisEntries: [],
    currentConversationWorklist: [],
    previousConversationWorklist: [],
    healthHistory: [],
  });
  assert.equal(metrics.activeDays, 1);
});

test('computeUsageAnalytics slaBreachTrend shows negative percent when breach rate falls', () => {
  const metrics = computeUsageAnalytics({
    windowDays: 14,
    auditEvents: [],
    analysisEntries: [],
    currentConversationWorklist: [
      { needsReplyStatus: 'needs_reply', slaStatus: 'safe', intent: 'follow_up', hoursSinceInbound: 2 },
    ],
    previousConversationWorklist: [
      { needsReplyStatus: 'needs_reply', slaStatus: 'breach', intent: 'complaint', hoursSinceInbound: 10 },
    ],
    healthHistory: [],
  });
  assert.equal(metrics.slaBreachTrendPercent, -100);
  assert.equal(metrics.slaBreachTrend, '-100%');
});

