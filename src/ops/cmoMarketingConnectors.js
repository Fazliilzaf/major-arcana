'use strict';

const { isMetricFresh } = require('./cmoMarketingMetrics');
const { fetchLiveMetricsViaAdapter, resolveLiveAdapter } = require('./cmoMarketingConnectorAdapters');

const CONNECTOR_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  OK: 'ok',
  ERROR: 'error',
});

const DEFAULT_CHANNELS = Object.freeze(['google_ads', 'meta', 'linkedin', 'mail']);
const metricsCache = new Map();

function cacheKey(tenantId, channel, window, connector = {}, appConfig = {}) {
  const mode = resolveConnectorMode(connector, appConfig);
  const enabled = isConnectorEnabled(connector, appConfig) ? '1' : '0';
  return `${normalizeText(tenantId) || 'default'}:${normalizeText(channel).toLowerCase()}:${window}:${mode}:${enabled}`;
}

function readCachedMetrics(key, ttlMs) {
  const entry = metricsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) {
    metricsCache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCachedMetrics(key, result) {
  if (result.status !== CONNECTOR_STATUS.OK) return result;
  metricsCache.set(key, { result, cachedAt: Date.now() });
  return result;
}

function clearConnectorMetricsCache() {
  metricsCache.clear();
}

function mergeConnectorConfig(globalConnector = {}, tenantConnector = {}) {
  const merged = { ...asObject(globalConnector) };
  const tenant = asObject(tenantConnector);
  for (const [key, value] of Object.entries(tenant)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !normalizeText(value)) continue;
    merged[key] = value;
  }
  return merged;
}

function resolveTenantConnectorConfig(tenantConfig = {}, channel = '') {
  const marketing = asObject(tenantConfig.marketing);
  const connectors = asObject(marketing.connectors || marketing.marketingConnectors);
  return asObject(connectors[normalizeText(channel).toLowerCase()]);
}

const CHANNEL_FIXTURES = Object.freeze({
  google_ads: {
    metrics: { ctr: 0.014, cpc: 4.8, cpa: 95, cpl: 38, conversionRate: 0.016 },
    spend: 1450,
    impressions: 82000,
    clicks: 1148,
  },
  meta: {
    metrics: { ctr: 0.021, cpc: 3.2, cpa: 72, cpl: 29, conversionRate: 0.019 },
    spend: 980,
    impressions: 64000,
    clicks: 1344,
  },
  linkedin: {
    metrics: { ctr: 0.032, cpc: 2.4, cpa: 110, cpl: 52, conversionRate: 0.011 },
    spend: 520,
    impressions: 18000,
    clicks: 576,
  },
  mail: {
    metrics: { ctr: 0.045, cpc: 0.35, cpa: 18, cpl: 12, conversionRate: 0.028 },
    spend: 120,
    impressions: 12000,
    clicks: 540,
  },
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveAppConfig(config = {}) {
  if (config && config.config && typeof config.config === 'object') return config.config;
  if (config && typeof config.marketingConnectors === 'object') return config;
  try {
    const loaded = require('../config');
    return loaded.config || loaded;
  } catch {
    return asObject(config);
  }
}

function resolveConnectorConfig(config = {}, channel = '', tenantConfig = null) {
  const appConfig = resolveAppConfig(config);
  const marketing = asObject(appConfig.marketingConnectors || appConfig.marketing?.connectors);
  const key = normalizeText(channel).toLowerCase();
  const globalConnector = asObject(marketing[key]);
  if (!tenantConfig) return globalConnector;
  const tenantConnector = resolveTenantConnectorConfig(tenantConfig, key);
  return mergeConnectorConfig(globalConnector, tenantConnector);
}

function resolveConnectorMode(connector = {}, appConfig = {}) {
  const explicit = normalizeText(connector.mode).toLowerCase();
  if (explicit === 'fixture' || explicit === 'live' || explicit === 'off') return explicit;
  const globalMode = normalizeText(appConfig.marketingConnectorsMode).toLowerCase();
  if (globalMode === 'fixture' || globalMode === 'live' || globalMode === 'off') return globalMode;
  return 'off';
}

function connectorHasCredentials(connector = {}) {
  return Boolean(
    normalizeText(connector.apiKey) ||
      normalizeText(connector.accessToken) ||
      normalizeText(connector.clientSecret)
  );
}

function isConnectorEnabled(connector = {}, appConfig = {}) {
  if (connector.enabled === false) return false;
  if (connector.enabled === true) return true;
  if (appConfig.marketingConnectorsEnabled === true) return true;
  return connectorHasCredentials(connector);
}

function buildMetric(value, source, window, fetchedAt) {
  return {
    value,
    source,
    window,
    fetchedAt,
    fresh: true,
  };
}

function buildChannelPerformanceBlock({
  channel = '',
  rawMetrics = {},
  window = '7d',
  fetchedAt = new Date().toISOString(),
  connectorMode = 'fixture',
} = {}) {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  const metricsBlock = asObject(rawMetrics.metrics);
  const metrics = {};
  for (const [key, value] of Object.entries(metricsBlock)) {
    metrics[key] = buildMetric(value, normalizedChannel, window, fetchedAt);
  }

  const block = {
    source: normalizedChannel,
    window,
    fetchedAt,
    fresh: true,
    connectorMode,
    metrics,
  };

  if (rawMetrics.spend != null) {
    block.spend = buildMetric(rawMetrics.spend, normalizedChannel, window, fetchedAt);
  }
  if (rawMetrics.impressions != null) {
    block.impressions = buildMetric(rawMetrics.impressions, normalizedChannel, window, fetchedAt);
  }
  if (rawMetrics.clicks != null) {
    block.clicks = buildMetric(rawMetrics.clicks, normalizedChannel, window, fetchedAt);
  }

  return block;
}

function resolveFixtureMetrics(channel = '', connector = {}) {
  const fixtureId = normalizeText(connector.fixtureId).toLowerCase();
  if (fixtureId && CHANNEL_FIXTURES[fixtureId]) return CHANNEL_FIXTURES[fixtureId];
  return CHANNEL_FIXTURES[normalizeText(channel).toLowerCase()] || null;
}

function normalizeLiveMetricsPayload(body = {}, channel = '') {
  const payload = asObject(body);
  const metricsSource = asObject(payload.metrics || payload.kpis || payload);
  const metrics = {};
  for (const key of ['ctr', 'cpc', 'cpa', 'cpl', 'conversionRate']) {
    if (metricsSource[key] == null) continue;
    const raw = metricsSource[key];
    metrics[key] = typeof raw === 'object' ? Number(raw.value) : Number(raw);
  }

  const spend = payload.spend != null ? Number(asObject(payload.spend).value ?? payload.spend) : null;
  const impressions =
    payload.impressions != null
      ? Number(asObject(payload.impressions).value ?? payload.impressions)
      : null;
  const clicks =
    payload.clicks != null ? Number(asObject(payload.clicks).value ?? payload.clicks) : null;

  if (!Object.keys(metrics).length && spend == null && impressions == null && clicks == null) {
    return null;
  }

  return {
    metrics,
    spend: Number.isFinite(spend) ? spend : null,
    impressions: Number.isFinite(impressions) ? impressions : null,
    clicks: Number.isFinite(clicks) ? clicks : null,
  };
}

async function fetchLiveChannelMetrics({
  connector = {},
  channel = '',
  window = '7d',
  fetchImpl = globalThis.fetch,
} = {}) {
  const adapter = resolveLiveAdapter(channel, connector);
  if (adapter) {
    const adapterMetrics = await fetchLiveMetricsViaAdapter({
      channel,
      connector,
      window,
      fetchImpl,
    });
    if (adapterMetrics) return adapterMetrics;
  }

  const apiBaseUrl = normalizeText(connector.apiBaseUrl);
  if (!apiBaseUrl) {
    throw new Error(`Live fetch saknar apiBaseUrl för ${channel}.`);
  }

  const metricsPath = normalizeText(connector.metricsPath) || '/metrics';
  const url = new URL(metricsPath, apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
  url.searchParams.set('window', window);

  const headers = { Accept: 'application/json' };
  const accessToken = normalizeText(connector.accessToken);
  const apiKey = normalizeText(connector.apiKey);
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const timeoutMs = Number(connector.timeoutMs) > 0 ? Number(connector.timeoutMs) : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json();
    const normalized = normalizeLiveMetricsPayload(body, channel);
    if (!normalized) {
      throw new Error('Live response saknar metrics.');
    }
    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchChannelMetrics({
  channel = '',
  tenantId = '',
  config = {},
  tenantConfig = null,
  window = '7d',
  fetchImpl = globalThis.fetch,
  forceRefresh = false,
} = {}) {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  const appConfig = resolveAppConfig(config);
  const cacheTtlMs = Number(appConfig.marketingConnectorsCacheTtlMs) > 0
    ? Number(appConfig.marketingConnectorsCacheTtlMs)
    : 300000;

  const connector = resolveConnectorConfig(appConfig, normalizedChannel, tenantConfig);
  const key = cacheKey(tenantId, normalizedChannel, window, connector, appConfig);
  if (!forceRefresh) {
    const cached = readCachedMetrics(key, cacheTtlMs);
    if (cached) {
      return { ...cached, cacheHit: true };
    }
  }

  const enabled = isConnectorEnabled(connector, appConfig);
  const mode = resolveConnectorMode(connector, appConfig);
  const hasCredentials = connectorHasCredentials(connector);
  const liveFetch =
    connector.liveFetch === true || appConfig.marketingConnectorsLiveFetch === true;
  const fetchedAt = new Date().toISOString();

  if (!enabled || mode === 'off') {
    const result = {
      status: CONNECTOR_STATUS.NOT_CONFIGURED,
      channel: normalizedChannel,
      tenantId: normalizeText(tenantId) || null,
      metrics: null,
      channelBlock: null,
      mode: mode || 'off',
      message: `Connector ${normalizedChannel || 'unknown'} not configured.`,
      fetchedAt,
    };
    return result;
  }

  if (mode === 'fixture' || (hasCredentials && !liveFetch)) {
    const fixture = resolveFixtureMetrics(normalizedChannel, connector);
    if (!fixture) {
      return {
        status: CONNECTOR_STATUS.ERROR,
        channel: normalizedChannel,
        tenantId: normalizeText(tenantId) || null,
        metrics: null,
        channelBlock: null,
        mode: 'fixture',
        message: `Fixture saknas för ${normalizedChannel}.`,
        fetchedAt,
      };
    }

    const channelBlock = buildChannelPerformanceBlock({
      channel: normalizedChannel,
      rawMetrics: fixture,
      window,
      fetchedAt,
      connectorMode: 'fixture',
    });

    return writeCachedMetrics(key, {
      status: CONNECTOR_STATUS.OK,
      channel: normalizedChannel,
      tenantId: normalizeText(tenantId) || null,
      metrics: channelBlock,
      channelBlock,
      mode: 'fixture',
      message: hasCredentials
        ? 'Fixture metrics (credentials present, live fetch disabled).'
        : 'Fixture metrics (v2.1 mock mode).',
      fetchedAt,
    });
  }

  if (!hasCredentials) {
    return {
      status: CONNECTOR_STATUS.NOT_CONFIGURED,
      channel: normalizedChannel,
      tenantId: normalizeText(tenantId) || null,
      metrics: null,
      channelBlock: null,
      mode: 'live',
      message: `Live connector ${normalizedChannel} saknar credentials.`,
      fetchedAt,
    };
  }

  try {
    const adapterName = resolveLiveAdapter(normalizedChannel, connector);
    const liveMetrics = await fetchLiveChannelMetrics({
      connector,
      channel: normalizedChannel,
      window,
      fetchImpl,
    });
    const channelBlock = buildChannelPerformanceBlock({
      channel: normalizedChannel,
      rawMetrics: liveMetrics,
      window,
      fetchedAt,
      connectorMode: 'live',
    });
    return writeCachedMetrics(key, {
      status: CONNECTOR_STATUS.OK,
      channel: normalizedChannel,
      tenantId: normalizeText(tenantId) || null,
      metrics: channelBlock,
      channelBlock,
      mode: 'live',
      adapter: adapterName || 'generic',
      message: adapterName
        ? `Live metrics fetched via ${adapterName} adapter.`
        : 'Live metrics fetched via generic endpoint.',
      fetchedAt,
    });
  } catch (error) {
    return {
      status: CONNECTOR_STATUS.ERROR,
      channel: normalizedChannel,
      tenantId: normalizeText(tenantId) || null,
      metrics: null,
      channelBlock: null,
      mode: 'live',
      message: error?.message || 'Live fetch failed.',
      fetchedAt,
    };
  }
}

async function listConnectorStatuses({
  config = {},
  channels = DEFAULT_CHANNELS,
  tenantId = '',
  tenantConfig = null,
  window = '7d',
  forceRefresh = false,
} = {}) {
  const results = [];
  for (const channel of channels) {
    results.push(
      await fetchChannelMetrics({
        channel,
        tenantId,
        config,
        tenantConfig,
        window,
        forceRefresh,
      })
    );
  }
  return results;
}

function snapshotHasFreshMarketingPerformance(snapshot = {}, maxAgeMs) {
  const performance = asObject(snapshot.marketingPerformance || snapshot.marketingMetrics);
  const channels = asObject(performance.channels);
  for (const rawChannel of Object.values(channels)) {
    const channel = asObject(rawChannel);
    const fetchedAt = normalizeText(channel.fetchedAt);
    if (isMetricFresh({ fetchedAt, fresh: channel.fresh !== false }, Date.now(), maxAgeMs)) {
      const metrics = asObject(channel.metrics);
      if (Object.keys(metrics).length > 0) return true;
    }
  }
  return false;
}

async function mergeMarketingPerformanceFromConnectors(
  snapshot = {},
  { config = {}, tenantId = '', forceRefresh = false, window = '7d', channels = DEFAULT_CHANNELS } = {}
) {
  const nextSnapshot =
    snapshot && typeof snapshot === 'object' ? { ...snapshot } : {};
  const appConfig = resolveAppConfig(config);

  if (!forceRefresh && snapshotHasFreshMarketingPerformance(nextSnapshot)) {
    return {
      snapshot: nextSnapshot,
      merged: false,
      connectorResults: [],
    };
  }

  const connectorResults = await listConnectorStatuses({
    config: appConfig,
    channels,
    tenantId,
    window,
  });
  const okResults = connectorResults.filter(
    (item) => item.status === CONNECTOR_STATUS.OK && item.channelBlock
  );

  if (!okResults.length) {
    return {
      snapshot: nextSnapshot,
      merged: false,
      connectorResults,
    };
  }

  const existingPerformance = asObject(nextSnapshot.marketingPerformance);
  const mergedChannels = { ...asObject(existingPerformance.channels) };
  for (const result of okResults) {
    mergedChannels[result.channel] = result.channelBlock;
  }

  return {
    snapshot: {
      ...nextSnapshot,
      marketingPerformance: {
        ...existingPerformance,
        channels: mergedChannels,
        connectorHydratedAt: new Date().toISOString(),
        connectorHydrationMode: okResults.some((item) => item.mode === 'live') ? 'live' : 'fixture',
      },
      marketingConnectorStatuses: connectorResults.map((item) => ({
        channel: item.channel,
        status: item.status,
        mode: item.mode,
        message: item.message,
        fetchedAt: item.fetchedAt,
      })),
    },
    merged: true,
    connectorResults,
  };
}

module.exports = {
  CONNECTOR_STATUS,
  DEFAULT_CHANNELS,
  CHANNEL_FIXTURES,
  resolveAppConfig,
  resolveConnectorConfig,
  resolveTenantConnectorConfig,
  mergeConnectorConfig,
  fetchChannelMetrics,
  listConnectorStatuses,
  mergeMarketingPerformanceFromConnectors,
  snapshotHasFreshMarketingPerformance,
  buildChannelPerformanceBlock,
  clearConnectorMetricsCache,
};
