const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const { createMarketingCampaignDraftsStore } = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const { getAgentBundleByName } = require('../../src/capabilities/registry');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function createRequireAuth(role = 'OWNER') {
  return (req, _res, next) => {
    req.auth = {
      tenantId: 'default',
      userId: 'owner-1',
      role,
    };
    next();
  };
}

function createRequireRole(...roles) {
  const allowed = new Set(roles.map((item) => String(item || '').toUpperCase()));
  return (req, res, next) => {
    const role = String(req.auth?.role || '').toUpperCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ error: 'Du saknar behörighet för detta.' });
    }
    return next();
  };
}

function buildCompliantCmoOutput() {
  return composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [{ topic: 'Launch' }], summary: 'Brief' }, warnings: [] },
    audienceOutput: { data: { segments: [{ id: 'seg-1', label: 'Klinikledning' }] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [{ id: 'launch-q2', name: 'Q2 Launch', readiness: 'ready', channel: 'email' }],
      },
      warnings: [],
    },
    socialOutput: { data: { posts: [{ id: 's1', platform: 'linkedin' }] }, warnings: [] },
    seoOutput: { data: { articles: [] }, warnings: [] },
    adOutput: { data: { ads: [] }, warnings: [] },
    emailOutput: { data: { emails: [] }, warnings: [] },
    repurposeOutput: { data: { variants: [] }, warnings: [] },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: [] },
    complianceOutput: {
      data: { status: 'passed', passed: true, clinicalGuard: { blocked: false, hits: [] }, checks: [] },
      warnings: [],
    },
    calendarOutput: { data: { weeklyPlan: [{ week: 1, topic: 'Launch' }] }, warnings: [] },
    scheduleOutput: {
      data: {
        scheduleItems: [{ id: 'sch-1', platform: 'email', proposedAt: '2026-06-01T09:00:00.000Z' }],
        missedPublications: [],
      },
      warnings: [],
    },
    utmOutput: {
      data: {
        links: [
          {
            id: 'utm-1',
            url: 'https://arcana.test/?utm_source=email&utm_medium=newsletter&utm_campaign=launch-q2',
          },
        ],
      },
      warnings: [],
    },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 0, p1Open: 0 },
      marketingBudget: { monthlyCap: 50000 },
      spendProposal: { amount: 10000 },
    },
  });
}

test('E2E: CMO compose → sync drafts → approve → resolve executive feed', async () => {
  const composed = buildCompliantCmoOutput();
  assert.equal(composed.data.complianceGatePassed, true);
  assert.equal(composed.data.autoPublish, false);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-phase-g-e2e-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  const sync = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-e2e-1',
    campaigns: composed.data.campaigns,
    complianceReview: composed.data.complianceReview,
  });
  assert.equal(sync.syncedCount, 1);
  assert.deepEqual(sync.pendingApprovalIds, ['launch-q2']);

  const feed = createExecutiveDecisionFeed();
  const feedItems = feed.addFromAgentOutput({
    agent: 'CMO',
    output: composed,
    tenantId: 'default',
    marketingDraftIds: sync.pendingApprovalIds,
  });
  const approveFeedEntry = feedItems.find((item) => item.actionType === 'approve_campaigns');
  assert.ok(approveFeedEntry);
  assert.equal(approveFeedEntry.status, 'pending');

  const app = express();
  app.use(express.json());
  app.use(
    createMarketingWorkspaceRouter({
      authStore: null,
      marketingCampaignDraftsStore: store,
      requireAuth: createRequireAuth('OWNER'),
      requireRole: createRequireRole,
    })
  );

  await withServer(app, async (baseUrl) => {
    const approveRes = await fetch(`${baseUrl}/marketing/campaigns/launch-q2/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const approveBody = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approveBody.item.status, 'approved');
  });

  const resolved = feed.resolve({
    entryId: approveFeedEntry.id,
    resolvedBy: 'owner-1',
    resolution: 'acknowledged',
  });
  assert.ok(resolved);
  assert.equal(resolved.status, 'acknowledged');
  assert.equal(resolved.resolvedBy, 'owner-1');

  const campaign = await store.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.equal(campaign.status, 'approved');
});

test('automation step 2 go/no-go: no auto-publish and schedule blocked by orchestration gates', () => {
  const allowed = buildCompliantCmoOutput();
  assert.equal(allowed.data.autoPublish, false);
  assert.equal(allowed.data.requiresOwnerApproval, true);
  assert.equal(allowed.data.scheduleAllowed, true);

  const blocked = composeCmoMarketingCopilot({
    campaignOutput: {
      data: { campaigns: [{ id: 'c1', readiness: 'ready', complianceCleared: true }] },
      warnings: [],
    },
    complianceOutput: {
      data: { status: 'passed', passed: true, flaggedClaims: [] },
      warnings: [],
    },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    orchestrationSnapshot: {
      operationalReadiness: { score: 60, band: 'no_go', goAllowed: false },
      incidentSummary: { p0Open: 1, p1Open: 0 },
      marketingBudget: { monthlyCap: 10000 },
      spendProposal: { amount: 15000 },
    },
  });

  assert.equal(blocked.data.autoPublish, false);
  assert.equal(blocked.data.scheduleAllowed, false);
  assert.equal(blocked.data.pauseAllExternalCampaigns, true);
  assert.equal(blocked.data.orchestrationGates.launchGate.blocked, true);
});

test('CMO bundle version and capability count match Fas G contract baseline', () => {
  const bundle = getAgentBundleByName('CMO');
  assert.equal(bundle.version, '2.0.0');
  assert.ok(bundle.capabilities.length >= 21);
  assert.ok(bundle.capabilities.includes('AnalyzeCompetitorLandscape'));
  assert.ok(bundle.capabilities.includes('GenerateNurtureSequence'));
  assert.ok(bundle.capabilities.includes('GenerateWinbackCampaign'));
});
