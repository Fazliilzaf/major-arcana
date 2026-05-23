'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  PUBLISH_MODES,
  CHANNEL_RISK_LEVEL,
  resolvePublishPolicyConfig,
  resolveChannelRiskLevel,
  evaluateChannelPublishEligibility,
  buildPublishGateContext,
  enrichScheduleItemsWithPublishPolicy,
  summarizeChannelPublishPolicy,
  executePilotChannelPublish,
  listDuePilotPublishCandidates,
} = require('../../src/ops/cmoPublishPolicy');
const {
  LAUNCH_GATE_MIN_SCORE,
  evaluateCmoLaunchGate,
  evaluateCooIncidentCampaignPause,
  evaluateCfoBudgetGate,
  buildCcoHandoffContext,
  applyCmoOrchestrationGates,
  buildOrchestrationSnapshotFromHydration,
} = require('../../src/ops/cmoOrchestrationGate');
const {
  resolveComplianceStatus,
  applyComplianceGateToCampaigns,
  applyComplianceGateToProductionPacks,
  buildComplianceReviewFromRuns,
  runClinicalGuardScan,
  collectSnapshotForCompliance,
} = require('../../src/ops/cmoComplianceGate');
const {
  INSUFFICIENT_DATA_MESSAGE,
  isMetricFresh,
  normalizeMetric,
  collectChannelMetrics,
  detectUnderperformingAds,
  summarizeMarketingPerformance,
  buildMarketingBrief,
} = require('../../src/ops/cmoMarketingMetrics');
const {
  createMarketingCampaignDraftsStore,
  mapReadinessToStatus,
} = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingContentAssetsStore } = require('../../src/ops/marketingContentAssetsStore');
const {
  CMO_AGENT_NAME,
  CMO_DRAFT_DISCLAIMER,
  cmoContentInputSchema,
  cmoContentOutputSchema,
  composeCmoMarketingCopilot,
  composeCmoAnalyticsReport,
  composeCmoStrategyIntelReport,
} = require('../../src/agents/cmoContentAgent');

const OPEN_GATES = buildPublishGateContext({
  scheduleAllowed: true,
  compliancePassed: true,
  campaignApproved: true,
  pauseAllExternal: false,
  orchestrationBlocked: false,
});

function freshFetchedAt(ageMs = 60_000) {
  return new Date(Date.now() - ageMs).toISOString();
}

test('resolveChannelRiskLevel normalizes twitter/mail and unknown defaults to L4', () => {
  assert.equal(resolveChannelRiskLevel('twitter'), CHANNEL_RISK_LEVEL.x);
  assert.equal(resolveChannelRiskLevel('mail'), CHANNEL_RISK_LEVEL.email);
  assert.equal(resolveChannelRiskLevel(''), 4);
  assert.equal(resolveChannelRiskLevel('seo'), 2);
});

test('resolvePublishPolicyConfig merges tenant and app sources with defaults', () => {
  const fromTenant = resolvePublishPolicyConfig(
    {},
    {
      marketing: {
        publishPolicy: { pilotEnabled: true, pilotChannels: 'meta,linkedin', pilotMaxRiskLevel: 2 },
      },
    }
  );
  assert.equal(fromTenant.pilotEnabled, true);
  assert.deepEqual(fromTenant.pilotChannels, ['meta', 'linkedin']);
  assert.equal(fromTenant.maxRiskLevel, 2);
  assert.equal(fromTenant.allowL5AutoPublish, false);

  const fromApp = resolvePublishPolicyConfig({
    marketingPublishPilotEnabled: true,
    marketingAutoPublishPilotChannels: ['x'],
    marketingPublishPilotMaxRiskLevel: 99,
  });
  assert.deepEqual(fromApp.pilotChannels, ['x']);
  assert.equal(fromApp.maxRiskLevel, 5);
});

test('evaluateChannelPublishEligibility covers every gate branch', () => {
  const policy = { pilotEnabled: true, pilotChannels: ['linkedin'], maxRiskLevel: 3 };

  const incident = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: policy,
    gateContext: { ...OPEN_GATES, pauseAllExternal: true },
    campaignStatus: 'approved',
  });
  assert.equal(incident.publishMode, PUBLISH_MODES.PROPOSAL_ONLY);
  assert.match(incident.autoPublishBlockedReason, /pausad/);

  const orchestration = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: policy,
    gateContext: { ...OPEN_GATES, orchestrationBlocked: true },
    campaignStatus: 'approved',
  });
  assert.match(orchestration.autoPublishBlockedReason, /Orkestrerings/);

  const compliance = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: policy,
    gateContext: { ...OPEN_GATES, compliancePassed: false },
    campaignStatus: 'approved',
  });
  assert.match(compliance.autoPublishBlockedReason, /Compliance/);

  const schedule = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: policy,
    gateContext: { ...OPEN_GATES, scheduleAllowed: false },
    campaignStatus: 'approved',
  });
  assert.match(schedule.autoPublishBlockedReason, /Schema/);

  const notOnAllowlist = evaluateChannelPublishEligibility({
    channel: 'facebook',
    policyConfig: policy,
    gateContext: OPEN_GATES,
    campaignStatus: 'approved',
  });
  assert.equal(notOnAllowlist.publishMode, PUBLISH_MODES.OWNER_APPROVED_QUEUE);
  assert.match(notOnAllowlist.autoPublishBlockedReason, /allowlist/);

  const notApproved = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: policy,
    gateContext: { ...OPEN_GATES, campaignApproved: false },
    campaignStatus: 'draft',
  });
  assert.equal(notApproved.pilotAutoPublishEligible, false);
  assert.equal(notApproved.publishMode, PUBLISH_MODES.PROPOSAL_ONLY);

  const highRisk = evaluateChannelPublishEligibility({
    channel: 'google_ads',
    policyConfig: { pilotEnabled: true, pilotChannels: ['google_ads'], maxRiskLevel: 3 },
    gateContext: OPEN_GATES,
    campaignStatus: 'approved',
  });
  assert.equal(highRisk.riskLevel, 4);
  assert.match(highRisk.autoPublishBlockedReason, /L4/);
  assert.equal(highRisk.autoPublish, false);
  assert.equal(highRisk.requiresOwnerApproval, true);
});

test('listDuePilotPublishCandidates respects grace window and terminal publish statuses', () => {
  const policy = resolvePublishPolicyConfig({ marketingPublishPilotEnabled: true });
  const now = new Date('2026-05-20T12:00:00.000Z');
  const due = listDuePilotPublishCandidates({
    campaigns: [
      {
        id: 'future',
        status: 'approved',
        payload: { publishSchedule: { proposedAt: '2026-05-20T13:00:00.000Z', platform: 'linkedin' } },
      },
      {
        id: 'queued',
        status: 'approved',
        payload: {
          publishSchedule: {
            proposedAt: '2026-05-20T10:00:00.000Z',
            platform: 'linkedin',
            publishStatus: 'publish_queued',
          },
        },
      },
      {
        id: 'ok',
        status: 'approved',
        channel: 'linkedin',
        payload: { publishSchedule: { proposedAt: '2026-05-20T10:00:00.000Z', platform: 'linkedin' } },
      },
    ],
    policyConfig: policy,
    gateContext: OPEN_GATES,
    now,
    graceMinutes: 30,
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].campaign.id, 'ok');
});

test('executePilotChannelPublish writes audit when authStore present', async () => {
  const audits = [];
  const result = await executePilotChannelPublish({
    campaign: { id: 'c-1', channel: 'twitter' },
    tenantId: 't1',
    authStore: {
      addAuditEvent: async (event) => audits.push(event),
    },
  });
  assert.equal(result.channel, 'x');
  assert.equal(result.externalPublishInvoked, false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'cmo.pilot_publish.queue');
  assert.equal(audits[0].metadata.externalPublishInvoked, false);
});

test('enrichScheduleItemsWithPublishPolicy marks approved campaign ids', () => {
  const enriched = enrichScheduleItemsWithPublishPolicy({
    scheduleItems: [{ id: 's1', campaignId: 'c-approved', platform: 'linkedin' }],
    policyConfig: resolvePublishPolicyConfig({ marketingPublishPilotEnabled: true }),
    gateContext: OPEN_GATES,
    approvedCampaignIds: ['c-approved'],
  });
  assert.equal(enriched[0].publishMode, PUBLISH_MODES.PILOT_AUTO_QUEUE);
  assert.equal(enriched[0].pilotAutoPublishEligible, true);

  const summary = summarizeChannelPublishPolicy({
    scheduleItems: enriched,
    policyConfig: resolvePublishPolicyConfig({ marketingPublishPilotEnabled: true }),
    gateContext: OPEN_GATES,
    approvedCampaignIds: ['c-approved'],
  });
  assert.equal(summary.autoPublish, false);
  assert.equal(summary.pilotAutoPublishEligibleCount, 1);
});

test('evaluateCmoLaunchGate enforces score 75 and controlled_go band', () => {
  assert.equal(LAUNCH_GATE_MIN_SCORE, 75);
  const blocked = evaluateCmoLaunchGate({ operationalReadiness: { score: 74, band: 'controlled_go' } });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.score, 74);

  const allowed = evaluateCmoLaunchGate({ operationalReadiness: { score: 75, band: 'controlled_go' } });
  assert.equal(allowed.allowed, true);

  const wrongBand = evaluateCmoLaunchGate({ operationalReadiness: { score: 90, band: 'hold' } });
  assert.equal(wrongBand.allowed, false);

  const goBypass = evaluateCmoLaunchGate({ operationalReadiness: { score: 10, band: 'hold', goAllowed: true } });
  assert.equal(goBypass.allowed, true);
});

test('evaluateCooIncidentCampaignPause triggers on P0 or P1', () => {
  assert.equal(evaluateCooIncidentCampaignPause({ p0Open: 0, p1Open: 0 }).required, false);
  assert.equal(evaluateCooIncidentCampaignPause({ p0Open: 1 }).required, true);
  assert.equal(evaluateCooIncidentCampaignPause({ p1Open: 2 }).required, true);
  assert.equal(evaluateCooIncidentCampaignPause({ criticalOpen: 1 }).required, true);
});

test('evaluateCfoBudgetGate flags spend over cap', () => {
  const within = evaluateCfoBudgetGate({
    marketingBudget: { monthlyCap: 10000, currency: 'EUR' },
    spendProposal: { amount: 5000 },
  });
  assert.equal(within.allowed, true);
  assert.equal(within.requiresOwnerApproval, false);
  assert.equal(within.currency, 'EUR');

  const over = evaluateCfoBudgetGate({
    marketingBudget: { monthlyCap: 1000 },
    spendProposal: { amount: 1001 },
  });
  assert.equal(over.requiresOwnerApproval, true);
  assert.equal(over.allowed, false);
});

test('applyCmoOrchestrationGates pauses campaigns and blocks schedule on incidents', () => {
  const gated = applyCmoOrchestrationGates({
    campaigns: [{ id: 'c1', readiness: 'ready', complianceCleared: true }],
    scheduleAllowed: true,
    snapshot: {
      operationalReadiness: { score: 90, band: 'controlled_go' },
      incidentSummary: { p0Open: 1, p1Open: 0 },
      marketingBudget: { monthlyCap: 500 },
      spendProposal: { amount: 600 },
    },
  });
  assert.equal(gated.pauseAllExternalCampaigns, true);
  assert.equal(gated.scheduleAllowed, false);
  assert.equal(gated.campaigns[0].readiness, 'paused_incident');
  assert.ok(gated.warnings.length >= 2);
});

test('buildOrchestrationSnapshotFromHydration derives incident counts from openIncidents', async () => {
  const snapshot = await buildOrchestrationSnapshotFromHydration({
    baseSnapshot: {
      openIncidents: [
        { priority: 'P0' },
        { priority: 'P1' },
        { priority: 'P2' },
      ],
    },
    intent: 'weekly',
    prompt: 'plan',
  });
  assert.equal(snapshot.incidentSummary.p0Open, 1);
  assert.equal(snapshot.incidentSummary.p1Open, 1);
  assert.equal(snapshot.orchestratorContext.intent, 'weekly');
});

test('resolveComplianceStatus and buildComplianceReviewFromRuns handle clinical block', () => {
  assert.equal(resolveComplianceStatus({ blocked: true }), 'blocked');
  assert.equal(resolveComplianceStatus({ highFlags: 1 }), 'blocked');
  assert.equal(resolveComplianceStatus({ needsOwner: true }), 'needs_owner');
  assert.equal(resolveComplianceStatus({}), 'passed');

  const review = buildComplianceReviewFromRuns({
    validateClaimsOutput: {
      data: {
        passed: false,
        flaggedClaims: [{ severity: 'high', claim: 'cure' }],
      },
    },
    reviewComplianceOutput: {
      data: { clinicalGuard: { blocked: true }, status: '' },
    },
  });
  assert.equal(review.status, 'blocked');
  assert.equal(review.passed, false);
  assert.equal(review.blocked, true);
});

test('applyComplianceGateToCampaigns mutates readiness per status', () => {
  const campaigns = [
    { id: 'a', readiness: 'ready' },
    { id: 'b', readiness: 'ready' },
  ];
  const blocked = applyComplianceGateToCampaigns(campaigns, { status: 'blocked' });
  assert.equal(blocked[0].readiness, 'compliance_blocked');
  assert.equal(blocked[0].complianceBlocked, true);

  const needsOwner = applyComplianceGateToCampaigns(campaigns, { status: 'needs_owner' });
  assert.equal(needsOwner[0].readiness, 'needs_compliance_owner');
  assert.equal(needsOwner[0].complianceOwnerRequired, true);

  const passed = applyComplianceGateToCampaigns(campaigns, { status: 'passed' });
  assert.equal(passed[0].complianceCleared, true);
});

test('applyComplianceGateToProductionPacks sets post statuses', () => {
  const packs = applyComplianceGateToProductionPacks({
    socialPostPack: { posts: [{ id: 'p1', status: 'ready' }] },
    adCopyPack: { ads: [{ id: 'a1' }] },
    emailDrafts: { emails: [{ id: 'e1' }] },
    complianceReview: { status: 'blocked' },
  });
  assert.equal(packs.socialPostPack.posts[0].status, 'compliance_blocked');
  assert.equal(packs.adCopyPack.ads[0].complianceGate, 'blocked');
});

test('isMetricFresh and normalizeMetric reject stale or missing timestamps', () => {
  const now = Date.now();
  assert.equal(isMetricFresh({ fetchedAt: freshFetchedAt(1000), fresh: true }, now), true);
  assert.equal(isMetricFresh({ fetchedAt: freshFetchedAt(50 * 3600_000), fresh: true }, now), false);
  assert.equal(isMetricFresh({ fetchedAt: freshFetchedAt(1000), fresh: false }, now), false);

  const stale = normalizeMetric({ value: 1, fetchedAt: freshFetchedAt(72 * 3600_000) }, 'meta');
  assert.equal(stale.fresh, false);

  const noValue = normalizeMetric({ fetchedAt: freshFetchedAt() }, 'meta');
  assert.equal(noValue, null);
});

test('detectUnderperformingAds flags low CTR with high CPC', () => {
  const entries = collectChannelMetrics({
    marketingPerformance: {
      channels: {
        meta: {
          source: 'meta',
          fetchedAt: freshFetchedAt(),
          metrics: {
            ctr: { value: 0.005, fetchedAt: freshFetchedAt() },
            cpc: { value: 6.5, fetchedAt: freshFetchedAt() },
          },
        },
      },
    },
  });
  const under = detectUnderperformingAds(entries);
  assert.equal(under.length, 1);
  assert.equal(under[0].channel, 'meta');
  assert.match(under[0].reason, /CTR/);
});

test('summarizeMarketingPerformance returns insufficient_data without fresh KPIs', () => {
  const empty = summarizeMarketingPerformance({});
  assert.equal(empty.status, 'insufficient_data');
  assert.equal(empty.recommendation, INSUFFICIENT_DATA_MESSAGE);
  assert.ok(empty.missingSources.length > 0);

  const ok = summarizeMarketingPerformance({
    marketingPerformance: {
      channels: {
        google_ads: {
          source: 'google_ads',
          fetchedAt: freshFetchedAt(),
          metrics: {
            ctr: { value: 0.02, fetchedAt: freshFetchedAt(), source: 'google_ads' },
            cpc: { value: 2.1, fetchedAt: freshFetchedAt(), source: 'google_ads' },
          },
          spend: { value: 1000, fetchedAt: freshFetchedAt(), source: 'google_ads' },
        },
      },
    },
  });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.recommendation, null);
  assert.ok(ok.kpis.ctr.fresh);
});

test('buildMarketingBrief branches on performance status', () => {
  const insufficient = buildMarketingBrief({ status: 'insufficient_data', freshMetricCount: 0 });
  assert.equal(insufficient.status, 'insufficient_data');
  assert.match(insufficient.executiveSummary, /insufficient_data/);

  const weekly = buildMarketingBrief(
    {
      status: 'ok',
      kpis: {
        ctr: { fresh: true, value: 0.03, source: 'meta' },
        cpc: { fresh: true, value: 1.5, source: 'meta' },
      },
      channelMix: [{ channel: 'meta', share: 0.6 }],
      underperformingAds: [],
      freshMetricCount: 2,
    },
    { period: 'weekly' }
  );
  assert.equal(weekly.period, 'weekly');
  assert.match(weekly.executiveSummary, /Veckorapport/);
  assert.equal(weekly.readOnly, true);

  const monthly = buildMarketingBrief({ status: 'ok', kpis: {}, channelMix: [], underperformingAds: [] }, {
    period: 'monthly',
  });
  assert.equal(monthly.period, 'monthly');
});

test('mapReadinessToStatus maps compliance and ready states', () => {
  assert.equal(mapReadinessToStatus('compliance_blocked'), 'compliance_blocked');
  assert.equal(mapReadinessToStatus('ready'), 'pending_approval');
  assert.equal(mapReadinessToStatus('needs_compliance_owner'), 'pending_approval');
  assert.equal(mapReadinessToStatus('draft'), 'draft');
});

test('marketingCampaignDraftsStore rejects compliance_blocked and invalid approve', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-campaigns-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  await store.upsertCampaign({
    tenantId: 'default',
    id: 'blocked',
    status: 'compliance_blocked',
    readiness: 'compliance_blocked',
  });
  await assert.rejects(
    () => store.approveCampaign({ tenantId: 'default', id: 'blocked', approvedBy: 'owner' }),
    (error) => error.code === 'COMPLIANCE_BLOCKED'
  );

  await store.upsertCampaign({ tenantId: 'default', id: 'rejected', status: 'rejected' });
  await assert.rejects(
    () => store.approveCampaign({ tenantId: 'default', id: 'rejected', approvedBy: 'owner' }),
    (error) => error.code === 'INVALID_STATUS'
  );
});

test('marketingContentAssetsStore preserves approved terminal status on resync', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-assets-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });
  const sample = {
    campaigns: [{ id: 'c1', name: 'Launch', channel: 'linkedin', readiness: 'ready' }],
    socialPostPack: { posts: [{ id: 'social-1', platform: 'linkedin', text: 'Post' }] },
  };
  const first = await store.syncFromCmoOutput({ tenantId: 'default', agentRunId: 'r1', cmoData: sample });
  const assetId = first.assetIds[0];
  await store.approveAssetsForCampaign({ tenantId: 'default', campaignId: 'c1', approvedBy: 'owner' });
  await store.syncFromCmoOutput({ tenantId: 'default', agentRunId: 'r2', cmoData: sample });
  const asset = await store.getAsset({ tenantId: 'default', id: assetId });
  assert.equal(asset.status, 'approved');
  assert.equal(asset.autoPublish, false);
});

test('composeCmoMarketingCopilot blocks schedule when tracking blocked', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [] }, warnings: [] },
    campaignOutput: { data: { campaigns: [] }, warnings: [] },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'blocked', passed: false }, warnings: [] },
    scheduleOutput: { data: { scheduleItems: [] }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 80, band: 'controlled_go' },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      appConfig: {},
    },
  });
  assert.equal(composed.data.scheduleAllowed, false);
  assert.ok(composed.warnings.some((w) => w.includes('Tracking-validering blockerad')));
  assert.equal(composed.data.autoPublish, false);
});

test('composeCmoAnalyticsReport and composeCmoStrategyIntelReport enforce read-only flags', () => {
  const analytics = composeCmoAnalyticsReport({
    performanceOutput: { data: { status: 'insufficient_data', underperformingAds: [{ channel: 'meta' }] } },
    briefOutput: { data: { status: 'insufficient_data', recommendation: INSUFFICIENT_DATA_MESSAGE } },
    period: 'MONTHLY',
    tenantId: 'acme',
  });
  assert.equal(analytics.data.period, 'monthly');
  assert.equal(analytics.data.autoPublish, false);
  assert.equal(analytics.data.readOnly, true);
  assert.equal(analytics.data.requiresOwnerApproval, true);

  const strategy = composeCmoStrategyIntelReport({
    briefOutput: { data: { summary: 'Brief' }, warnings: [] },
    audienceOutput: { data: { segments: [{ id: 's1' }] }, warnings: [] },
    competitorOutput: { data: { competitors: [{ name: 'X' }] }, warnings: [] },
    nurtureOutput: { data: { touches: [{ step: 1 }] }, warnings: [] },
    winbackOutput: { data: { touches: [] }, warnings: [] },
    connectorStatuses: [{ status: 'ok' }, { status: 'error' }],
    tenantId: 'acme',
  });
  assert.equal(strategy.data.mode, 'strategy_intel');
  assert.equal(strategy.data.autoSend, false);
  assert.match(strategy.data.executiveSummary, new RegExp(CMO_DRAFT_DISCLAIMER.slice(0, 20)));
  assert.equal(strategy.metadata.version, '2.0.0');
});

test('buildCcoHandoffContext uses tenant definitions when provided', () => {
  const custom = buildCcoHandoffContext({
    ccoCommercialHandoff: {
      mqlDefinition: 'Custom MQL',
      sqlDefinition: 'Custom SQL',
      pipelineStages: ['a', 'b'],
      battlecardRequested: false,
      source: 'tenant',
    },
  });
  assert.equal(custom.mqlDefinition, 'Custom MQL');
  assert.equal(custom.battlecardRequested, false);
  assert.deepEqual(custom.pipelineStages, ['a', 'b']);
});

test('buildChannelMix falls back to channel presence when spend is zero', () => {
  const entries = collectChannelMetrics({
    marketingPerformance: {
      channels: {
        seo: {
          source: 'seo',
          fetchedAt: freshFetchedAt(),
          metrics: { ctr: { value: 0.02, fetchedAt: freshFetchedAt() } },
        },
        social: {
          source: 'social',
          fetchedAt: freshFetchedAt(),
          metrics: { ctr: { value: 0.01, fetchedAt: freshFetchedAt() } },
        },
      },
    },
  });
  const summary = summarizeMarketingPerformance({
    marketingPerformance: {
      channels: {
        seo: {
          source: 'seo',
          fetchedAt: freshFetchedAt(),
          metrics: { ctr: { value: 0.02, fetchedAt: freshFetchedAt() } },
        },
        social: {
          source: 'social',
          fetchedAt: freshFetchedAt(),
          metrics: { ctr: { value: 0.01, fetchedAt: freshFetchedAt() } },
        },
      },
    },
  });
  assert.equal(summary.status, 'ok');
  assert.ok(summary.channelMix.length >= 2);
  assert.equal(summary.channelMix[0].evidence, 'channel_presence_only');
});

test('buildMarketingBrief recommends pause action when underperforming ads exist', () => {
  const brief = buildMarketingBrief({
    status: 'ok',
    kpis: { ctr: { fresh: true, value: 0.02, source: 'meta' } },
    channelMix: [],
    underperformingAds: [{ channel: 'meta', reason: 'Låg CTR', ctr: 0.005, cpc: 6 }],
    freshMetricCount: 1,
  });
  assert.equal(brief.actions.length, 1);
  assert.equal(brief.actions[0].id, 'pause_underperforming_ads');
  assert.equal(brief.actions[0].requiresOwnerApproval, true);
  assert.match(brief.recommendation, /OWNER/);
});

test('marketingCampaignDraftsStore list filters and schedule/markPublish flows', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-store-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  const created = await store.upsertCampaign({
    tenantId: 'default',
    id: 'c-new',
    name: 'New',
    owner: 'alice',
    readiness: 'draft',
    channel: 'email',
  });
  assert.equal(created.version, 1);
  assert.equal(created.status, 'draft');

  const updated = await store.upsertCampaign({
    tenantId: 'default',
    id: 'c-new',
    name: 'New v2',
    owner: 'alice',
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.name, 'New v2');
  assert.ok(updated.versions.length >= 1);

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-a',
    campaigns: [
      { id: 'c-pending', name: 'Pending', readiness: 'ready', channel: 'linkedin' },
      { readiness: 'ready', name: 'No id skip' },
    ],
    complianceReview: { status: 'passed' },
    assetIdsByCampaign: { 'c-pending': ['asset-1'] },
  });
  const syncList = await store.listCampaigns({ tenantId: 'default', status: 'pending_approval' });
  assert.equal(syncList.length, 1);
  assert.deepEqual(syncList[0].payload.assetIds, ['asset-1']);

  const noopPatch = await store.patchCampaign({
    tenantId: 'default',
    id: 'c-pending',
    fields: {},
    changedBy: 'alice',
  });
  assert.deepEqual(noopPatch.updatedFields, []);

  const approved = await store.approveCampaign({
    tenantId: 'default',
    id: 'c-pending',
    approvedBy: 'owner-1',
  });
  assert.equal(approved.status, 'approved');
  const idempotent = await store.approveCampaign({
    tenantId: 'default',
    id: 'c-pending',
    approvedBy: 'owner-1',
  });
  assert.equal(idempotent.version, approved.version);

  const scheduleResult = await store.applyScheduleProposals({
    tenantId: 'default',
    scheduleItems: [
      {
        campaignId: 'c-pending',
        platform: 'linkedin',
        proposedAt: '2026-06-01T09:00:00.000Z',
        topic: 'Launch',
        publishMode: 'pilot_auto_queue',
        pilotAutoPublishEligible: true,
      },
    ],
    sourceAgentRunId: 'run-schedule',
  });
  assert.equal(scheduleResult.updatedCount, 1);
  const withSchedule = await store.getCampaign({ tenantId: 'default', id: 'c-pending' });
  assert.match(withSchedule.scheduleProposal, /linkedin/);
  assert.equal(withSchedule.payload.publishSchedule.platform, 'linkedin');

  const queued = await store.markPublishQueued({
    tenantId: 'default',
    id: 'c-pending',
    publishResult: {
      queuedAt: '2026-06-01T10:00:00.000Z',
      mode: 'pilot_queue_stub',
      externalPublishInvoked: false,
    },
  });
  assert.equal(queued.payload.publishSchedule.publishStatus, 'publish_queued');
  assert.equal(queued.payload.publishSchedule.externalPublishInvoked, false);

  const rejected = await store.rejectCampaign({
    tenantId: 'default',
    id: 'c-new',
    rejectedBy: 'owner-1',
    reason: 'Off-brand',
  });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectionReason, 'Off-brand');

  const byOwner = await store.listCampaigns({ tenantId: 'default', owner: 'alice', limit: 5 });
  assert.ok(byOwner.some((c) => c.id === 'c-new'));
  assert.equal(await store.getCampaign({ tenantId: 'default', id: 'missing' }), null);
});

test('marketingContentAssetsStore link and filter assets by campaign', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-assets2-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  await store.upsertAsset({
    tenantId: 'default',
    id: 'orphan',
    assetType: 'social_post',
    channel: 'linkedin',
    title: 'Orphan',
    campaignId: null,
  });
  await store.upsertAsset({
    tenantId: 'default',
    id: 'linked',
    assetType: 'seo',
    channel: 'seo',
    title: 'SEO',
    campaignId: 'c1',
    status: 'pending_approval',
  });

  const link = await store.linkAssetsToCampaign({
    tenantId: 'default',
    campaignId: 'c1',
    assetIds: ['orphan', 'missing', 'linked'],
  });
  assert.equal(link.updatedCount, 1);

  const linked = await store.getAsset({ tenantId: 'default', id: 'orphan' });
  assert.equal(linked.campaignId, 'c1');

  const seoOnly = await store.listAssets({
    tenantId: 'default',
    campaignId: 'c1',
    assetType: 'seo',
    status: 'pending_approval',
  });
  assert.equal(seoOnly.length, 1);
  assert.equal(seoOnly[0].id, 'linked');

  const emptyApprove = await store.approveAssetsForCampaign({
    tenantId: 'default',
    campaignId: '',
    approvedBy: 'owner',
  });
  assert.equal(emptyApprove.approvedCount, 0);

  await store.approveAssetsForCampaign({ tenantId: 'default', campaignId: 'c1', approvedBy: 'owner' });
  const approvedList = await store.listAssets({ tenantId: 'default', campaignId: 'c1', status: 'approved' });
  assert.equal(approvedList.length, 2);
});

test('composeCmoMarketingCopilot full production path with pilot and orchestration', () => {
  const past = new Date(Date.now() - 7200000).toISOString();
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: {
      data: { summary: 'Q2 brief', topics: [{ topic: 'Admin' }], contentCalendar: [{ week: 1 }] },
      warnings: ['brief-warn'],
    },
    audienceOutput: { data: { segments: [{ label: 'Klinik' }] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [
          {
            id: 'launch-q2',
            name: 'Launch',
            readiness: 'ready',
            complianceCleared: true,
            status: 'approved',
            approvedAt: past,
          },
        ],
      },
      warnings: [],
    },
    socialOutput: {
      data: { posts: [{ id: 'p1', platform: 'linkedin', caption: 'Hej' }] },
      warnings: [],
    },
    seoOutput: { data: { articles: [{ id: 's1', title: 'Guide' }] }, warnings: [] },
    adOutput: { data: { ads: [{ id: 'a1', channel: 'google_ads' }] }, warnings: [] },
    emailOutput: { data: { emails: [{ id: 'e1', subject: 'Nyhetsbrev' }] }, warnings: [] },
    repurposeOutput: { data: { variants: [{ id: 'r1', format: 'carousel' }] }, warnings: [] },
    calendarOutput: { data: { weeklyPlan: [{ week: 2, topic: 'Launch', channel: 'linkedin' }] }, warnings: [] },
    scheduleOutput: {
      data: {
        scheduleItems: [
          {
            id: 'launch-q2',
            campaignId: 'launch-q2',
            platform: 'linkedin',
            proposedAt: past,
            status: 'proposed',
          },
        ],
        missedPublications: [{ campaignId: 'old', proposedAt: '2020-01-01' }],
      },
      warnings: [],
    },
    utmOutput: { data: { links: [{ url: 'https://arcana.test/?utm_source=linkedin' }] }, warnings: [] },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: [] },
    complianceOutput: { data: { status: 'passed', passed: true, clinicalGuard: { blocked: false } }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    enablementOutput: { data: { battlecards: [{ id: 'bc1' }] }, warnings: [] },
    crisisOutput: { data: { status: 'recommended', holdReason: 'Incident' }, warnings: [] },
    orchestrationSnapshot: {
      appConfig: {
        marketingPublishPilotEnabled: true,
        marketingAutoPublishPilotChannels: ['linkedin'],
        marketingPublishPilotMaxRiskLevel: 3,
      },
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      marketingBudget: { monthlyCap: 10000 },
      spendProposal: { amount: 2000 },
    },
    tenantId: 'default',
    correlationId: 'corr-1',
  });

  assert.equal(composed.data.outputType, 'MarketingCopilot');
  assert.equal(composed.data.mode, 'production_draft');
  assert.equal(composed.data.complianceGatePassed, true);
  assert.equal(composed.data.trackingGatePassed, true);
  assert.equal(composed.data.scheduleAllowed, true);
  assert.equal(composed.data.campaignReadyCount, 1);
  assert.equal(composed.data.contentAssetCount, 5);
  assert.equal(composed.data.pilotAutoPublishEligibleCount, 1);
  assert.equal(composed.data.autoPublish, false);
  assert.equal(composed.data.requiresOwnerApproval, true);
  assert.ok(composed.data.scheduleItems[0].pilotAutoPublishEligible);
  assert.match(composed.data.executiveSummary, /missade publiceringsdatum/);
  assert.match(composed.data.executiveSummary, /Crisis comms-hold/);
  assert.match(composed.data.executiveSummary, /battlecards/);
  assert.equal(composed.metadata.tenantId, 'default');
  assert.equal(composed.metadata.correlationId, 'corr-1');
  assert.equal(composed.metadata.version, '1.5.0');
});

test('composeCmoMarketingCopilot emits compliance and launch gate warnings', () => {
  const blocked = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [] }, warnings: [] },
    campaignOutput: { data: { campaigns: [{ id: 'c1', readiness: 'ready' }] }, warnings: [] },
    claimsOutput: { data: { passed: false, flaggedClaims: [{ severity: 'high' }] }, warnings: [] },
    complianceOutput: { data: { status: 'blocked', clinicalGuard: { blocked: true } }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 50, band: 'hold' },
      incidentSummary: { p0Open: 0, p1Open: 0 },
    },
  });
  assert.equal(blocked.data.complianceReview.status, 'blocked');
  assert.equal(blocked.data.scheduleAllowed, false);
  assert.ok(blocked.warnings.some((w) => w.includes('Compliance-gate blockerad')));
  assert.ok(blocked.data.campaigns[0].readiness === 'compliance_blocked' || blocked.data.campaigns[0].complianceBlocked);

  const needsOwner = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [] }, warnings: [] },
    campaignOutput: { data: { campaigns: [{ id: 'c2', readiness: 'ready' }] }, warnings: [] },
    complianceOutput: { data: { status: 'needs_owner' }, warnings: [] },
    trackingOutput: { data: { status: 'needs_owner', passed: false }, warnings: [] },
  });
  assert.ok(needsOwner.warnings.some((w) => w.includes('OWNER-granskning')));
  assert.equal(needsOwner.data.complianceReview.needsOwner, true);
});

test('composeCmoContentAdvisor mirrors marketing copilot output', () => {
  const { composeCmoContentAdvisor } = require('../../src/agents/cmoContentAgent');
  const advisor = composeCmoContentAdvisor({
    contentBriefOutput: { data: { summary: 'Advisor' }, warnings: [] },
    campaignOutput: { data: { campaigns: [] }, warnings: [] },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
  });
  assert.equal(advisor.data.outputType, 'MarketingCopilot');
  assert.match(advisor.data.executiveSummary, /Advisor/);
});

test('cmoContentAgent exports schemas and agent identity constants', () => {
  assert.equal(CMO_AGENT_NAME, 'CMO');
  assert.ok(cmoContentInputSchema.properties.mode.enum.includes('strategy_intel'));
  assert.ok(cmoContentOutputSchema.required.includes('warnings'));
  assert.match(CMO_DRAFT_DISCLAIMER, /OWNER-godkännande/);
});

test('composeCmoMarketingCopilot without orchestration uses brief calendar and merges warnings', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: {
      data: {
        summary: 'Minimal brief',
        topics: [{ topic: 'A' }, { topic: 'B' }],
        contentCalendar: [{ week: 3, topic: 'From brief' }],
      },
      warnings: ['brief-warning'],
    },
    campaignOutput: { data: { campaigns: [] }, warnings: ['campaign-warning'] },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: ['claims-warning'] },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    calendarOutput: { data: { weeklyPlan: [] }, warnings: [] },
    channel: 'slack',
    tenantId: '',
  });
  assert.equal(composed.data.scheduleAllowed, true);
  assert.equal(composed.data.orchestrationGates, null);
  assert.equal(composed.data.pauseAllExternalCampaigns, false);
  assert.equal(composed.data.contentCalendar.length, 1);
  assert.equal(composed.metadata.channel, 'slack');
  assert.equal(composed.metadata.tenantId, 'unknown');
  assert.ok(composed.warnings.includes('brief-warning'));
  assert.ok(composed.warnings.includes('claims-warning'));
  assert.match(composed.data.executiveSummary, /Minimal brief/);
  assert.equal(composed.data.topics.length, 2);
});

test('composeCmoMarketingCopilot applies budget and launch gate mutations on campaigns', () => {
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { summary: 'Gated' }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [
          {
            id: 'ready-1',
            readiness: 'ready',
            complianceCleared: true,
            launchBlocked: true,
          },
          {
            id: 'ready-2',
            readiness: 'ready',
            complianceCleared: true,
          },
        ],
      },
      warnings: [],
    },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 60, band: 'hold', goAllowed: false },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      marketingBudget: { monthlyCap: 5000 },
      spendProposal: { amount: 9000 },
    },
  });
  assert.equal(composed.data.campaignReadyCount, 0);
  assert.equal(composed.data.scheduleAllowed, false);
  assert.ok(composed.data.campaigns.every((c) => c.launchBlocked === true));
  assert.ok(
    composed.data.campaigns.some((c) => c.readiness === 'launch_gate_blocked')
  );
  assert.match(composed.data.executiveSummary, /Launch gate: blockerad/);
  assert.ok(composed.warnings.some((w) => w.includes('budgettak') || w.includes('Spend-förslag')));

  const budgetOnly = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { summary: 'Budget' }, warnings: [] },
    campaignOutput: {
      data: { campaigns: [{ id: 'b1', readiness: 'ready', complianceCleared: true }] },
      warnings: [],
    },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      marketingBudget: { monthlyCap: 1000 },
      spendProposal: { amount: 2500 },
    },
  });
  assert.equal(budgetOnly.data.campaigns[0].budgetGate, 'over_cap');
  assert.equal(budgetOnly.data.scheduleAllowed, false);
});

test('composeCmoMarketingCopilot counts approvedAt campaigns for publish policy', () => {
  const past = new Date(Date.now() - 3600000).toISOString();
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [{ id: 'by-date', approvedAt: past, readiness: 'ready' }],
      },
      warnings: [],
    },
    scheduleOutput: {
      data: {
        scheduleItems: [
          { campaignId: 'by-date', platform: 'linkedin', proposedAt: past, status: 'proposed' },
        ],
      },
      warnings: [],
    },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      tenantConfig: {
        marketing: {
          publishPolicy: { pilotEnabled: true, pilotChannels: ['linkedin'], pilotMaxRiskLevel: 3 },
        },
      },
      operationalReadiness: { score: 80, band: 'controlled_go' },
      incidentSummary: { p0Open: 0, p1Open: 0 },
    },
  });
  assert.equal(composed.data.pilotAutoPublishEligibleCount, 1);
  assert.equal(composed.data.publishPilotEnabled, true);
  assert.deepEqual(composed.data.pilotChannels, ['linkedin']);
});

test('composeCmoAnalyticsReport uses performance fallback summary when brief empty', () => {
  const analytics = composeCmoAnalyticsReport({
    performanceOutput: {
      data: {
        status: 'ok',
        summary: 'Performance OK',
        kpis: { ctr: { fresh: true, value: 0.02, source: 'meta' } },
        channelMix: [{ channel: 'meta', share: 1 }],
        underperformingAds: [],
        freshMetricCount: 3,
        staleMetricCount: 0,
        missingSources: [],
      },
      warnings: ['perf-warn'],
    },
    briefOutput: { data: {}, warnings: [] },
    windowDays: 14,
    correlationId: 'corr-analytics',
  });
  assert.equal(analytics.data.windowDays, 14);
  assert.equal(analytics.data.status, undefined);
  assert.equal(analytics.data.requiresOwnerApproval, false);
  assert.equal(analytics.metadata.agent, CMO_AGENT_NAME);
  assert.equal(analytics.metadata.correlationId, 'corr-analytics');
  assert.match(analytics.data.executiveSummary, /Performance OK/);
  assert.equal(analytics.data.recommendation, 'Ingen rekommendation utan färsk metric-data.');
  assert.ok(analytics.warnings.includes('perf-warn'));
});

test('composeCmoStrategyIntelReport handles empty connector and segment lists', () => {
  const strategy = composeCmoStrategyIntelReport({
    briefOutput: { data: {}, warnings: [] },
    audienceOutput: { data: { segments: [] }, warnings: [] },
    competitorOutput: { data: { competitors: [] }, warnings: [] },
    nurtureOutput: { data: { touches: [] }, warnings: [] },
    winbackOutput: { data: { touches: [] }, warnings: [] },
    connectorStatuses: [],
    channel: '',
  });
  assert.match(strategy.data.executiveSummary, /Ingen brief-data/);
  assert.equal(strategy.data.marketingConnectors.length, 0);
  assert.equal(strategy.metadata.channel, 'admin');
});

test('marketingCampaignDraftsStore normalizes defaults and preserves terminal rejected sync', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-norm-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  const defaulted = await store.upsertCampaign({ tenantId: 'default' });
  assert.equal(defaulted.name, 'Namnlös kampanj');
  assert.equal(defaulted.channel, 'email');
  assert.equal(defaulted.status, 'draft');
  assert.ok(defaulted.id.length > 8);

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'r1',
    campaigns: [{ id: 'rej', name: 'Reject me', readiness: 'ready' }],
    complianceReview: { status: 'passed' },
  });
  await store.rejectCampaign({ tenantId: 'default', id: 'rej', rejectedBy: 'owner' });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'r2',
    campaigns: [{ id: 'rej', name: 'New name attempt', readiness: 'ready' }],
  });
  const stillRejected = await store.getCampaign({ tenantId: 'default', id: 'rej' });
  assert.equal(stillRejected.status, 'rejected');
  assert.equal(stillRejected.name, 'New name attempt');

  const draftApproved = await store.upsertCampaign({
    tenantId: 'default',
    id: 'draft-approve',
    status: 'draft',
    readiness: 'draft',
  });
  const fromDraft = await store.approveCampaign({
    tenantId: 'default',
    id: 'draft-approve',
    approvedBy: '',
  });
  assert.equal(fromDraft.approvedBy, 'OWNER');
  assert.equal(fromDraft.status, 'approved');

  const defaultReject = await store.rejectCampaign({
    tenantId: 'default',
    id: 'draft-approve',
    rejectedBy: '',
    reason: '',
  });
  assert.equal(defaultReject.rejectionReason, 'Avvisad av OWNER.');
});

test('marketingCampaignDraftsStore schedule by id and external publish flag', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-sched-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  await store.upsertCampaign({ tenantId: 'default', id: 'sched-id', name: 'Sched' });

  const applied = await store.applyScheduleProposals({
    tenantId: 'default',
    scheduleItems: [
      {
        id: 'sched-id',
        proposedAt: '2026-07-01T08:00:00.000Z',
        timezone: 'Europe/Stockholm',
        windowLabel: 'morning',
        status: 'confirmed',
        publishPolicy: { publishMode: 'owner_approved_queue' },
      },
    ],
  });
  assert.equal(applied.updatedCount, 1);
  const item = await store.getCampaign({ tenantId: 'default', id: 'sched-id' });
  assert.equal(item.payload.publishSchedule.timezone, 'Europe/Stockholm');
  assert.equal(item.payload.publishSchedule.publishMode, 'owner_approved_queue');

  await store.approveCampaign({ tenantId: 'default', id: 'sched-id', approvedBy: 'owner' });
  const queued = await store.markPublishQueued({
    tenantId: 'default',
    id: 'sched-id',
    publishResult: { externalPublishInvoked: true, mode: 'live', queuedAt: '2026-07-01T09:00:00.000Z' },
  });
  assert.equal(queued.payload.publishSchedule.externalPublishInvoked, true);
  assert.equal(queued.payload.publishSchedule.publishQueueMode, 'live');
});

test('marketingCampaignDraftsStore isolates tenants and caps list limit', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-tenant-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  for (let i = 0; i < 3; i += 1) {
    await store.upsertCampaign({ tenantId: 'tenant-a', id: `a-${i}`, name: `A${i}` });
    await store.upsertCampaign({ tenantId: 'tenant-b', id: `b-${i}`, name: `B${i}` });
  }
  const tenantA = await store.listCampaigns({ tenantId: 'tenant-a', limit: 2 });
  assert.equal(tenantA.length, 2);
  assert.ok(tenantA.every((c) => c.tenantId === 'tenant-a'));
});

test('marketingContentAssetsStore upsert sync and archived terminal preservation', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-asset-term-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  const emptySync = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'empty',
    cmoData: {},
  });
  assert.equal(emptySync.syncedCount, 0);
  assert.deepEqual(emptySync.assetIds, []);

  const created = await store.upsertAsset({
    tenantId: 'default',
    id: 'asset-1',
    title: 'First',
    assetType: 'social_post',
    channel: 'linkedin',
    status: 'draft',
  });
  assert.equal(created.version, 1);
  assert.equal(created.requiresOwnerApproval, true);

  await store.upsertAsset({
    tenantId: 'default',
    id: 'asset-1',
    title: 'Second',
    body: 'Updated body',
  });
  const updated = await store.getAsset({ tenantId: 'default', id: 'asset-1' });
  assert.equal(updated.version, 2);
  assert.equal(updated.body, 'Updated body');

  await store.upsertAsset({
    tenantId: 'default',
    id: 'asset-archived',
    status: 'archived',
    assetType: 'mail',
    channel: 'email',
    title: 'Old mail',
    campaignId: 'c-arch',
  });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'sync-arch',
    cmoData: {
      emailDrafts: {
        emails: [{ id: 'asset-archived', subject: 'Should not reopen', body: 'x' }],
      },
    },
  });
  const archived = await store.getAsset({ tenantId: 'default', id: 'asset-archived' });
  assert.equal(archived.status, 'archived');
  assert.match(archived.title, /Should not reopen|Old mail/);
});

function buildRichComposeInput(overrides = {}) {
  return {
    contentBriefOutput: {
      data: {
        summary: 'Rich summary',
        topics: [{ topic: 'T1' }],
        contentCalendar: [{ week: 1, topic: 'Brief cal' }],
      },
      warnings: [],
    },
    audienceOutput: {
      data: { segments: [{ label: 'Klinikledare', size: 'M' }] },
      warnings: [],
    },
    campaignOutput: {
      data: {
        campaigns: [
          { id: 'c1', readiness: 'ready', name: 'C1' },
          { id: 'c2', readiness: 'ready', name: 'C2', complianceCleared: true },
        ],
      },
      warnings: [],
    },
    socialOutput: { data: { posts: [{ id: 'p1' }, { id: 'p2' }] }, warnings: [] },
    seoOutput: { data: { articles: [{ id: 's1' }] }, warnings: [] },
    adOutput: { data: { ads: [{ id: 'a1' }] }, warnings: [] },
    emailOutput: { data: { emails: [{ id: 'e1' }] }, warnings: [] },
    repurposeOutput: { data: { variants: [{ id: 'r1' }] }, warnings: [] },
    calendarOutput: { data: { weeklyPlan: [{ week: 9, topic: 'Proposed cal' }] }, warnings: [] },
    scheduleOutput: {
      data: {
        scheduleItems: [{ campaignId: 'c1', platform: 'linkedin', proposedAt: '2026-06-01' }],
        missedPublications: [],
      },
      warnings: [],
    },
    utmOutput: { data: { links: [{ url: 'https://x.test' }] }, warnings: [] },
    claimsOutput: { data: { passed: true, flaggedClaims: [], approvedMatches: ['claim-a'] }, warnings: [] },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    enablementOutput: { data: { battlecards: [{ id: 'bc1' }] }, warnings: [] },
    crisisOutput: { data: { status: 'clear' }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 0, p1Open: 0 },
    },
    channel: 'api',
    tenantId: 'tenant-x',
    correlationId: 'corr-rich',
    ...overrides,
  };
}

test('composeCmoMarketingCopilot empty inputs still returns stable marketing copilot shape', () => {
  const composed = composeCmoMarketingCopilot({});
  assert.equal(composed.data.outputType, 'MarketingCopilot');
  assert.equal(composed.data.mode, 'production_draft');
  assert.equal(composed.data.contentAssetCount, 0);
  assert.equal(composed.data.campaignReadyCount, 0);
  assert.equal(composed.data.autoPublish, false);
  assert.match(composed.data.executiveSummary, /Ingen content-data tillgänglig/);
  assert.equal(composed.metadata.agent, CMO_AGENT_NAME);
  assert.equal(composed.metadata.sources.length, 21);
});

test('composeCmoMarketingCopilot rich path fills executive summary and asset counts', () => {
  const composed = composeCmoMarketingCopilot(buildRichComposeInput());
  assert.equal(composed.data.contentCalendar[0].week, 9);
  assert.equal(composed.data.campaignReadyCount, 2);
  assert.equal(composed.data.contentAssetCount, 6);
  assert.equal(composed.data.productionCounts.socialPosts, 2);
  assert.deepEqual(composed.data.flaggedClaims, []);
  assert.ok(composed.data.complianceReview.approvedMatches.includes('claim-a'));
  assert.match(composed.data.executiveSummary, /Rich summary/);
  assert.match(composed.data.executiveSummary, /1 målgruppssegment \(högst: Klinikledare\)/);
  assert.match(composed.data.executiveSummary, /2 kampanjförslag \(2 compliance-klara\)/);
  assert.match(composed.data.executiveSummary, /Content-kalender: 1 planerade inlägg/);
  assert.match(composed.data.executiveSummary, /Publiceringsschema: 1 förslag/);
  assert.match(composed.data.executiveSummary, /UTM-pack: 1 länkar/);
  assert.match(composed.data.executiveSummary, /Produktion: 2 social, 1 SEO, 1 ads, 1 mail/);
  assert.match(composed.data.executiveSummary, /Compliance: passed/);
  assert.match(composed.data.executiveSummary, /Tracking: passed/);
  assert.match(composed.data.executiveSummary, /Sales enablement: 1 battlecards/);
  assert.equal(composed.data.disclaimer, CMO_DRAFT_DISCLAIMER);
  assert.equal(composed.metadata.tenantId, 'tenant-x');
  assert.equal(composed.metadata.correlationId, 'corr-rich');
});

test('composeCmoMarketingCopilot incident pause and blocked production packs', () => {
  const incident = composeCmoMarketingCopilot(
    buildRichComposeInput({
      orchestrationSnapshot: {
        operationalReadiness: { score: 90, band: 'controlled_go' },
        incidentSummary: { p0Open: 2, p1Open: 1 },
      },
    })
  );
  assert.equal(incident.data.pauseAllExternalCampaigns, true);
  assert.match(incident.data.executiveSummary, /Incident-paus/);
  assert.ok(incident.warnings.some((w) => w.includes('P0')));

  const blocked = composeCmoMarketingCopilot(
    buildRichComposeInput({
      complianceOutput: { data: { status: 'blocked' }, warnings: [] },
      trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    })
  );
  assert.equal(blocked.data.socialPostPack.posts[0].status, 'compliance_blocked');
  assert.equal(blocked.data.adCopyPack.ads[0].status, 'compliance_blocked');
  assert.equal(blocked.data.emailDrafts.emails[0].status, 'compliance_blocked');
  assert.ok(blocked.warnings.some((w) => w.includes('Compliance-gate blockerad')));
});

test('composeCmoMarketingCopilot derives compliance from claims when review status missing', () => {
  const composed = composeCmoMarketingCopilot(
    buildRichComposeInput({
      complianceOutput: { data: {}, warnings: [] },
      claimsOutput: {
        data: { passed: true, flaggedClaims: [{ severity: 'low', claim: 'test' }] },
        warnings: [],
      },
    })
  );
  assert.equal(composed.data.complianceReview.status, 'needs_owner');
  assert.equal(composed.data.complianceReview.needsOwner, true);
  assert.equal(composed.data.scheduleAllowed, false);
});

test('composeCmoAnalyticsReport prefers brief recommendation when performance ok', () => {
  const analytics = composeCmoAnalyticsReport({
    performanceOutput: {
      data: {
        status: 'ok',
        underperformingAds: [{ channel: 'meta' }],
        kpis: {},
        channelMix: [],
        freshMetricCount: 1,
      },
      warnings: [],
    },
    briefOutput: {
      data: {
        status: 'ok',
        recommendation: 'OWNER ska pausa meta.',
        executiveSummary: 'Brief executive',
      },
      warnings: [],
    },
  });
  assert.equal(analytics.data.recommendation, 'OWNER ska pausa meta.');
  assert.equal(analytics.data.executiveSummary, 'Brief executive');
  assert.equal(analytics.data.requiresOwnerApproval, true);
});

test('summarizeMarketingPerformance pickBestMetric prefers freshest CTR source', () => {
  const older = freshFetchedAt(3600_000);
  const newer = freshFetchedAt(60_000);
  const summary = summarizeMarketingPerformance({
    marketingPerformance: {
      channels: {
        a: {
          source: 'meta',
          fetchedAt: newer,
          metrics: {
            ctr: { value: 0.03, fetchedAt: newer, source: 'meta' },
          },
        },
        b: {
          source: 'linkedin',
          fetchedAt: older,
          metrics: {
            ctr: { value: 0.01, fetchedAt: older, source: 'linkedin' },
          },
        },
      },
    },
  });
  assert.equal(summary.kpis.ctr.value, 0.03);
  assert.equal(summary.kpis.ctr.source, 'meta');
});

test('cmoComplianceGate clinical scan and snapshot collector', () => {
  const scan = runClinicalGuardScan('Vi garanterar botemedel och lovar 100% botemedel.');
  assert.equal(typeof scan.blocked, 'boolean');

  const collected = collectSnapshotForCompliance({
    socialPostPack: { posts: [{ caption: 'Arcana för kliniker' }] },
    adCopyPack: { ads: [{ headline: 'Demo' }] },
  });
  assert.ok(collected.texts.length >= 1);
  assert.ok(collected.combinedText.length > 0);
});

test('buildComplianceReviewFromRuns respects explicit review status over validate', () => {
  const review = buildComplianceReviewFromRuns({
    validateClaimsOutput: { data: { passed: false, flaggedClaims: [] } },
    reviewComplianceOutput: { data: { status: 'passed' } },
  });
  assert.equal(review.status, 'passed');
  assert.equal(review.passed, true);
});

test('marketingCampaignDraftsStore persists to disk and patch status field', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-persist-'));
  const filePath = path.join(tmpDir, 'drafts.json');
  const store1 = await createMarketingCampaignDraftsStore({ filePath });
  await store1.syncFromCmoOutput({
    tenantId: 't1',
    agentRunId: 'run-p',
    campaigns: [{ id: 'persist', name: 'Persist', readiness: 'ready' }],
    complianceReview: { status: 'needs_owner' },
  });

  const store2 = await createMarketingCampaignDraftsStore({ filePath });
  const loaded = await store2.getCampaign({ tenantId: 't1', id: 'persist' });
  assert.equal(loaded.complianceStatus, 'needs_owner');
  assert.equal(loaded.status, 'pending_approval');

  const patched = await store2.patchCampaign({
    tenantId: 't1',
    id: 'persist',
    fields: { status: 'draft', owner: 'bob' },
    changedBy: 'bob',
  });
  assert.deepEqual(patched.updatedFields, ['owner', 'status']);
  assert.equal(patched.item.status, 'draft');
  assert.equal(patched.item.owner, 'bob');
});

test('marketingContentAssetsStore persists and filters by tenant', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-mut-asset-persist-'));
  const filePath = path.join(tmpDir, 'assets.json');
  const store1 = await createMarketingContentAssetsStore({ filePath });
  await store1.upsertAsset({
    tenantId: 't1',
    id: 'a1',
    assetType: 'social_post',
    channel: 'linkedin',
    title: 'T1 asset',
    campaignId: 'c1',
  });
  await store1.upsertAsset({
    tenantId: 't2',
    id: 'a1',
    assetType: 'social_post',
    channel: 'linkedin',
    title: 'T2 asset',
    campaignId: 'c2',
  });

  const store2 = await createMarketingContentAssetsStore({ filePath });
  const t1 = await store2.listAssets({ tenantId: 't1' });
  assert.equal(t1.length, 1);
  assert.equal(t1[0].title, 'T1 asset');
  assert.equal(await store2.getAsset({ tenantId: 't1', id: 'missing' }), null);
});

test('composeCmoStrategyIntelReport summarizes connector health and nurture/winback counts', () => {
  const strategy = composeCmoStrategyIntelReport({
    briefOutput: { data: { summary: 'Intel brief' }, warnings: ['dup', 'dup'] },
    audienceOutput: { data: { segments: [{ label: 'SMB' }, { label: 'Enterprise' }] }, warnings: [] },
    competitorOutput: { data: { competitors: [{ name: 'A' }, { name: 'B' }] }, warnings: [] },
    nurtureOutput: { data: { touches: [{ step: 1 }, { step: 2 }] }, warnings: [] },
    winbackOutput: { data: { touches: [{ step: 1 }] }, warnings: [] },
    connectorStatuses: [{ status: 'ok' }, { status: 'ok' }, { status: 'error' }],
    correlationId: 'intel-corr',
  });
  assert.match(strategy.data.executiveSummary, /2\/3 aktiva/);
  assert.match(strategy.data.executiveSummary, /2 målgruppssegment/);
  assert.match(strategy.data.executiveSummary, /2 konkurrentprofiler/);
  assert.match(strategy.data.executiveSummary, /Nurture: 2 touches/);
  assert.match(strategy.data.executiveSummary, /Winback: 1 touches/);
  assert.equal(strategy.metadata.correlationId, 'intel-corr');
  assert.equal(strategy.warnings.length, 1);
});

test('composeCmoMarketingCopilot dedupes warnings and flags crisis plus missed publications', () => {
  const composed = composeCmoMarketingCopilot(
    buildRichComposeInput({
      contentBriefOutput: {
        data: { summary: 'Warn test', topics: [] },
        warnings: ['shared-warn', 'shared-warn'],
      },
      scheduleOutput: {
        data: {
          scheduleItems: [],
          missedPublications: [{ id: 'm1' }, { id: 'm2' }],
        },
        warnings: ['shared-warn'],
      },
      crisisOutput: { data: { status: 'recommended' }, warnings: [] },
    })
  );
  assert.equal(composed.warnings.filter((w) => w === 'shared-warn').length, 1);
  assert.match(composed.data.executiveSummary, /2 missade publiceringsdatum/);
  assert.match(composed.data.executiveSummary, /Crisis comms-hold rekommenderas/);
  assert.equal(composed.data.crisisCommsHold.status, 'recommended');
});

test('buildChannelMix calculates spend share and detectUnderperformingAds skips healthy ads', () => {
  const fresh = freshFetchedAt();
  const summary = summarizeMarketingPerformance({
    marketingPerformance: {
      channels: {
        meta: {
          source: 'meta',
          fetchedAt: fresh,
          metrics: {
            ctr: { value: 0.03, fetchedAt: fresh, source: 'meta' },
            cpc: { value: 2, fetchedAt: fresh, source: 'meta' },
          },
          spend: { value: 750, fetchedAt: fresh, source: 'meta' },
        },
        google_ads: {
          source: 'google_ads',
          fetchedAt: fresh,
          metrics: {
            ctr: { value: 0.02, fetchedAt: fresh, source: 'google_ads' },
            cpc: { value: 3, fetchedAt: fresh, source: 'google_ads' },
          },
          spend: { value: 250, fetchedAt: fresh, source: 'google_ads' },
        },
      },
    },
  });
  assert.equal(summary.status, 'ok');
  assert.equal(summary.staleMetricCount, 0);
  const metaMix = summary.channelMix.find((item) => item.channel === 'meta');
  assert.equal(metaMix.evidence, 'fresh_spend');
  assert.equal(metaMix.share, 0.75);

  const healthy = detectUnderperformingAds(
    collectChannelMetrics({
      marketingPerformance: {
        channels: {
          meta: {
            source: 'meta',
            fetchedAt: fresh,
            metrics: {
              ctr: { value: 0.03, fetchedAt: fresh },
              cpc: { value: 2, fetchedAt: fresh },
            },
          },
        },
      },
    })
  );
  assert.equal(healthy.length, 0);

  const metric = normalizeMetric(
    { value: 12.5, unit: 'SEK', label: 'CPC', fetchedAt: fresh, source: 'meta' },
    'meta'
  );
  assert.equal(metric.unit, 'SEK');
  assert.equal(metric.label, 'CPC');
});

test('buildPublishGateContext rejects truthy non-boolean gate flags', () => {
  const loose = buildPublishGateContext({
    scheduleAllowed: 'yes',
    compliancePassed: 1,
    campaignApproved: 'approved',
    pauseAllExternal: 'true',
    orchestrationBlocked: {},
  });
  assert.equal(loose.scheduleAllowed, false);
  assert.equal(loose.compliancePassed, false);
  assert.equal(loose.campaignApproved, false);
  assert.equal(loose.pauseAllExternal, false);
  assert.equal(loose.orchestrationBlocked, false);
});

test('applyComplianceGateToProductionPacks sets needs_compliance_owner on posts', () => {
  const packs = applyComplianceGateToProductionPacks({
    socialPostPack: { posts: [{ id: 'p1', status: 'ready' }] },
    adCopyPack: { ads: [] },
    emailDrafts: { emails: [] },
    complianceReview: { status: 'needs_owner' },
  });
  assert.equal(packs.socialPostPack.posts[0].status, 'needs_compliance_owner');
  assert.equal(packs.socialPostPack.posts[0].complianceGate, 'needs_owner');
});

test('composeCmoAnalyticsReport metadata version and monitoring recommendation path', () => {
  const analytics = composeCmoAnalyticsReport({
    performanceOutput: {
      data: {
        status: 'ok',
        summary: 'Perf summary',
        underperformingAds: [],
        kpis: { ctr: { fresh: true, value: 0.02, source: 'meta' } },
        channelMix: [],
        freshMetricCount: 2,
        staleMetricCount: 0,
        missingSources: [],
      },
      warnings: [],
    },
    briefOutput: {
      data: {
        status: 'ok',
        recommendation: 'Ingen åtgärd rekommenderas utöver fortsatt övervakning.',
        executiveSummary: 'Veckorapport OK',
      },
      warnings: [],
    },
    period: 'weekly',
    tenantId: 't1',
  });
  assert.equal(analytics.metadata.version, '1.4.0');
  assert.equal(analytics.data.requiresOwnerApproval, false);
  assert.equal(analytics.data.recommendation, 'Ingen åtgärd rekommenderas utöver fortsatt övervakning.');
  assert.equal(analytics.metadata.tenantId, 't1');
});
