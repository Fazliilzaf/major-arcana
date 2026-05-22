const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCmoLaunchGate,
  evaluateCooIncidentCampaignPause,
  evaluateCfoBudgetGate,
  applyCmoOrchestrationGates,
  buildOrchestrationSnapshotFromHydration,
} = require('../../src/ops/cmoOrchestrationGate');
const { GenerateSalesEnablementPackCapability } = require('../../src/capabilities/generateSalesEnablementPack');
const { ProposeCrisisCommsHoldCapability } = require('../../src/capabilities/proposeCrisisCommsHold');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const {
  inferIntent,
  INTENTS,
  runAdminOrchestration,
  MARKETING_PRIMARY_INTENTS,
} = require('../../src/orchestrator/adminOrchestrator');

test('inferIntent detects marketing_campaign from campaign keywords', () => {
  const inference = inferIntent('Planera Q2 outreach-kampanj med UTM och publiceringsschema');
  assert.equal(inference.intent, INTENTS.MARKETING_CAMPAIGN);
  assert.ok(inference.confidence >= 0.8);
});

test('evaluateCmoLaunchGate blocks launch when readiness is below threshold', () => {
  const gate = evaluateCmoLaunchGate({ score: 68, band: 'no_go', goAllowed: false });
  assert.equal(gate.blocked, true);
  assert.equal(gate.allowed, false);
});

test('evaluateCooIncidentCampaignPause requires pause on open P0/P1', () => {
  const pause = evaluateCooIncidentCampaignPause({ p0Open: 1, p1Open: 0 });
  assert.equal(pause.required, true);
  assert.equal(pause.actionType, 'pause_all_external_campaigns');
});

test('evaluateCfoBudgetGate requires owner approval when spend exceeds cap', () => {
  const gate = evaluateCfoBudgetGate({
    marketingBudget: { monthlyCap: 50000, currency: 'SEK' },
    spendProposal: { amount: 62000 },
  });
  assert.equal(gate.requiresOwnerApproval, true);
  assert.equal(gate.allowed, false);
});

test('applyCmoOrchestrationGates blocks schedule and marks campaigns paused on incidents', () => {
  const result = applyCmoOrchestrationGates({
    campaigns: [{ id: 'c1', readiness: 'ready', complianceCleared: true }],
    scheduleAllowed: true,
    snapshot: {
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 1, p1Open: 0 },
    },
  });
  assert.equal(result.scheduleAllowed, false);
  assert.equal(result.pauseAllExternalCampaigns, true);
  assert.equal(result.campaigns[0].readiness, 'paused_incident');
});

test('GenerateSalesEnablementPack returns shared MQL/SQL definitions and battlecards', async () => {
  const capability = new GenerateSalesEnablementPackCapability();
  const result = await capability.execute({
    input: { maxBattlecards: 2 },
    systemStateSnapshot: {
      tenantConfig: { assistantName: 'Arcana Clinic' },
      audienceSegments: [{ id: 'seg-1', label: 'Klinikledning', persona: 'VD' }],
    },
  });
  assert.equal(result.data.outputType, 'SalesEnablementPack');
  assert.ok(result.data.mqlDefinition);
  assert.ok(result.data.sqlDefinition);
  assert.ok(result.data.battlecards.length >= 1);
  assert.equal(result.data.autoPublish, false);
});

test('ProposeCrisisCommsHold recommends hold when P0 incidents are open', async () => {
  const capability = new ProposeCrisisCommsHoldCapability();
  const result = await capability.execute({
    input: { scenario: 'operational_incident' },
    systemStateSnapshot: {
      tenantConfig: { assistantName: 'Arcana Clinic' },
      incidentSummary: { p0Open: 2, p1Open: 1 },
    },
  });
  assert.equal(result.data.outputType, 'CrisisCommsHold');
  assert.equal(result.data.status, 'recommended');
  assert.equal(result.data.autoSend, false);
  assert.equal(result.data.pauseAllExternalCampaigns, true);
});

test('composeCmoMarketingCopilot applies orchestration gates in output', () => {
  const composed = composeCmoMarketingCopilot({
    campaignOutput: {
      data: {
        campaigns: [{ id: 'c1', readiness: 'ready', complianceCleared: true }],
      },
    },
    complianceOutput: { data: { status: 'passed', passed: true, flaggedClaims: [] }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 60, band: 'no_go', goAllowed: false },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      marketingBudget: { monthlyCap: 10000 },
      spendProposal: { amount: 15000 },
    },
  });
  assert.ok(composed.data.orchestrationGates);
  assert.equal(composed.data.orchestrationGates.launchGate.blocked, true);
  assert.equal(composed.data.orchestrationGates.budgetGate.requiresOwnerApproval, true);
  assert.equal(composed.data.scheduleAllowed, false);
});

test('executive feed surfaces pause_all_external_campaigns and budget gate actions', () => {
  const feed = createExecutiveDecisionFeed();
  const items = feed.addFromAgentOutput({
    agent: 'CMO',
    tenantId: 'tenant-a',
    output: {
      data: {
        pauseAllExternalCampaigns: true,
        orchestrationGates: {
          incidentPause: {
            required: true,
            p0Open: 1,
            p1Open: 0,
            recommendation: 'Pausa externa kampanjer',
            reason: '1 P0 incident',
          },
          budgetGate: {
            requiresOwnerApproval: true,
            reason: 'Over cap',
            cap: 50000,
            proposed: 62000,
          },
          launchGate: { blocked: true, reason: 'Low readiness', score: 60, band: 'no_go' },
        },
        campaigns: [],
        executiveSummary: 'Test summary',
      },
    },
  });
  assert.ok(items.some((item) => item.actionType === 'pause_all_external_campaigns'));
  assert.ok(items.some((item) => item.actionType === 'approve_marketing_budget'));
  assert.ok(items.some((item) => item.actionType === 'review_go_nogo'));
});

test('runAdminOrchestration marketing execute preview recommends CMO agent run', async () => {
  const result = await runAdminOrchestration({
    prompt: 'Skapa marketing campaign med ads och UTM-pack',
    role: 'OWNER',
    tenantId: 'tenant-a',
    tenantConfig: { assistantName: 'Arcana' },
    mode: 'plan',
  });
  assert.equal(result.intent, INTENTS.MARKETING_CAMPAIGN);
  assert.ok(MARKETING_PRIMARY_INTENTS.has(result.intent));
  assert.ok(result.selectedAgents.includes('CMO'));
  assert.equal(result.executePreview.recommendedAgentRun.agent, 'CMO');
});

test('buildOrchestrationSnapshotFromHydration attaches readiness and orchestrator context', async () => {
  const snapshot = await buildOrchestrationSnapshotFromHydration({
    baseSnapshot: { tenantConfig: { assistantName: 'Arcana' } },
    intent: 'marketing_campaign',
    prompt: 'Launch campaign',
    buildReadiness: async () => ({ score: 82, band: 'limited_beta', goAllowed: false }),
  });
  assert.equal(snapshot.orchestratorContext.intent, 'marketing_campaign');
  assert.equal(snapshot.operationalReadiness.score, 82);
  assert.equal(snapshot.ccoCommercialHandoff.battlecardRequested, true);
});
