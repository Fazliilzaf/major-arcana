const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateForwardOutlook } = require('../../src/intelligence/forwardOutlookEngine');

test('evaluateForwardOutlook returns risk/capacity/preparation with confidence', () => {
  const healthHistory = [
    { score: 74 },
    { score: 72 },
    { score: 69 },
    { score: 68 },
  ];
  const dailySnapshots = [
    { healthScore: 70, unresolvedCount: 12, complaintRate: 0.12 },
    { healthScore: 68, unresolvedCount: 14, complaintRate: 0.14 },
  ];
  const result = evaluateForwardOutlook({
    healthHistory,
    dailySnapshots,
    usageAnalytics: {
      avgResponseTimeHours: 9,
      volatilityIndex: 0.48,
    },
    horizonDays: 7,
  });

  assert.equal(Boolean(result.riskForecast?.level), true);
  assert.equal(Boolean(result.capacityForecast?.state), true);
  assert.equal(Array.isArray(result.recommendedPreparation), true);
  assert.equal(result.confidence >= 0 && result.confidence <= 1, true);
});

