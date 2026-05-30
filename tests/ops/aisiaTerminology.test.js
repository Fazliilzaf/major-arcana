'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { translateMetric, localizeSessionSummary } = require('../../src/ops/aisiaTerminology');

test('translateMetric maps known Aisia metrics to Swedish', () => {
  assert.equal(translateMetric('total_hair_count'), 'Hårantal');
  assert.equal(translateMetric('telangiectasia_severity'), 'Ytliga blodkärl / telangiektasier');
});

test('localizeSessionSummary includes disclaimer', () => {
  const summary = localizeSessionSummary(
    { date: '2026-05-30', sessionType: 'consultation', status: 'verified' },
    [{ metricType: 'total_hair_count', value: 120, unit: 'count', verified: true }]
  );
  assert.equal(summary.metrics[0].label, 'Hårantal');
  assert.match(summary.disclaimer, /Slutlig bedömning/);
});
