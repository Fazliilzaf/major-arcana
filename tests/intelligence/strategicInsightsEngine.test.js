const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateStrategicInsights, buildDailySnapshotsFromAnalysisEntries } = require('../../src/intelligence/strategicInsightsEngine');

function entry(ts, worklist) {
  return {
    ts,
    output: {
      data: {
        conversationWorklist: worklist,
      },
    },
  };
}

test('evaluateStrategicInsights composes weekly/monthly/scenario/threat/forward outputs', () => {
  const analysisEntries = [
    entry('2026-02-25T10:00:00.000Z', [
      { needsReplyStatus: 'needs_reply', intent: 'complaint', tone: 'frustrated', slaStatus: 'breach' },
    ]),
    entry('2026-02-26T10:00:00.000Z', [
      { needsReplyStatus: 'needs_reply', intent: 'booking_request', tone: 'anxious', slaStatus: 'warning' },
    ]),
    entry('2026-02-27T10:00:00.000Z', [
      { needsReplyStatus: 'needs_reply', intent: 'complaint', tone: 'frustrated', slaStatus: 'breach' },
      { needsReplyStatus: 'needs_reply', intent: 'pricing_question', tone: 'neutral', slaStatus: 'safe' },
    ]),
  ];

  const result = evaluateStrategicInsights({
    analysisEntries,
    usageAnalytics: {
      healthScore: 62,
      avgResponseTimeHours: 8.7,
      ccoUsageRate: 0.82,
      systemRecommendationFollowRate: 0.66,
      sprintCompletionRate: 0.58,
      slaBreachTrend: '+12%',
      complaintRate: 0.2,
      volatilityIndex: 0.52,
    },
    redFlagState: {
      isActive: true,
      delta: -11,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
      recommendedAction: 'Prioritera high-risk 48h',
      severity: 'high',
    },
    adaptiveFocusState: { isActive: true },
    recoveryState: { recovered: false },
  });

  assert.equal(Boolean(result.weeklyBrief), true);
  assert.equal(Boolean(result.monthlyRisk), true);
  assert.equal(Boolean(result.scenarioAnalysis), true);
  assert.equal(Boolean(result.businessThreats), true);
  assert.equal(Boolean(result.forwardOutlook), true);
  assert.equal(result.weeklyBrief.mode, 'focus');
});

test('buildDailySnapshotsFromAnalysisEntries keeps last entry per calendar day', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [
      entry('2026-02-25T08:00:00.000Z', [{ needsReplyStatus: 'handled', intent: 'follow_up', slaStatus: 'safe', tone: 'neutral' }]),
      entry('2026-02-25T18:00:00.000Z', [
        { needsReplyStatus: 'needs_reply', intent: 'complaint', slaStatus: 'breach', tone: 'frustrated' },
      ]),
    ],
    usageAnalytics: {},
    windowDays: 35,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, '2026-02-25');
  assert.ok(rows[0].unresolvedCount >= 1);
});

test('buildDailySnapshotsFromAnalysisEntries clamps windowDays to at least 7', () => {
  const analysisEntries = [];
  for (let d = 1; d <= 15; d += 1) {
    const dd = String(d).padStart(2, '0');
    analysisEntries.push(entry(`2026-01-${dd}T10:00:00.000Z`, []));
  }
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries,
    usageAnalytics: {},
    windowDays: 3,
  });
  assert.equal(rows.length, 7);
});

test('buildDailySnapshotsFromAnalysisEntries skips entries without parseable day', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [
      { ts: '', output: { data: { conversationWorklist: [] } } },
      entry('2026-02-25T10:00:00.000Z', []),
    ],
    usageAnalytics: {},
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, '2026-02-25');
});

test('evaluateStrategicInsights returns full shape with empty analysis history', () => {
  const result = evaluateStrategicInsights({
    analysisEntries: [],
    usageAnalytics: {},
    redFlagState: {},
    adaptiveFocusState: {},
    recoveryState: { recovered: true },
    generatedAt: '2026-03-01T12:00:00.000Z',
  });

  assert.equal(result.generatedAt, '2026-03-01T12:00:00.000Z');
  assert.equal(result.recoveryState.recovered, true);
  assert.ok(result.monthlyRisk);
  assert.ok(result.scenarioAnalysis);
  assert.ok(result.weeklyBrief);
});

test('buildDailySnapshotsFromAnalysisEntries clamps windowDays to max 90', () => {
  const analysisEntries = [];
  for (let d = 1; d <= 120; d += 1) {
    const day = String(((d - 1) % 28) + 1).padStart(2, '0');
    const month = String(((Math.floor((d - 1) / 28)) % 12) + 1).padStart(2, '0');
    analysisEntries.push(entry(`2026-${month}-${day}T10:00:00.000Z`, []));
  }
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries,
    usageAnalytics: {},
    windowDays: 999,
  });
  assert.equal(rows.length <= 90, true);
});

test('buildDailySnapshotsFromAnalysisEntries respects provided usage analytics rates', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [
      entry('2026-02-25T10:00:00.000Z', [
        { needsReplyStatus: 'needs_reply', intent: 'complaint', tone: 'frustrated', slaStatus: 'breach' },
      ]),
    ],
    usageAnalytics: {
      avgResponseTimeHours: 20,
      systemRecommendationFollowRate: 0,
      ccoUsageRate: 0,
      sprintCompletionRate: 0,
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].healthScore <= 60, true);
});

test('evaluateStrategicInsights normalizes non-object inputs defensively', () => {
  const result = evaluateStrategicInsights({
    analysisEntries: [entry('2026-02-25T10:00:00.000Z', [])],
    usageAnalytics: 'oops',
    redFlagState: null,
    adaptiveFocusState: null,
    recoveryState: 'oops',
    generatedAt: ' 2026-03-01T12:00:00.000Z ',
  });
  assert.equal(result.generatedAt, '2026-03-01T12:00:00.000Z');
  assert.deepEqual(result.recoveryState, {});
  assert.ok(result.forwardOutlook);
});

test('buildDailySnapshotsFromAnalysisEntries ignorar icke-array analysisEntries', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: 'not-array',
    usageAnalytics: {},
  });
  assert.deepEqual(rows, []);
});

test('buildDailySnapshotsFromAnalysisEntries windowDays NaN faller tillbaka till 35', () => {
  const analysisEntries = [];
  const start = new Date('2026-01-01T12:00:00.000Z');
  for (let i = 0; i < 50; i += 1) {
    const ts = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString();
    analysisEntries.push(entry(ts, []));
  }
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries,
    usageAnalytics: {},
    windowDays: Number.NaN,
  });
  assert.equal(rows.length, 35);
});

test('buildDailySnapshotsFromAnalysisEntries tolererar usageAnalytics null', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [entry('2026-04-01T10:00:00.000Z', [])],
    usageAnalytics: null,
  });
  assert.equal(rows.length, 1);
  assert.ok(Number.isFinite(rows[0].healthScore));
});

test('buildDailySnapshotsFromAnalysisEntries skips null and non-object entries', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [null, 'bad', entry('2026-02-26T10:00:00.000Z', [])],
    usageAnalytics: {},
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, '2026-02-26');
});

test('buildDailySnapshotsFromAnalysisEntries skips entries whose ts does not parse to a day', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [
      { ts: 'not-a-valid-date', output: { data: { conversationWorklist: [] } } },
      entry('2026-02-25T10:00:00.000Z', []),
    ],
    usageAnalytics: {},
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, '2026-02-25');
});

test('buildDailySnapshotsFromAnalysisEntries sorts by ts before keeping last snapshot per day', () => {
  const rows = buildDailySnapshotsFromAnalysisEntries({
    analysisEntries: [
      entry('2026-02-25T18:00:00.000Z', [
        { needsReplyStatus: 'needs_reply', intent: 'complaint', slaStatus: 'breach', tone: 'frustrated' },
      ]),
      entry('2026-02-25T08:00:00.000Z', [
        { needsReplyStatus: 'handled', intent: 'follow_up', slaStatus: 'safe', tone: 'neutral' },
      ]),
    ],
    usageAnalytics: {},
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dayKey, '2026-02-25');
  assert.ok(rows[0].slaBreachRate > 0 || rows[0].unresolvedCount >= 1);
});

test('evaluateStrategicInsights with empty usageAnalytics infers pipeline and keeps normal brief', () => {
  const result = evaluateStrategicInsights({
    analysisEntries: [
      entry('2026-02-25T10:00:00.000Z', [{ needsReplyStatus: 'handled', intent: 'follow_up', slaStatus: 'safe', tone: 'neutral' }]),
    ],
    usageAnalytics: {},
    redFlagState: { isActive: false },
    adaptiveFocusState: { isActive: false },
    generatedAt: '2026-03-01T00:00:00.000Z',
  });
  assert.equal(result.weeklyBrief.mode, 'normal');
  assert.equal(result.generatedAt, '2026-03-01T00:00:00.000Z');
  assert.ok(Number.isFinite(result.monthlyRisk.riskIndex));
});

