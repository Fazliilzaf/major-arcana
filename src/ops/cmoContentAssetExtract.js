'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeChannel(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'twitter') return 'x';
  if (normalized === 'mail') return 'email';
  return normalized;
}

function resolveDefaultCampaignId(campaigns = []) {
  const items = asArray(campaigns);
  if (items.length === 1) return normalizeText(items[0].id) || null;
  return null;
}

function resolveCampaignForChannel(campaigns = [], channel = '') {
  const normalizedChannel = normalizeChannel(channel);
  const match = asArray(campaigns).find(
    (campaign) => normalizeChannel(campaign.channel) === normalizedChannel
  );
  return normalizeText(match?.id) || null;
}

function buildAssetBase({
  id = '',
  tenantId = 'default',
  campaignId = null,
  assetType = '',
  channel = '',
  title = '',
  body = '',
  sourceAgentRunId = '',
  metadata = {},
} = {}) {
  return {
    id: normalizeText(id),
    tenantId: normalizeText(tenantId) || 'default',
    campaignId: normalizeText(campaignId) || null,
    assetType: normalizeText(assetType) || 'content',
    channel: normalizeChannel(channel) || 'unknown',
    title: normalizeText(title) || 'Untitled asset',
    body: normalizeText(body),
    status: 'draft',
    sourceAgentRunId: normalizeText(sourceAgentRunId) || null,
    metadata: asObject(metadata),
    autoPublish: false,
    requiresOwnerApproval: true,
  };
}

function extractContentAssetsFromCmoOutput({
  cmoData = {},
  tenantId = 'default',
  agentRunId = '',
} = {}) {
  const data = asObject(cmoData);
  const campaigns = asArray(data.campaigns);
  const defaultCampaignId = resolveDefaultCampaignId(campaigns);
  const assets = [];

  for (const post of asArray(asObject(data.socialPostPack).posts)) {
    const channel = post.platform || post.channel;
    assets.push(
      buildAssetBase({
        id: post.id || `social-${assets.length + 1}`,
        tenantId,
        campaignId:
          post.campaignId ||
          resolveCampaignForChannel(campaigns, channel) ||
          defaultCampaignId,
        assetType: 'social_post',
        channel,
        title: post.hook || post.topic || post.title,
        body: post.text || post.body || post.caption,
        sourceAgentRunId: agentRunId,
        metadata: { format: post.format || null, cta: post.cta || null },
      })
    );
  }

  for (const article of asArray(asObject(data.seoBrief).articles)) {
    assets.push(
      buildAssetBase({
        id: article.id || `seo-${assets.length + 1}`,
        tenantId,
        campaignId: article.campaignId || defaultCampaignId,
        assetType: 'seo_article',
        channel: 'seo',
        title: article.title || article.keyword,
        body: article.outline || article.summary || article.body,
        sourceAgentRunId: agentRunId,
        metadata: { keyword: article.keyword || null },
      })
    );
  }

  for (const ad of asArray(asObject(data.adCopyPack).ads)) {
    const channel = ad.channel || ad.platform;
    assets.push(
      buildAssetBase({
        id: ad.id || `ad-${assets.length + 1}`,
        tenantId,
        campaignId:
          ad.campaignId || resolveCampaignForChannel(campaigns, channel) || defaultCampaignId,
        assetType: 'ad_copy',
        channel,
        title: ad.headline || ad.title,
        body: ad.body || ad.description,
        sourceAgentRunId: agentRunId,
        metadata: { cta: ad.cta || null },
      })
    );
  }

  for (const email of asArray(asObject(data.emailDrafts).emails)) {
    assets.push(
      buildAssetBase({
        id: email.id || `email-${assets.length + 1}`,
        tenantId,
        campaignId: email.campaignId || defaultCampaignId,
        assetType: 'email_draft',
        channel: 'email',
        title: email.subject || email.title,
        body: email.body || email.preview,
        sourceAgentRunId: agentRunId,
        metadata: { preheader: email.preheader || null },
      })
    );
  }

  for (const variant of asArray(asObject(data.repurposedContent).variants)) {
    assets.push(
      buildAssetBase({
        id: variant.id || `repurpose-${assets.length + 1}`,
        tenantId,
        campaignId: variant.campaignId || defaultCampaignId,
        assetType: 'repurpose_variant',
        channel: variant.format || variant.channel,
        title: variant.title || variant.sourceTopic,
        body: variant.body || variant.summary,
        sourceAgentRunId: agentRunId,
        metadata: { sourceTopic: variant.sourceTopic || null, format: variant.format || null },
      })
    );
  }

  return assets.filter((asset) => asset.id);
}

function groupAssetIdsByCampaign(assets = []) {
  const grouped = {};
  for (const asset of asArray(assets)) {
    const campaignId = normalizeText(asset.campaignId);
    if (!campaignId) continue;
    if (!grouped[campaignId]) grouped[campaignId] = [];
    grouped[campaignId].push(asset.id);
  }
  return grouped;
}

module.exports = {
  extractContentAssetsFromCmoOutput,
  groupAssetIdsByCampaign,
  resolveCampaignForChannel,
  buildAssetBase,
};
