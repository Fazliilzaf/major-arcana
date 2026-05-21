const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMarketingCampaignDraftsStore } = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');
const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');

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

test('marketingCampaignDraftsStore syncs CMO campaigns and preserves approved status', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-phase-c-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  const firstSync = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-1',
    campaigns: [
      { id: 'c1', name: 'Launch', readiness: 'ready', channel: 'email' },
      { id: 'c2', name: 'Blocked', readiness: 'compliance_blocked', channel: 'email' },
    ],
    complianceReview: { status: 'needs_owner' },
  });

  assert.equal(firstSync.syncedCount, 2);
  assert.deepEqual(firstSync.pendingApprovalIds, ['c1']);

  const approved = await store.approveCampaign({
    tenantId: 'default',
    id: 'c1',
    approvedBy: 'owner-1',
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.version, 2);

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-2',
    campaigns: [{ id: 'c1', name: 'Launch v2', readiness: 'ready', channel: 'email' }],
    complianceReview: { status: 'passed' },
  });

  const afterResync = await store.getCampaign({ tenantId: 'default', id: 'c1' });
  assert.equal(afterResync.status, 'approved');
  assert.equal(afterResync.name, 'Launch v2');
});

test('marketing workspace approve/reject/patch routes work', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-phase-c-api-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-api',
    campaigns: [{ id: 'launch', name: 'Launch', readiness: 'ready', channel: 'email' }],
    complianceReview: { status: 'passed' },
  });

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
    const listRes = await fetch(`${baseUrl}/marketing/campaigns?status=pending_approval`);
    const listBody = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(listBody.items.length, 1);

    const patchRes = await fetch(`${baseUrl}/marketing/campaigns/launch`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: 'OWNER' }),
    });
    const patchBody = await patchRes.json();
    assert.equal(patchRes.status, 200);
    assert.deepEqual(patchBody.updatedFields, ['owner']);

    const approveRes = await fetch(`${baseUrl}/marketing/campaigns/launch/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const approveBody = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approveBody.item.status, 'approved');
    assert.equal(approveBody.item.approvedBy, 'owner-1');

    await store.syncFromCmoOutput({
      tenantId: 'default',
      agentRunId: 'run-reject',
      campaigns: [{ id: 'reject-me', name: 'Reject', readiness: 'ready', channel: 'email' }],
      complianceReview: { status: 'passed' },
    });

    const rejectRes = await fetch(`${baseUrl}/marketing/campaigns/reject-me/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Copy behöver justeras' }),
    });
    const rejectBody = await rejectRes.json();
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectBody.item.status, 'rejected');
    assert.equal(rejectBody.item.rejectionReason, 'Copy behöver justeras');
  });
});

test('approve is blocked for compliance_blocked campaigns', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-phase-c-block-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-block',
    campaigns: [{ id: 'blocked', name: 'Blocked', readiness: 'compliance_blocked', channel: 'email' }],
    complianceReview: { status: 'blocked' },
  });

  await assert.rejects(
    () =>
      store.approveCampaign({
        tenantId: 'default',
        id: 'blocked',
        approvedBy: 'owner-1',
      }),
    (error) => error.code === 'COMPLIANCE_BLOCKED'
  );
});

test('executive feed approve_campaigns includes synced draftIds', () => {
  const feed = createExecutiveDecisionFeed();
  const composed = composeCmoMarketingCopilot({
    contentBriefOutput: { data: { topics: [], summary: 'Brief' }, warnings: [] },
    audienceOutput: { data: { segments: [] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [
          { id: 'c-ready', readiness: 'ready', name: 'Ready campaign' },
          { id: 'c-blocked', readiness: 'compliance_blocked', name: 'Blocked campaign' },
        ],
      },
      warnings: [],
    },
    socialOutput: { data: { posts: [] }, warnings: [] },
    seoOutput: { data: { articles: [] }, warnings: [] },
    adOutput: { data: { ads: [] }, warnings: [] },
    emailOutput: { data: { emails: [] }, warnings: [] },
    repurposeOutput: { data: { variants: [] }, warnings: [] },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: [] },
    complianceOutput: {
      data: { status: 'passed', clinicalGuard: { blocked: false, hits: [] }, checks: [] },
      warnings: [],
    },
  });

  const items = feed.addFromAgentOutput({
    agent: 'CMO',
    output: composed,
    tenantId: 'default',
    marketingDraftIds: ['c-ready'],
  });

  const approveEntry = items.find((item) => item.actionType === 'approve_campaigns');
  assert.ok(approveEntry);
  assert.deepEqual(approveEntry.context.draftIds, ['c-ready']);
  assert.equal(approveEntry.actionEndpoint, '/api/v1/marketing/campaigns');
});
