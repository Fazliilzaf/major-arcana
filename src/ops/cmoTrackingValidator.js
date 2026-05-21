'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
const CTA_PATTERN =
  /\b(läs mer|boka|kontakta|demo|registrera|sign up|cta|call to action|upptäck|kom igång)\b/i;

const REQUIRED_UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

function extractUrls(text = '') {
  return normalizeText(text).match(URL_PATTERN) || [];
}

function parseUrl(rawUrl = '') {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function hasRequiredUtm(urlObj) {
  if (!urlObj) return false;
  return REQUIRED_UTM_KEYS.every((key) => normalizeText(urlObj.searchParams.get(key)));
}

function hasCta(text = '') {
  return CTA_PATTERN.test(normalizeText(text));
}

function collectMarketingTexts(snapshot = {}) {
  const items = [];
  const push = (id, channel, text) => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    items.push({ id, channel, text: normalized });
  };

  for (const post of asArray(asObject(snapshot.socialPostPack).posts)) {
    push(
      normalizeText(post.id) || 'social',
      normalizeText(post.platform) || 'social',
      [post.caption, post.hook, post.firstComment].filter(Boolean).join('\n')
    );
  }
  for (const ad of asArray(asObject(snapshot.adCopyPack).ads)) {
    push(
      normalizeText(ad.id) || 'ad',
      normalizeText(ad.channel) || 'ads',
      [...asArray(ad.headlines), ad.description, ad.cta].filter(Boolean).join('\n')
    );
  }
  for (const email of asArray(asObject(snapshot.emailDrafts).emails)) {
    push(
      normalizeText(email.id) || 'email',
      'email',
      [email.subject, email.preview, email.bodyOutline].filter(Boolean).join('\n')
    );
  }
  for (const campaign of asArray(snapshot.campaigns)) {
    push(
      normalizeText(campaign.id) || 'campaign',
      normalizeText(campaign.channel) || 'campaign',
      [campaign.subject, campaign.bodyOutline].filter(Boolean).join('\n')
    );
  }

  return items;
}

function validateMarketingTracking({
  snapshot = {},
  utmPack = null,
  requireUtmOnAllLinks = false,
} = {}) {
  const issues = [];
  const texts = collectMarketingTexts(snapshot);
  const utmLinks = asArray(asObject(utmPack).links);

  for (const item of texts) {
    const urls = extractUrls(item.text);
    if (!urls.length && !hasCta(item.text)) {
      issues.push({
        id: `missing_cta_${item.id}`,
        severity: 'medium',
        label: `Saknar tydlig CTA (${item.channel})`,
        source: item.id,
        channel: item.channel,
      });
    }

    for (const rawUrl of urls) {
      const parsed = parseUrl(rawUrl);
      if (!parsed) {
        issues.push({
          id: `broken_link_${item.id}`,
          severity: 'high',
          label: `Ogiltig länk: ${rawUrl.slice(0, 80)}`,
          source: item.id,
          channel: item.channel,
        });
        continue;
      }
      if (!hasRequiredUtm(parsed)) {
        issues.push({
          id: `missing_utm_${item.id}`,
          severity: requireUtmOnAllLinks ? 'high' : 'medium',
          label: `Saknar UTM-parametrar på länk (${item.channel})`,
          source: item.id,
          channel: item.channel,
          url: rawUrl,
        });
      }
    }
  }

  if (!utmLinks.length && texts.length > 0) {
    issues.push({
      id: 'missing_utm_pack',
      severity: 'medium',
      label: 'Inget UTM-pack genererat för kampanjer.',
      source: 'utm_pack',
      channel: 'tracking',
    });
  }

  const highCount = issues.filter((item) => item.severity === 'high').length;
  const passed = highCount === 0;

  return {
    outputType: 'MarketingTrackingValidation',
    passed,
    status: passed ? 'passed' : highCount > 0 ? 'blocked' : 'needs_owner',
    issueCount: issues.length,
    highSeverityCount: highCount,
    issues: issues.slice(0, 40),
    summary:
      issues.length === 0
        ? 'Tracking-validering OK — CTA och länkar ser rimliga ut.'
        : `${issues.length} tracking-problem hittades (${highCount} höga).`,
    validatedAt: new Date().toISOString(),
  };
}

module.exports = {
  validateMarketingTracking,
  collectMarketingTexts,
  extractUrls,
  hasRequiredUtm,
  hasCta,
};
