const test = require('node:test');
const assert = require('node:assert/strict');

const { composeWeeklyBrief } = require('../../src/intelligence/weeklyBriefComposer');

test('composeWeeklyBrief switches to focus structure when focus mode is active', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 58,
      avgResponseTimeHours: 10.2,
      systemRecommendationFollowRate: 0.61,
      slaBreachTrend: '+14%',
      volatilityIndex: 0.62,
    },
    redFlagState: {
      isActive: true,
      delta: -12,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
      recommendedAction: 'Prioritera high-risk ärenden 48h',
      severity: 'high',
    },
    adaptiveFocusState: { isActive: true },
  });

  assert.equal(result.mode, 'focus');
  assert.equal(result.focusActive, true);
  assert.equal(result.structureOrder[0], 'stabilization_actions');
  assert.equal(result.recommendations.length <= 3, true);
});

test('composeWeeklyBrief keeps normal structure when focus is inactive', () => {
  const result = composeWeeklyBrief({
    usageAnalytics: {
      healthScore: 84,
      avgResponseTimeHours: 5.1,
      systemRecommendationFollowRate: 0.77,
      slaBreachTrend: '-10%',
      volatilityIndex: 0.25,
    },
    adaptiveFocusState: { isActive: false },
    redFlagState: { isActive: false },
  });

  assert.equal(result.mode, 'normal');
  assert.equal(result.structureOrder[0], 'strategic_signals');
});

