const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateCustomerTemperature } = require('../../src/intelligence/customerTemperatureEngine');

test('Customer temperature engine marks at_risk for complaint + breach + frustrated tone', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'returning',
    toneHistory: ['frustrated'],
    slaStatus: 'breach',
    complaintCount: 2,
    engagementScore: 0.71,
    recencyDays: 1,
  });

  assert.equal(result.temperature, 'at_risk');
  assert.equal(result.drivers.includes('sla_breach'), true);
  assert.equal(result.drivers.includes('complaint_pattern'), true);
});

test('Customer temperature engine marks stable for active but stable signals', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'active_dialogue',
    toneHistory: ['neutral'],
    slaStatus: 'safe',
    complaintCount: 0,
    engagementScore: 0.66,
    recencyDays: 2,
  });

  assert.equal(result.temperature, 'stable');
});

test('Customer temperature engine marks cool for low engagement dormant profile', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'dormant',
    toneHistory: ['neutral'],
    slaStatus: 'safe',
    complaintCount: 0,
    engagementScore: 0.1,
    recencyDays: 40,
  });

  assert.equal(result.temperature, 'cool');
});

test('Customer temperature engine marks elevated when engagement is high and SLA warns', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'returning',
    toneHistory: ['neutral'],
    slaStatus: 'warning',
    complaintCount: 0,
    engagementScore: 1,
    recencyDays: 3,
  });

  assert.equal(result.temperature, 'elevated');
  assert.equal(result.drivers.includes('sla_warning'), true);
  assert.equal(result.drivers.includes('high_engagement'), true);
});

test('Customer temperature engine records urgent tone driver', () => {
  const result = evaluateCustomerTemperature({
    toneHistory: ['urgent'],
    slaStatus: 'safe',
    complaintCount: 0,
    engagementScore: 0.35,
    recencyDays: 90,
  });

  assert.equal(result.drivers.includes('urgent_tone'), true);
});

test('Customer temperature engine handles null input with default engagement', () => {
  const result = evaluateCustomerTemperature(null);
  assert.equal(result.temperature, 'cool');
  assert.equal(result.score, 0.14);
});

test('evaluateCustomerTemperature array input behandlas som tom profil', () => {
  assert.deepEqual(evaluateCustomerTemperature([]), evaluateCustomerTemperature(null));
});

test('evaluateCustomerTemperature icke-array toneHistory ignoreras', () => {
  const withBad = evaluateCustomerTemperature({
    toneHistory: 'frustrated',
    engagementScore: 0.35,
    slaStatus: 'safe',
    complaintCount: 0,
    recencyDays: 30,
  });
  const baseline = evaluateCustomerTemperature({
    engagementScore: 0.35,
    slaStatus: 'safe',
    complaintCount: 0,
    recencyDays: 30,
  });
  assert.deepEqual(withBad, baseline);
  assert.equal(withBad.drivers.includes('frustrated_tone'), false);
});

test('evaluateCustomerTemperature okand SLA-status behandlas som safe', () => {
  const r = evaluateCustomerTemperature({
    slaStatus: 'unknown_future',
    engagementScore: 0.5,
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 90,
  });
  assert.equal(r.drivers.includes('sla_breach'), false);
  assert.equal(r.drivers.includes('sla_warning'), false);
});

test('Customer temperature engine prefers frustrated tone over anxious when both appear', () => {
  const both = evaluateCustomerTemperature({
    toneHistory: ['anxious', 'frustrated'],
    engagementScore: 0.5,
    slaStatus: 'safe',
    complaintCount: 0,
    recencyDays: 30,
  });

  assert.equal(both.drivers.includes('frustrated_tone'), true);
  assert.equal(both.drivers.includes('anxious_tone'), false);
});

test('Customer temperature engine clamps engagement and complaint contribution', () => {
  const result = evaluateCustomerTemperature({
    engagementScore: 9,
    complaintCount: 999,
    slaStatus: 'safe',
    toneHistory: [],
    recencyDays: 200,
  });

  // score = 0.35 (engagement cap) + 0.35 (complaint cap)
  assert.equal(result.score, 0.7);
  assert.equal(result.temperature, 'elevated');
});

test('Customer temperature engine treats invalid recency as not recent interaction', () => {
  const result = evaluateCustomerTemperature({
    engagementScore: 0.4,
    recencyDays: 'not-a-number',
  });

  assert.equal(result.drivers.includes('recent_interaction'), false);
  assert.equal(result.score, 0.14);
});

test('Customer temperature engine dedupes and caps drivers list', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'returning',
    toneHistory: Array.from({ length: 30 }, () => 'frustrated'),
    slaStatus: 'breach',
    complaintCount: 5,
    engagementScore: 1,
    recencyDays: 1,
  });

  assert.equal(result.drivers.length <= 8, true);
  assert.equal(new Set(result.drivers).size, result.drivers.length);
  assert.equal(result.drivers.includes('frustrated_tone'), true);
});

test('Customer temperature engine klassar warm med SLA-varning och mattlig engagement', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'ACTIVE_DIALOGUE',
    toneHistory: ['positive'],
    slaStatus: 'warning',
    complaintCount: 0,
    engagementScore: 0.55,
    recencyDays: 5,
  });
  assert.equal(result.temperature, 'warm');
  assert.ok(result.drivers.includes('sla_warning'));
});

test('Customer temperature engine normaliserar SLA-status med versaler', () => {
  const result = evaluateCustomerTemperature({
    slaStatus: 'BREACH',
    engagementScore: 0,
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 400,
  });
  assert.ok(result.drivers.includes('sla_breach'));
  assert.equal(result.temperature, 'stable');
});

test('Customer temperature engine normaliserar lifecycle returning med versaler', () => {
  const result = evaluateCustomerTemperature({
    lifecycleStatus: 'RETURNING',
    engagementScore: 0.2,
    slaStatus: 'safe',
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 100,
  });
  assert.ok(result.drivers.includes('returning_customer'));
});

test('Customer temperature engine mappar anxious tone nar frustrerad saknas', () => {
  const result = evaluateCustomerTemperature({
    toneHistory: ['anxious', 'neutral'],
    engagementScore: 0.4,
    slaStatus: 'safe',
    complaintCount: 0,
    recencyDays: 30,
  });
  assert.equal(result.drivers.includes('anxious_tone'), true);
  assert.equal(result.drivers.includes('frustrated_tone'), false);
});

test('evaluateCustomerTemperature undefined and string input match empty object', () => {
  const baseline = evaluateCustomerTemperature({});
  assert.deepEqual(evaluateCustomerTemperature(undefined), baseline);
  assert.deepEqual(evaluateCustomerTemperature('not-an-object'), baseline);
});

test('evaluateCustomerTemperature trims SLA status for warning match', () => {
  const r = evaluateCustomerTemperature({
    slaStatus: '  WARNING  ',
    engagementScore: 0.55,
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 90,
  });
  assert.ok(r.drivers.includes('sla_warning'));
});

test('evaluateCustomerTemperature adds recent_interaction when recencyDays is exactly 7', () => {
  const r = evaluateCustomerTemperature({
    engagementScore: 0.3,
    slaStatus: 'safe',
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 7,
  });
  assert.ok(r.drivers.includes('recent_interaction'));
});

test('evaluateCustomerTemperature skips recent_interaction when recencyDays is 8', () => {
  const r = evaluateCustomerTemperature({
    engagementScore: 0.3,
    slaStatus: 'safe',
    complaintCount: 0,
    toneHistory: [],
    recencyDays: 8,
  });
  assert.equal(r.drivers.includes('recent_interaction'), false);
});

test('evaluateCustomerTemperature ignores negative complaintCount', () => {
  const neg = evaluateCustomerTemperature({
    complaintCount: -5,
    engagementScore: 0.2,
    slaStatus: 'safe',
    toneHistory: [],
    recencyDays: 30,
  });
  const zero = evaluateCustomerTemperature({
    complaintCount: 0,
    engagementScore: 0.2,
    slaStatus: 'safe',
    toneHistory: [],
    recencyDays: 30,
  });
  assert.deepEqual(neg, zero);
});
