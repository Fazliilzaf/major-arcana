const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateRedFlag } = require('../../src/intelligence/redFlagEngine');

test('RedFlag triggers on rapid health drop over 48h', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 64,
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 80 },
      { ts: '2026-02-28T10:00:00.000Z', score: 76 },
    ],
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.isActive, true);
  assert.equal(result.triggerType, 'rapid_drop');
  assert.equal(result.delta <= -10, true);
});

test('RedFlag triggers on critical threshold', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 55,
    healthHistory: [{ ts: '2026-03-01T08:00:00.000Z', score: 58 }],
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.isActive, true);
  assert.equal(result.criticalThresholdTriggered, true);
});

test('RedFlag triggers cluster when two or more cluster signals are active', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 72,
    previousHealthScore48h: 73,
    clusterSignals: {
      slaBreachRateUp: true,
      complaintSpike: true,
      conversionDrop: false,
      volatilityIndex: 0.7,
    },
  });

  assert.equal(result.isActive, true);
  assert.equal(result.clusterTriggered, true);
  assert.equal(result.primaryDrivers.includes('sla_breach'), true);
  assert.equal(result.primaryDrivers.includes('complaint_spike'), true);
});

test('RedFlag inactive when score stable and fewer than two cluster signals', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 90,
    previousHealthScore48h: 88,
    clusterSignals: { slaBreachRateUp: true, complaintSpike: false },
    usageMetrics: {},
  });

  assert.equal(result.isActive, false);
  assert.equal(result.severity, 'none');
  assert.equal(result.recommendedAction, '');
});

test('RedFlag honors explicit previousHealthScore48h over history', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 65,
    previousHealthScore48h: 80,
    healthHistory: [{ ts: '2020-01-01T00:00:00.000Z', score: 99 }],
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.baselineHealthScore48h, 80);
  assert.equal(result.delta, -15);
  assert.equal(result.triggerType, 'rapid_drop');
  assert.equal(result.severity, 'high');
});

test('RedFlag recommendedAction combines SLA and complaint cluster drivers', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 72,
    previousHealthScore48h: 72,
    clusterSignals: {
      slaBreachRateUp: true,
      complaintSpike: true,
    },
  });

  assert.equal(result.isActive, true);
  assert.match(result.recommendedAction, /48h/i);
});

test('RedFlag severity high when at least three cluster signals fire', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 70,
    previousHealthScore48h: 69,
    clusterSignals: {
      slaBreachRateUp: true,
      complaintSpike: true,
      conversionDrop: true,
      volatilityIndex: 0.9,
    },
  });

  assert.equal(result.clusterTriggered, true);
  assert.equal(result.severity, 'high');
});

test('RedFlag derives cluster signals from usageMetrics trends when booleans are absent', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 78,
    previousHealthScore48h: 79,
    clusterSignals: {},
    usageMetrics: {
      slaBreachTrendPercent: 12,
      complaintTrendPercent: 4,
      conversionTrendPercent: -2,
      volatilityIndex: 0.7,
    },
  });

  assert.equal(result.clusterSignals.slaBreachRateUp, true);
  assert.equal(result.clusterSignals.complaintSpike, true);
  assert.equal(result.clusterSignals.conversionDrop, true);
  assert.equal(result.clusterSignals.volatilityHigh, true);
  assert.equal(result.clusterTriggered, true);
});

test('RedFlag falls back to current score when no valid 48h baseline exists', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 71,
    healthHistory: [{ ts: 'invalid-date', score: 10 }],
    nowMs: 'not-a-number',
  });

  assert.equal(result.baselineHealthScore48h, 71);
  assert.equal(result.delta, 0);
  assert.equal(result.rapidDropTriggered, false);
});

test('RedFlag recommendation targets conversion when conversion_drop is primary active driver', () => {
  const result = evaluateRedFlag({
    currentHealthScore: 80,
    previousHealthScore48h: 80,
    clusterSignals: {
      conversionDrop: true,
      slaBreachRateUp: false,
      complaintSpike: false,
      volatilityIndex: 0.2,
    },
  });

  assert.equal(result.clusterTriggered, false);
  assert.equal(result.isActive, false);
  // Activate via critical threshold so conversion remains the only cluster driver in list.
  const active = evaluateRedFlag({
    currentHealthScore: 55,
    previousHealthScore48h: 80,
    clusterSignals: {
      conversionDrop: true,
      complaintSpike: false,
      slaBreachRateUp: false,
    },
  });
  assert.match(active.recommendedAction, /CTA|bokningsflöde/i);
});

test('evaluateRedFlag default invocation stays inactive', () => {
  const r = evaluateRedFlag();
  assert.equal(r.isActive, false);
  assert.equal(r.triggerType, 'none');
  assert.equal(r.severity, 'none');
});

test('evaluateRedFlag adds health_threshold when critical with no other primary drivers', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 55,
    previousHealthScore48h: 54,
    clusterSignals: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.criticalThresholdTriggered, true);
  assert.ok(r.primaryDrivers.includes('health_threshold'));
});

test('evaluateRedFlag volatilityHigh requires index strictly above 0.6', () => {
  const atEdge = evaluateRedFlag({
    currentHealthScore: 80,
    previousHealthScore48h: 80,
    clusterSignals: {
      slaBreachRateUp: true,
      complaintSpike: true,
      volatilityIndex: 0.6,
    },
  });
  assert.equal(atEdge.clusterSignals.volatilityHigh, false);

  const above = evaluateRedFlag({
    currentHealthScore: 80,
    previousHealthScore48h: 80,
    clusterSignals: {
      slaBreachRateUp: true,
      complaintSpike: true,
      volatilityIndex: 0.61,
    },
  });
  assert.equal(above.clusterSignals.volatilityHigh, true);
});

test('evaluateRedFlag ignores non-object clusterSignals', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 85,
    previousHealthScore48h: 84,
    clusterSignals: [{ slaBreachRateUp: true }],
    usageMetrics: { slaBreachTrendPercent: 0, complaintTrendPercent: 0 },
  });
  assert.equal(r.clusterTriggered, false);
});

test('evaluateRedFlag recommends complaint handling when complaint_spike is sole cluster driver', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 55,
    previousHealthScore48h: 80,
    clusterSignals: {
      slaBreachRateUp: false,
      complaintSpike: true,
      conversionDrop: false,
      volatilityIndex: 0.2,
    },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.isActive, true);
  assert.match(r.recommendedAction, /complaint/i);
});

test('evaluateRedFlag rapid_drop triggers when delta is exactly -10', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 70,
    previousHealthScore48h: 80,
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.delta, -10);
  assert.equal(r.rapidDropTriggered, true);
  assert.equal(r.isActive, true);
});

test('evaluateRedFlag rapid_drop does not trigger when delta is above -10', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 70.01,
    previousHealthScore48h: 80,
    clusterSignals: {},
    usageMetrics: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.rapidDropTriggered, false);
  assert.equal(r.delta > -10, true);
});

test('evaluateRedFlag criticalThreshold uses strict comparison below 60', () => {
  const below = evaluateRedFlag({
    currentHealthScore: 59.9,
    previousHealthScore48h: 70,
    clusterSignals: {},
    usageMetrics: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  const at60 = evaluateRedFlag({
    currentHealthScore: 60,
    previousHealthScore48h: 70,
    clusterSignals: {},
    usageMetrics: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(below.criticalThresholdTriggered, true);
  assert.equal(at60.criticalThresholdTriggered, false);
});

test('evaluateRedFlag uses generic stabilization action when primary driver is only health_drop', () => {
  const r = evaluateRedFlag({
    currentHealthScore: 68,
    previousHealthScore48h: 80,
    clusterSignals: {},
    usageMetrics: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.ok(r.primaryDrivers.includes('health_drop'));
  assert.match(r.recommendedAction, /Stabilisera|kritiska/i);
});

