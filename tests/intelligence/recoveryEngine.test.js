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

