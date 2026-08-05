'use strict';

const GSC_API_BASE = 'https://www.googleapis.com/webmasters/v3';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSiteUrl(siteUrl) {
  const raw = normalizeText(siteUrl);
  if (!raw) return '';
  if (raw.includes('://')) return raw;
  return `https://${raw}`;
}

function parseWindowDays(window = '7d') {
  const normalized = normalizeText(window).toLowerCase();
  const match = normalized.match(/^(\d+)\s*d$/);
  if (match) return Math.max(1, Math.min(90, Number(match[1])));
  if (normalized === '30d' || normalized === 'monthly') return 30;
  return 7;
}

function formatDateIso(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateRange(window = '7d') {
  const days = parseWindowDays(window);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));
  return { startDate: formatDateIso(start), endDate: formatDateIso(end) };
}

function buildNormalizedMetrics({ clicks = null, impressions = null, position = null } = {}) {
  const safeClicks = toNumber(clicks, null);
  const safeImpressions = toNumber(impressions, null);
  const safePosition = toNumber(position, null);

  const metrics = {};
  if (safeClicks != null && safeImpressions != null && safeImpressions > 0) {
    metrics.ctr = safeClicks / safeImpressions;
  }
  if (safePosition != null) metrics.position = safePosition;

  return {
    metrics,
    clicks: safeClicks,
    impressions: safeImpressions,
    spend: null,
  };
}

async function fetchWithTimeout(url, options = {}, fetchImpl = globalThis.fetch) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonResponse(response) {
  if (!response.ok) {
    const bodyText = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

function aggregateGscRows(rows = []) {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of asArray(rows)) {
    const safeClicks = toNumber(row.clicks, 0);
    const safeImpressions = toNumber(row.impressions, 0);
    const safePosition = toNumber(row.position, 0);

    clicks += safeClicks;
    impressions += safeImpressions;
    weightedPosition += safePosition * safeImpressions;
  }

  const averagePosition = impressions > 0 ? weightedPosition / impressions : null;

  return buildNormalizedMetrics({ clicks, impressions, position: averagePosition });
}

function canFetchGsc(connector = {}) {
  return Boolean(normalizeText(connector.accessToken) && normalizeSiteUrl(connector.siteUrl));
}

async function fetchGscMetrics({
  connector = {},
  window = '7d',
  fetchImpl = globalThis.fetch,
} = {}) {
  const siteUrl = normalizeSiteUrl(connector.siteUrl);
  const accessToken = normalizeText(connector.accessToken);
  if (!siteUrl || !accessToken) {
    throw new Error('GSC connector saknar siteUrl eller accessToken.');
  }

  const encodedSiteUrl = encodeURIComponent(siteUrl);
  const url = `${GSC_API_BASE}/sites/${encodedSiteUrl}/searchAnalytics/query`;
  const { startDate, endDate } = buildDateRange(window);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 1000,
      }),
      timeoutMs: connector.timeoutMs,
    },
    fetchImpl
  );

  const body = await readJsonResponse(response);
  return aggregateGscRows(body.rows);
}

module.exports = {
  canFetchGsc,
  fetchGscMetrics,
  buildNormalizedMetrics,
  normalizeSiteUrl,
  parseWindowDays,
  buildDateRange,
};
