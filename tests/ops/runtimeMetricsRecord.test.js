const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeMetricsStore } = require('../../src/ops/runtimeMetrics');

test('record maps /api/v1/risk paths to risk area', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({
    method: 'GET',
    path: '/api/v1/risk/assessments',
    statusCode: 200,
    durationMs: 2,
  });
  const snap = store.getSnapshot({ areaLimit: 20 });
  const row = snap.byArea.find((r) => r.area === 'risk');
  assert.ok(row);
  assert.equal(row.requests, 1);
});
