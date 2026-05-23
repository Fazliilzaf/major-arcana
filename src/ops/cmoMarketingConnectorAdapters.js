'use strict';

const GOOGLE_ADS_API_VERSION = 'v18';
const META_GRAPH_VERSION = 'v21.0';
const LINKEDIN_API_VERSION = '202405';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseWindowDays(window = '7d') {
  const normalized = normalizeText(window).toLowerCase();
  const match = normalized.match(/^(\d+)\s*d$/);
  if (match) return Math.max(1, Math.min(90, Number(match[1])));
  if (normalized === '30d' || normalized === 'monthly') return 30;
  return 7;
}

function windowToGoogleAdsRange(window = '7d') {
  const days = parseWindowDays(window);
  if (days <= 7) return 'LAST_7_DAYS';
  if (days <= 14) return 'LAST_14_DAYS';
  if (days <= 30) return 'LAST_30_DAYS';
  return 'LAST_30_DAYS';
}

function windowToMetaDatePreset(window = '7d') {
  const days = parseWindowDays(window);
  if (days <= 7) return 'last_7d';
  if (days <= 14) return 'last_14d';
  if (days <= 28) return 'last_28d';
  return 'last_30d';
}

function buildNormalizedMetrics({
  impressions = null,
  clicks = null,
  spend = null,
  ctr = null,
  cpc = null,
  cpa = null,
  cpl = null,
  conversions = null,
} = {}) {
  const metrics = {};
  const safeImpressions = toNumber(impressions, null);
  const safeClicks = toNumber(clicks, null);
  const safeSpend = toNumber(spend, null);
  const safeConversions = toNumber(conversions, null);

  let resolvedCtr = toNumber(ctr, null);
  if (resolvedCtr == null && safeImpressions && safeClicks != null && safeImpressions > 0) {
    resolvedCtr = safeClicks / safeImpressions;
  }
  if (resolvedCtr != null && resolvedCtr > 1) resolvedCtr = resolvedCtr / 100;

  let resolvedCpc = toNumber(cpc, null);
  if (resolvedCpc == null && safeSpend != null && safeClicks != null && safeClicks > 0) {
    resolvedCpc = safeSpend / safeClicks;
  }

  let resolvedCpa = toNumber(cpa, null);
  if (resolvedCpa == null && safeSpend != null && safeConversions != null && safeConversions > 0) {
    resolvedCpa = safeSpend / safeConversions;
  }

  if (resolvedCtr != null) metrics.ctr = resolvedCtr;
  if (resolvedCpc != null) metrics.cpc = resolvedCpc;
  if (resolvedCpa != null) metrics.cpa = resolvedCpa;
  if (toNumber(cpl, null) != null) metrics.cpl = toNumber(cpl);
  if (safeConversions != null && safeClicks != null && safeClicks > 0) {
    metrics.conversionRate = safeConversions / safeClicks;
  }

  return {
    metrics,
    spend: safeSpend,
    impressions: safeImpressions,
    clicks: safeClicks,
  };
}

async function readJsonResponse(response) {
  if (!response.ok) {
    const bodyText = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

async function fetchWithTimeout(url, options = {}, fetchImpl = globalThis.fetch) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _ignored, ...fetchOptions } = options;
    return await fetchImpl(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function canFetchGoogleAds(connector = {}) {
  return Boolean(
    normalizeText(connector.customerId || connector.accountId) &&
      normalizeText(connector.accessToken) &&
      normalizeText(connector.developerToken || connector.apiKey)
  );
}

function canFetchMeta(connector = {}) {
  return Boolean(normalizeText(connector.adAccountId || connector.accountId) && normalizeText(connector.accessToken));
}

function canFetchLinkedIn(connector = {}) {
  return Boolean(normalizeText(connector.adAccountId || connector.accountId) && normalizeText(connector.accessToken));
}

function canFetchMail(connector = {}) {
  return Boolean(
    normalizeText(connector.apiBaseUrl) &&
      (normalizeText(connector.accessToken) || normalizeText(connector.apiKey))
  );
}

function resolveLiveAdapter(channel = '', connector = {}) {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  if (normalizedChannel === 'google_ads' && canFetchGoogleAds(connector)) return 'google_ads';
  if (normalizedChannel === 'meta' && canFetchMeta(connector)) return 'meta';
  if (normalizedChannel === 'linkedin' && canFetchLinkedIn(connector)) return 'linkedin';
  if (normalizedChannel === 'mail' && canFetchMail(connector)) return 'mail';
  return null;
}

function aggregateGoogleAdsRows(rows = []) {
  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  let conversions = 0;

  for (const row of rows) {
    const metrics = asObject(row.metrics);
    impressions += toNumber(metrics.impressions, 0);
    clicks += toNumber(metrics.clicks, 0);
    spend += toNumber(metrics.costMicros ?? metrics.cost_micros, 0) / 1_000_000;
    conversions += toNumber(metrics.conversions, 0);
  }

  return buildNormalizedMetrics({
    impressions,
    clicks,
    spend,
    conversions,
  });
}

async function fetchGoogleAdsMetrics({ connector = {}, window = '7d', fetchImpl = globalThis.fetch } = {}) {
  const customerId = normalizeText(connector.customerId || connector.accountId).replace(/-/g, '');
  const accessToken = normalizeText(connector.accessToken);
  const developerToken = normalizeText(connector.developerToken || connector.apiKey);
  const loginCustomerId = normalizeText(connector.loginCustomerId).replace(/-/g, '');
  const apiVersion = normalizeText(connector.apiVersion) || GOOGLE_ADS_API_VERSION;
  const dateRange = windowToGoogleAdsRange(window);
  const query = [
    'SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr,',
    'metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion',
    'FROM customer',
    `WHERE segments.date DURING ${dateRange}`,
  ].join(' ');

  const url = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      timeoutMs: connector.timeoutMs,
    },
    fetchImpl
  );
  const body = await readJsonResponse(response);
  const rows = asArray(body.results);
  const normalized = aggregateGoogleAdsRows(rows);
  if (!Object.keys(normalized.metrics).length && normalized.spend == null) {
    throw new Error('Google Ads response saknar metrics.');
  }
  return normalized;
}

function normalizeMetaInsightsRow(row = {}) {
  const leads = asArray(row.actions).find((item) =>
    /lead/i.test(normalizeText(item.action_type))
  );
  return buildNormalizedMetrics({
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    ctr: row.ctr,
    cpc: row.cpc,
    conversions: leads?.value,
  });
}

async function fetchMetaMetrics({ connector = {}, window = '7d', fetchImpl = globalThis.fetch } = {}) {
  const adAccountId = normalizeText(connector.adAccountId || connector.accountId).replace(/^act_/, '');
  const accessToken = normalizeText(connector.accessToken);
  const graphVersion = normalizeText(connector.apiVersion) || META_GRAPH_VERSION;
  const datePreset = windowToMetaDatePreset(window);
  const url = new URL(`https://graph.facebook.com/${graphVersion}/act_${adAccountId}/insights`);
  url.searchParams.set(
    'fields',
    'impressions,clicks,spend,ctr,cpc,actions,cost_per_action_type,cost_per_unique_click'
  );
  url.searchParams.set('date_preset', datePreset);
  url.searchParams.set('access_token', accessToken);

  const response = await fetchWithTimeout(url.toString(), { timeoutMs: connector.timeoutMs }, fetchImpl);
  const body = await readJsonResponse(response);
  const row = asArray(body.data)[0];
  if (!row) throw new Error('Meta insights response saknar data.');
  const normalized = normalizeMetaInsightsRow(row);
  if (!Object.keys(normalized.metrics).length && normalized.spend == null) {
    throw new Error('Meta insights saknar metrics.');
  }
  return normalized;
}

function resolveLinkedInAccountUrn(connector = {}) {
  const raw = normalizeText(connector.adAccountId || connector.accountId);
  if (!raw) return '';
  if (raw.startsWith('urn:li:sponsoredAccount:')) return raw;
  return `urn:li:sponsoredAccount:${raw.replace(/\D/g, '')}`;
}

function buildLinkedInDateRange(window = '7d') {
  const days = parseWindowDays(window);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));
  const part = (date) =>
    `(year:${date.getUTCFullYear()},month:${date.getUTCMonth() + 1},day:${date.getUTCDate()})`;
  return `(start:${part(start)},end:${part(end)})`;
}

async function fetchLinkedInMetrics({ connector = {}, window = '7d', fetchImpl = globalThis.fetch } = {}) {
  const accountUrn = resolveLinkedInAccountUrn(connector);
  const accessToken = normalizeText(connector.accessToken);
  const linkedInVersion = normalizeText(connector.apiVersion) || LINKEDIN_API_VERSION;
  const dateRange = buildLinkedInDateRange(window);
  const url = new URL('https://api.linkedin.com/rest/adAnalytics');
  url.searchParams.set('q', 'analytics');
  url.searchParams.set('pivot', 'ACCOUNT');
  url.searchParams.set('timeGranularity', 'ALL');
  url.searchParams.set('dateRange', dateRange);
  url.searchParams.set('accounts', `List(${accountUrn})`);
  url.searchParams.set(
    'fields',
    'impressions,clicks,costInLocalCurrency,externalWebsiteConversions,oneClickLeads'
  );

  const response = await fetchWithTimeout(
    url.toString(),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': linkedInVersion,
        'X-Restli-Protocol-Version': '2.0.0',
        Accept: 'application/json',
      },
      timeoutMs: connector.timeoutMs,
    },
    fetchImpl
  );
  const body = await readJsonResponse(response);
  const elements = asArray(body.elements);
  const row = elements[0] || body;
  const normalized = buildNormalizedMetrics({
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.costInLocalCurrency,
    conversions: row.externalWebsiteConversions ?? row.oneClickLeads,
  });
  if (!Object.keys(normalized.metrics).length && normalized.spend == null) {
    throw new Error('LinkedIn adAnalytics saknar metrics.');
  }
  return normalized;
}

async function fetchMailMetrics({ connector = {}, window = '7d', fetchImpl = globalThis.fetch } = {}) {
  const apiBaseUrl = normalizeText(connector.apiBaseUrl);
  const metricsPath = normalizeText(connector.metricsPath) || '/metrics';
  const url = new URL(metricsPath, apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
  url.searchParams.set('window', window);

  const headers = { Accept: 'application/json' };
  const accessToken = normalizeText(connector.accessToken);
  const apiKey = normalizeText(connector.apiKey);
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetchWithTimeout(url.toString(), { headers, timeoutMs: connector.timeoutMs }, fetchImpl);
  const body = await readJsonResponse(response);
  const metricsSource = asObject(body.metrics || body.kpis || body);
  const normalized = buildNormalizedMetrics({
    impressions: metricsSource.impressions ?? metricsSource.delivered,
    clicks: metricsSource.clicks ?? metricsSource.unique_clicks,
    spend: metricsSource.spend ?? metricsSource.cost,
    ctr: metricsSource.ctr ?? metricsSource.click_rate,
    cpc: metricsSource.cpc,
    conversions: metricsSource.conversions ?? metricsSource.signups,
  });
  if (!Object.keys(normalized.metrics).length && normalized.spend == null) {
    throw new Error('Mail metrics response saknar data.');
  }
  return normalized;
}

async function fetchLiveMetricsViaAdapter({
  channel = '',
  connector = {},
  window = '7d',
  fetchImpl = globalThis.fetch,
} = {}) {
  const adapter = resolveLiveAdapter(channel, connector);
  if (!adapter) return null;

  if (adapter === 'google_ads') {
    return fetchGoogleAdsMetrics({ connector, window, fetchImpl });
  }
  if (adapter === 'meta') {
    return fetchMetaMetrics({ connector, window, fetchImpl });
  }
  if (adapter === 'linkedin') {
    return fetchLinkedInMetrics({ connector, window, fetchImpl });
  }
  if (adapter === 'mail') {
    return fetchMailMetrics({ connector, window, fetchImpl });
  }
  return null;
}

module.exports = {
  GOOGLE_ADS_API_VERSION,
  META_GRAPH_VERSION,
  LINKEDIN_API_VERSION,
  parseWindowDays,
  resolveLiveAdapter,
  fetchLiveMetricsViaAdapter,
  fetchGoogleAdsMetrics,
  fetchMetaMetrics,
  fetchLinkedInMetrics,
  buildNormalizedMetrics,
  canFetchGoogleAds,
  canFetchMeta,
  canFetchLinkedIn,
  canFetchMail,
  fetchMailMetrics,
};
