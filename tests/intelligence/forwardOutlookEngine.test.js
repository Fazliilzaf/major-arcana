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

test('evaluateForwardOutlook uses score defaults when history and snapshots are empty', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [],
    dailySnapshots: [],
    usageAnalytics: {},
    horizonDays: 7,
    generatedAt: '2026-04-01T12:00:00.000Z',
  });

  assert.equal(result.riskForecast.projectedHealthScore, 75);
  assert.equal(result.capacityForecast.state, 'comfortable');
  assert.equal(result.generatedAt, '2026-04-01T12:00:00.000Z');
  assert.match(result.recommendedPreparation[0], /Nuvarande trend är stabil/i);
});

test('evaluateForwardOutlook clamps horizonDays between 1 and 30', () => {
  const low = evaluateForwardOutlook({
    healthHistory: [{ score: 70 }],
    dailySnapshots: [],
    usageAnalytics: {},
    horizonDays: 0,
  });
  const high = evaluateForwardOutlook({
    healthHistory: [{ score: 70 }],
    dailySnapshots: [],
    usageAnalytics: {},
    horizonDays: 99,
  });
  assert.equal(low.horizonDays, 1);
  assert.equal(high.horizonDays, 30);
});

test('evaluateForwardOutlook marks capacity strained under heavy backlog', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [{ score: 72 }, { score: 71 }],
    dailySnapshots: [{ healthScore: 70, unresolvedCount: 50, complaintRate: 0.2 }],
    usageAnalytics: { avgResponseTimeHours: 22 },
    horizonDays: 7,
  });
  assert.equal(result.capacityForecast.state, 'strained');
});

test('evaluateForwardOutlook falls back to dailySnapshots for trend when healthHistory empty', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [],
    dailySnapshots: [
      { healthScore: 80, unresolvedCount: 2, complaintRate: 0.05 },
      { healthScore: 65, unresolvedCount: 2, complaintRate: 0.05 },
    ],
    usageAnalytics: { volatilityIndex: 0.2 },
    horizonDays: 7,
  });
  assert.equal(result.riskForecast.projectedHealthScore, 0);
  assert.equal(['high', 'medium'].includes(result.riskForecast.level), true);
});

test('evaluateForwardOutlook derives volatility from slope when usage volatility missing', () => {
  const volatile = evaluateForwardOutlook({
    healthHistory: [{ score: 90 }, { score: 50 }],
    dailySnapshots: [{ healthScore: 50, unresolvedCount: 5, complaintRate: 0.05 }],
    usageAnalytics: {},
    horizonDays: 7,
  });
  const stable = evaluateForwardOutlook({
    healthHistory: [{ score: 70 }, { score: 69 }],
    dailySnapshots: [{ healthScore: 69, unresolvedCount: 5, complaintRate: 0.05 }],
    usageAnalytics: {},
    horizonDays: 7,
  });
  assert.equal(volatile.volatilityIndex > stable.volatilityIndex, true);
});

test('evaluateForwardOutlook builds medium-risk and balanced-capacity preparation actions', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [{ score: 50 }, { score: 45 }],
    dailySnapshots: [{ healthScore: 45, unresolvedCount: 18, complaintRate: 0.08 }],
    usageAnalytics: { avgResponseTimeHours: 12, volatilityIndex: 0.2 },
    horizonDays: 1,
  });

  assert.equal(result.riskForecast.level, 'medium');
  assert.equal(result.capacityForecast.state, 'balanced');
  assert.equal(
    result.recommendedPreparation.some((x) => /obesvarade med (hogst|högst) prioritet/i.test(x)),
    true
  );
  assert.equal(
    result.recommendedPreparation.some((x) => /Fördela svarspass/i.test(x)),
    true
  );
});

test('evaluateForwardOutlook handles non-object usageAnalytics and trims generatedAt', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [{ score: 75 }],
    dailySnapshots: [{ healthScore: 75, unresolvedCount: 1, complaintRate: 0.01 }],
    usageAnalytics: 'oops',
    generatedAt: ' 2026-04-02T09:00:00.000Z ',
  });
  assert.equal(result.generatedAt, '2026-04-02T09:00:00.000Z');
  assert.equal(result.capacityForecast.backlogCount, 1);
  assert.equal(result.recommendedPreparation.length <= 3, true);
});

test('evaluateForwardOutlook utan argument ger horizon 7 och giltig generatedAt', () => {
  const result = evaluateForwardOutlook();
  assert.equal(result.horizonDays, 7);
  assert.equal(typeof result.riskForecast.level, 'string');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('evaluateForwardOutlook tolererar null healthHistory och dailySnapshots', () => {
  const result = evaluateForwardOutlook({
    healthHistory: null,
    dailySnapshots: null,
    usageAnalytics: {},
  });
  assert.equal(result.riskForecast.projectedHealthScore, 75);
});

test('evaluateForwardOutlook blankt generatedAt ger ISO-fallback', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [{ score: 75 }],
    dailySnapshots: [],
    generatedAt: '  ',
  });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('evaluateForwardOutlook high risk och strained capacity ger SLA- och sprintatgarder', () => {
  const result = evaluateForwardOutlook({
    healthHistory: [{ score: 20 }, { score: 15 }],
    dailySnapshots: [{ healthScore: 15, unresolvedCount: 30, complaintRate: 0.4 }],
    usageAnalytics: { avgResponseTimeHours: 20, volatilityIndex: 0.95 },
    horizonDays: 14,
  });
  assert.equal(result.riskForecast.level, 'high');
  assert.equal(result.capacityForecast.state, 'strained');
  assert.ok(result.recommendedPreparation.some((a) => /48h/i.test(a)));
  assert.ok(result.recommendedPreparation.some((a) => /sprint/i.test(a)));
});

