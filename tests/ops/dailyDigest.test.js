const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDigest } = require('../../src/ops/dailyDigest');

function baseKpis(overrides = {}) {
  const data = {
    throughput: { today: 4, yesterday: 2, last7d: 14, last7dAvgPerDay: 2, last30d: 40 },
    actionsTotals: { today: 3, last7d: 10 },
    alerts: [],
    dailyTimeseries: [
      { date: '2026-05-01', outcomeCount: 2 },
      { date: '2026-05-02', outcomeCount: 4 },
    ],
    outcomeBreakdown: [{ key: 'done', count: 5 }],
    intentBreakdown: [{ key: 'booking', count: 2 }],
    topDomains: [{ domain: 'patient.se', count: 3 }],
    tenantId: 't1',
    ...(overrides.data || {}),
  };
  return { data, ...overrides };
}

test('buildDigest Swedish locale subject and sections', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'Demo Klinik' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daglig översikt/);
  assert.match(out.subject, /Demo Klinik/);
  assert.match(out.html, /Daglig översikt/);
  assert.match(out.text, /Varningar/);
  assert.match(out.html, /done<\/strong>/);
});

test('buildDigest English locale', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: { displayName: 'Clinic X' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daily summary/);
  assert.match(out.text, /Alerts/);
});

test('buildDigest anvander displayName nar name saknas', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { displayName: 'Endast Display' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Endast Display/);
});

test('buildDigest locale sv-SE behandlas som svenska', () => {
  const out = buildDigest({
    locale: 'sv-SE',
    tenantBrand: { name: 'Lokal' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daglig översikt/);
});

test('buildDigest anvander tenantBrand accentColor i trendstaplar', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T', accentColor: '#ff00aa' },
    kpis: baseKpis(),
  });
  assert.ok(out.html.includes('#ff00aa'));
});

test('buildDigest ignorerar icke-array alerts', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        throughput: { today: 0, yesterday: 0, last7d: 0, last7dAvgPerDay: 0, last30d: 0 },
        actionsTotals: { today: 0, last7d: 0 },
        alerts: 'not-an-array',
        dailyTimeseries: [],
        outcomeBreakdown: [],
        intentBreakdown: [],
        topDomains: [],
      },
    }),
  });
  assert.match(out.html, /Inga aktiva varningar/);
});

test('buildDigest escapes HTML-special characters in tenant name inside html', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'A & B <C>' },
    kpis: baseKpis(),
  });
  assert.ok(out.html.includes('A &amp; B &lt;C&gt;'));
});

test('buildDigest renders alert messages when present', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        throughput: { today: 0, yesterday: 0, last7d: 0, last7dAvgPerDay: 0, last30d: 0 },
        actionsTotals: { today: 0, last7d: 0 },
        alerts: [{ severity: 'warning', message: 'Kö <full>' }],
        dailyTimeseries: [],
        outcomeBreakdown: [],
        intentBreakdown: [],
        topDomains: [],
      },
    }),
  });
  assert.ok(out.html.includes('Kö &lt;full&gt;'));
  assert.match(out.text, /Kö <full>/);
});

test('buildDigest uses tenantId fallback when tenantBrand name/displayName saknas', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: {},
    kpis: baseKpis({ data: { tenantId: 'tenant-fallback-1' } }),
  });
  assert.match(out.subject, /tenant-fallback-1/);
});

test('buildDigest falls back to CCO when no tenant identifiers exist', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: {},
    kpis: { data: {} },
  });
  assert.match(out.subject, /CCO/);
});

test('buildDigest throws when non-array breakdown payloads are provided', () => {
  assert.throws(
    () =>
      buildDigest({
        locale: 'en',
        tenantBrand: { name: 'Clinic' },
        kpis: baseKpis({
          data: {
            outcomeBreakdown: null,
            intentBreakdown: 'oops',
            topDomains: 123,
          },
        }),
      }),
    /map is not a function/
  );
});

test('buildDigest minimal tom kpis utan krasch', () => {
  const out = buildDigest({});
  assert.equal(typeof out.subject, 'string');
  assert.ok(out.subject.length > 0);
  assert.ok(out.html.includes('<html'));
  assert.ok(out.text.length > 0);
});

test('buildDigest alert severity info och success stylar html', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        throughput: { today: 0, yesterday: 0, last7d: 0, last7dAvgPerDay: 0, last30d: 0 },
        actionsTotals: { today: 0, last7d: 0 },
        alerts: [
          { severity: 'info', message: 'Info line' },
          { severity: 'success', message: 'OK line' },
        ],
        dailyTimeseries: [],
        outcomeBreakdown: [],
        intentBreakdown: [],
        topDomains: [],
      },
    }),
  });
  assert.ok(out.html.includes('#e8f0f8'));
  assert.ok(out.html.includes('#e8f4ee'));
});

test('buildDigest delta shows em dash when yesterday throughput is zero', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        throughput: { today: 5, yesterday: 0, last7d: 10, last7dAvgPerDay: 1.4, last30d: 20 },
        actionsTotals: { today: 1, last7d: 5 },
        alerts: [],
        dailyTimeseries: [],
        outcomeBreakdown: [],
        intentBreakdown: [],
        topDomains: [],
      },
    }),
  });
  assert.match(out.html, /—\s+igår \(0\)/);
});

test('buildDigest treats uppercase EN locale as English', () => {
  const out = buildDigest({
    locale: 'EN',
    tenantBrand: { name: 'Clinic' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daily summary/);
  assert.match(out.text, /Closed today/);
});

test('buildDigest alert without severity uses default error styling', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        throughput: { today: 0, yesterday: 0, last7d: 0, last7dAvgPerDay: 0, last30d: 0 },
        actionsTotals: { today: 0, last7d: 0 },
        alerts: [{ message: 'Unhandled condition' }],
        dailyTimeseries: [],
        outcomeBreakdown: [],
        intentBreakdown: [],
        topDomains: [],
      },
    }),
  });
  assert.ok(out.html.includes('#fde8e8'));
  assert.ok(out.html.includes('#b94a4a'));
});

test('buildDigest handles empty dailyTimeseries without crashing', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({ data: { dailyTimeseries: [] } }),
  });
  assert.match(out.html, /Trend/);
  assert.ok(out.html.includes('role="presentation"'));
});

test('buildDigest prefers tenantBrand name over displayName in subject', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'Primär', displayName: 'Sekundär' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Primär/);
  assert.equal(out.subject.includes('Sekundär'), false);
});

test('buildDigest uses English template for non-Swedish locale (de)', () => {
  const out = buildDigest({
    locale: 'de',
    tenantBrand: { name: 'Klinik' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daily summary/);
  assert.ok(out.html.includes('lang="en"'));
});

test('buildDigest uses English template when locale is empty string', () => {
  const out = buildDigest({
    locale: '',
    tenantBrand: { name: 'Brand' },
    kpis: baseKpis(),
  });
  assert.match(out.subject, /Daily summary/);
});

test('buildDigest ignorerar icke-array dailyTimeseries', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        dailyTimeseries: 'not-an-array',
      },
    }),
  });
  assert.match(out.html, /Trend/);
  assert.ok(out.html.includes('role="presentation"'));
});

test('buildDigest escaperar outcome-nyckel med HTML i html-lista', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        outcomeBreakdown: [{ key: 'done<script>', count: 1 }],
      },
    }),
  });
  assert.ok(out.html.includes('done&lt;script&gt;'));
});

test('buildDigest escaperar intent-nyckel med HTML i html-lista', () => {
  const out = buildDigest({
    locale: 'en',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        intentBreakdown: [{ key: 'book<script>', count: 2 }],
      },
    }),
  });
  assert.ok(out.html.includes('book&lt;script&gt;'));
});

test('buildDigest escaperar topDomains-värde med HTML i html-lista', () => {
  const out = buildDigest({
    locale: 'sv',
    tenantBrand: { name: 'T' },
    kpis: baseKpis({
      data: {
        topDomains: [{ domain: 'evil.com"><x', count: 1 }],
      },
    }),
  });
  assert.ok(out.html.includes('evil.com&quot;&gt;&lt;x'));
});
