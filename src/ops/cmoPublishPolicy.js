'use strict';

const PUBLISH_MODES = Object.freeze({
  PROPOSAL_ONLY: 'proposal_only',
  OWNER_APPROVED_QUEUE: 'owner_approved_queue',
  PILOT_AUTO_QUEUE: 'pilot_auto_queue',
});

const CHANNEL_RISK_LEVEL = Object.freeze({
  seo: 2,
  blog: 2,
  web: 2,
  linkedin: 3,
  instagram: 3,
  facebook: 3,
  x: 3,
  twitter: 3,
  tiktok: 3,
  social: 3,
  email: 4,
  mail: 4,
  google_ads: 4,
  meta: 4,
  ads: 4,
});

const DEFAULT_PILOT_CHANNELS = Object.freeze(['linkedin']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function normalizeChannel(channel = '') {
  const normalized = normalizeText(channel).toLowerCase();
  if (normalized === 'twitter') return 'x';
  if (normalized === 'mail') return 'email';
  return normalized || 'unknown';
}

function resolveChannelRiskLevel(channel = '') {
  return CHANNEL_RISK_LEVEL[normalizeChannel(channel)] || 4;
}

function resolvePublishPolicyConfig(appConfig = {}, tenantConfig = {}) {
  const tenantMarketing = asObject(tenantConfig.marketing);
  const tenantPublish = asObject(tenantMarketing.publishPolicy || tenantMarketing.publish);
  const appPublish = asObject(appConfig.marketingPublishPolicy);

  const pilotEnabled =
    tenantPublish.pilotEnabled === true ||
    tenantMarketing.publishPilotEnabled === true ||
    appConfig.marketingPublishPilotEnabled === true ||
    appPublish.pilotEnabled === true;

  const pilotChannels = asStringArray(
    tenantPublish.pilotChannels ||
      tenantMarketing.autoPublishPilotChannels ||
      appConfig.marketingAutoPublishPilotChannels ||
      appPublish.pilotChannels
  );

  const maxRiskLevelRaw = Number(
    tenantPublish.pilotMaxRiskLevel ??
      tenantMarketing.publishPilotMaxRiskLevel ??
      appConfig.marketingPublishPilotMaxRiskLevel ??
      appPublish.pilotMaxRiskLevel ??
      3
  );

  return {
    pilotEnabled,
    pilotChannels: pilotChannels.length ? pilotChannels : [...DEFAULT_PILOT_CHANNELS],
    maxRiskLevel: Number.isFinite(maxRiskLevelRaw) ? Math.max(1, Math.min(5, maxRiskLevelRaw)) : 3,
    allowL5AutoPublish: false,
  };
}

function buildPublishGateContext({
  scheduleAllowed = false,
  compliancePassed = false,
  campaignApproved = false,
  pauseAllExternal = false,
  orchestrationBlocked = false,
} = {}) {
  return {
    scheduleAllowed: scheduleAllowed === true,
    compliancePassed: compliancePassed === true,
    campaignApproved: campaignApproved === true,
    pauseAllExternal: pauseAllExternal === true,
    orchestrationBlocked: orchestrationBlocked === true,
  };
}

function evaluateChannelPublishEligibility({
  channel = '',
  policyConfig = {},
  gateContext = {},
  campaignStatus = '',
} = {}) {
  const normalizedChannel = normalizeChannel(channel);
  const riskLevel = resolveChannelRiskLevel(normalizedChannel);
  const pilotEnabled = policyConfig.pilotEnabled === true;
  const pilotChannels = asStringArray(policyConfig.pilotChannels);
  const maxRiskLevel = Number(policyConfig.maxRiskLevel) || 3;
  const approved =
    gateContext.campaignApproved ||
    normalizeText(campaignStatus).toLowerCase() === 'approved';

  let publishMode = PUBLISH_MODES.PROPOSAL_ONLY;
  let pilotAutoPublishEligible = false;
  let autoPublishBlockedReason = null;

  if (gateContext.pauseAllExternal || gateContext.orchestrationBlocked) {
    autoPublishBlockedReason = gateContext.pauseAllExternal
      ? 'Extern publicering pausad pga incidenter.'
      : 'Orkestrerings-gate blockerar publicering.';
  } else if (!gateContext.compliancePassed) {
    autoPublishBlockedReason = 'Compliance-gate har inte passerats.';
  } else if (!gateContext.scheduleAllowed) {
    autoPublishBlockedReason = 'Schema tillåts inte (compliance/tracking/gates).';
  } else if (approved && gateContext.scheduleAllowed && gateContext.compliancePassed) {
    publishMode = PUBLISH_MODES.OWNER_APPROVED_QUEUE;
  }

  if (
    publishMode === PUBLISH_MODES.OWNER_APPROVED_QUEUE &&
    pilotEnabled &&
    pilotChannels.includes(normalizedChannel) &&
    riskLevel <= maxRiskLevel &&
    riskLevel < 5 &&
    approved
  ) {
    publishMode = PUBLISH_MODES.PILOT_AUTO_QUEUE;
    pilotAutoPublishEligible = true;
    autoPublishBlockedReason = null;
  } else if (publishMode === PUBLISH_MODES.OWNER_APPROVED_QUEUE && pilotEnabled) {
    if (!pilotChannels.includes(normalizedChannel)) {
      autoPublishBlockedReason = `Kanal ${normalizedChannel} saknas i pilot allowlist.`;
    } else if (riskLevel > maxRiskLevel) {
      autoPublishBlockedReason = `Kanalrisk L${riskLevel} över pilot-tak L${maxRiskLevel}.`;
    } else if (!approved) {
      autoPublishBlockedReason = 'Kampanj saknar OWNER-godkännande.';
    }
  }

  if (riskLevel >= 5) {
    pilotAutoPublishEligible = false;
    publishMode = PUBLISH_MODES.PROPOSAL_ONLY;
    autoPublishBlockedReason = 'L5 autonom publicering är blockerad (ADR 0002).';
  }

  return {
    channel: normalizedChannel,
    riskLevel,
    publishMode,
    pilotAutoPublishEligible,
    autoPublishBlockedReason,
    requiresOwnerApproval: true,
    autoPublish: false,
  };
}

function enrichScheduleItemsWithPublishPolicy({
  scheduleItems = [],
  policyConfig = {},
  gateContext = {},
  approvedCampaignIds = [],
} = {}) {
  const approvedSet = new Set(asArray(approvedCampaignIds).map((id) => normalizeText(id)));
  return asArray(scheduleItems).map((rawItem) => {
    const item = asObject(rawItem);
    const campaignId = normalizeText(item.campaignId || item.id);
    const evaluation = evaluateChannelPublishEligibility({
      channel: item.platform || item.channel,
      policyConfig,
      gateContext: {
        ...gateContext,
        campaignApproved: approvedSet.has(campaignId) || gateContext.campaignApproved,
      },
      campaignStatus: approvedSet.has(campaignId) ? 'approved' : '',
    });
    return {
      ...item,
      publishPolicy: evaluation,
      pilotAutoPublishEligible: evaluation.pilotAutoPublishEligible,
      publishMode: evaluation.publishMode,
      requiresOwnerApproval: true,
      autoPublish: false,
    };
  });
}

function summarizeChannelPublishPolicy({
  scheduleItems = [],
  policyConfig = {},
  gateContext = {},
  approvedCampaignIds = [],
} = {}) {
  const enriched = enrichScheduleItemsWithPublishPolicy({
    scheduleItems,
    policyConfig,
    gateContext,
    approvedCampaignIds,
  });
  const pilotAutoPublishEligibleCount = enriched.filter((item) => item.pilotAutoPublishEligible).length;
  const channels = enriched.map((item) => item.publishPolicy);

  return {
    publishPilotEnabled: policyConfig.pilotEnabled === true,
    pilotChannels: asArray(policyConfig.pilotChannels),
    pilotMaxRiskLevel: policyConfig.maxRiskLevel,
    channelPublishEvaluations: channels,
    scheduleItems: enriched,
    pilotAutoPublishEligibleCount,
    autoPublish: false,
    requiresOwnerApproval: true,
  };
}

async function executePilotChannelPublish({
  campaign = {},
  channel = '',
  tenantId = '',
  actorUserId = 'scheduler',
  authStore = null,
  correlationId = '',
} = {}) {
  const normalizedChannel = normalizeChannel(channel || campaign.channel);
  const campaignId = normalizeText(campaign.id);
  const result = {
    status: 'publish_queued',
    channel: normalizedChannel,
    campaignId,
    tenantId: normalizeText(tenantId) || 'default',
    mode: 'pilot_queue_stub',
    externalPublishInvoked: false,
    message:
      'Pilot publish köad — extern connector anropas inte (ADR 0002). OWNER audit + manuell verifiering krävs.',
    queuedAt: new Date().toISOString(),
  };

  if (authStore && typeof authStore.addAuditEvent === 'function') {
    await authStore.addAuditEvent({
      tenantId: result.tenantId,
      actorUserId: normalizeText(actorUserId) || 'scheduler',
      action: 'cmo.pilot_publish.queue',
      outcome: 'success',
      targetType: 'marketing_campaign_draft',
      targetId: campaignId || 'unknown',
      metadata: {
        channel: normalizedChannel,
        correlationId: normalizeText(correlationId) || null,
        externalPublishInvoked: false,
      },
    });
  }

  return result;
}

function listDuePilotPublishCandidates({
  campaigns = [],
  policyConfig = {},
  gateContext = {},
  now = new Date(),
  graceMinutes = 15,
} = {}) {
  const due = [];
  const graceMs = Math.max(0, Number(graceMinutes) || 0) * 60 * 1000;
  const nowMs = now.getTime();

  for (const rawCampaign of asArray(campaigns)) {
    const campaign = asObject(rawCampaign);
    if (normalizeText(campaign.status).toLowerCase() !== 'approved') continue;

    const schedule = asObject(asObject(campaign.payload).publishSchedule);
    const proposedAt = Date.parse(normalizeText(schedule.proposedAt));
    if (!Number.isFinite(proposedAt) || proposedAt > nowMs + graceMs) continue;
    if (normalizeText(schedule.publishStatus).toLowerCase() === 'publish_queued') continue;
    if (normalizeText(schedule.publishStatus).toLowerCase() === 'published') continue;

    const channel = schedule.platform || campaign.channel;
    const evaluation = evaluateChannelPublishEligibility({
      channel,
      policyConfig,
      gateContext: {
        ...gateContext,
        campaignApproved: true,
      },
      campaignStatus: 'approved',
    });

    if (!evaluation.pilotAutoPublishEligible) continue;

    due.push({
      campaign,
      channel: evaluation.channel,
      evaluation,
      proposedAt: schedule.proposedAt,
    });
  }

  return due;
}

module.exports = {
  PUBLISH_MODES,
  CHANNEL_RISK_LEVEL,
  resolvePublishPolicyConfig,
  resolveChannelRiskLevel,
  evaluateChannelPublishEligibility,
  enrichScheduleItemsWithPublishPolicy,
  summarizeChannelPublishPolicy,
  buildPublishGateContext,
  executePilotChannelPublish,
  listDuePilotPublishCandidates,
};
