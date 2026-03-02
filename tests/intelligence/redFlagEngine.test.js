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

