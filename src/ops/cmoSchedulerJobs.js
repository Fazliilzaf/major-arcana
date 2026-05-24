'use strict';

const { notifyOwnerIfNeeded } = require('./caoSchedulerJobs');

const CMO_SCHEDULER_JOB_IDS = Object.freeze([
  'cmo_weekly_content_plan',
  'cmo_pilot_publish_due',
  'cmo_connector_health_check',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function appendSchedulerAnalysis({
  capabilityAnalysisStore,
  tenantId,
  capabilityName,
  outputData,
  metadata = {},
}) {
  if (!capabilityAnalysisStore || typeof capabilityAnalysisStore.append !== 'function') {
    return null;
  }
  return capabilityAnalysisStore.append({
    tenantId,
    capability: { name: capabilityName, version: '1.0.0', persistStrategy: 'analysis' },
    decision: 'allow',
    runId: metadata.runId || null,
    capabilityRunId: metadata.capabilityRunId || null,
    correlationId: metadata.correlationId || null,
    actor: { id: 'scheduler', role: 'OWNER' },
    input: metadata.input || {},
    output: outputData,
    riskSummary: {},
    policySummary: { blocked: false, reasonCodes: [] },
    metadata: { ...metadata, source: 'scheduler.cmo' },
  });
}

async function runCapabilityStep({
  capabilityExecutor,
  tenantId,
  actorUserId,
  capabilityName,
  input,
  systemStateSnapshot,
  trigger,
  step,
}) {
  return capabilityExecutor.runCapability({
    tenantId,
    actor: { id: actorUserId || 'scheduler', role: 'OWNER' },
    channel: 'admin',
    capabilityName,
    input,
    systemStateSnapshot,
    correlationId: `scheduler-cmo-${step}-${Date.now()}`,
    idempotencyKey: null,
    requestMetadata: { source: 'scheduler.cmo_weekly_content_plan', trigger, step },
  });
}

async function runCmoWeeklyContentPlan({
  tenantId,
  trigger = 'scheduled',
  actorUserId = null,
  capabilityExecutor = null,
  capabilityAnalysisStore = null,
  sendAlertNotification = null,
  executiveDecisionFeed = null,
  minNotifyRiskLevel = 'L3',
  templateStore = null,
  tenantConfigStore = null,
  marketingClaimsWhitelistStore = null,
  marketingCampaignDraftsStore = null,
  config = null,
} = {}) {
  if (!capabilityExecutor || typeof capabilityExecutor.runCapability !== 'function') {
    throw new Error('capabilityExecutor.runCapability saknas för cmo_weekly_content_plan.');
  }

  const { hydrateCmoSystemSnapshot } = require('../routes/capabilities');
  let systemStateSnapshot = await hydrateCmoSystemSnapshot({
    tenantId,
    templateStore,
    tenantConfigStore,
    marketingClaimsWhitelistStore,
    config,
    systemStateSnapshot: {},
  });

  const calendarRun = await runCapabilityStep({
    capabilityExecutor,
    tenantId,
    actorUserId,
    capabilityName: 'ProposeContentCalendar',
    input: { horizonWeeks: 4, includeMonthView: true },
    systemStateSnapshot,
    trigger,
    step: 'calendar',
  });

  const calendarData = asObject(calendarRun?.output?.data || calendarRun?.output);
  systemStateSnapshot = {
    ...systemStateSnapshot,
    proposedContentCalendar: calendarData,
    contentCalendar: asArray(calendarData.weeklyPlan),
  };

  const scheduleRun = await runCapabilityStep({
    capabilityExecutor,
    tenantId,
    actorUserId,
    capabilityName: 'ProposePublishSchedule',
    input: { maxItems: 12 },
    systemStateSnapshot,
    trigger,
    step: 'schedule',
  });

  const scheduleData = asObject(scheduleRun?.output?.data || scheduleRun?.output);
  const utmRun = await runCapabilityStep({
    capabilityExecutor,
    tenantId,
    actorUserId,
    capabilityName: 'GenerateUtmPack',
    input: { maxLinks: 10 },
    systemStateSnapshot,
    trigger,
    step: 'utm',
  });

  const utmData = asObject(utmRun?.output?.data || utmRun?.output);
  const trackingRun = await runCapabilityStep({
    capabilityExecutor,
    tenantId,
    actorUserId,
    capabilityName: 'ValidateMarketingTracking',
    input: {},
    systemStateSnapshot: {
      ...systemStateSnapshot,
      utmPack: utmData,
    },
    trigger,
    step: 'tracking',
  });

  const trackingData = asObject(trackingRun?.output?.data || trackingRun?.output);
  const missedPublications = asArray(scheduleData.missedPublications);
  const scheduleItems = asArray(scheduleData.scheduleItems);
  const pendingReviewCount = scheduleItems.filter((item) => item.status === 'proposed').length;

  if (
    marketingCampaignDraftsStore &&
    typeof marketingCampaignDraftsStore.applyScheduleProposals === 'function'
  ) {
    await marketingCampaignDraftsStore.applyScheduleProposals({
      tenantId,
      scheduleItems,
      sourceAgentRunId: `scheduler-cmo-${Date.now()}`,
    });
  }

  const outputData = {
    summary:
      normalizeText(calendarData.summary) ||
      `${asArray(calendarData.weeklyPlan).length} veckor planerade, ${scheduleItems.length} publiceringsförslag.`,
    weeklySlots: asArray(calendarData.weeklyPlan).length,
    scheduleItems: scheduleItems.length,
    missedPublications: missedPublications.length,
    trackingStatus: normalizeText(trackingData.status) || 'unknown',
    generatedAt: new Date().toISOString(),
    trigger,
  };

  await appendSchedulerAnalysis({
    capabilityAnalysisStore,
    tenantId,
    capabilityName: 'CMO.WeeklyContentPlan',
    outputData,
    metadata: { trigger },
  });

  let weeklyNotification = { skipped: true };
  if (pendingReviewCount > 0) {
    weeklyNotification = await notifyOwnerIfNeeded({
      sendAlertNotification,
      executiveDecisionFeed,
      tenantId,
      actorUserId,
      eventType: 'cmo.weekly_content_plan',
      severity: 'info',
      riskLevel: 'L2',
      minRiskLevel: minNotifyRiskLevel,
      payload: outputData,
    });
  }

  let missedNotification = { skipped: true };
  if (missedPublications.length > 0) {
    missedNotification = await notifyOwnerIfNeeded({
      sendAlertNotification,
      executiveDecisionFeed,
      tenantId,
      actorUserId,
      eventType: 'cmo.missed_publication',
      severity: 'warn',
      riskLevel: 'L3',
      minRiskLevel: minNotifyRiskLevel,
      payload: {
        ...outputData,
        summary: `${missedPublications.length} planerade publiceringar har passerat datum utan status published.`,
      },
    });
  }

  if (
    executiveDecisionFeed &&
    typeof executiveDecisionFeed.addFromAgentOutput === 'function' &&
    pendingReviewCount >= 5
  ) {
    executiveDecisionFeed.addFromAgentOutput({
      agent: 'CMO',
      tenantId,
      output: {
        data: {
          executiveSummary: outputData.summary,
          disclaimer: 'Veckoplan — kräver OWNER-godkännande före publicering.',
          campaigns: [],
          productionCounts: { socialPosts: pendingReviewCount },
        },
      },
    });
  }

  return {
    tenantId,
    trigger,
    ...outputData,
    notifications: {
      weekly: weeklyNotification,
      missed: missedNotification,
    },
  };
}

async function runCmoPilotPublishDue({
  tenantId,
  trigger = 'scheduled',
  actorUserId = null,
  marketingCampaignDraftsStore = null,
  authStore = null,
  executiveDecisionFeed = null,
  config = null,
  tenantConfigStore = null,
  now = new Date(),
} = {}) {
  if (
    !marketingCampaignDraftsStore ||
    typeof marketingCampaignDraftsStore.listCampaigns !== 'function'
  ) {
    throw new Error('marketingCampaignDraftsStore.listCampaigns saknas för cmo_pilot_publish_due.');
  }

  const {
    resolvePublishPolicyConfig,
    buildPublishGateContext,
    listDuePilotPublishCandidates,
    executePilotChannelPublish,
  } = require('./cmoPublishPolicy');

  const tenantConfig =
    tenantConfigStore && typeof tenantConfigStore.getTenantConfig === 'function'
      ? await tenantConfigStore.getTenantConfig(tenantId)
      : {};
  const policyConfig = resolvePublishPolicyConfig(config || {}, tenantConfig || {});
  if (!policyConfig.pilotEnabled) {
    return {
      tenantId,
      trigger,
      skipped: true,
      reason: 'Publish pilot disabled.',
      queuedCount: 0,
    };
  }

  const campaigns = await marketingCampaignDraftsStore.listCampaigns({
    tenantId,
    status: 'approved',
    limit: 500,
  });
  const gateContext = buildPublishGateContext({
    scheduleAllowed: true,
    compliancePassed: true,
    campaignApproved: true,
    pauseAllExternal: false,
    orchestrationBlocked: false,
  });
  const dueItems = listDuePilotPublishCandidates({
    campaigns,
    policyConfig,
    gateContext,
    now,
  });

  const queued = [];
  for (const entry of dueItems) {
    const campaign = asObject(entry.campaign);
    const publishResult = await executePilotChannelPublish({
      campaign,
      channel: entry.channel,
      tenantId,
      actorUserId: actorUserId || 'scheduler',
      authStore,
      correlationId: `scheduler-cmo-pilot-${Date.now()}`,
      config,
      tenantConfig,
    });
    if (typeof marketingCampaignDraftsStore.markPublishQueued === 'function') {
      await marketingCampaignDraftsStore.markPublishQueued({
        tenantId,
        id: campaign.id,
        publishResult,
        changedBy: actorUserId || 'scheduler',
      });
    }
    queued.push({
      campaignId: campaign.id,
      channel: entry.channel,
      publishResult,
    });
  }

  if (
    queued.length > 0 &&
    executiveDecisionFeed &&
    typeof executiveDecisionFeed.addFromSchedulerNotification === 'function'
  ) {
    executiveDecisionFeed.addFromSchedulerNotification({
      tenantId,
      eventType: 'cmo.pilot_publish_queue',
      severity: 'info',
      riskLevel: 'L3',
      payload: {
        summary: `${queued.length} godkända kampanjer bearbetade för pilot-publicering.`,
        queuedCount: queued.length,
        publishedCount: queued.filter((item) => item.publishResult.status === 'published').length,
        failedCount: queued.filter((item) => item.publishResult.status === 'publish_failed').length,
        channels: queued.map((item) => item.channel),
      },
    });
  }

  return {
    tenantId,
    trigger,
    skipped: false,
    queuedCount: queued.length,
    queued,
    generatedAt: new Date().toISOString(),
  };
}

async function runCmoConnectorHealthCheck({
  tenantId,
  trigger = 'scheduled',
  config = null,
  tenantConfigStore = null,
  executiveDecisionFeed = null,
  sendAlertNotification = null,
  connectorHealthStateStore = null,
  minNotifyRiskLevel = 'L3',
} = {}) {
  const { listConnectorStatuses } = require('./cmoMarketingConnectors');
  const tenantConfig =
    tenantConfigStore && typeof tenantConfigStore.getTenantConfig === 'function'
      ? await tenantConfigStore.getTenantConfig(tenantId)
      : {};

  const items = await listConnectorStatuses({
    config: config || {},
    tenantId,
    tenantConfig,
    window: '7d',
    forceRefresh: true,
  });

  const errors = items.filter((item) => item.status === 'error');
  const notConfigured = items.filter((item) => item.status === 'not_configured');
  const checkedAt = new Date().toISOString();
  const payload = {
    tenantId,
    trigger,
    checkedAt,
    total: items.length,
    ok: items.filter((item) => item.status === 'ok').length,
    errorCount: errors.length,
    notConfiguredCount: notConfigured.length,
    errorChannels: errors.map((item) => item.channel),
    items: items.map((item) => ({
      channel: item.channel,
      status: item.status,
      mode: item.mode,
      message: item.message,
      fetchedAt: item.fetchedAt,
    })),
  };

  let healthSummary = null;
  if (connectorHealthStateStore && typeof connectorHealthStateStore.recordStatuses === 'function') {
    healthSummary = await connectorHealthStateStore.recordStatuses({
      tenantId,
      items,
      checkedAt,
    });
    payload.healthSummary = healthSummary;
  }

  const shouldNotify =
    errors.length > 0 &&
    (!healthSummary || healthSummary.alertingCount > 0);

  let notification = { skipped: true };
  if (
    shouldNotify &&
    executiveDecisionFeed &&
    typeof executiveDecisionFeed.addFromSchedulerNotification === 'function'
  ) {
    executiveDecisionFeed.addFromSchedulerNotification({
      tenantId,
      eventType: 'review_marketing_connectors',
      severity: 'warn',
      riskLevel: 'L3',
      payload: {
        summary: `${healthSummary?.alertingCount || errors.length} marketing connector(s) i fel >15 min: ${(healthSummary?.alertingChannels || errors.map((item) => item.channel)).join(', ')}`,
        ...payload,
      },
    });
    notification = { skipped: false, eventType: 'review_marketing_connectors' };
  } else if (shouldNotify && typeof sendAlertNotification === 'function') {
    notification = await sendAlertNotification({
      tenantId,
      eventType: 'review_marketing_connectors',
      severity: 'warn',
      payload,
      minRiskLevel: minNotifyRiskLevel,
    });
  }

  return {
    ...payload,
    notification,
  };
}

async function runCmoConnectorHealthCheckAllTenants({
  tenantIds = null,
  trigger = 'scheduled',
  config = null,
  tenantConfigStore = null,
  executiveDecisionFeed = null,
  sendAlertNotification = null,
  connectorHealthStateStore = null,
  minNotifyRiskLevel = 'L3',
} = {}) {
  let ids = Array.isArray(tenantIds)
    ? tenantIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null;

  if ((!ids || !ids.length) && tenantConfigStore && typeof tenantConfigStore.listTenants === 'function') {
    const tenants = await tenantConfigStore.listTenants();
    ids = tenants.filter((tenant) => tenant && tenant.disabled !== true).map((tenant) => tenant.tenantId);
  }

  if (!ids || !ids.length) {
    ids = [String(config?.defaultTenantId || 'default').trim() || 'default'];
  }

  const results = [];
  let totalErrorCount = 0;
  for (const tenantId of ids) {
    const result = await runCmoConnectorHealthCheck({
      tenantId,
      trigger,
      config,
      tenantConfigStore,
      executiveDecisionFeed,
      sendAlertNotification,
      connectorHealthStateStore,
      minNotifyRiskLevel,
    });
    results.push(result);
    totalErrorCount += Number(result.errorCount || 0);
  }

  return {
    trigger,
    tenantsChecked: ids.length,
    tenantIds: ids,
    totalErrorCount,
    results,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  CMO_SCHEDULER_JOB_IDS,
  runCmoWeeklyContentPlan,
  runCmoPilotPublishDue,
  runCmoConnectorHealthCheck,
  runCmoConnectorHealthCheckAllTenants,
};
