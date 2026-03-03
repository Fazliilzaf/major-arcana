const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeMonthlyRisk } = require('../../src/intelligence/monthlyRiskAnalyzer');

test('analyzeMonthlyRisk returns risk index and top drivers', () => {
  const dailySnapshots = Array.from({ length: 30 }).map((_, index) => ({
    slaBreachRate: index < 15 ? 0.08 : 0.14,
    complaintRate: index < 15 ? 0.06 : 0.11,
    unresolvedCount: 10 + index,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots,
    usageAnalytics: { volatilityIndex: 0.55 },
    windowDays: 30,
  });

  assert.equal(typeof result.riskIndex, 'number');
  assert.equal(['low', 'medium', 'high'].includes(result.riskLevel), true);
  assert.equal(Array.isArray(result.topDrivers), true);
  assert.equal(result.topDrivers.length > 0, true);
});

