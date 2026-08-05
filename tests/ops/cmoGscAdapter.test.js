'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

const {
  canFetchGsc,
  fetchGscMetrics,
  buildNormalizedMetrics,
  normalizeSiteUrl,
  parseWindowDays,
  buildDateRange,
} = require('../../src/ops/cmoGscAdapter');

test('normalizeSiteUrl adds https:// when scheme is missing', () => {
  assert.equal(normalizeSiteUrl('hairtpclinic.com'), 'https://hairtpclinic.com');
  assert.equal(normalizeSiteUrl('https://hairtpclinic.com'), 'https://hairtpclinic.com');
  assert.equal(normalizeSiteUrl(''), '');
});

test('parseWindowDays returns safe defaults and clamps values', () => {
  assert.equal(parseWindowDays('7d'), 7);
  assert.equal(parseWindowDays('30d'), 30);
  assert.equal(parseWindowDays('90d'), 90);
  assert.equal(parseWindowDays('120d'), 90);
  assert.equal(parseWindowDays('monthly'), 30);
  assert.equal(parseWindowDays('invalid'), 7);
});

test('buildDateRange returns last N days ending yesterday', () => {
  const range = buildDateRange('7d');
  assert.match(range.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(range.endDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(range.startDate <= range.endDate);
});

test('buildNormalizedMetrics calculates CTR from clicks and impressions', () => {
  const result = buildNormalizedMetrics({ clicks: 10, impressions: 100, position: 12.5 });
  assert.equal(result.clicks, 10);
  assert.equal(result.impressions, 100);
  assert.equal(result.metrics.position, 12.5);
  assert.equal(result.metrics.ctr, 0.1);
  assert.equal(result.spend, null);
});

test('canFetchGsc requires accessToken and siteUrl', () => {
  assert.equal(canFetchGsc({ accessToken: 'token', siteUrl: 'hairtpclinic.com' }), true);
  assert.equal(canFetchGsc({ accessToken: 'token' }), false);
  assert.equal(canFetchGsc({ siteUrl: 'hairtpclinic.com' }), false);
  assert.equal(canFetchGsc({}), false);
});

test('fetchGscMetrics throws when credentials are missing', async () => {
  await assert.rejects(
    () => fetchGscMetrics({ connector: {}, window: '7d' }),
    /siteUrl eller accessToken/
  );
});

test('fetchGscMetrics calls GSC API and aggregates rows', async () => {
  const mockFetch = async (url, options) => {
    assert.match(url, /webmasters\/v3\/sites\/.*\/searchAnalytics\/query/);
    assert.equal(options.method, 'POST');
    assert.ok(options.headers.Authorization.includes('Bearer token-123'));
    const body = JSON.parse(options.body);
    assert.ok(body.startDate);
    assert.ok(body.endDate);
    assert.deepEqual(body.dimensions, ['date']);
    return {
      ok: true,
      json: async () => ({
        rows: [
          { clicks: 5, impressions: 50, position: 10 },
          { clicks: 7, impressions: 30, position: 8 },
        ],
      }),
    };
  };

  const result = await fetchGscMetrics({
    connector: { accessToken: 'token-123', siteUrl: 'https://hairtpclinic.com' },
    window: '7d',
    fetchImpl: mockFetch,
  });

  assert.equal(result.clicks, 12);
  assert.equal(result.impressions, 80);
  assert.equal(result.metrics.position, (10 * 50 + 8 * 30) / 80);
  assert.equal(result.metrics.ctr, 12 / 80);
});

test('fetchGscMetrics handles empty rows gracefully', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ rows: [] }),
  });

  const result = await fetchGscMetrics({
    connector: { accessToken: 'token-123', siteUrl: 'https://hairtpclinic.com' },
    window: '7d',
    fetchImpl: mockFetch,
  });

  assert.equal(result.clicks, 0);
  assert.equal(result.impressions, 0);
  assert.equal(result.metrics.position, undefined);
  assert.equal(result.metrics.ctr, undefined);
});

test('fetchGscMetrics throws on HTTP error', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 401,
    text: async () => 'Unauthorized',
  });

  await assert.rejects(
    () =>
      fetchGscMetrics({
        connector: { accessToken: 'bad-token', siteUrl: 'https://hairtpclinic.com' },
        window: '7d',
        fetchImpl: mockFetch,
      }),
    /HTTP 401/
  );
});
