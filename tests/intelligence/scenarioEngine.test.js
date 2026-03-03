const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateScenarioEngine } = require('../../src/intelligence/scenarioEngine');

test('evaluateScenarioEngine returns three deterministic scenarios', () => {
  const result = evaluateScenarioEngine({
    usageAnalytics: {
      complaintRate: 0.2,
      volatilityIndex: 0.6,
    },
    monthlyRisk: {
      riskIndex: 0.7,
    },
    businessThreats: {
      strategicFlag: true,
    },
    worklist: [{ needsReplyStatus: 'needs_reply' }, { needsReplyStatus: 'needs_reply' }],
  });

  assert.equal(Array.isArray(result.scenarios), true);
  assert.equal(result.scenarios.length, 3);
  assert.equal(Boolean(result.recommendedScenario?.id), true);
  assert.equal(result.confidence >= 0 && result.confidence <= 1, true);
});

