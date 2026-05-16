const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateRecovery } = require('../../src/intelligence/recoveryEngine');

test('Recovery returns recovered=true when 3 of 4 stabilization rules pass', () => {
  const result = evaluateRecovery({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['sla_breach', 'complaint_spike', 'conversion_drop'],
    },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 70 },
      { ts: '2026-02-28T10:00:00.000Z', score: 72 },
      { ts: '2026-03-01T10:00:00.000Z', score: 71 },
    ],
    slaBreachHistory: [
      { ts: '2026-02-28T20:00:00.000Z', rate: 0.03 },
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.04 },
    ],
    volatilityHistory: [
      { ts: '2026-03-01T09:30:00.000Z', index: 0.31 },
    ],
    driverDeltas: {
      sla_breach: -0.1,
      complaint_spike: -0.2,
      conversion_drop: 0.01,
    },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.recovered, true);
  assert.equal(result.rulesMet >= 3, true);
  assert.equal(result.confidence >= 0.75, true);
  assert.equal(result.driversResolved.includes('sla_breach'), true);
  assert.equal(result.driversResolved.includes('complaint_spike'), true);
});

test('Recovery stays false when rules are insufficient', () => {
  const result = evaluateRecovery({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
    },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 70 },
      { ts: '2026-02-28T10:00:00.000Z', score: 79 },
      { ts: '2026-03-01T10:00:00.000Z', score: 66 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.2 },
    ],
    volatilityHistory: [
      { ts: '2026-03-01T09:30:00.000Z', index: 0.72 },
    ],
    driverDeltas: {
      sla_breach: 0.2,
      complaint_spike: 0.3,
    },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.recovered, false);
  assert.equal(result.rulesMet < 3, true);
});

test('Recovery reason no_active_red_flag when red flag inactive and signals weak', () => {
  const result = evaluateRecovery({
    redFlagState: { isActive: false, primaryDrivers: [] },
    healthHistory: [{ ts: '2026-03-01T10:00:00.000Z', score: 70 }],
    slaBreachHistory: [],
    volatilityHistory: [],
    driverDeltas: {},
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.recovered, false);
  assert.equal(result.reason, 'no_active_red_flag');
  assert.equal(result.rulesMet, 0);
});

test('Recovery reason insufficient_signals when active but rulesMet below threshold', () => {
  const result = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    healthHistory: [{ ts: '2026-03-01T10:00:00.000Z', score: 70 }],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-01T09:30:00.000Z', rate: 0.02 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T09:45:00.000Z', index: 0.72 }],
    driverDeltas: { sla_breach: 0.05 },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.recovered, false);
  assert.equal(result.reason, 'insufficient_signals');
});

test('Recovery slaNormalized respects custom breachThreshold', () => {
  const loose = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 71 },
      { ts: '2026-02-28T10:00:00.000Z', score: 72 },
      { ts: '2026-03-01T10:00:00.000Z', score: 71 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.04 },
      { ts: '2026-03-01T10:00:00.000Z', rate: 0.04 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T10:00:00.000Z', index: 0.3 }],
    driverDeltas: { sla_breach: -0.1 },
    breachThreshold: 0.05,
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(loose.rules.slaNormalized, true);

  const strict = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 71 },
      { ts: '2026-02-28T10:00:00.000Z', score: 72 },
      { ts: '2026-03-01T10:00:00.000Z', score: 71 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.04 },
      { ts: '2026-03-01T10:00:00.000Z', rate: 0.04 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T10:00:00.000Z', index: 0.3 }],
    driverDeltas: { sla_breach: -0.1 },
    breachThreshold: 0.03,
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(strict.rules.slaNormalized, false);
});

test('Recovery daysStable becomes 3 when last three health scores are tightly bounded', () => {
  const result = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 70 },
      { ts: '2026-03-02T10:00:00.000Z', score: 71 },
      { ts: '2026-03-03T10:00:00.000Z', score: 69.5 },
    ],
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(result.rules.healthStabilized, true);
  assert.equal(result.daysStable, 3);
});

test('Recovery chooses latest volatility point by timestamp', () => {
  const result = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 70 },
      { ts: '2026-03-02T10:00:00.000Z', score: 70 },
      { ts: '2026-03-03T10:00:00.000Z', score: 70 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-03T09:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-03T10:00:00.000Z', rate: 0.01 },
    ],
    volatilityHistory: [
      { ts: '2026-03-03T10:00:00.000Z', index: 0.9 },
      { ts: '2026-03-03T11:00:00.000Z', index: 0.2 },
    ],
    driverDeltas: { sla_breach: -0.1 },
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(result.rules.volatilityDropped, true);
});

test('Recovery breachThreshold is clamped to [0,1]', () => {
  const strict = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    slaBreachHistory: [
      { ts: '2026-03-03T09:00:00.000Z', rate: 0.6 },
      { ts: '2026-03-03T10:00:00.000Z', rate: 0.7 },
    ],
    breachThreshold: 999,
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(strict.rules.slaNormalized, true);

  const loose = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    slaBreachHistory: [
      { ts: '2026-03-03T09:00:00.000Z', rate: 0.0001 },
      { ts: '2026-03-03T10:00:00.000Z', rate: 0.0001 },
    ],
    breachThreshold: -10,
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(loose.rules.slaNormalized, false);
});

test('evaluateRecovery default anrop ger no_active_red_flag', () => {
  const r = evaluateRecovery();
  assert.equal(r.recovered, false);
  assert.equal(r.reason, 'no_active_red_flag');
  assert.equal(r.rulesMet, 0);
});

test('Recovery behandlar redFlagState-array som saknad aktiv flagga', () => {
  const result = evaluateRecovery({
    redFlagState: [],
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 70 },
      { ts: '2026-03-02T10:00:00.000Z', score: 71 },
      { ts: '2026-03-03T10:00:00.000Z', score: 70 },
    ],
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(result.reason, 'no_active_red_flag');
});

test('Recovery ignorerar driverDeltas som inte ar objekt', () => {
  const result = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach', 'complaint_spike'] },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 71 },
      { ts: '2026-02-28T10:00:00.000Z', score: 72 },
      { ts: '2026-03-01T10:00:00.000Z', score: 71 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-01T10:00:00.000Z', rate: 0.02 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T10:00:00.000Z', index: 0.3 }],
    driverDeltas: [],
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(result.rules.driverResolution, false);
});

test('evaluateRecovery null redFlagState behaves like empty red flag', () => {
  const r = evaluateRecovery({
    redFlagState: null,
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.reason, 'no_active_red_flag');
  assert.equal(r.recovered, false);
});

test('evaluateRecovery ignores non-array healthHistory', () => {
  const r = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    healthHistory: 'not-array',
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.rules.healthStabilized, false);
});

test('evaluateRecovery drops SLA breach samples outside the 48h window', () => {
  const now = Date.parse('2026-03-10T12:00:00.000Z');
  const r = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    slaBreachHistory: [
      { ts: '2026-03-01T12:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-02T12:00:00.000Z', rate: 0.02 },
    ],
    breachThreshold: 0.05,
    nowMs: now,
  });
  assert.equal(r.rules.slaNormalized, false);
});

test('evaluateRecovery driverResolution true for single driver with negative delta', () => {
  const r = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 71 },
      { ts: '2026-02-28T10:00:00.000Z', score: 72 },
      { ts: '2026-03-01T10:00:00.000Z', score: 71 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-01T10:00:00.000Z', rate: 0.02 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T10:00:00.000Z', index: 0.3 }],
    driverDeltas: { sla_breach: -0.05 },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.rules.driverResolution, true);
});

test('evaluateRecovery volatilityDropped is strict on index below 0.4', () => {
  const nowMs = Date.parse('2026-03-03T12:00:00.000Z');
  const shared = {
    redFlagState: { isActive: true, primaryDrivers: [] },
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 70 },
      { ts: '2026-03-02T10:00:00.000Z', score: 71 },
      { ts: '2026-03-03T10:00:00.000Z', score: 70 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-03T09:00:00.000Z', rate: 0.01 },
      { ts: '2026-03-03T10:00:00.000Z', rate: 0.01 },
    ],
    nowMs,
  };
  const below = evaluateRecovery({
    ...shared,
    volatilityHistory: [{ ts: '2026-03-03T11:00:00.000Z', index: 0.39 }],
  });
  const atEdge = evaluateRecovery({
    ...shared,
    volatilityHistory: [{ ts: '2026-03-03T11:00:00.000Z', index: 0.4 }],
  });
  assert.equal(below.rules.volatilityDropped, true);
  assert.equal(atEdge.rules.volatilityDropped, false);
});

test('evaluateRecovery healthStabilized true when last-three score span is exactly three', () => {
  const r = evaluateRecovery({
    redFlagState: { isActive: true, primaryDrivers: [] },
    healthHistory: [
      { ts: '2026-03-01T10:00:00.000Z', score: 80 },
      { ts: '2026-03-02T10:00:00.000Z', score: 83 },
      { ts: '2026-03-03T10:00:00.000Z', score: 81 },
    ],
    nowMs: Date.parse('2026-03-03T12:00:00.000Z'),
  });
  assert.equal(r.rules.healthStabilized, true);
});

test('evaluateRecovery reason stabilized when all four rules pass', () => {
  const r = evaluateRecovery({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
    },
    healthHistory: [
      { ts: '2026-02-27T10:00:00.000Z', score: 70 },
      { ts: '2026-02-28T10:00:00.000Z', score: 71 },
      { ts: '2026-03-01T10:00:00.000Z', score: 70 },
    ],
    slaBreachHistory: [
      { ts: '2026-03-01T09:00:00.000Z', rate: 0.02 },
      { ts: '2026-03-01T10:00:00.000Z', rate: 0.03 },
    ],
    volatilityHistory: [{ ts: '2026-03-01T10:30:00.000Z', index: 0.35 }],
    driverDeltas: { sla_breach: -0.1, complaint_spike: -0.1 },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });
  assert.equal(r.recovered, true);
  assert.equal(r.rulesMet, 4);
  assert.equal(r.confidence, 1);
  assert.equal(r.reason, 'stabilized');
});

