const { assertCapabilityClass } = require('./capabilityContract');
const { GenerateTaskPlanCapability } = require('./generateTaskPlan');
const { SummarizeIncidentsCapability } = require('./summarizeIncidents');
const { AnalyzeInboxCapability } = require('./analyzeInbox');
const { RefineReplyDraftCapability } = require('./refineReplyDraft');
const { CcoConversationActionCapability } = require('./ccoConversationAction');
const { SummarizeThreadCapability } = require('./summarizeThread');
const { RecordDraftFeedbackCapability } = require('./recordDraftFeedback');
const { GdprExportCustomerCapability, GdprAnonymizeCustomerCapability } = require('./gdprCustomer');
const {
  TenantListCapability,
  TenantCreateCapability,
  TenantDisableCapability,
} = require('./tenantLifecycle');
const { TenantUsageMetricsCapability } = require('./tenantUsageMetrics');
const { CcoOperationalKpisCapability } = require('./ccoOperationalKpis');
const { CcoCustomerBookingsCapability } = require('./ccoCustomerBookings');
const { SuggestTemplateImprovementCapability } = require('./suggestTemplateImprovement');
const { ValidateDisclaimersCapability } = require('./validateDisclaimers');
const { OptimizeVariablesCapability } = require('./optimizeVariables');
const { AssessTemplateLibraryHealthCapability } = require('./assessTemplateLibraryHealth');
const { AssessAdminQualityGateCapability } = require('./assessAdminQualityGate');
const {
  GenerateAdminTemplateDraftCapability,
  AuditDocumentationMetadataCapability,
  ProposeDocumentStructureCapability,
  SummarizeIncidentAdminCapability,
  FlagUnownedIncidentsCapability,
  BuildAuditSummaryCapability,
  VerifyDecisionTraceabilityCapability,
  TenantAdminHealthSummaryCapability,
  GenerateAdminDailyBriefCapability,
  GenerateAdminWeeklyBriefCapability,
  ExplainReadinessScoreCapability,
  GenerateGoNoGoBriefCapability,
} = require('./caoCapabilityKit');
const { AnalyzeRiskTrendCapability } = require('./analyzeRiskTrend');
const { FinanceGovernanceCapability } = require('./financeGovernance');
const { PrepareResponseDraftsCapability } = require('./prepareResponseDrafts');
const { GenerateContentBriefCapability } = require('./generateContentBrief');
const { AnalyzeAudienceSegmentsCapability } = require('./analyzeAudienceSegments');
const { GenerateOutreachCampaignCapability } = require('./generateOutreachCampaign');
const { GenerateSocialPostPackCapability } = require('./generateSocialPostPack');
const { GenerateSeoBriefCapability } = require('./generateSeoBrief');
const { GenerateAdCopyPackCapability } = require('./generateAdCopyPack');
const { GenerateEmailDraftCapability } = require('./generateEmailDraft');
const { RepurposeContentCapability } = require('./repurposeContent');
const { ValidateMarketingClaimsCapability } = require('./validateMarketingClaims');
const { ReviewMarketingComplianceCapability } = require('./reviewMarketingCompliance');
const { ProposeContentCalendarCapability } = require('./proposeContentCalendar');
const { ProposePublishScheduleCapability } = require('./proposePublishSchedule');
const { GenerateUtmPackCapability } = require('./generateUtmPack');
const { ValidateMarketingTrackingCapability } = require('./validateMarketingTracking');
const { SummarizeMarketingPerformanceCapability } = require('./summarizeMarketingPerformance');
const { GenerateMarketingBriefCapability } = require('./generateMarketingBrief');
const { GenerateSalesEnablementPackCapability } = require('./generateSalesEnablementPack');
const { ProposeCrisisCommsHoldCapability } = require('./proposeCrisisCommsHold');
const { AnalyzeCompetitorLandscapeCapability } = require('./analyzeCompetitorLandscape');
const { GenerateNurtureSequenceCapability } = require('./generateNurtureSequence');
const { GenerateWinbackCampaignCapability } = require('./generateWinbackCampaign');
const { PatientChatResponseCapability } = require('./patientChatResponse');
const { RequestPostOpReviewCapability } = require('./requestPostOpReview');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { COO_AGENT_NAME } = require('../agents/cooDailyBriefAgent');
const { CAO_AGENT_NAME } = require('../agents/caoTemplateAdvisorAgent');
const { CFO_AGENT_NAME } = require('../agents/cfoCostAdvisorAgent');
const { CMO_AGENT_NAME } = require('../agents/cmoContentAgent');
const { PATIENT_AGENT_NAME } = require('../agents/patientAgent');
const { CCO_AGENT_NAME } = require('../agents/ccoInboxAgent');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const CAPABILITY_DEFINITIONS = Object.freeze([
  assertCapabilityClass(GenerateTaskPlanCapability),
  assertCapabilityClass(SummarizeIncidentsCapability),
  assertCapabilityClass(AnalyzeInboxCapability),
  assertCapabilityClass(RefineReplyDraftCapability),
  assertCapabilityClass(CcoConversationActionCapability),
  assertCapabilityClass(SummarizeThreadCapability),
  assertCapabilityClass(RecordDraftFeedbackCapability),
  assertCapabilityClass(GdprExportCustomerCapability),
  assertCapabilityClass(GdprAnonymizeCustomerCapability),
  assertCapabilityClass(TenantListCapability),
  assertCapabilityClass(TenantCreateCapability),
  assertCapabilityClass(TenantDisableCapability),
  assertCapabilityClass(TenantUsageMetricsCapability),
  assertCapabilityClass(CcoOperationalKpisCapability),
  assertCapabilityClass(CcoCustomerBookingsCapability),
  assertCapabilityClass(SuggestTemplateImprovementCapability),
  assertCapabilityClass(ValidateDisclaimersCapability),
  assertCapabilityClass(OptimizeVariablesCapability),
  assertCapabilityClass(AssessTemplateLibraryHealthCapability),
  assertCapabilityClass(AssessAdminQualityGateCapability),
  assertCapabilityClass(GenerateAdminTemplateDraftCapability),
  assertCapabilityClass(AuditDocumentationMetadataCapability),
  assertCapabilityClass(ProposeDocumentStructureCapability),
  assertCapabilityClass(SummarizeIncidentAdminCapability),
  assertCapabilityClass(FlagUnownedIncidentsCapability),
  assertCapabilityClass(BuildAuditSummaryCapability),
  assertCapabilityClass(VerifyDecisionTraceabilityCapability),
  assertCapabilityClass(TenantAdminHealthSummaryCapability),
  assertCapabilityClass(GenerateAdminDailyBriefCapability),
  assertCapabilityClass(GenerateAdminWeeklyBriefCapability),
  assertCapabilityClass(ExplainReadinessScoreCapability),
  assertCapabilityClass(GenerateGoNoGoBriefCapability),
  assertCapabilityClass(PrepareResponseDraftsCapability),
  assertCapabilityClass(AnalyzeRiskTrendCapability),
  assertCapabilityClass(FinanceGovernanceCapability),
  assertCapabilityClass(GenerateContentBriefCapability),
  assertCapabilityClass(AnalyzeAudienceSegmentsCapability),
  assertCapabilityClass(GenerateOutreachCampaignCapability),
  assertCapabilityClass(GenerateSocialPostPackCapability),
  assertCapabilityClass(GenerateSeoBriefCapability),
  assertCapabilityClass(GenerateAdCopyPackCapability),
  assertCapabilityClass(GenerateEmailDraftCapability),
  assertCapabilityClass(RepurposeContentCapability),
  assertCapabilityClass(ValidateMarketingClaimsCapability),
  assertCapabilityClass(ReviewMarketingComplianceCapability),
  assertCapabilityClass(ProposeContentCalendarCapability),
  assertCapabilityClass(ProposePublishScheduleCapability),
  assertCapabilityClass(GenerateUtmPackCapability),
  assertCapabilityClass(ValidateMarketingTrackingCapability),
  assertCapabilityClass(SummarizeMarketingPerformanceCapability),
  assertCapabilityClass(GenerateMarketingBriefCapability),
  assertCapabilityClass(GenerateSalesEnablementPackCapability),
  assertCapabilityClass(ProposeCrisisCommsHoldCapability),
  assertCapabilityClass(AnalyzeCompetitorLandscapeCapability),
  assertCapabilityClass(GenerateNurtureSequenceCapability),
  assertCapabilityClass(GenerateWinbackCampaignCapability),
  assertCapabilityClass(PatientChatResponseCapability),
  assertCapabilityClass(RequestPostOpReviewCapability),
]);

const CAPABILITY_MAP = new Map(
  CAPABILITY_DEFINITIONS.map((capability) => [
    normalizeText(capability.name).toLowerCase(),
    capability,
  ])
);

const AGENT_BUNDLE_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: COO_AGENT_NAME,
    version: '1.0.0',
    role: 'COO',
    capabilities: Object.freeze(['SummarizeIncidents', 'GenerateTaskPlan', 'AnalyzeRiskTrend']),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'DailyBrief',
    plannedCapabilities: Object.freeze([]),
  }),
  Object.freeze({
    name: CAO_AGENT_NAME,
    version: '1.0.0',
    role: 'CAO',
    capabilities: Object.freeze([
      'SuggestTemplateImprovement',
      'ValidateDisclaimers',
      'OptimizeVariables',
      'AssessTemplateLibraryHealth',
      'AssessAdminQualityGate',
      'GenerateAdminTemplateDraft',
      'AuditDocumentationMetadata',
      'ProposeDocumentStructure',
      'SummarizeIncidentAdmin',
      'FlagUnownedIncidents',
      'BuildAuditSummary',
      'VerifyDecisionTraceability',
      'TenantAdminHealthSummary',
      'GenerateAdminDailyBrief',
      'GenerateAdminWeeklyBrief',
      'ExplainReadinessScore',
      'GenerateGoNoGoBrief',
    ]),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'AdminOperator',
    plannedCapabilities: Object.freeze([]),
  }),
  Object.freeze({
    name: CFO_AGENT_NAME,
    version: '1.0.0',
    role: 'CFO',
    capabilities: Object.freeze(['FinanceGovernance']),
    allowedRoles: Object.freeze([ROLE_OWNER]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'CostAdvisor',
    plannedCapabilities: Object.freeze([]),
  }),
  Object.freeze({
    name: CMO_AGENT_NAME,
    version: '2.0.0',
    role: 'CMO',
    capabilities: Object.freeze([
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
      'GenerateUtmPack',
      'ValidateMarketingTracking',
      'SummarizeMarketingPerformance',
      'GenerateMarketingBrief',
      'GenerateSalesEnablementPack',
      'ProposeCrisisCommsHold',
      'AnalyzeCompetitorLandscape',
      'GenerateNurtureSequence',
      'GenerateWinbackCampaign',
    ]),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'MarketingCopilot',
    plannedCapabilities: Object.freeze([]),
  }),
  Object.freeze({
    name: CCO_AGENT_NAME,
    version: '1.0.0',
    role: 'CCO',
    capabilities: Object.freeze(['AnalyzeInbox', 'PrepareResponseDrafts', 'RefineReplyDraft']),
    allowedRoles: Object.freeze([ROLE_OWNER, ROLE_STAFF]),
    allowedChannels: Object.freeze(['admin']),
    persistStrategy: 'analysis',
    outputType: 'InboxAnalysis',
    plannedCapabilities: Object.freeze([]),
  }),
  Object.freeze({
    name: PATIENT_AGENT_NAME,
    version: '1.0.0',
    role: 'Patient',
    capabilities: Object.freeze(['PatientChatResponse']),
    allowedRoles: Object.freeze([ROLE_OWNER]),
    allowedChannels: Object.freeze(['patient', 'admin']),
    persistStrategy: 'analysis',
    outputType: 'ChatResponse',
    plannedCapabilities: Object.freeze([]),
  }),
]);

const AGENT_BUNDLE_MAP = new Map();
AGENT_BUNDLE_DEFINITIONS.forEach((bundle) => {
  const keys = [bundle.name, bundle.role];
  for (const key of keys) {
    const normalized = normalizeText(key).toLowerCase();
    if (!normalized) continue;
    AGENT_BUNDLE_MAP.set(normalized, bundle);
  }
});

function listCapabilities() {
  return CAPABILITY_DEFINITIONS.map((capability) => ({
    name: capability.name,
    version: capability.version,
    allowedRoles: Array.isArray(capability.allowedRoles) ? [...capability.allowedRoles] : [],
    allowedChannels: Array.isArray(capability.allowedChannels)
      ? [...capability.allowedChannels]
      : [],
    channels: Array.isArray(capability.allowedChannels) ? [...capability.allowedChannels] : [],
    persistStrategy: capability.persistStrategy,
    auditStrategy: capability.auditStrategy,
    requiresInputRisk: capability.requiresInputRisk === true,
    requiresOutputRisk: capability.requiresOutputRisk === true,
    requiresPolicyFloor: capability.requiresPolicyFloor === true,
  }));
}

function getCapabilityByName(name = '') {
  const normalized = normalizeText(name).toLowerCase();
  if (!normalized) return null;
  return CAPABILITY_MAP.get(normalized) || null;
}

function listAgentBundles() {
  return AGENT_BUNDLE_DEFINITIONS.map((bundle) => ({
    name: bundle.name,
    version: bundle.version,
    role: bundle.role,
    capabilities: Array.isArray(bundle.capabilities) ? [...bundle.capabilities] : [],
    allowedRoles: Array.isArray(bundle.allowedRoles) ? [...bundle.allowedRoles] : [],
    allowedChannels: Array.isArray(bundle.allowedChannels) ? [...bundle.allowedChannels] : [],
    persistStrategy: bundle.persistStrategy,
    outputType: bundle.outputType,
    plannedCapabilities: Array.isArray(bundle.plannedCapabilities)
      ? [...bundle.plannedCapabilities]
      : [],
  }));
}

function getAgentBundleByName(name = '') {
  const normalized = normalizeText(name).toLowerCase();
  if (!normalized) return null;
  return AGENT_BUNDLE_MAP.get(normalized) || null;
}

module.exports = {
  listCapabilities,
  getCapabilityByName,
  listAgentBundles,
  getAgentBundleByName,
};
