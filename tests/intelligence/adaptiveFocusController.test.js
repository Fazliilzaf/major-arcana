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

test('Adaptive focus manual override on tvingar aktivt läge utan red flag', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: false },
    recoveryState: { recovered: false },
    manualOverride: '  ON ',
    nowMs: Date.parse('2026-04-10T08:00:00.000Z'),
    durationHours: 24,
  });
  assert.equal(result.isActive, true);
  assert.equal(result.reason, 'red_flag_active');
  assert.equal(result.visualState, 'focus_mode');
  assert.equal(result.until, '2026-04-11T08:00:00.000Z');
});

test('Adaptive focus manual off trimmas och slår av trots återhämtad false', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    manualOverride: '  OFF\t',
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'manual_override_off');
});

test('Adaptive focus inaktiv red flag utan override ger no_trigger och normal vy', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: false },
    recoveryState: { recovered: false },
    nowMs: Date.parse('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'no_trigger');
  assert.deepEqual(result.focusScope, []);
  assert.equal(result.visualState, 'normal');
  assert.equal(result.until, null);
  assert.equal(result.startedAt, '2026-01-01T00:00:00.000Z');
});

test('Adaptive focus durationHours kläms till 1–168 timmar', () => {
  const low = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    nowMs: 0,
    durationHours: 0,
  });
  assert.equal(low.durationHours, 1);

  const high = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    nowMs: 0,
    durationHours: 999,
  });
  assert.equal(high.durationHours, 168);
});

test('Adaptive focus begränsar primaryDrivers till fyra poster', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['a', 'b', 'c', 'd', 'e', 'f'],
      recommendedAction: '  ',
    },
    recoveryState: { recovered: false },
  });
  assert.deepEqual(result.primaryDrivers, ['a', 'b', 'c', 'd']);
  assert.equal(result.recommendedAction, '');
});

test('Adaptive focus ignorerar ogiltiga redFlagState-typer', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: ['not', 'an', 'object'],
    recoveryState: { recovered: false },
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'no_trigger');
});

test('Adaptive focus manual ON överstyr även recovered=true', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: false, recommendedAction: 'Kör sprint.' },
    recoveryState: { recovered: true },
    manualOverride: 'on',
  });
  assert.equal(result.isActive, true);
  assert.equal(result.reason, 'red_flag_active');
});

test('Adaptive focus rensar drivers/action när läget är inaktivt', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: {
      isActive: true,
      primaryDrivers: ['sla_breach', 'complaint_spike'],
      recommendedAction: 'Prioritera.',
    },
    recoveryState: { recovered: true },
  });
  assert.deepEqual(result.primaryDrivers, []);
  assert.equal(result.recommendedAction, '');
  assert.equal(result.until, null);
});

test('Adaptive focus tolererar ogiltigt nowMs och ger giltiga tidsfält', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: null,
    nowMs: 'not-a-number',
  });
  assert.match(result.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(result.until, /^\d{4}-\d{2}-\d{2}T/);
});

test('Adaptive focus durationHours NaN falls back to 48 before clamp', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    nowMs: Date.parse('2026-01-01T00:00:00.000Z'),
    durationHours: Number.NaN,
  });
  assert.equal(result.durationHours, 48);
});

test('Adaptive focus durationHours nullish coerces to 1 hour minimum', () => {
  const fromNull = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    durationHours: null,
  });
  assert.equal(fromNull.durationHours, 1);

  const fromUndef = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    durationHours: undefined,
  });
  assert.equal(fromUndef.durationHours, 48);
});

test('Adaptive focus durationHours string parses to rounded hours', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: { recovered: false },
    durationHours: '72',
  });
  assert.equal(result.durationHours, 72);
});

test('Adaptive focus ignorerar icke-array primaryDrivers', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: {
      isActive: true,
      primaryDrivers: 'sla_only',
      recommendedAction: 'Act',
    },
    recoveryState: { recovered: false },
  });
  assert.deepEqual(result.primaryDrivers, []);
});

test('Adaptive focus ignorerar icke-objekt recoveryState', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: true },
    recoveryState: ['recovered'],
  });
  assert.equal(result.isActive, true);
  assert.equal(result.reason, 'red_flag_active');
});

test('Adaptive focus okänd manualOverride påverkar inte no_trigger', () => {
  const result = resolveAdaptiveFocusState({
    redFlagState: { isActive: false },
    recoveryState: { recovered: false },
    manualOverride: 'maybe',
  });
  assert.equal(result.isActive, false);
  assert.equal(result.reason, 'no_trigger');
});

test('resolveAdaptiveFocusState requires redFlag isActive strictly true', () => {
  const stringFlag = resolveAdaptiveFocusState({
    redFlagState: { isActive: 'true', primaryDrivers: ['sla_breach'] },
    recoveryState: { recovered: false },
  });
  const numericFlag = resolveAdaptiveFocusState({
    redFlagState: { isActive: 1, primaryDrivers: ['sla_breach'] },
    recoveryState: { recovered: false },
  });
  assert.equal(stringFlag.isActive, false);
  assert.equal(stringFlag.reason, 'no_trigger');
  assert.equal(numericFlag.isActive, false);
});

test('resolveAdaptiveFocusState requires recovery.recovered strictly true to clear focus', () => {
  const r = resolveAdaptiveFocusState({
    redFlagState: { isActive: true, primaryDrivers: ['sla_breach'] },
    recoveryState: { recovered: 'true' },
  });
  assert.equal(r.isActive, true);
  assert.equal(r.reason, 'red_flag_active');
});

test('resolveAdaptiveFocusState default invocation is inactive', () => {
  const r = resolveAdaptiveFocusState();
  assert.equal(r.isActive, false);
  assert.equal(r.reason, 'no_trigger');
  assert.deepEqual(r.focusScope, []);
  assert.equal(r.until, null);
});

