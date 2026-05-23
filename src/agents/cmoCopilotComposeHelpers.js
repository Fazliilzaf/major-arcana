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

const CMO_COPILOT_METADATA_SOURCES = Object.freeze([
  'GenerateContentBrief',
  'AnalyzeAudienceSegments',
  'GenerateOutreachCampaign',
  'GenerateSocialPostPack',
  'GenerateSeoBrief',
  'GenerateAdCopyPack',
  'GenerateEmailDraft',
  'RepurposeContent',
  'ValidateMarketingClaims',
  'ReviewMarketingCompliance',
  'ProposeContentCalendar',
  'ProposePublishSchedule',
  'GenerateContentSeries',
  'GenerateUtmPack',
  'ValidateMarketingTracking',
  'GenerateSalesEnablementPack',
  'ProposeCrisisCommsHold',
  'CLINICAL_GUARD',
  'CAO',
  'COO',
  'CFO',
]);

const CMO_ANALYTICS_METADATA_SOURCES = Object.freeze([
  'SummarizeMarketingPerformance',
  'GenerateMarketingBrief',
]);

const CMO_STRATEGY_INTEL_METADATA_SOURCES = Object.freeze([
  'GenerateContentBrief',
  'AnalyzeAudienceSegments',
  'AnalyzeCompetitorLandscape',
  'GenerateNurtureSequence',
  'GenerateWinbackCampaign',
]);

function dedupeWarnings(warnings = [], limit = 30) {
  return Array.from(new Set(asArray(warnings).map((w) => normalizeText(w)).filter(Boolean))).slice(
    0,
    limit
  );
}

function collectInitialCopilotWarnings({
  contentBriefOutput = null,
  audienceOutput = null,
  campaignOutput = null,
  socialOutput = null,
  seoOutput = null,
  adOutput = null,
  emailOutput = null,
  repurposeOutput = null,
  claimsOutput = null,
  complianceOutput = null,
  calendarOutput = null,
  scheduleOutput = null,
  utmOutput = null,
  trackingOutput = null,
  complianceReview = {},
  trackingReview = {},
} = {}) {
  return dedupeWarnings(
    [
      ...asArray(asObject(contentBriefOutput).warnings),
      ...asArray(asObject(audienceOutput).warnings),
      ...asArray(asObject(campaignOutput).warnings),
      ...asArray(asObject(socialOutput).warnings),
      ...asArray(asObject(seoOutput).warnings),
      ...asArray(asObject(adOutput).warnings),
      ...asArray(asObject(emailOutput).warnings),
      ...asArray(asObject(repurposeOutput).warnings),
      ...asArray(asObject(claimsOutput).warnings),
      ...asArray(asObject(complianceOutput).warnings),
      ...asArray(asObject(calendarOutput).warnings),
      ...asArray(asObject(scheduleOutput).warnings),
      ...asArray(asObject(utmOutput).warnings),
      ...asArray(asObject(trackingOutput).warnings),
      complianceReview.status === 'blocked'
        ? 'Compliance-gate blockerad — inget markeras redo för schemaläggning.'
        : '',
      complianceReview.status === 'needs_owner'
        ? 'Compliance kräver OWNER-granskning före schemaläggning.'
        : '',
      trackingReview.status === 'blocked'
        ? 'Tracking-validering blockerad — åtgärda UTM/länkar före schema.'
        : '',
      trackingReview.status === 'needs_owner'
        ? 'Tracking kräver OWNER-granskning före schemaläggning.'
        : '',
    ],
    30
  );
}

function resolveContentCalendar(proposedCalendarData = {}, briefData = {}) {
  const weeklyPlan = asArray(asObject(proposedCalendarData).weeklyPlan);
  return weeklyPlan.length ? weeklyPlan : asArray(asObject(briefData).contentCalendar);
}

function buildProductionCounts({
  socialPosts = [],
  seoArticles = [],
  adCopies = [],
  emailDrafts = [],
  repurposeVariants = [],
} = {}) {
  return {
    socialPosts: asArray(socialPosts).length,
    seoBriefs: asArray(seoArticles).length,
    adCopies: asArray(adCopies).length,
    emailDrafts: asArray(emailDrafts).length,
    repurposeVariants: asArray(repurposeVariants).length,
  };
}

function computeContentAssetCount(productionCounts = {}) {
  const counts = asObject(productionCounts);
  return (
    Number(counts.socialPosts || 0) +
    Number(counts.seoBriefs || 0) +
    Number(counts.adCopies || 0) +
    Number(counts.emailDrafts || 0) +
    Number(counts.repurposeVariants || 0)
  );
}

function computeCampaignReadyCount(campaigns = []) {
  return asArray(campaigns).filter(
    (campaign) =>
      (campaign.readiness === 'ready' || campaign.complianceCleared === true) &&
      campaign.launchBlocked !== true
  ).length;
}

function extractApprovedCampaignIds(campaigns = []) {
  return asArray(campaigns)
    .filter(
      (campaign) =>
        normalizeText(campaign.status).toLowerCase() === 'approved' || campaign.approvedAt
    )
    .map((campaign) => normalizeText(campaign.id))
    .filter(Boolean);
}

function resolveInitialScheduleAllowed(complianceReview = {}, trackingReview = {}) {
  return complianceReview.status === 'passed' && trackingReview.status !== 'blocked';
}

function buildMarketingCopilotExecutiveSummary({
  briefSummary = '',
  segments = [],
  campaigns = [],
  campaignReadyCount = 0,
  calendar = [],
  scheduleItems = [],
  utmLinks = [],
  missedPublications = [],
  productionCounts = {},
  complianceStatus = '',
  trackingStatus = '',
  gateResult = null,
  enablementData = {},
  crisisData = {},
  disclaimer = '',
} = {}) {
  return [
    'Arcana Marketing Copilot.',
    normalizeText(briefSummary) || 'Ingen content-data tillgänglig.',
    segments.length > 0
      ? `${segments.length} målgruppssegment (högst: ${segments[0]?.label || '-'}).`
      : '',
    campaigns.length > 0
      ? `${campaigns.length} kampanjförslag (${campaignReadyCount} compliance-klara).`
      : '',
    calendar.length > 0 ? `Content-kalender: ${calendar.length} planerade inlägg.` : '',
    scheduleItems.length > 0
      ? `Publiceringsschema: ${scheduleItems.length} förslag (heuristik).`
      : '',
    utmLinks.length > 0 ? `UTM-pack: ${utmLinks.length} länkar.` : '',
    missedPublications.length > 0
      ? `${missedPublications.length} missade publiceringsdatum flaggade.`
      : '',
    `Produktion: ${productionCounts.socialPosts || 0} social, ${productionCounts.seoBriefs || 0} SEO, ${productionCounts.adCopies || 0} ads, ${productionCounts.emailDrafts || 0} mail.`,
    `Compliance: ${complianceStatus || 'unknown'}.`,
    trackingStatus ? `Tracking: ${trackingStatus}.` : '',
    gateResult?.orchestrationGates?.launchGate?.blocked
      ? 'Launch gate: blockerad av operational readiness.'
      : '',
    gateResult?.pauseAllExternalCampaigns ? 'Incident-paus: externa kampanjer bör stoppas.' : '',
    asArray(enablementData.battlecards).length
      ? `Sales enablement: ${enablementData.battlecards.length} battlecards.`
      : '',
    crisisData.status === 'recommended' ? 'Crisis comms-hold rekommenderas.' : '',
    disclaimer,
  ]
    .filter(Boolean)
    .join(' ');
}

function collectAnalyticsWarnings(performanceOutput = null, briefOutput = null, briefData = {}) {
  return dedupeWarnings(
    [
      ...asArray(asObject(performanceOutput).warnings),
      ...asArray(asObject(briefOutput).warnings),
      briefData.status === 'insufficient_data' ? briefData.recommendation : '',
    ],
    20
  );
}

function resolveAnalyticsRecommendation(briefData = {}, performanceData = {}) {
  return (
    normalizeText(briefData.recommendation) ||
    normalizeText(performanceData.recommendation) ||
    'Ingen rekommendation utan färsk metric-data.'
  );
}

function resolveAnalyticsExecutiveSummary(briefData = {}, performanceData = {}) {
  return (
    normalizeText(briefData.executiveSummary) ||
    normalizeText(performanceData.summary) ||
    'Marketing analytics — read-only.'
  );
}

function collectStrategyIntelWarnings({
  briefOutput = null,
  audienceOutput = null,
  competitorOutput = null,
  nurtureOutput = null,
  winbackOutput = null,
} = {}) {
  return dedupeWarnings(
    [
      ...asArray(asObject(briefOutput).warnings),
      ...asArray(asObject(audienceOutput).warnings),
      ...asArray(asObject(competitorOutput).warnings),
      ...asArray(asObject(nurtureOutput).warnings),
      ...asArray(asObject(winbackOutput).warnings),
    ],
    20
  );
}

function buildStrategyIntelExecutiveSummary({
  briefSummary = '',
  segments = [],
  competitors = [],
  nurtureTouches = [],
  winbackTouches = [],
  connectorStatuses = [],
  disclaimer = '',
} = {}) {
  const connectors = asArray(connectorStatuses);
  return [
    'Arcana Marketing Copilot — strategy intel (v2).',
    normalizeText(briefSummary) || 'Ingen brief-data.',
    segments.length ? `${segments.length} målgruppssegment.` : '',
    competitors.length ? `${competitors.length} konkurrentprofiler (kräver verifiering).` : '',
    nurtureTouches.length ? `Nurture: ${nurtureTouches.length} touches.` : '',
    winbackTouches.length ? `Winback: ${winbackTouches.length} touches.` : '',
    connectors.length
      ? `Connectors: ${connectors.filter((item) => item.status === 'ok').length}/${connectors.length} aktiva.`
      : '',
    disclaimer,
  ]
    .filter(Boolean)
    .join(' ');
}

function resolveAgentMetadataIdentity({ channel = '', tenantId = '', correlationId = '' } = {}) {
  return {
    channel: normalizeText(channel) || 'admin',
    tenantId: normalizeText(tenantId) || 'unknown',
    correlationId: normalizeText(correlationId) || '',
  };
}

module.exports = {
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
};
