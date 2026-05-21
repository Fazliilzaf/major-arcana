'use strict';

const INSUFFICIENT_DATA_MESSAGE = 'insufficient_data — no recommendation';

const KPI_KEYS = Object.freeze(['ctr', 'cpc', 'cpa', 'cpl', 'conversionRate']);
const CHANNEL_SOURCES = Object.freeze([
  'google_ads',
  'meta',
  'linkedin',
  'mail',
  'analytics',
  'seo',
  'social',
]);

const DEFAULT_FRESHNESS_MS = 48 * 60 * 60 * 1000;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isMetricFresh(metric = {}, nowMs = Date.now(), maxAgeMs = DEFAULT_FRESHNESS_MS) {
  if (metric.fresh === false) return false;
  const fetchedAt = Date.parse(normalizeText(metric.fetchedAt));
  if (!Number.isFinite(fetchedAt)) return false;
  return nowMs - fetchedAt <= maxAgeMs;
}

function normalizeMetric(raw = {}, fallbackSource = '', fallbackWindow = '7d') {
  const source = asObject(raw);
  const value = toNumber(source.value, null);
  if (value == null) return null;

  const metric = {
    value,
    source: normalizeText(source.source) || normalizeText(fallbackSource) || 'unknown',
    window: normalizeText(source.window) || fallbackWindow,
    fetchedAt: normalizeText(source.fetchedAt) || '',
    fresh: source.fresh !== false,
    unit: normalizeText(source.unit) || null,
    label: normalizeText(source.label) || null,
  };

  if (!metric.fetchedAt) metric.fresh = false;
  if (!isMetricFresh(metric)) metric.fresh = false;
  return metric;
}

function collectChannelMetrics(snapshot = {}) {
  const performance = asObject(snapshot.marketingPerformance || snapshot.marketingMetrics);
  const channels = asObject(performance.channels);
  const collected = [];

  for (const [channelKey, rawChannel] of Object.entries(channels)) {
    const channel = asObject(rawChannel);
    const source = normalizeText(channel.source) || channelKey;
    const window = normalizeText(channel.window) || '7d';
    const fetchedAt = normalizeText(channel.fetchedAt) || '';
    const channelFresh = channel.fresh !== false && isMetricFresh({ fetchedAt, fresh: channel.fresh !== false });

    const metricsBlock = asObject(channel.metrics);
    for (const kpiKey of KPI_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(metricsBlock, kpiKey)) continue;
      const normalized = normalizeMetric(metricsBlock[kpiKey], source, window);
      if (!normalized) continue;
      if (!channelFresh) normalized.fresh = false;
      collected.push({
        channel: source,
        kpi: kpiKey,
        metric: normalized,
      });
    }

    const spend = normalizeMetric(channel.spend, source, window);
    const impressions = normalizeMetric(channel.impressions, source, window);
    const clicks = normalizeMetric(channel.clicks, source, window);
    if (spend) collected.push({ channel: source, kpi: 'spend', metric: spend });
    if (impressions) collected.push({ channel: source, kpi: 'impressions', metric: impressions });
    if (clicks) collected.push({ channel: source, kpi: 'clicks', metric: clicks });
  }

  return collected;
}

function pickBestMetric(entries = [], kpi = '') {
  const matches = entries.filter((entry) => entry.kpi === kpi && entry.metric?.fresh === true);
  if (!matches.length) return null;
  return matches.sort(
    (a, b) => Date.parse(b.metric.fetchedAt || 0) - Date.parse(a.metric.fetchedAt || 0)
  )[0].metric;
}

function buildChannelMix(entries = []) {
  const spendByChannel = new Map();
  let totalSpend = 0;

  for (const entry of entries) {
    if (entry.kpi !== 'spend' || entry.metric?.fresh !== true) continue;
    const spend = Number(entry.metric.value) || 0;
    spendByChannel.set(entry.channel, (spendByChannel.get(entry.channel) || 0) + spend);
    totalSpend += spend;
  }

  if (totalSpend <= 0) {
    const channels = [...new Set(entries.filter((e) => e.metric?.fresh).map((e) => e.channel))];
    return channels.map((channel) => ({
      channel,
      share: channels.length ? Number((1 / channels.length).toFixed(4)) : 0,
      spend: null,
      evidence: 'channel_presence_only',
    }));
  }

  return [...spendByChannel.entries()]
    .map(([channel, spend]) => ({
      channel,
      spend,
      share: Number((spend / totalSpend).toFixed(4)),
      evidence: 'fresh_spend',
    }))
    .sort((a, b) => b.share - a.share);
}

function detectUnderperformingAds(entries = []) {
  const underperforming = [];
  const byChannel = new Map();

  for (const entry of entries) {
    if (!byChannel.has(entry.channel)) byChannel.set(entry.channel, {});
    byChannel.get(entry.channel)[entry.kpi] = entry.metric;
  }

  for (const [channel, metrics] of byChannel.entries()) {
    const ctr = metrics.ctr;
    const cpc = metrics.cpc;
    if (!ctr?.fresh || !cpc?.fresh) continue;
    if (Number(ctr.value) < 0.01 && Number(cpc.value) > 5) {
      underperforming.push({
        channel,
        ctr: ctr.value,
        cpc: cpc.value,
        source: ctr.source,
        window: ctr.window,
        fetchedAt: ctr.fetchedAt,
        reason: 'Låg CTR kombinerat med hög CPC',
      });
    }
  }

  return underperforming;
}

function summarizeMarketingPerformance(snapshot = {}, { windowDays = 7 } = {}) {
  const entries = collectChannelMetrics(snapshot);
  const freshEntries = entries.filter((entry) => entry.metric?.fresh === true);
  const staleEntries = entries.filter((entry) => entry.metric && entry.metric.fresh !== true);

  const presentSources = new Set(freshEntries.map((entry) => entry.metric.source));
  const missingSources = CHANNEL_SOURCES.filter((source) => !presentSources.has(source));

  const kpis = {};
  for (const kpiKey of KPI_KEYS) {
    kpis[kpiKey] = pickBestMetric(freshEntries, kpiKey);
  }

  const hasFreshKpi = Object.values(kpis).some((metric) => metric?.fresh === true);
  const channelMix = buildChannelMix(freshEntries);
  const underperformingAds = detectUnderperformingAds(freshEntries);
  const status = hasFreshKpi ? 'ok' : 'insufficient_data';

  const summary =
    status === 'ok'
      ? `Marketing performance (${windowDays}d): ${freshEntries.length} färska metrics, ${channelMix.length} kanaler i mix.`
      : `Marketing performance: otillräcklig färsk data (${freshEntries.length} färska, ${missingSources.length} källor saknas).`;

  return {
    outputType: 'MarketingPerformanceSummary',
    status,
    recommendation: status === 'ok' ? null : INSUFFICIENT_DATA_MESSAGE,
    windowDays,
    kpis,
    channelMix,
    underperformingAds,
    freshMetricCount: freshEntries.length,
    staleMetricCount: staleEntries.length,
    missingSources,
    metrics: freshEntries.map((entry) => ({
      channel: entry.channel,
      kpi: entry.kpi,
      ...entry.metric,
    })),
    summary,
    generatedAt: new Date().toISOString(),
  };
}

function buildMarketingBrief(performanceSummary = {}, { period = 'weekly' } = {}) {
  const summary = asObject(performanceSummary);
  const normalizedPeriod = normalizeText(period).toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
  const periodLabel = normalizedPeriod === 'monthly' ? 'Månadsrapport' : 'Veckorapport';

  if (summary.status !== 'ok') {
    return {
      outputType: 'MarketingBrief',
      period: normalizedPeriod,
      status: 'insufficient_data',
      recommendation: INSUFFICIENT_DATA_MESSAGE,
      executiveSummary: `${periodLabel}: ${INSUFFICIENT_DATA_MESSAGE}`,
      highlights: [],
      risks: [],
      actions: [],
      dataQuality: {
        freshMetricCount: Number(summary.freshMetricCount || 0),
        staleMetricCount: Number(summary.staleMetricCount || 0),
        missingSources: asArray(summary.missingSources),
      },
      generatedAt: new Date().toISOString(),
      readOnly: true,
    };
  }

  const highlights = [];
  const kpis = asObject(summary.kpis);
  if (kpis.ctr?.fresh) highlights.push(`CTR ${(Number(kpis.ctr.value) * 100).toFixed(2)}% (${kpis.ctr.source}).`);
  if (kpis.cpc?.fresh) highlights.push(`CPC ${Number(kpis.cpc.value).toFixed(2)} (${kpis.cpc.source}).`);
  if (kpis.cpl?.fresh) highlights.push(`CPL ${Number(kpis.cpl.value).toFixed(2)} (${kpis.cpl.source}).`);
  if (kpis.conversionRate?.fresh) {
    highlights.push(
      `Konvertering ${(Number(kpis.conversionRate.value) * 100).toFixed(2)}% (${kpis.conversionRate.source}).`
    );
  }

  const channelMix = asArray(summary.channelMix);
  if (channelMix.length) {
    highlights.push(
      `Kanalmix topp: ${channelMix
        .slice(0, 3)
        .map((item) => `${item.channel} ${Math.round(Number(item.share || 0) * 100)}%`)
        .join(', ')}.`
    );
  }

  const underperforming = asArray(summary.underperformingAds);
  const risks = underperforming.map(
    (item) => `${item.channel}: ${item.reason} (CTR ${item.ctr}, CPC ${item.cpc}).`
  );

  const actions =
    underperforming.length > 0
      ? [
          {
            id: 'pause_underperforming_ads',
            label: 'Överväg paus av underpresterande annonskanaler',
            requiresOwnerApproval: true,
            channels: underperforming.map((item) => item.channel),
          },
        ]
      : [];

  return {
    outputType: 'MarketingBrief',
    period: normalizedPeriod,
    status: 'ok',
    recommendation: actions.length
      ? 'Färsk data visar underpresterande annonser — OWNER bör granska paus-förslag.'
      : 'Ingen åtgärd rekommenderas utöver fortsatt övervakning.',
    executiveSummary: [periodLabel, ...highlights].filter(Boolean).join(' '),
    highlights,
    risks,
    actions,
    performanceSummary: summary,
    dataQuality: {
      freshMetricCount: Number(summary.freshMetricCount || 0),
      staleMetricCount: Number(summary.staleMetricCount || 0),
      missingSources: asArray(summary.missingSources),
    },
    generatedAt: new Date().toISOString(),
    readOnly: true,
  };
}

module.exports = {
  INSUFFICIENT_DATA_MESSAGE,
  KPI_KEYS,
  summarizeMarketingPerformance,
  buildMarketingBrief,
  collectChannelMetrics,
  detectUnderperformingAds,
  normalizeMetric,
  isMetricFresh,
};
