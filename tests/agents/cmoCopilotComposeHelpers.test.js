'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../../src/agents/cmoCopilotComposeHelpers');

const DISCLAIMER = 'Utkast only — kräver OWNER-godkännande.';

test('dedupeWarnings trims, dedupes and caps list length', () => {
  const warnings = dedupeWarnings([' a ', 'a', 'b', 'c', 'd', 'e', 'f'], 3);
  assert.deepEqual(warnings, ['a', 'b', 'c']);
});

test('collectInitialCopilotWarnings adds compliance and tracking gate messages', () => {
  const warnings = collectInitialCopilotWarnings({
    contentBriefOutput: { warnings: ['brief'] },
    complianceReview: { status: 'blocked' },
    trackingReview: { status: 'needs_owner' },
  });
  assert.ok(warnings.includes('brief'));
  assert.ok(warnings.some((w) => w.includes('Compliance-gate blockerad')));
  assert.ok(warnings.some((w) => w.includes('Tracking kräver OWNER')));
});

test('resolveContentCalendar prefers proposed weekly plan over brief calendar', () => {
  assert.deepEqual(
    resolveContentCalendar({ weeklyPlan: [{ week: 2 }] }, { contentCalendar: [{ week: 1 }] }),
    [{ week: 2 }]
  );
  assert.deepEqual(resolveContentCalendar({}, { contentCalendar: [{ week: 1 }] }), [{ week: 1 }]);
});

test('buildProductionCounts and computeContentAssetCount sum asset buckets', () => {
  const counts = buildProductionCounts({
    socialPosts: [1, 2],
    seoArticles: [1],
    adCopies: [],
    emailDrafts: [1],
    repurposeVariants: [1, 2, 3],
  });
  assert.deepEqual(counts, {
    socialPosts: 2,
    seoBriefs: 1,
    adCopies: 0,
    emailDrafts: 1,
    repurposeVariants: 3,
  });
  assert.equal(computeContentAssetCount(counts), 7);
});

test('computeCampaignReadyCount and extractApprovedCampaignIds handle edge cases', () => {
  const campaigns = [
    { id: 'a', readiness: 'ready' },
    { id: 'b', readiness: 'ready', launchBlocked: true },
    { id: 'c', approvedAt: '2026-01-01' },
    { id: '', status: 'approved' },
  ];
  assert.equal(computeCampaignReadyCount(campaigns), 1);
  assert.deepEqual(extractApprovedCampaignIds(campaigns), ['c']);
});

test('resolveInitialScheduleAllowed requires passed compliance and non-blocked tracking', () => {
  assert.equal(resolveInitialScheduleAllowed({ status: 'passed' }, { status: 'passed' }), true);
  assert.equal(resolveInitialScheduleAllowed({ status: 'needs_owner' }, { status: 'passed' }), false);
  assert.equal(resolveInitialScheduleAllowed({ status: 'passed' }, { status: 'blocked' }), false);
});

test('buildMarketingCopilotExecutiveSummary renders all optional sections', () => {
  const summary = buildMarketingCopilotExecutiveSummary({
    briefSummary: 'Brief',
    segments: [{ label: 'Klinik' }],
    campaigns: [{ id: 'c1' }, { id: 'c2' }],
    campaignReadyCount: 1,
    calendar: [{ week: 1 }],
    scheduleItems: [{ id: 's1' }],
    utmLinks: [{ url: 'https://x.test' }],
    missedPublications: [{ id: 'm1' }],
    productionCounts: { socialPosts: 2, seoBriefs: 1, adCopies: 1, emailDrafts: 1 },
    complianceStatus: 'passed',
    trackingStatus: 'passed',
    gateResult: {
      pauseAllExternalCampaigns: true,
      orchestrationGates: { launchGate: { blocked: true } },
    },
    enablementData: { battlecards: [{ id: 'bc1' }] },
    crisisData: { status: 'recommended' },
    disclaimer: DISCLAIMER,
  });
  assert.match(summary, /Brief/);
  assert.match(summary, /Klinik/);
  assert.match(summary, /2 kampanjförslag \(1 compliance-klara\)/);
  assert.match(summary, /Content-kalender: 1/);
  assert.match(summary, /Publiceringsschema: 1/);
  assert.match(summary, /UTM-pack: 1/);
  assert.match(summary, /missade publiceringsdatum/);
  assert.match(summary, /Produktion: 2 social, 1 SEO, 1 ads, 1 mail/);
  assert.match(summary, /Launch gate/);
  assert.match(summary, /Incident-paus/);
  assert.match(summary, /battlecards/);
  assert.match(summary, /Crisis comms-hold/);
});

test('analytics and strategy helper resolvers pick expected fallback values', () => {
  assert.equal(
    resolveAnalyticsRecommendation({ recommendation: 'Brief rec' }, {}),
    'Brief rec'
  );
  assert.equal(resolveAnalyticsRecommendation({}, { recommendation: 'Perf rec' }), 'Perf rec');
  assert.match(
    resolveAnalyticsRecommendation({}, {}),
    /Ingen rekommendation utan färsk metric-data/
  );
  assert.equal(
    resolveAnalyticsExecutiveSummary({ executiveSummary: 'Brief exec' }, {}),
    'Brief exec'
  );
  assert.equal(resolveAnalyticsExecutiveSummary({}, { summary: 'Perf exec' }), 'Perf exec');
  assert.equal(resolveAnalyticsExecutiveSummary({}, {}), 'Marketing analytics — read-only.');

  const analyticsWarnings = collectAnalyticsWarnings(
    { warnings: ['perf'] },
    { warnings: ['brief'], data: { status: 'insufficient_data', recommendation: 'Need data' } },
    { status: 'insufficient_data', recommendation: 'Need data' }
  );
  assert.ok(analyticsWarnings.includes('Need data'));

  const strategyWarnings = collectStrategyIntelWarnings({
    briefOutput: { warnings: ['dup'] },
    audienceOutput: { warnings: ['dup'] },
  });
  assert.equal(strategyWarnings.length, 1);

  const strategySummary = buildStrategyIntelExecutiveSummary({
    briefSummary: 'Intel',
    segments: [{ id: 's1' }, { id: 's2' }],
    competitors: [{ name: 'X' }],
    nurtureTouches: [{ step: 1 }],
    winbackTouches: [{ step: 1 }, { step: 2 }],
    connectorStatuses: [{ status: 'ok' }, { status: 'error' }],
    disclaimer: DISCLAIMER,
  });
  assert.match(strategySummary, /Intel/);
  assert.match(strategySummary, /2 målgruppssegment/);
  assert.match(strategySummary, /1\/2 aktiva/);
});

test('collectInitialCopilotWarnings covers needs_owner compliance and blocked tracking', () => {
  const warnings = collectInitialCopilotWarnings({
    complianceReview: { status: 'needs_owner' },
    trackingReview: { status: 'blocked' },
  });
  assert.ok(warnings.some((w) => w.includes('Compliance kräver OWNER')));
  assert.ok(warnings.some((w) => w.includes('Tracking-validering blockerad')));
});

test('buildMarketingCopilotExecutiveSummary minimal path omits optional sections', () => {
  const summary = buildMarketingCopilotExecutiveSummary({
    disclaimer: DISCLAIMER,
    productionCounts: {},
    complianceStatus: 'unknown',
  });
  assert.match(summary, /Ingen content-data tillgänglig/);
  assert.match(summary, /Produktion: 0 social, 0 SEO, 0 ads, 0 mail/);
  assert.doesNotMatch(summary, /Publiceringsschema/);
  assert.doesNotMatch(summary, /Incident-paus/);
});

test('dedupeWarnings handles non-array input and analytics metadata constants', () => {
  assert.deepEqual(dedupeWarnings(null), []);
  assert.equal(CMO_ANALYTICS_METADATA_SOURCES.length, 2);
  assert.equal(CMO_STRATEGY_INTEL_METADATA_SOURCES.length, 5);
});

test('resolveAgentMetadataIdentity and metadata source constants', () => {
  assert.equal(resolveAgentMetadataIdentity({ channel: ' slack ', tenantId: ' t1 ' }).channel, 'slack');
  assert.equal(resolveAgentMetadataIdentity({}).tenantId, 'unknown');
  assert.equal(CMO_COPILOT_METADATA_SOURCES.length, 20);
  assert.ok(CMO_COPILOT_METADATA_SOURCES.includes('CLINICAL_GUARD'));
});
