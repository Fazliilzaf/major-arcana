'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  composeWeeklyReport,
  formatWeek,
  isoWeek,
  buildChannelKpi,
  buildSummary,
} = require('../../src/ops/cmoWeeklyReportComposer');
const { clearConnectorMetricsCache } = require('../../src/ops/cmoMarketingConnectors');

function fixtureConfig(overrides = {}) {
  return {
    marketingConnectorsEnabled: true,
    marketingConnectorsMode: 'fixture',
    marketingConnectors: {
      google_ads: { enabled: true, mode: 'fixture' },
      meta: { enabled: true, mode: 'fixture' },
      linkedin: { enabled: true, mode: 'fixture' },
      mail: { enabled: true, mode: 'fixture' },
      gsc: { enabled: true, mode: 'fixture' },
      ...overrides.marketingConnectors,
    },
    ...overrides,
  };
}

test('formatWeek normalizes ISO week format', () => {
  assert.equal(formatWeek('2026-w32'), '2026-W32');
  assert.equal(formatWeek('2026-W32'), '2026-W32');
  assert.equal(formatWeek('invalid'), '');
});

test('isoWeek returns current ISO week string', () => {
  const week = isoWeek();
  assert.match(week, /^\d{4}-W\d{2}$/);
});

test('buildChannelKpi extracts normalized values from channel block', () => {
  const block = {
    source: 'gsc',
    window: '7d',
    fetchedAt: '2026-08-05T10:00:00.000Z',
    fresh: true,
    connectorMode: 'fixture',
    metrics: {
      ctr: { value: 0.032 },
      position: { value: 12.4 },
      clicks: { value: 464 },
      impressions: { value: 14500 },
    },
  };
  const kpi = buildChannelKpi(block);
  assert.equal(kpi.source, 'gsc');
  assert.equal(kpi.clicks, 464);
  assert.equal(kpi.impressions, 14500);
  assert.equal(kpi.position, 12.4);
  assert.equal(kpi.ctr, 0.032);
});

test('buildSummary reports channel count and impressions', () => {
  const summary = buildSummary({
    week: '2026-W32',
    channels: {
      gsc: { status: 'ok', clicks: 464, impressions: 14500 },
      google_ads: { status: 'ok', clicks: 1148, impressions: 82000 },
      meta: { status: 'error', message: 'Token expired' },
    },
  });
  assert.match(summary, /2026-W32/);
  assert.match(summary, /2 av 3 kanaler/);
  assert.match(summary, /96\s?500\svisningar/);
  assert.match(summary, /meta rapporterade fel/);
});

test('composeWeeklyReport builds draft from fixture connectors', async () => {
  clearConnectorMetricsCache();
  const draft = await composeWeeklyReport({
    tenantId: 'hair-tp-clinic',
    brand: 'hairtpclinic',
    week: '2026-W32',
    config: fixtureConfig(),
    channels: ['gsc', 'google_ads', 'meta'],
  });

  assert.equal(draft.tenantId, 'hair-tp-clinic');
  assert.equal(draft.brand, 'hairtpclinic');
  assert.equal(draft.week, '2026-W32');
  assert.equal(draft.status, 'draft');
  assert.ok(draft.summary.includes('2026-W32'));
  assert.ok(draft.sections.kpi.gsc);
  assert.ok(draft.sections.kpi.google_ads);
  assert.ok(draft.sections.kpi.meta);
  assert.equal(draft.sections.kpi.gsc.status, 'ok');
  assert.equal(draft.sections.kpi.gsc.fresh, true);
  assert.equal(draft.sections.kpi.gsc.mode, 'fixture');
  assert.equal(draft.sections.done.length, 0);
  assert.equal(draft.sections.planned.length, 0);
});

test('composeWeeklyReport uses current week when week is omitted', async () => {
  clearConnectorMetricsCache();
  const draft = await composeWeeklyReport({
    tenantId: 'hair-tp-clinic',
    brand: 'hairtpclinic',
    config: fixtureConfig(),
    channels: ['gsc'],
  });
  assert.match(draft.week, /^\d{4}-W\d{2}$/);
});

test('composeWeeklyReport marks not_configured connectors clearly', async () => {
  clearConnectorMetricsCache();
  const draft = await composeWeeklyReport({
    tenantId: 'hair-tp-clinic',
    brand: 'hairtpclinic',
    week: '2026-W32',
    config: fixtureConfig({
      marketingConnectors: {
        google_ads: { enabled: false },
      },
    }),
    channels: ['google_ads', 'gsc'],
  });
  assert.equal(draft.sections.kpi.google_ads.status, 'not_configured');
  assert.equal(draft.sections.kpi.gsc.status, 'ok');
  assert.ok(draft.summary.includes('1 av 2 kanaler'));
});

test('composeWeeklyReport compares impressions with previous report', async () => {
  clearConnectorMetricsCache();
  const previous = {
    sections: {
      kpi: {
        gsc: { impressions: 10000, status: 'ok' },
        google_ads: { impressions: 80000, status: 'ok' },
      },
    },
  };
  const draft = await composeWeeklyReport({
    tenantId: 'hair-tp-clinic',
    brand: 'hairtpclinic',
    week: '2026-W32',
    config: fixtureConfig(),
    channels: ['gsc', 'google_ads'],
    previousReport: previous,
  });
  assert.ok(draft.summary.includes('Visningar förändrades'));
});
