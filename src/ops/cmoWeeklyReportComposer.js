'use strict';

const { fetchChannelMetrics } = require('./cmoMarketingConnectors');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatWeek(week = '') {
  const normalized = normalizeText(week).toUpperCase();
  const match = normalized.match(/^(\d{4})-W(\d{1,2})$/);
  if (!match) return '';
  const year = match[1];
  const num = String(match[2]).padStart(2, '0');
  return `${year}-W${num}`;
}

function isoWeek(date = new Date()) {
  const target = new Date(date.valueOf());
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function buildChannelKpi(channelBlock = {}) {
  const block = asObject(channelBlock);
  const metrics = asObject(block.metrics);
  return {
    source: block.source || '',
    window: block.window || '',
    fetchedAt: block.fetchedAt || '',
    fresh: block.fresh === true,
    mode: block.connectorMode || block.mode || '',
    status: block.status || '',
    clicks: metrics.clicks?.value ?? block.clicks?.value ?? null,
    impressions: metrics.impressions?.value ?? block.impressions?.value ?? null,
    spend: metrics.spend?.value ?? block.spend?.value ?? null,
    ctr: metrics.ctr?.value ?? null,
    cpc: metrics.cpc?.value ?? null,
    cpa: metrics.cpa?.value ?? null,
    position: metrics.position?.value ?? null,
    message: block.message || '',
  };
}

function buildSummary({ week, channels, previousReport }) {
  const okChannels = Object.entries(channels).filter(([, block]) => block.status === 'ok');
  const totalClicks = okChannels.reduce((sum, [, block]) => sum + (block.clicks || 0), 0);
  const totalImpressions = okChannels.reduce((sum, [, block]) => sum + (block.impressions || 0), 0);

  const lines = [
    `Veckorapport ${week}:`,
    `${okChannels.length} av ${Object.keys(channels).length} kanaler rapporterade färsk data.`,
  ];

  if (totalImpressions > 0) {
    lines.push(
      `${totalImpressions.toLocaleString('sv-SE')} visningar, ${totalClicks.toLocaleString('sv-SE')} klick.`
    );
  }

  if (previousReport && previousReport.sections && previousReport.sections.kpi) {
    const prev = asObject(previousReport.sections.kpi);
    const prevImpressions = Object.values(prev).reduce(
      (sum, block) => sum + (asObject(block).impressions || 0),
      0
    );
    if (prevImpressions > 0 && totalImpressions > 0) {
      const change = ((totalImpressions - prevImpressions) / prevImpressions) * 100;
      const sign = change >= 0 ? '+' : '';
      lines.push(
        `Visningar förändrades med ${sign}${change.toFixed(1)}% jämfört med förra veckan.`
      );
    }
  }

  const errorChannels = Object.entries(channels).filter(([, block]) => block.status === 'error');
  if (errorChannels.length) {
    lines.push(`Varning: ${errorChannels.map(([name]) => name).join(', ')} rapporterade fel.`);
  }

  return lines.join(' ');
}

async function composeWeeklyReport({
  tenantId = '',
  brand = '',
  week = '',
  config = {},
  tenantConfig = null,
  previousReport = null,
  channels = ['gsc', 'google_ads', 'meta', 'linkedin', 'mail'],
  window = '7d',
  createdBy = 'agent',
} = {}) {
  const resolvedWeek = formatWeek(week) || isoWeek();
  const resolvedBrand = normalizeText(brand) || normalizeText(tenantId) || 'default';

  const channelResults = {};
  for (const channel of channels) {
    const result = await fetchChannelMetrics({
      channel,
      tenantId,
      config,
      tenantConfig,
      window,
    });
    channelResults[channel] = result;
  }

  const channelBlocks = {};
  for (const [channel, result] of Object.entries(channelResults)) {
    const block = asObject(result.channelBlock || result.metrics);
    channelBlocks[channel] = buildChannelKpi(block);
    channelBlocks[channel].status = result.status || '';
    channelBlocks[channel].message = result.message || '';
  }

  const summary = buildSummary({ week: resolvedWeek, channels: channelBlocks, previousReport });

  return {
    tenantId: normalizeText(tenantId) || 'default',
    brand: resolvedBrand,
    week: resolvedWeek,
    status: 'draft',
    createdBy,
    summary,
    sections: {
      kpi: channelBlocks,
      done: [],
      planned: [],
      draftsPending: [],
      blockers: [],
    },
  };
}

module.exports = {
  composeWeeklyReport,
  formatWeek,
  isoWeek,
  buildChannelKpi,
  buildSummary,
};
