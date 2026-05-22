'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asObject,
  asArray,
  brandLabel,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

function slugify(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function resolveBaseUrl(snapshot = {}) {
  const tenantConfig = asObject(snapshot.tenantConfig);
  const marketing = asObject(tenantConfig.marketing || tenantConfig.brand);
  return (
    normalizeText(marketing.websiteUrl) ||
    normalizeText(marketing.baseUrl) ||
    normalizeText(tenantConfig.publicBaseUrl) ||
    'https://example.com'
  ).replace(/\/$/, '');
}

class GenerateUtmPackCapability extends BaseCapability {
  static name = 'GenerateUtmPack';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = false;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      maxLinks: { type: 'integer', minimum: 1, maximum: 30 },
      campaignPrefix: { type: 'string', maxLength: 40 },
    },
  };

  static outputSchema = {
    type: 'object',
    required: ['data', 'metadata', 'warnings'],
    additionalProperties: false,
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: { type: 'object', additionalProperties: true },
      warnings: { type: 'array', maxItems: 20 },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const snapshot = asObject(safeContext.systemStateSnapshot);
    const warnings = [];
    const maxLinks = Math.max(1, Math.min(30, toNumber(input.maxLinks, 12)));
    const brand = slugify(brandLabel(snapshot)) || 'arcana';
    const prefix = slugify(input.campaignPrefix) || `${brand}_q${Math.ceil((new Date().getUTCMonth() + 1) / 3)}`;
    const baseUrl = resolveBaseUrl(snapshot);

    const campaigns = asArray(snapshot.campaigns);
    const channels = ['linkedin', 'email', 'instagram', 'google', 'facebook'];
    const links = [];

    const sourceCampaigns = campaigns.length
      ? campaigns
      : [{ id: 'default', name: 'Content push', channel: 'email' }];

    for (const campaign of sourceCampaigns) {
      const campaignSlug = slugify(campaign.name || campaign.id) || 'campaign';
      for (const channel of channels) {
        if (links.length >= maxLinks) break;
        const params = new URLSearchParams({
          utm_source: channel,
          utm_medium: channel === 'email' ? 'email' : 'social',
          utm_campaign: `${prefix}_${campaignSlug}`,
          utm_content: `${channel}_v1`,
        });
        links.push({
          id: `${campaignSlug}_${channel}`,
          campaignId: normalizeText(campaign.id) || campaignSlug,
          campaignName: normalizeText(campaign.name) || campaignSlug,
          channel,
          path: '/',
          url: `${baseUrl}/?${params.toString()}`,
          utm_source: params.get('utm_source'),
          utm_medium: params.get('utm_medium'),
          utm_campaign: params.get('utm_campaign'),
          utm_content: params.get('utm_content'),
          requiresOwnerApproval: true,
        });
      }
    }

    const namingConvention = '{brand}_{quarter}_{campaign}_{channel}_{variant}';
    const summary =
      `${links.length} UTM-länkar genererade för ${sourceCampaigns.length} kampanj(er). ` +
      `Bas-URL: ${baseUrl}. ${CMO_DRAFT_DISCLAIMER}`;

    if (baseUrl.includes('example.com')) {
      warnings.push('Tenant base URL saknas — använder example.com som placeholder.');
    }

    return {
      data: {
        links: links.slice(0, maxLinks),
        namingConvention,
        campaignPrefix: prefix,
        baseUrl,
        summary,
        generatedAt: new Date().toISOString(),
        mode: 'proposal_only',
        autoPublish: false,
      },
      metadata: capabilityMeta(GenerateUtmPackCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateUtmPackCapability,
};
