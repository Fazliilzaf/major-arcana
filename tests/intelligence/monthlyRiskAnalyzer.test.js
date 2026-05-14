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

test('analyzeMonthlyRisk handles empty snapshots with stable low risk', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [],
    usageAnalytics: { volatilityIndex: 0 },
    windowDays: 30,
    generatedAt: '2026-05-01T00:00:00.000Z',
  });

  assert.equal(result.riskLevel, 'low');
  assert.equal(result.riskIndex, 0);
  assert.equal(result.trendDirection, 'stable');
  assert.equal(result.generatedAt, '2026-05-01T00:00:00.000Z');
});

test('analyzeMonthlyRisk clamps windowDays to at least 7', () => {
  const snaps = Array.from({ length: 10 }).map(() => ({
    slaBreachRate: 0.02,
    complaintRate: 0.02,
    unresolvedCount: 5,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots: snaps,
    usageAnalytics: { volatilityIndex: 0.1 },
    windowDays: 3,
  });
  assert.equal(result.windowDays, 7);
});

test('analyzeMonthlyRisk marks rising trend when second half SLA worsens', () => {
  const calm = Array.from({ length: 15 }).map(() => ({
    slaBreachRate: 0.02,
    complaintRate: 0.02,
    unresolvedCount: 8,
  }));
  const hot = Array.from({ length: 15 }).map(() => ({
    slaBreachRate: 0.2,
    complaintRate: 0.02,
    unresolvedCount: 8,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots: [...calm, ...hot],
    usageAnalytics: { volatilityIndex: 0.2 },
    windowDays: 30,
  });
  assert.equal(result.trendDirection, 'rising');
});

test('analyzeMonthlyRisk tolerates null usageAnalytics', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [
      { slaBreachRate: 0.01, complaintRate: 0.01, unresolvedCount: 2 },
      { slaBreachRate: 0.02, complaintRate: 0.02, unresolvedCount: 2 },
    ],
    usageAnalytics: null,
    windowDays: 7,
  });
  assert.ok(Number.isFinite(result.riskIndex));
  assert.equal(result.confidence <= 1, true);
});

test('analyzeMonthlyRisk sets 100% trend when first half baseline is zero', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [
      { slaBreachRate: 0, complaintRate: 0, unresolvedCount: 1 },
      { slaBreachRate: 0, complaintRate: 0, unresolvedCount: 1 },
      { slaBreachRate: 0.1, complaintRate: 0.2, unresolvedCount: 1 },
      { slaBreachRate: 0.1, complaintRate: 0.2, unresolvedCount: 1 },
    ],
    usageAnalytics: {},
    windowDays: 7,
  });
  assert.equal(result.breachTrendPercent, 100);
  assert.equal(result.complaintTrendPercent, 100);
  assert.equal(result.trendDirection, 'rising');
});

test('analyzeMonthlyRisk marks falling trend when second half improves strongly', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [
      { slaBreachRate: 0.2, complaintRate: 0.2, unresolvedCount: 10 },
      { slaBreachRate: 0.2, complaintRate: 0.2, unresolvedCount: 10 },
      { slaBreachRate: 0.01, complaintRate: 0.01, unresolvedCount: 10 },
      { slaBreachRate: 0.01, complaintRate: 0.01, unresolvedCount: 10 },
    ],
    usageAnalytics: { volatilityIndex: 0 },
    windowDays: 7,
  });
  assert.equal(result.trendDirection, 'falling');
});

test('analyzeMonthlyRisk clamps windowDays to max 90 and trims generatedAt', () => {
  const snaps = Array.from({ length: 120 }, () => ({
    slaBreachRate: 0.05,
    complaintRate: 0.05,
    unresolvedCount: 5,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots: snaps,
    usageAnalytics: {},
    windowDays: 999,
    generatedAt: ' 2026-05-01T00:00:00.000Z ',
  });
  assert.equal(result.windowDays, 90);
  assert.equal(result.generatedAt, '2026-05-01T00:00:00.000Z');
});

test('analyzeMonthlyRisk utan argument ger low risk och windowDays 30', () => {
  const result = analyzeMonthlyRisk();
  assert.equal(result.windowDays, 30);
  assert.equal(result.riskLevel, 'low');
  assert.equal(result.riskIndex, 0);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('analyzeMonthlyRisk tolererar null dailySnapshots', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: null,
    usageAnalytics: {},
    windowDays: 30,
  });
  assert.equal(result.riskIndex, 0);
  assert.equal(result.riskLevel, 'low');
});

test('analyzeMonthlyRisk blankt generatedAt ger ISO-fallback', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [],
    usageAnalytics: {},
    generatedAt: '   ',
  });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('analyzeMonthlyRisk filtrerar bort icke-objekt i snapshots', () => {
  const result = analyzeMonthlyRisk({
    dailySnapshots: [
      null,
      'x',
      { slaBreachRate: 0.1, complaintRate: 0.05, unresolvedCount: 10 },
      { slaBreachRate: 0.12, complaintRate: 0.06, unresolvedCount: 10 },
    ],
    usageAnalytics: { volatilityIndex: 0 },
    windowDays: 7,
  });
  assert.ok(Number.isFinite(result.riskIndex));
  assert.equal(result.topDrivers.length, 3);
});

test('analyzeMonthlyRisk klassar high vid extrema andra halvlek och max volatility', () => {
  const calm = Array.from({ length: 45 }, () => ({
    slaBreachRate: 0.05,
    complaintRate: 0.05,
    unresolvedCount: 5,
  }));
  const heavy = Array.from({ length: 45 }, () => ({
    slaBreachRate: 0.85,
    complaintRate: 0.9,
    unresolvedCount: 80,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots: [...calm, ...heavy],
    usageAnalytics: { volatilityIndex: 1 },
    windowDays: 90,
  });
  assert.equal(result.riskLevel, 'high');
  assert.ok(result.riskIndex >= 0.7);
});

test('analyzeMonthlyRisk behandlar usageAnalytics som primitiv som tom volatility', () => {
  const snaps = [
    { slaBreachRate: 0.1, complaintRate: 0.05, unresolvedCount: 10 },
    { slaBreachRate: 0.1, complaintRate: 0.05, unresolvedCount: 10 },
  ];
  const withObject = analyzeMonthlyRisk({
    dailySnapshots: snaps,
    usageAnalytics: { volatilityIndex: 0.5 },
    windowDays: 7,
  });
  const withNumber = analyzeMonthlyRisk({
    dailySnapshots: snaps,
    usageAnalytics: 999,
    windowDays: 7,
  });
  assert.ok(withNumber.riskIndex < withObject.riskIndex);
});

test('analyzeMonthlyRisk tolkar windowDays som sträng och generatedAt som icke-sträng', () => {
  const snaps = Array.from({ length: 10 }).map(() => ({
    slaBreachRate: 0.02,
    complaintRate: 0.02,
    unresolvedCount: 5,
  }));
  const result = analyzeMonthlyRisk({
    dailySnapshots: snaps,
    usageAnalytics: {},
    windowDays: '14',
    generatedAt: 20260501,
  });
  assert.equal(result.windowDays, 14);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

