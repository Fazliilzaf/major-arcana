const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateStrategicInsights } = require('../../src/intelligence/strategicInsightsEngine');

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

