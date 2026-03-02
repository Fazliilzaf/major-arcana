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
