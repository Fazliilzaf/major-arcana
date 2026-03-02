const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveAdaptiveFocusState } = require('../../src/intelligence/adaptiveFocusController');

test('Adaptive focus activates when red flag is active and recovery is false', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
      recommendedAction: 'Prioritera high-risk ärenden kommande 48h.',
    },
    recoveryState: { recovered: false },
    nowMs: Date.parse('2026-03-01T12:00:00.000Z'),
  });

  assert.equal(result.isActive, true);
  assert.equal(result.autoSprint, true);
  assert.deepEqual(result.focusScope, ['critical', 'high']);
  assert.equal(result.reason, 'red_flag_active');
});

test('Adaptive focus deactivates when recovery is true', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: true },
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'recovered');
});

test('Adaptive focus manual override off wins over red flag', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    manualOverride: 'off',
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'manual_override_off');
});

