'use strict';

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const {
  normalizeText,
  toNumber,
  asObject,
  asArray,
  capabilityMeta,
  CMO_DRAFT_DISCLAIMER,
} = require('./cmoCapabilityHelpers');
const {
  resolvePublishPolicyConfig,
  buildPublishGateContext,
  summarizeChannelPublishPolicy,
} = require('../ops/cmoPublishPolicy');

const PLATFORM_WINDOWS = Object.freeze({
  linkedin: { days: [2, 3, 4], hourUtc: 8, label: 'LinkedIn — tis–tor morgon' },
  instagram: { days: [3, 4, 5], hourUtc: 12, label: 'Instagram — ons–fre lunch' },
  facebook: { days: [2, 4], hourUtc: 10, label: 'Facebook — tis/tors förmiddag' },
  x: { days: [1, 3, 5], hourUtc: 15, label: 'X — mån/ons/fre eftermiddag' },
  tiktok: { days: [4, 6], hourUtc: 17, label: 'TikTok — tor/lör kväll' },
  email: { days: [2], hourUtc: 9, label: 'E-post — tisdag morgon' },
  seo: { days: [1], hourUtc: 7, label: 'SEO/publicering — måndag tidig' },
});

function nextSlotForPlatform(platform, fromDate = new Date()) {
  const config = PLATFORM_WINDOWS[normalizeText(platform).toLowerCase()] || PLATFORM_WINDOWS.linkedin;
  const cursor = new Date(fromDate.getTime());
  for (let offset = 1; offset <= 21; offset += 1) {
    cursor.setUTCDate(fromDate.getUTCDate() + offset);
    const day = cursor.getUTCDay();
    if (config.days.includes(day)) {
      cursor.setUTCHours(config.hourUtc, 0, 0, 0);
      return {
        proposedAt: cursor.toISOString(),
        windowLabel: config.label,
      };
    }
  }
  const fallback = new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  fallback.setUTCHours(config.hourUtc, 0, 0, 0);
  return {
    proposedAt: fallback.toISOString(),
    windowLabel: config.label,
  };
}

class ProposePublishScheduleCapability extends BaseCapability {
  static name = 'ProposePublishSchedule';
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
      maxItems: { type: 'integer', minimum: 1, maximum: 30 },
      timezone: { type: 'string', maxLength: 40 },
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
    const maxItems = Math.max(1, Math.min(30, toNumber(input.maxItems, 12)));
    const timezone = normalizeText(input.timezone) || 'Europe/Stockholm';

    const weeklyPlan = asArray(asObject(snapshot.proposedContentCalendar).weeklyPlan);
    const legacyCalendar = asArray(snapshot.contentCalendar);
    const socialPosts = asArray(asObject(snapshot.socialPostPack).posts);
    const scheduleItems = [];
    const now = new Date();

    if (weeklyPlan.length) {
      for (const slot of weeklyPlan.slice(0, maxItems)) {
        const platform = normalizeText(slot.channel).toLowerCase() || 'linkedin';
        const slotTime = nextSlotForPlatform(platform, now);
        scheduleItems.push({
          id: `cal-${normalizeText(slot.week) || scheduleItems.length + 1}`,
          sourceType: 'content_calendar',
          platform,
          topic: normalizeText(slot.topic) || 'Content',
          proposedAt: slotTime.proposedAt,
          timezone,
          windowLabel: slotTime.windowLabel,
          status: 'proposed',
          requiresOwnerApproval: true,
        });
      }
    } else if (legacyCalendar.length) {
      for (const slot of legacyCalendar.slice(0, maxItems)) {
        const platform = 'email';
        const slotTime = nextSlotForPlatform(platform, now);
        scheduleItems.push({
          id: `legacy-${normalizeText(slot.week) || scheduleItems.length + 1}`,
          sourceType: 'legacy_calendar',
          platform,
          topic: normalizeText(slot.topic) || 'Content',
          proposedAt: slotTime.proposedAt,
          timezone,
          windowLabel: slotTime.windowLabel,
          status: 'proposed',
          requiresOwnerApproval: true,
        });
      }
    }

    for (const post of socialPosts.slice(0, Math.max(0, maxItems - scheduleItems.length))) {
      const platform = normalizeText(post.platform).toLowerCase() || 'linkedin';
      const slotTime = nextSlotForPlatform(platform, now);
      scheduleItems.push({
        id: normalizeText(post.id) || `social-${scheduleItems.length + 1}`,
        sourceType: 'social_post',
        platform,
        topic: normalizeText(post.topic) || normalizeText(post.hook) || 'Social post',
        proposedAt: slotTime.proposedAt,
        timezone,
        windowLabel: slotTime.windowLabel,
        status: 'proposed',
        requiresOwnerApproval: true,
      });
    }

    if (!scheduleItems.length) {
      warnings.push('Ingen kalender eller social data — genererar ett standardförslag.');
      const slotTime = nextSlotForPlatform('linkedin', now);
      scheduleItems.push({
        id: 'default-1',
        sourceType: 'default',
        platform: 'linkedin',
        topic: 'Veckans Arcana-insikt',
        proposedAt: slotTime.proposedAt,
        timezone,
        windowLabel: slotTime.windowLabel,
        status: 'proposed',
        requiresOwnerApproval: true,
      });
    }

    const missedPublications = [...weeklyPlan, ...legacyCalendar]
      .map((slot) => {
        const targetDate = normalizeText(slot.targetDate);
        const ts = Date.parse(targetDate);
        if (!Number.isFinite(ts) || ts >= now.getTime()) return null;
        if (normalizeText(slot.status).toLowerCase() === 'published') return null;
        return {
          topic: normalizeText(slot.topic) || 'Content',
          targetDate,
          status: 'missed',
        };
      })
      .filter(Boolean);

    const policyConfig = resolvePublishPolicyConfig(
      asObject(snapshot.appConfig),
      asObject(snapshot.tenantConfig)
    );
    const publishGateContext = buildPublishGateContext({
      scheduleAllowed:
        asObject(snapshot.complianceReview).passed === true ||
        asObject(snapshot.validateMarketingClaims).passed === true,
      compliancePassed:
        asObject(snapshot.complianceReview).passed === true ||
        asObject(snapshot.reviewMarketingCompliance).status === 'passed',
      campaignApproved: false,
      pauseAllExternal: asObject(snapshot.incidentSummary).p0Open > 0,
      orchestrationBlocked: false,
    });
    const publishSummary = summarizeChannelPublishPolicy({
      scheduleItems,
      policyConfig,
      gateContext: publishGateContext,
    });

    const summary =
      `${publishSummary.scheduleItems.length} publiceringsförslag (heuristik v1). ` +
      `${missedPublications.length} missade planerade datum. ` +
      CMO_DRAFT_DISCLAIMER;

    return {
      data: {
        scheduleItems: publishSummary.scheduleItems.slice(0, maxItems),
        missedPublications,
        timezone,
        summary,
        generatedAt: new Date().toISOString(),
        mode: 'proposal_only',
        autoPublish: false,
        publishPilotEnabled: publishSummary.publishPilotEnabled,
        pilotAutoPublishEligibleCount: publishSummary.pilotAutoPublishEligibleCount,
        channelPublishEvaluations: publishSummary.channelPublishEvaluations,
      },
      metadata: capabilityMeta(ProposePublishScheduleCapability, safeContext),
      warnings,
    };
  }
}

module.exports = {
  ProposePublishScheduleCapability,
};
