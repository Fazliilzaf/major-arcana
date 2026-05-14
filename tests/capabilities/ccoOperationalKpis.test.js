const test = require('node:test');
const assert = require('node:assert/strict');

const { CcoOperationalKpisCapability } = require('../../src/capabilities/ccoOperationalKpis');

function startOfLocalDayMs(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

test('CcoOperationalKpisCapability warns when history store missing', async () => {
  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: {},
  });
  assert.ok(out.warnings.some((w) => /listOutcomes saknas/i.test(w)));
  assert.equal(out.data.throughput.today, 0);
  assert.equal(out.data.throughput.last7d, 0);
});

test('CcoOperationalKpisCapability records listOutcomes failure', async () => {
  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => {
        throw new Error('db nere');
      },
      listActions: async () => [],
    },
  });
  assert.ok(out.warnings.some((w) => /listOutcomes misslyckades: db nere/i.test(w)));
});

test('CcoOperationalKpisCapability forwards mailboxIds and sinceIso', async () => {
  let outOpts;
  let actOpts;
  const cap = new CcoOperationalKpisCapability();
  await cap.execute({
    tenantId: 'tenant-a',
    channel: 'admin',
    input: { windowDays: 10, mailboxIds: ['mb-1', 'mb-2'] },
    ccoHistoryStore: {
      listOutcomes: async (opts) => {
        outOpts = opts;
        return [];
      },
      listActions: async (opts) => {
        actOpts = opts;
        return [];
      },
    },
  });
  assert.equal(outOpts.tenantId, 'tenant-a');
  assert.deepEqual(outOpts.mailboxIds, ['mb-1', 'mb-2']);
  assert.equal(actOpts.tenantId, 'tenant-a');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(outOpts.sinceIso));
  assert.equal(outOpts.sinceIso, actOpts.sinceIso);
});

test('CcoOperationalKpisCapability aggregates throughput breakdowns and domains', async () => {
  const today0 = startOfLocalDayMs();
  const todayIso = new Date(today0 + 3 * 3600 * 1000).toISOString();
  const yIso = new Date(today0 - 6 * 3600 * 1000).toISOString();
  const d3Iso = new Date(today0 - 3 * 24 * 3600 * 1000 + 3600 * 1000).toISOString();

  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    requestId: 'req-kpi',
    ccoHistoryStore: {
      listOutcomes: async () => [
        { recordedAt: todayIso, outcomeCode: 'booked', intent: 'question', customerEmail: 'a@Acme.com' },
        { recordedAt: todayIso, outcomeCode: 'booked', intent: 'question', customerEmail: 'b@Beta.io' },
        { recordedAt: yIso, outcomeCode: 'replied', intent: 'complaint', customerEmail: 'a@acme.com' },
        { recordedAt: d3Iso, outcomeCode: 'rebooked', intent: 'question', customerEmail: 'x@Acme.com' },
      ],
      listActions: async () => [
        { recordedAt: todayIso, actionType: 'reply_sent' },
        { recordedAt: d3Iso, actionType: 'reply_sent' },
        { recordedAt: d3Iso, actionType: 'note_added' },
      ],
    },
  });

  assert.equal(out.metadata.requestId, 'req-kpi');
  assert.equal(out.data.throughput.today, 2);
  assert.ok(out.data.throughput.yesterday >= 1);
  assert.ok(out.data.throughput.last7d >= 3);
  assert.equal(out.data.actionsTotals.today, 1);
  assert.ok(out.data.dailyTimeseries.length >= 7);
  const booked = out.data.outcomeBreakdown.find((x) => x.key === 'booked');
  assert.ok(booked && booked.count >= 1);
  assert.ok(out.data.topDomains.some((d) => d.domain === 'acme.com'));
  assert.ok(out.data.actionTypeBreakdown.some((a) => a.key === 'reply_sent'));
  assert.equal(out.warnings.length, 0);
});

test('CcoOperationalKpisCapability empty_day alert when yesterday had outcomes', async () => {
  const today0 = startOfLocalDayMs();
  const yIso = new Date(today0 - 6 * 3600 * 1000).toISOString();

  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => [{ recordedAt: yIso, outcomeCode: 'booked', intent: 'other' }],
      listActions: async () => [],
    },
  });

  assert.equal(out.data.throughput.today, 0);
  assert.ok(out.data.alerts.some((a) => a.type === 'empty_day' && a.severity === 'warning'));
});

test('CcoOperationalKpisCapability uses tenant alertThresholds', async () => {
  const today0 = startOfLocalDayMs();
  const yIso = new Date(today0 - 6 * 3600 * 1000).toISOString();

  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => [{ recordedAt: yIso, outcomeCode: 'booked', intent: 'other' }],
      listActions: async () => [],
    },
    tenantConfigStore: {
      getTenantConfig: async () => ({
        alertThresholds: { minOutcomesToday: 5, emptyDayWarning: false },
      }),
    },
  });

  assert.ok(out.data.alerts.some((a) => a.type === 'min_outcomes_today'));
  assert.equal(out.data.thresholds.minOutcomesToday, 5);
});

test('CcoOperationalKpisCapability: windowDays klampas till 1–90', async () => {
  const cap = new CcoOperationalKpisCapability();
  const low = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { windowDays: 0 },
    ccoHistoryStore: {
      listOutcomes: async () => [],
      listActions: async () => [],
    },
  });
  assert.equal(low.data.windowDays, 7);

  const high = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { windowDays: 200 },
    ccoHistoryStore: {
      listOutcomes: async () => [],
      listActions: async () => [],
    },
  });
  assert.equal(high.data.windowDays, 90);
});

test('CcoOperationalKpisCapability: saknad tenantId blir okand', async () => {
  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => [],
      listActions: async () => [],
    },
  });
  assert.equal(out.data.tenantId, 'okand');
  assert.equal(out.metadata.tenantId, 'okand');
});

test('CcoOperationalKpisCapability: mailboxIds som ej ar array blir tom lista till store', async () => {
  let seen;
  const cap = new CcoOperationalKpisCapability();
  await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    input: { mailboxIds: 'mb-1' },
    ccoHistoryStore: {
      listOutcomes: async (opts) => {
        seen = opts;
        return [];
      },
      listActions: async () => [],
    },
  });
  assert.deepEqual(seen.mailboxIds, []);
});

test('CcoOperationalKpisCapability records listActions failure', async () => {
  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => [],
      listActions: async () => {
        throw new Error('actions timeout');
      },
    },
  });
  assert.ok(out.warnings.some((w) => /listActions misslyckades: actions timeout/i.test(w)));
  assert.equal(out.data.actionsTotals.today, 0);
});

test('CcoOperationalKpisCapability: getTenantConfig som kastar anvander default-trösklar', async () => {
  const cap = new CcoOperationalKpisCapability();
  const out = await cap.execute({
    tenantId: 't1',
    channel: 'admin',
    ccoHistoryStore: {
      listOutcomes: async () => [],
      listActions: async () => [],
    },
    tenantConfigStore: {
      getTenantConfig: async () => {
        throw new Error('config broken');
      },
    },
  });
  assert.equal(out.data.thresholds.minOutcomesToday, 0);
  assert.equal(out.warnings.length, 0);
});
