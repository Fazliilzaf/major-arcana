'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asObject,
  pickTopics,
  brandLabel,
  toneHint,
  targetAudienceLabel,
  capabilityMeta,
  SOCIAL_PLATFORMS,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');

function adaptCaption({ platform, topic, brand, tone, audience }) {
  const base = `${topic} — ${brand} hjälper ${audience} att arbeta tryggare och mer strukturerat.`;
  const cta = 'Läs mer på webben (kräver godkännande före publicering).';
  const hashtags = ['#Arcana', '#Vårdadministration', '#DigitalHälsa'].join(' ');
  let caption = `${base}\n\n${tone}\n\n${cta}\n\n${hashtags}`;
  const max = platform.maxLength || 2000;
  if (caption.length > max) {
    caption = `${caption.slice(0, max - 3)}...`;
  }
  return {
    caption,
    hashtags: hashtags.split(' ').filter(Boolean),
    firstComment: 'Vill du veta mer? Boka demo eller följ oss för fler insikter.',
    hook: topic.length > 60 ? `${topic.slice(0, 57)}...` : topic,
    requiresOwnerApproval: true,
  };
}

class GenerateSocialPostPackCapability extends BaseCapability {
  static name = 'GenerateSocialPostPack';
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
      maxPosts: { type: 'integer', minimum: 1, maximum: 20 },
      platforms: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', maxLength: 20 },
      },
      tone: { type: 'string', maxLength: 30 },
      targetAudience: { type: 'string', maxLength: 100 },
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
    const maxPosts = Math.max(1, Math.min(20, toNumber(input.maxPosts, 10)));
    const requestedPlatforms = input.platforms;
    let platforms = SOCIAL_PLATFORMS;
    if (Array.isArray(requestedPlatforms) && requestedPlatforms.length) {
      const wanted = new Set(requestedPlatforms.map((p) => normalizeText(p).toLowerCase()).filter(Boolean));
      platforms = SOCIAL_PLATFORMS.filter((p) => wanted.has(p.id));
      if (!platforms.length) {
        platforms = SOCIAL_PLATFORMS;
        warnings.push('Okända plattformar — använder standarduppsättning.');
      }
    }

    const topics = pickTopics(snapshot, 5);
    const brand = brandLabel(snapshot);
    const tone = toneHint(snapshot, input);
    const audience = targetAudienceLabel(snapshot, input);
    const posts = [];

    for (const platform of platforms) {
      for (const topicItem of topics) {
        if (posts.length >= maxPosts) break;
        posts.push({
          id: `${platform.id}-${posts.length + 1}`,
          platform: platform.id,
          platformLabel: platform.label,
          topic: topicItem.topic,
          format: topicItem.format === 'guide' ? 'carousel' : 'single_post',
          ...adaptCaption({
            platform,
            topic: topicItem.topic,
            brand,
            tone,
            audience,
          }),
          mediaIdeas: [
            `Infografik: ${topicItem.topic}`,
            'Produktscreenshot med tydlig rubrik',
            'Kort video-hook (15–30s) med text overlay',
          ],
          status: 'draft',
        });
      }
    }

    return {
      data: {
        posts: posts.slice(0, maxPosts),
        summary: `${posts.length} sociala utkast för ${platforms.map((p) => p.label).join(', ')}.`,
        disclaimer: CMO_DRAFT_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      metadata: capabilityMeta(GenerateSocialPostPackCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  GenerateSocialPostPackCapability,
};
