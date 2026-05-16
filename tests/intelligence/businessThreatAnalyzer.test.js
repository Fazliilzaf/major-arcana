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

test('analyzeBusinessThreats returns empty threats when signals are calm', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {
      slaBreachRate: 0.05,
      complaintRate: 0.05,
      complaintTrendPercent: 0,
      conversionTrendPercent: 0,
    },
    monthlyRisk: { breachTrendPercent: 0 },
    worklist: [{ tone: 'neutral' }],
  });

  assert.equal(result.strategicFlag, false);
  assert.equal(result.threats.length, 0);
  assert.match(result.recommendedAction, /Inga tydliga systemhot/i);
});

test('analyzeBusinessThreats triggers sla_drift at 10% SLA breach rate', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0.1, complaintRate: 0, conversionTrendPercent: 0 },
    monthlyRisk: {},
    worklist: [],
  });
  assert.equal(result.threats.some((t) => t.code === 'sla_drift'), true);
});

test('analyzeBusinessThreats triggers complaint_cluster at 12% complaint rate', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0, complaintRate: 0.12, conversionTrendPercent: 0 },
    monthlyRisk: {},
    worklist: [],
  });
  assert.equal(result.threats.some((t) => t.code === 'complaint_cluster'), true);
});

test('analyzeBusinessThreats triggers tone_escalation with two frustrated worklist rows', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0, complaintRate: 0, conversionTrendPercent: 0 },
    monthlyRisk: {},
    worklist: [{ tone: 'frustrated' }, { tone: 'frustrated' }],
  });
  assert.equal(result.threats.some((t) => t.code === 'tone_escalation'), true);
});

test('analyzeBusinessThreats computes medium severity from isolated tone escalation', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {},
    monthlyRisk: {},
    worklist: [{ tone: 'frustrated' }, { tone: 'frustrated' }, { tone: 'neutral' }, { tone: 'neutral' }],
  });
  assert.equal(result.strategicFlag, true);
  assert.equal(result.severity, 'medium');
  assert.equal(result.threats[0].code, 'tone_escalation');
});

test('analyzeBusinessThreats trims generatedAt and handles non-object inputs', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: 'oops',
    monthlyRisk: null,
    worklist: 'nope',
    generatedAt: ' 2026-05-01T00:00:00.000Z ',
  });
  assert.equal(result.generatedAt, '2026-05-01T00:00:00.000Z');
  assert.equal(result.threats.length, 0);
  assert.equal(result.strategicFlag, false);
});

test('analyzeBusinessThreats limits threat list to max five entries', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {
      slaBreachRate: 1,
      complaintRate: 1,
      complaintTrendPercent: 100,
      conversionTrendPercent: -100,
    },
    monthlyRisk: { breachTrendPercent: 100 },
    worklist: Array.from({ length: 30 }, () => ({ tone: 'frustrated' })),
  });
  assert.equal(result.threats.length <= 5, true);
});

test('analyzeBusinessThreats utan argument ger inga identifierade hot', () => {
  const result = analyzeBusinessThreats();
  assert.equal(result.strategicFlag, false);
  assert.equal(result.threats.length, 0);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('analyzeBusinessThreats flaggar conversion_drop nar konvertering faller kraftigt', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {
      slaBreachRate: 0,
      complaintRate: 0,
      complaintTrendPercent: 0,
      conversionTrendPercent: -15,
    },
    monthlyRisk: {},
    worklist: [],
  });
  assert.ok(result.threats.some((t) => t.code === 'conversion_drop'));
});

test('analyzeBusinessThreats sla_drift fran monthlyRisk breach-trend', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0.02, complaintRate: 0.05, conversionTrendPercent: 0 },
    monthlyRisk: { breachTrendPercent: 20 },
    worklist: [],
  });
  assert.ok(result.threats.some((t) => t.code === 'sla_drift'));
});

test('analyzeBusinessThreats complaint_cluster nar complaintTrend ar positiv', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {
      slaBreachRate: 0,
      complaintRate: 0.05,
      complaintTrendPercent: 5,
      conversionTrendPercent: 0,
    },
    monthlyRisk: {},
    worklist: [],
  });
  assert.ok(result.threats.some((t) => t.code === 'complaint_cluster'));
});

test('analyzeBusinessThreats blankt generatedAt ger ISO-fallback', () => {
  const result = analyzeBusinessThreats({ generatedAt: '   ' });
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.generatedAt));
});

test('analyzeBusinessThreats filtrerar bort null i worklist for tone_escalation', () => {
  const result = analyzeBusinessThreats({
    usageAnalytics: {},
    monthlyRisk: {},
    worklist: [null, { tone: 'frustrated' }, { tone: 'frustrated' }],
  });
  assert.ok(result.threats.some((t) => t.code === 'tone_escalation'));
});

test('analyzeBusinessThreats conversion_drop triggers at exactly -10 percent trend', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0, complaintRate: 0, conversionTrendPercent: -10 },
    monthlyRisk: {},
    worklist: [],
  });
  assert.ok(r.threats.some((t) => t.code === 'conversion_drop'));
});

test('analyzeBusinessThreats skips conversion_drop when trend is above -10', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0, complaintRate: 0, conversionTrendPercent: -9.9 },
    monthlyRisk: {},
    worklist: [],
  });
  assert.equal(r.threats.some((t) => t.code === 'conversion_drop'), false);
});

test('analyzeBusinessThreats sla_drift when monthly breachTrendPercent is exactly 15', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0.02, complaintRate: 0, conversionTrendPercent: 0 },
    monthlyRisk: { breachTrendPercent: 15 },
    worklist: [],
  });
  assert.ok(r.threats.some((t) => t.code === 'sla_drift'));
});

test('analyzeBusinessThreats skips sla_drift when monthly breach trend is 14', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: { slaBreachRate: 0.02, complaintRate: 0, conversionTrendPercent: 0 },
    monthlyRisk: { breachTrendPercent: 14 },
    worklist: [],
  });
  assert.equal(r.threats.some((t) => t.code === 'sla_drift'), false);
});

test('analyzeBusinessThreats counts frustrated tone case-insensitively', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: {},
    monthlyRisk: {},
    worklist: [{ tone: 'FRUSTRATED' }, { tone: 'frustrated' }],
  });
  assert.ok(r.threats.some((t) => t.code === 'tone_escalation'));
});

test('analyzeBusinessThreats no tone_escalation with only one frustrated row', () => {
  const r = analyzeBusinessThreats({
    usageAnalytics: {},
    monthlyRisk: {},
    worklist: [{ tone: 'frustrated' }, { tone: 'neutral' }],
  });
  assert.equal(r.threats.some((t) => t.code === 'tone_escalation'), false);
});

