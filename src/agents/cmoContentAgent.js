'use strict';

const {
  normalizeText,
  asObject,
  asArray,
  CMO_COPILOT_METADATA_SOURCES,
  CMO_ANALYTICS_METADATA_SOURCES,
  CMO_STRATEGY_INTEL_METADATA_SOURCES,
  dedupeWarnings,
  collectInitialCopilotWarnings,
  resolveContentCalendar,
  buildProductionCounts,
  computeContentAssetCount,
  computeCampaignReadyCount,
  extractApprovedCampaignIds,
  resolveInitialScheduleAllowed,
  buildMarketingCopilotExecutiveSummary,
  collectAnalyticsWarnings,
  resolveAnalyticsRecommendation,
  resolveAnalyticsExecutiveSummary,
  collectStrategyIntelWarnings,
  buildStrategyIntelExecutiveSummary,
  resolveAgentMetadataIdentity,
} = require('./cmoCopilotComposeHelpers');

const {
  buildComplianceReviewFromRuns,
  applyComplianceGateToCampaigns,
  applyComplianceGateToProductionPacks,
} = require('../ops/cmoComplianceGate');
const { applyCmoOrchestrationGates } = require('../ops/cmoOrchestrationGate');
const {
  resolvePublishPolicyConfig,
  buildPublishGateContext,
  summarizeChannelPublishPolicy,
} = require('../ops/cmoPublishPolicy');

const CMO_AGENT_NAME = 'CMO';

const CMO_DRAFT_DISCLAIMER =
  'Utkast only — kräver OWNER-godkännande före publicering, annonsbudget eller utskick.';

const cmoContentInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    maxTopics: { type: 'integer', minimum: 1, maximum: 10 },
    targetAudience: { type: 'string', maxLength: 100 },
    targetSegment: { type: 'string', maxLength: 50 },
    tone: { type: 'string', maxLength: 30 },
    sourceContent: { type: 'string', maxLength: 8000 },
    emailType: { type: 'string', maxLength: 30 },
    platforms: {
      type: 'array',
      maxItems: 5,
      items: { type: 'string', maxLength: 20 },
    },
    mode: { type: 'string', enum: ['production_draft', 'analytics', 'strategy_intel'] },
    period: { type: 'string', enum: ['weekly', 'monthly'] },
    windowDays: { type: 'integer', minimum: 1, maximum: 90 },
    orchestratorIntent: { type: 'string', maxLength: 80 },
    orchestratorPrompt: { type: 'string', maxLength: 2000 },
  },
});

const cmoContentOutputSchema = Object.freeze({
  type: 'object',
  required: ['data', 'metadata', 'warnings'],
  additionalProperties: false,
  properties: {
    data: {
      type: 'object',
      required: ['executiveSummary', 'generatedAt'],
      additionalProperties: true,
    },
    metadata: {
      type: 'object',
      required: ['agent', 'version', 'channel'],
      additionalProperties: true,
    },
    warnings: { type: 'array', maxItems: 30 },
  },
});

function composeCmoMarketingCopilot({
  contentBriefOutput = null,
  audienceOutput = null,
  campaignOutput = null,
  socialOutput = null,
  seoOutput = null,
  adOutput = null,
  emailOutput = null,
  repurposeOutput = null,
  seriesOutput = null,
  claimsOutput = null,
  complianceOutput = null,
  calendarOutput = null,
  scheduleOutput = null,
  utmOutput = null,
  trackingOutput = null,
  enablementOutput = null,
  crisisOutput = null,
  orchestrationSnapshot = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const briefData = asObject(asObject(contentBriefOutput).data);
  const audienceData = asObject(asObject(audienceOutput).data);
  const campaignData = asObject(asObject(campaignOutput).data);
  let socialData = asObject(asObject(socialOutput).data);
  const seoData = asObject(asObject(seoOutput).data);
  let adData = asObject(asObject(adOutput).data);
  let emailData = asObject(asObject(emailOutput).data);
  const repurposeData = asObject(asObject(repurposeOutput).data);
  const proposedCalendarData = asObject(asObject(calendarOutput).data);
  const publishScheduleData = asObject(asObject(scheduleOutput).data);
  const utmPackData = asObject(asObject(utmOutput).data);
  const trackingReview = asObject(asObject(trackingOutput).data);

  const complianceReview = buildComplianceReviewFromRuns({
    validateClaimsOutput: asObject(claimsOutput),
    reviewComplianceOutput: asObject(complianceOutput),
  });

  let campaigns = applyComplianceGateToCampaigns(
    asArray(campaignData.campaigns),
    complianceReview
  );

  const gatedProduction = applyComplianceGateToProductionPacks({
    socialPostPack: socialData,
    adCopyPack: adData,
    emailDrafts: emailData,
    complianceReview,
  });
  socialData = gatedProduction.socialPostPack;
  adData = gatedProduction.adCopyPack;
  emailData = gatedProduction.emailDrafts;

  const warnings = collectInitialCopilotWarnings({
    contentBriefOutput,
    audienceOutput,
    campaignOutput,
    socialOutput,
    seoOutput,
    adOutput,
    emailOutput,
    repurposeOutput,
    claimsOutput,
    complianceOutput,
    calendarOutput,
    scheduleOutput,
    utmOutput,
    trackingOutput,
    seriesOutput,
    complianceReview,
    trackingReview,
  });

  const topics = asArray(briefData.topics);
  const calendar = resolveContentCalendar(proposedCalendarData, briefData);
  const segments = asArray(audienceData.segments);
  const socialPosts = asArray(socialData.posts);
  const seoArticles = asArray(seoData.articles);
  const adCopies = asArray(adData.ads);
  const emailDrafts = asArray(emailData.emails);
  const repurposeVariants = asArray(repurposeData.variants);
  const seriesData = asObject(asObject(seriesOutput).data);
  const contentSeriesEpisodes = asArray(seriesData.episodes);
  const scheduleItemsRaw = asArray(publishScheduleData.scheduleItems);
  const missedPublications = asArray(publishScheduleData.missedPublications);
  const utmLinks = asArray(utmPackData.links);

  const productionCounts = buildProductionCounts({
    socialPosts,
    seoArticles,
    adCopies,
    emailDrafts,
    repurposeVariants,
  });

  let scheduleAllowed = resolveInitialScheduleAllowed(complianceReview, trackingReview);

  const gateResult = orchestrationSnapshot
    ? applyCmoOrchestrationGates({
        campaigns,
        scheduleAllowed,
        snapshot: orchestrationSnapshot,
      })
    : null;

  if (gateResult) {
    campaigns = gateResult.campaigns;
    scheduleAllowed = gateResult.scheduleAllowed;
  }

  const policyConfig = resolvePublishPolicyConfig(
    asObject(orchestrationSnapshot?.appConfig),
    asObject(orchestrationSnapshot?.tenantConfig)
  );
  const approvedCampaignIds = extractApprovedCampaignIds(campaigns);
  const publishGateContext = buildPublishGateContext({
    scheduleAllowed,
    compliancePassed: complianceReview.passed === true,
    campaignApproved: approvedCampaignIds.length > 0,
    pauseAllExternal: gateResult?.pauseAllExternalCampaigns === true,
    orchestrationBlocked:
      gateResult?.orchestrationGates?.launchGate?.blocked === true ||
      gateResult?.pauseAllExternalCampaigns === true,
  });
  const publishSummary = summarizeChannelPublishPolicy({
    scheduleItems: scheduleItemsRaw,
    policyConfig,
    gateContext: publishGateContext,
    approvedCampaignIds,
  });
  const scheduleItems = publishSummary.scheduleItems;

  const campaignReadyCount = computeCampaignReadyCount(campaigns);

  const enablementData = asObject(asObject(enablementOutput).data);
  const crisisData = asObject(asObject(crisisOutput).data);

  const finalWarnings = dedupeWarnings(
    gateResult?.warnings?.length ? [...warnings, ...gateResult.warnings] : warnings,
    30
  );

  const executiveSummary = buildMarketingCopilotExecutiveSummary({
    briefSummary: briefData.summary,
    segments,
    campaigns,
    campaignReadyCount,
    calendar,
    scheduleItems,
    utmLinks,
    missedPublications,
    productionCounts,
    complianceStatus: complianceReview.status,
    trackingStatus: trackingReview.status,
    gateResult,
    enablementData,
    crisisData,
    contentSeriesEpisodes,
    disclaimer: CMO_DRAFT_DISCLAIMER,
  });

  const metadataIdentity = resolveAgentMetadataIdentity({ channel, tenantId, correlationId });

  return {
    data: {
      outputType: 'MarketingCopilot',
      mode: 'production_draft',
      contentBrief: briefData,
      topics,
      contentCalendar: calendar,
      proposedContentCalendar: proposedCalendarData,
      publishSchedule: publishScheduleData,
      scheduleItems,
      missedPublications,
      utmPack: utmPackData,
      trackingReview,
      audienceSegments: segments,
      campaigns,
      campaignReadyCount,
      socialPostPack: socialData,
      seoBrief: seoData,
      adCopyPack: adData,
      emailDrafts: emailData,
      repurposedContent: repurposeData,
      contentSeries: seriesData,
      contentSeriesEpisodes,
      productionCounts,
      contentAssetCount: computeContentAssetCount(productionCounts),
      complianceReview,
      flaggedClaims: asArray(complianceReview.flaggedClaims),
      complianceGatePassed: complianceReview.passed === true,
      trackingGatePassed: trackingReview.passed === true,
      scheduleAllowed,
      orchestrationGates: gateResult?.orchestrationGates || null,
      pauseAllExternalCampaigns: gateResult?.pauseAllExternalCampaigns === true,
      publishPilotEnabled: publishSummary.publishPilotEnabled,
      pilotChannels: publishSummary.pilotChannels,
      pilotMaxRiskLevel: publishSummary.pilotMaxRiskLevel,
      channelPublishEvaluations: publishSummary.channelPublishEvaluations,
      pilotAutoPublishEligibleCount: publishSummary.pilotAutoPublishEligibleCount,
      salesEnablementPack: enablementData,
      crisisCommsHold: crisisData,
      executiveSummary,
      disclaimer: CMO_DRAFT_DISCLAIMER,
      requiresOwnerApproval: true,
      autoPublish: false,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CMO_AGENT_NAME,
      version: '1.5.0',
      channel: metadataIdentity.channel,
      tenantId: metadataIdentity.tenantId,
      correlationId: metadataIdentity.correlationId,
      sources: [...CMO_COPILOT_METADATA_SOURCES],
    },
    warnings: finalWarnings,
  };
}

function composeCmoContentAdvisor(options = {}) {
  return composeCmoMarketingCopilot(options);
}

function composeCmoAnalyticsReport({
  performanceOutput = null,
  briefOutput = null,
  channel = 'admin',
  tenantId = '',
  correlationId = '',
  period = 'weekly',
  windowDays = 7,
} = {}) {
  const performanceData = asObject(asObject(performanceOutput).data);
  const briefData = asObject(asObject(briefOutput).data);
  const warnings = collectAnalyticsWarnings(performanceOutput, briefOutput, briefData);
  const underperformingAds = asArray(performanceData.underperformingAds);
  const metadataIdentity = resolveAgentMetadataIdentity({ channel, tenantId, correlationId });

  return {
    data: {
      outputType: 'MarketingAnalytics',
      mode: 'analytics',
      period: normalizeText(period).toLowerCase() || 'weekly',
      windowDays,
      performanceSummary: performanceData,
      marketingBrief: briefData,
      underperformingAds,
      kpis: asObject(performanceData.kpis),
      channelMix: asArray(performanceData.channelMix),
      dataQuality: briefData.dataQuality || {
        freshMetricCount: performanceData.freshMetricCount,
        staleMetricCount: performanceData.staleMetricCount,
        missingSources: asArray(performanceData.missingSources),
      },
      recommendation: resolveAnalyticsRecommendation(briefData, performanceData),
      executiveSummary: resolveAnalyticsExecutiveSummary(briefData, performanceData),
      readOnly: true,
      autoPublish: false,
      requiresOwnerApproval: underperformingAds.length > 0,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CMO_AGENT_NAME,
      version: '1.4.0',
      channel: metadataIdentity.channel,
      tenantId: metadataIdentity.tenantId,
      correlationId: metadataIdentity.correlationId,
      sources: [...CMO_ANALYTICS_METADATA_SOURCES],
    },
    warnings,
  };
}

function composeCmoStrategyIntelReport({
  briefOutput = null,
  audienceOutput = null,
  competitorOutput = null,
  nurtureOutput = null,
  winbackOutput = null,
  connectorStatuses = [],
  channel = 'admin',
  tenantId = '',
  correlationId = '',
} = {}) {
  const briefData = asObject(asObject(briefOutput).data);
  const audienceData = asObject(asObject(audienceOutput).data);
  const competitorData = asObject(asObject(competitorOutput).data);
  const nurtureData = asObject(asObject(nurtureOutput).data);
  const winbackData = asObject(asObject(winbackOutput).data);

  const warnings = collectStrategyIntelWarnings({
    briefOutput,
    audienceOutput,
    competitorOutput,
    nurtureOutput,
    winbackOutput,
  });

  const segments = asArray(audienceData.segments);
  const competitors = asArray(competitorData.competitors);
  const nurtureTouches = asArray(nurtureData.touches);
  const winbackTouches = asArray(winbackData.touches);
  const connectors = asArray(connectorStatuses);
  const metadataIdentity = resolveAgentMetadataIdentity({ channel, tenantId, correlationId });

  const executiveSummary = buildStrategyIntelExecutiveSummary({
    briefSummary: briefData.summary,
    segments,
    competitors,
    nurtureTouches,
    winbackTouches,
    connectorStatuses: connectors,
    disclaimer: CMO_DRAFT_DISCLAIMER,
  });

  return {
    data: {
      outputType: 'MarketingStrategyIntel',
      mode: 'strategy_intel',
      contentBrief: briefData,
      audienceSegments: segments,
      competitorLandscape: competitorData,
      nurtureSequence: nurtureData,
      winbackCampaign: winbackData,
      marketingConnectors: connectors,
      executiveSummary,
      readOnly: true,
      autoPublish: false,
      autoSend: false,
      requiresOwnerApproval: true,
      generatedAt: new Date().toISOString(),
    },
    metadata: {
      agent: CMO_AGENT_NAME,
      version: '2.0.0',
      channel: metadataIdentity.channel,
      tenantId: metadataIdentity.tenantId,
      correlationId: metadataIdentity.correlationId,
      sources: [...CMO_STRATEGY_INTEL_METADATA_SOURCES],
    },
    warnings,
  };
}

module.exports = {
  CMO_AGENT_NAME,
  CMO_DRAFT_DISCLAIMER,
  cmoContentInputSchema,
  cmoContentOutputSchema,
  composeCmoMarketingCopilot,
  composeCmoContentAdvisor,
  composeCmoAnalyticsReport,
  composeCmoStrategyIntelReport,
};
