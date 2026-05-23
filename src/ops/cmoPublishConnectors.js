'use strict';

const IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;
const recentPublishes = new Map();

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function resolvePublishLiveEnabled(config = {}) {
  const appConfig = config.config && typeof config.config === 'object' ? config.config : config;
  return appConfig.marketingPublishLiveEnabled === true;
}

function buildIdempotencyKey({ tenantId = '', campaignId = '', channel = '', correlationId = '' } = {}) {
  const explicit = normalizeText(correlationId);
  if (explicit) return explicit;
  return `${normalizeText(tenantId) || 'default'}:${normalizeText(campaignId)}:${normalizeText(channel)}`;
}

function readIdempotentResult(key) {
  const entry = recentPublishes.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    recentPublishes.delete(key);
    return null;
  }
  return entry.result;
}

function rememberIdempotentResult(key, result) {
  recentPublishes.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
  return result;
}

function extractPublishBody(campaign = {}) {
  const payload = asObject(campaign.payload);
  const schedule = asObject(payload.publishSchedule);
  return (
    normalizeText(schedule.body) ||
    normalizeText(payload.bodyOutline) ||
    normalizeText(campaign.name) ||
    'Arcana Marketing Copilot — godkänt utkast.'
  );
}

async function publishLinkedInPost({
  campaign = {},
  connector = {},
  fetchImpl = globalThis.fetch,
  sandbox = true,
} = {}) {
  const accessToken = normalizeText(connector.accessToken);
  const organizationUrn = normalizeText(connector.organizationUrn || connector.adAccountId);
  const body = extractPublishBody(campaign);

  if (sandbox || !accessToken || !organizationUrn) {
    return {
      status: 'published',
      channel: 'linkedin',
      externalId: `sandbox-linkedin-${Date.now()}`,
      externalPublishInvoked: true,
      mode: sandbox ? 'sandbox' : 'stub',
      message: 'LinkedIn publish simulerad (sandbox/staging).',
      publishedBodyPreview: body.slice(0, 180),
    };
  }

  const url = 'https://api.linkedin.com/rest/posts';
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': normalizeText(connector.apiVersion) || '202405',
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      author: organizationUrn.startsWith('urn:')
        ? organizationUrn
        : `urn:li:organization:${organizationUrn.replace(/\D/g, '')}`,
      commentary: body,
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
    }),
  });

  if (!response.ok) {
    const detail = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`LinkedIn publish HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }

  const payload = typeof response.json === 'function' ? await response.json() : {};
  return {
    status: 'published',
    channel: 'linkedin',
    externalId: normalizeText(payload.id) || `linkedin-${Date.now()}`,
    externalPublishInvoked: true,
    mode: 'live',
    message: 'LinkedIn publish lyckades.',
  };
}

async function publishMetaPost({ campaign = {}, sandbox = true } = {}) {
  const body = extractPublishBody(campaign);
  if (sandbox) {
    return {
      status: 'publish_queued',
      channel: 'meta',
      externalId: null,
      externalPublishInvoked: false,
      mode: 'stub',
      message: 'Meta publish stub — aktivera live adapter i senare fas.',
      publishedBodyPreview: body.slice(0, 180),
    };
  }
  throw new Error('Meta live publish är inte aktiverad i denna fas.');
}

async function publishMailCampaign({ campaign = {}, sandbox = true } = {}) {
  const body = extractPublishBody(campaign);
  return {
    status: 'publish_queued',
    channel: 'email',
    externalId: null,
    externalPublishInvoked: false,
    mode: 'stub',
    message: 'Mail publish stub — kräver ESP-integration (Fas Q3).',
    publishedBodyPreview: body.slice(0, 180),
  };
}

async function publishToExternalChannel({
  channel = '',
  campaign = {},
  tenantId = '',
  config = {},
  tenantConfig = {},
  correlationId = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedChannel = normalizeText(channel).toLowerCase();
  const campaignId = normalizeText(campaign.id);
  const idempotencyKey = buildIdempotencyKey({
    tenantId,
    campaignId,
    channel: normalizedChannel,
    correlationId,
  });
  const cached = readIdempotentResult(idempotencyKey);
  if (cached) {
    return { ...cached, idempotentReplay: true };
  }

  const appConfig = config.config && typeof config.config === 'object' ? config.config : config;
  const liveEnabled = resolvePublishLiveEnabled(appConfig);
  const tenantMarketing = asObject(asObject(tenantConfig).marketing);
  const tenantPublish = asObject(tenantMarketing.publishConnectors);
  const globalPublish = asObject(appConfig.marketingPublishConnectors);
  const connector = asObject(tenantPublish[normalizedChannel] || globalPublish[normalizedChannel]);
  const sandbox = connector.sandbox !== false && appConfig.marketingPublishSandbox !== false;

  if (!liveEnabled) {
    const blocked = {
      status: 'publish_queued',
      channel: normalizedChannel,
      campaignId,
      tenantId: normalizeText(tenantId) || 'default',
      externalPublishInvoked: false,
      mode: 'pilot_queue_stub',
      message: 'Live publish avstängd (ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=false).',
      correlationId: idempotencyKey,
    };
    return rememberIdempotentResult(idempotencyKey, blocked);
  }

  try {
    let result;
    if (normalizedChannel === 'linkedin') {
      result = await publishLinkedInPost({ campaign, connector, fetchImpl, sandbox });
    } else if (normalizedChannel === 'meta' || normalizedChannel === 'facebook') {
      result = await publishMetaPost({ campaign, sandbox });
    } else if (normalizedChannel === 'email' || normalizedChannel === 'mail') {
      result = await publishMailCampaign({ campaign, sandbox });
    } else {
      throw new Error(`Kanal ${normalizedChannel} stöds inte för extern publish.`);
    }

    const wrapped = {
      ...result,
      campaignId,
      tenantId: normalizeText(tenantId) || 'default',
      correlationId: idempotencyKey,
      publishedAt: result.status === 'published' ? new Date().toISOString() : null,
    };
    return rememberIdempotentResult(idempotencyKey, wrapped);
  } catch (error) {
    const failed = {
      status: 'publish_failed',
      channel: normalizedChannel,
      campaignId,
      tenantId: normalizeText(tenantId) || 'default',
      externalPublishInvoked: true,
      mode: sandbox ? 'sandbox' : 'live',
      message: error?.message || 'Extern publish misslyckades.',
      correlationId: idempotencyKey,
      deadLetter: true,
    };
    return rememberIdempotentResult(idempotencyKey, failed);
  }
}

function clearPublishIdempotencyCache() {
  recentPublishes.clear();
}

module.exports = {
  publishToExternalChannel,
  resolvePublishLiveEnabled,
  buildIdempotencyKey,
  clearPublishIdempotencyCache,
  extractPublishBody,
};
