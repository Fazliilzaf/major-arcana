const test = require('node:test');
const assert = require('node:assert/strict');

const { SummarizeMarketingPerformanceCapability } = require('../../src/capabilities/summarizeMarketingPerformance');
const { GenerateMarketingBriefCapability } = require('../../src/capabilities/generateMarketingBrief');
const { composeCmoAnalyticsReport } = require('../../src/agents/cmoContentAgent');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const {
  summarizeMarketingPerformance,
  buildMarketingBrief,
  INSUFFICIENT_DATA_MESSAGE,
} = require('../../src/ops/cmoMarketingMetrics');

function freshMetric(value, source, window = '7d', fetchedAt = '2026-05-21T12:00:00.000Z') {
  return {
    value,
    source,
    window,
    fetchedAt,
    fresh: true,
  };
}

const samplePerformanceSnapshot = {
  marketingPerformance: {
    channels: {
      google_ads: {
        source: 'google_ads',
        window: '7d',
        fetchedAt: '2026-05-21T12:00:00.000Z',
        fresh: true,
        metrics: {
          ctr: freshMetric(0.008, 'google_ads'),
          cpc: freshMetric(8.5, 'google_ads'),
          cpa: freshMetric(120, 'google_ads'),
          cpl: freshMetric(45, 'google_ads'),
          conversionRate: freshMetric(0.012, 'google_ads'),
        },
        spend: freshMetric(1500, 'google_ads'),
      },
      linkedin: {
        source: 'linkedin',
        window: '7d',
        fetchedAt: '2026-05-21T11:00:00.000Z',
        fresh: true,
        metrics: {
          ctr: freshMetric(0.03, 'linkedin', '7d', '2026-05-21T11:00:00.000Z'),
          cpc: freshMetric(2.2, 'linkedin', '7d', '2026-05-21T11:00:00.000Z'),
        },
        spend: freshMetric(500, 'linkedin', '7d', '2026-05-21T11:00:00.000Z'),
      },
    },
  },
};

test('summarizeMarketingPerformance returns insufficient_data without fresh metrics', () => {
  const summary = summarizeMarketingPerformance({});
  assert.equal(summary.status, 'insufficient_data');
  assert.equal(summary.recommendation, INSUFFICIENT_DATA_MESSAGE);
  assert.equal(summary.kpis.ctr, null);
});

test('summarizeMarketingPerformance aggregates KPIs and channel mix from fresh metrics', () => {
  const summary = summarizeMarketingPerformance(samplePerformanceSnapshot, { windowDays: 7 });
  assert.equal(summary.status, 'ok');
  assert.equal(summary.kpis.ctr.source, 'google_ads');
  assert.ok(summary.channelMix.length >= 2);
  assert.equal(summary.recommendation, null);
});

test('summarizeMarketingPerformance detects underperforming ads', () => {
  const summary = summarizeMarketingPerformance(samplePerformanceSnapshot);
  assert.ok(summary.underperformingAds.length >= 1);
  assert.equal(summary.underperformingAds[0].channel, 'google_ads');
});

test('buildMarketingBrief avoids recommendations when data is insufficient', () => {
  const brief = buildMarketingBrief({ status: 'insufficient_data', freshMetricCount: 0 }, { period: 'weekly' });
  assert.equal(brief.status, 'insufficient_data');
  assert.equal(brief.recommendation, INSUFFICIENT_DATA_MESSAGE);
  assert.deepEqual(brief.actions, []);
});

test('GenerateMarketingBrief returns weekly brief with evidence-backed highlights', async () => {
  const capability = new GenerateMarketingBriefCapability();
  const result = await capability.execute({
    input: { period: 'weekly' },
    systemStateSnapshot: samplePerformanceSnapshot,
  });
  assert.equal(result.data.period, 'weekly');
  assert.equal(result.data.status, 'ok');
  assert.ok(result.data.highlights.length >= 1);
  assert.equal(result.metadata.readOnly, true);
});

test('SummarizeMarketingPerformance capability enforces metric contract output', async () => {
  const capability = new SummarizeMarketingPerformanceCapability();
  const result = await capability.execute({
    input: { windowDays: 7 },
    systemStateSnapshot: samplePerformanceSnapshot,
  });
  assert.equal(result.data.outputType, 'MarketingPerformanceSummary');
  assert.ok(Array.isArray(result.data.metrics));
  assert.ok(result.data.metrics.every((metric) => metric.source && metric.window && metric.fetchedAt));
});

test('composeCmoAnalyticsReport merges performance and brief outputs', () => {
  const performance = summarizeMarketingPerformance(samplePerformanceSnapshot);
  const brief = buildMarketingBrief(performance, { period: 'monthly' });
  const composed = composeCmoAnalyticsReport({
    performanceOutput: { data: performance, warnings: [] },
    briefOutput: { data: brief, warnings: [] },
    period: 'monthly',
    windowDays: 30,
  });

  assert.equal(composed.data.outputType, 'MarketingAnalytics');
  assert.equal(composed.data.mode, 'analytics');
  assert.equal(composed.data.readOnly, true);
  assert.ok(composed.data.underperformingAds.length >= 1);
});

test('executive feed adds pause_underperforming_ads from analytics output', () => {
  const feed = createExecutiveDecisionFeed();
  feed.addFromAgentOutput({
    agent: 'CMO',
    tenantId: 'default',
    output: {
      data: {
        mode: 'analytics',
        outputType: 'MarketingAnalytics',
        underperformingAds: [{ channel: 'google_ads', ctr: 0.008, cpc: 8.5 }],
        executiveSummary: 'Underperformance detected',
      },
    },
  });
  const items = feed.list({ limit: 10 });
  assert.ok(items.some((item) => item.actionType === 'pause_underperforming_ads'));
});
