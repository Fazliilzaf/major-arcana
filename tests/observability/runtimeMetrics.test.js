const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeMetricsStore } = require('../../src/ops/runtimeMetrics');

test('runtime metrics buckets requests by normalized path and area', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 100, slowRequestMs: 5000 });
  const id = 'a1b2c3d4-e5f6-4178-89ab-1234567890ab';

  store.record({
    method: 'GET',
    path: `/api/v1/templates/${id}/draft`,
    statusCode: 200,
    durationMs: 12,
  });
  store.record({
    method: 'POST',
    path: '/api/v1/auth/session',
    statusCode: 401,
    durationMs: 4,
  });
  store.record({
    method: 'GET',
    path: '/api/v1/monitor/health',
    statusCode: 500,
    durationMs: 200,
  });

  const snap = store.getSnapshot({ areaLimit: 20 });
  assert.equal(snap.totals.requests, 3);
  assert.equal(snap.totals.statusBuckets['2xx'], 1);
  assert.equal(snap.totals.statusBuckets['4xx'], 1);
  assert.equal(snap.totals.statusBuckets['5xx'], 1);

  const areas = new Map(snap.byArea.map((row) => [row.area, row]));
  assert.ok(areas.has('templates'));
  assert.ok(areas.has('auth'));
  assert.ok(areas.has('monitor'));

  const templateSample = areas.get('templates').latency;
  assert.equal(templateSample.count, 1);

  const templateRow = snap.byArea.find((r) => r.area === 'templates');
  assert.equal(templateRow.serverErrors, 0);
  assert.equal(templateRow.clientErrors, 0);

  const authRow = snap.byArea.find((r) => r.area === 'auth');
  assert.equal(authRow.clientErrors, 1);

  const monitorRow = snap.byArea.find((r) => r.area === 'monitor');
  assert.equal(monitorRow.serverErrors, 1);
});

test('runtime metrics latency summary tracks percentiles', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  for (let i = 1; i <= 10; i += 1) {
    store.record({
      method: 'GET',
      path: '/api/v1/ops/ping',
      statusCode: 200,
      durationMs: i * 10,
    });
  }
  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.latency.count, 10);
  assert.ok(snap.latency.p50Ms >= 40);
  assert.ok(snap.latency.p95Ms >= 90);
  assert.equal(snap.totals.slowRequests, 0);
});

test('snapshot totals.requests aligns with statusBuckets for scheduler SLO math', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 100, slowRequestMs: 5000 });
  for (let i = 0; i < 5; i += 1) {
    store.record({ path: '/api/v1/ops/ping', statusCode: 500, durationMs: 10 });
  }
  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.totals.requests, 5);
  assert.equal(snap.totals.sampledRequests, 5);
  assert.equal(snap.totals.statusBuckets['5xx'], 5);
});

test('inferArea tags /api/v1/capabilities/:name as cap:<name>', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({
    method: 'POST',
    path: '/api/v1/capabilities/TenantUsageMetrics/execute',
    statusCode: 200,
    durationMs: 3,
  });
  const snap = store.getSnapshot({ areaLimit: 20 });
  const capRow = snap.byArea.find((r) => r.area === 'cap:TenantUsageMetrics');
  assert.ok(capRow);
  assert.equal(capRow.requests, 1);
});

test('getTenantUsage uses snapshot totals and cap:* rows', async () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({ path: '/api/v1/capabilities/TenantUsageMetrics/run', statusCode: 200, durationMs: 1 });
  store.record({ path: '/api/v1/capabilities/TenantUsageMetrics/run', statusCode: 200, durationMs: 1 });
  for (let i = 0; i < 8; i += 1) {
    store.record({ path: '/api/v1/monitor/health', statusCode: 200, durationMs: 1 });
  }

  const usage = await store.getTenantUsage('tenant-z', { windowDays: 14 });
  assert.equal(usage.tenantId, 'tenant-z');
  assert.equal(usage.windowDays, 14);
  assert.deepEqual(usage.capabilityRunsByName, { TenantUsageMetrics: 2 });
  assert.equal(usage.capabilityRunsTotal, 2);
  assert.equal(usage.mailboxReadsApprox, Math.floor(10 * 0.15));
  assert.ok(typeof usage.collectedAt === 'string');
});

test('runtime metrics marker langsam begaran over slowRequestMs-tröskel', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 5000, slowRequestMs: 100 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: 10 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: 150 });

  const snap = store.getSnapshot({ areaLimit: 10 });
  assert.equal(snap.totals.requests, 2);
  assert.equal(snap.totals.sampledRequests, 2);
  assert.equal(snap.totals.slowRequests, 1);
  assert.equal(snap.settings.slowRequestMs, 100);
});

test('runtime metrics kapar samples vid store-minimum maxSamples (500)', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 500, slowRequestMs: 99999 });
  for (let i = 0; i < 502; i += 1) {
    store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: 1 });
  }

  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.totals.requests, 502);
  assert.equal(snap.totals.sampledRequests, 500);
  assert.equal(snap.settings.maxSamples, 500);
});

test('inferArea mappar public_api incidents orchestrator och chat', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({ path: '/api/public/foo', statusCode: 200, durationMs: 1 });
  store.record({ path: '/api/v1/incidents/open', statusCode: 200, durationMs: 1 });
  store.record({ path: '/api/v1/orchestrator/run', statusCode: 200, durationMs: 1 });
  store.record({ path: '/chat/stream', statusCode: 200, durationMs: 1 });

  const snap = store.getSnapshot({ areaLimit: 20 });
  const areas = new Map(snap.byArea.map((r) => [r.area, r]));
  assert.ok(areas.get('public_api'));
  assert.ok(areas.get('incidents'));
  assert.ok(areas.get('orchestrator'));
  assert.ok(areas.get('public_chat'));
});

test('runtime metrics status other bucket for ogiltig HTTP-kod', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 20, slowRequestMs: 5000 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 0, durationMs: 1 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 999, durationMs: 1 });

  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.totals.statusBuckets.other, 2);
});

test('getSnapshot clamp: areaLimit under 1 becomes 1 row max', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 1000, slowRequestMs: 5000 });
  store.record({ path: '/api/v1/auth/session', statusCode: 200, durationMs: 1 });
  store.record({ path: '/api/v1/monitor/health', statusCode: 200, durationMs: 1 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: 1 });

  const snap = store.getSnapshot({ areaLimit: 0 });
  assert.equal(snap.byArea.length, 1);
});

test('record normaliserar ogiltig duration till 0 i latency', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 1000, slowRequestMs: 5000 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: Number.NaN });

  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.latency.count, 1);
  assert.equal(snap.latency.avgMs, 0);
  assert.equal(snap.latency.maxMs, 0);
});

test('getTenantUsage clampar windowDays till intervallet 1..365', async () => {
  const store = createRuntimeMetricsStore({ maxSamples: 1000, slowRequestMs: 5000 });

  const min = await store.getTenantUsage('t1', { windowDays: 0 });
  const max = await store.getTenantUsage('t1', { windowDays: 999 });
  assert.equal(min.windowDays, 30);
  assert.equal(max.windowDays, 365);
});

test('inferArea mappar ogiltigt capabilities-segment till cap:other', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({
    method: 'POST',
    path: '/api/v1/capabilities/foo bar/execute',
    statusCode: 200,
    durationMs: 2,
  });
  const snap = store.getSnapshot({ areaLimit: 20 });
  const row = snap.byArea.find((r) => r.area === 'cap:other');
  assert.ok(row);
  assert.equal(row.requests, 1);
});

test('summarizeLatency filtrerar bort negativa durationMs', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: -5 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 200, durationMs: 20 });
  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.latency.count, 1);
  assert.equal(snap.latency.avgMs, 20);
  assert.equal(snap.totals.requests, 2);
  assert.equal(snap.totals.sampledRequests, 2);
});

test('runtime metrics klampar maxSamples till hogsta tillatna 50000', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 999999, slowRequestMs: 5000 });
  assert.equal(store.getSnapshot({ areaLimit: 2 }).settings.maxSamples, 50000);
});

test('runtime metrics klampar slowRequestMs till 50..60000', () => {
  const low = createRuntimeMetricsStore({ maxSamples: 500, slowRequestMs: 1 });
  assert.equal(low.getSnapshot({ areaLimit: 1 }).settings.slowRequestMs, 50);
  const high = createRuntimeMetricsStore({ maxSamples: 500, slowRequestMs: 999999 });
  assert.equal(high.getSnapshot({ areaLimit: 1 }).settings.slowRequestMs, 60000);
});

test('runtime metrics status 3xx hamnar i egen hink', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 20, slowRequestMs: 5000 });
  store.record({ path: '/api/v1/ops/ping', statusCode: 302, durationMs: 1 });
  const snap = store.getSnapshot({ areaLimit: 5 });
  assert.equal(snap.totals.statusBuckets['3xx'], 1);
  assert.equal(snap.totals.statusBuckets['2xx'], 0);
});

test('record normaliserar null path till root och icke-sträng method till GET', () => {
  const store = createRuntimeMetricsStore({ maxSamples: 20, slowRequestMs: 5000 });
  store.record({ method: null, path: null, statusCode: 200, durationMs: 1 });
  const snap = store.getSnapshot({ areaLimit: 10 });
  const other = snap.byArea.find((r) => r.area === 'other');
  assert.ok(other);
  assert.equal(other.requests, 1);
  assert.equal(other.latency.count, 1);
});

test('getTenantUsage stringifierar nullish tenantId till tom sträng', async () => {
  const store = createRuntimeMetricsStore({ maxSamples: 50, slowRequestMs: 99999 });
  const uNull = await store.getTenantUsage(null, { windowDays: 7 });
  const uUndef = await store.getTenantUsage(undefined, { windowDays: 7 });
  assert.equal(uNull.tenantId, '');
  assert.equal(uUndef.tenantId, '');
  assert.equal(uNull.windowDays, 7);
});
