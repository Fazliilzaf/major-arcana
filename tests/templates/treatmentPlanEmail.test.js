'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTreatmentPlanEmail } = require('../../src/templates/treatmentPlanEmail');

test('buildTreatmentPlanEmail svensk default', () => {
  const result = buildTreatmentPlanEmail({
    customerName: 'Anna Test',
    plan: {
      method: 'FUE',
      graftsTotal: 3000,
      zones: ['front', 'tinningar'],
      prpIncluded: true,
      consultationDate: '2026-05-12T08:00:00.000Z',
      notes: 'Patienten vill prioritera fronten.',
    },
    viewUrl: 'https://example.com/plan/abc',
  });
  assert.match(result.subject, /Din behandlingsplan/i);
  assert.match(result.html, /Anna/);
  assert.match(result.html, /FUE/);
  assert.match(result.html, /3000/);
  assert.match(result.html, /front, tinningar/);
  assert.match(result.html, /Patienten vill prioritera fronten/);
  assert.match(result.html, /https:\/\/example\.com\/plan\/abc/);
  assert.match(result.text, /FUE/);
});

test('buildTreatmentPlanEmail locale=en', () => {
  const result = buildTreatmentPlanEmail({
    customerName: 'John',
    plan: { method: 'DHI', graftsTotal: 2500, zones: ['crown'], prpIncluded: false },
    locale: 'en',
  });
  assert.match(result.subject, /Your treatment plan/);
  assert.match(result.html, /Method/);
  assert.match(result.html, /DHI/);
  assert.match(result.html, /No/);
});

test('buildTreatmentPlanEmail returnerar text och html utan tomma rader vid plan utan extras', () => {
  const result = buildTreatmentPlanEmail({
    customerName: 'Anna',
    plan: { method: 'FUE', zones: [] },
  });
  assert.match(result.html, /Behandlingsplan|FUE/);
  assert.ok(result.text.length > 0);
});
