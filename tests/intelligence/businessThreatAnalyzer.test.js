const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeBusinessThreats } = require('../../src/intelligence/businessThreatAnalyzer');

test('analyzeBusinessThreats raises strategic flag when threat conditions exist', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {
      slaBreachRate: 0.16,
      complaintRate: 0.2,
      complaintTrendPercent: 18,
      conversionTrendPercent: -20,
    },
    monthlyRisk: {
      breachTrendPercent: 22,
    },
    worklist: [
      { tone: 'frustrated' },
      { tone: 'frustrated' },
      { tone: 'neutral' },
    ],
  });

  assert.equal(result.strategicFlag, true);
  assert.equal(Array.isArray(result.threats), true);
  assert.equal(result.threats.length >= 1, true);
});

