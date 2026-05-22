'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMarketingCampaignDraftsStore, mapReadinessToStatus } = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingContentAssetsStore } = require('../../src/ops/marketingContentAssetsStore');
const { syncMarketingWorkspaceFromCmoOutput } = require('../../src/ops/cmoMarketingWorkspaceSync');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');

function buildWorkspaceCmoOutput() {
  return composeCmoMarketingCopilot({
    contentBriefOutput: { data: { summary: 'Launch brief', topics: [{ topic: 'Admin' }] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [
          {
            id: 'launch-q2',
            name: 'Launch Q2',
            channel: 'linkedin',
            readiness: 'ready',
            trigger: 'quarterly',
            targetSegment: 'klinikledning',
            subject: 'Arcana update',
            bodyOutline: 'Intro + CTA',
            estimatedImpact: 'medium',
            suggestedActions: ['approve', 'schedule'],
          },
        ],
      },
      warnings: [],
    },
    socialOutput: {
      data: { posts: [{ id: 'social-1', platform: 'linkedin', text: 'Post copy', hook: 'Hook' }] },
      warnings: [],
    },
    seoOutput: {
      data: { articles: [{ id: 'seo-1', title: 'Guide', keyword: 'admin', outline: 'Outline' }] },
      warnings: [],
    },
    adOutput: { data: { ads: [{ id: 'ad-1', channel: 'google_ads', headline: 'Arcana', body: 'Ad' }] }, warnings: [] },
    emailOutput: { data: { emails: [{ id: 'mail-1', subject: 'Nyhetsbrev', body: 'Hej!' }] }, warnings: [] },
    repurposeOutput: {
      data: { variants: [{ id: 'rep-1', format: 'carousel', sourceTopic: 'Admin', body: 'Carousel' }] },
      warnings: [],
    },
    claimsOutput: { data: { passed: true, flaggedClaims: [] }, warnings: [] },
    complianceOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    scheduleOutput: {
      data: {
        scheduleItems: [
          {
            campaignId: 'launch-q2',
            platform: 'linkedin',
            proposedAt: '2026-06-15T09:00:00.000Z',
            topic: 'Launch Q2',
            status: 'proposed',
          },
        ],
      },
      warnings: [],
    },
  });
}

async function createStorePair(tmpDir) {
  const campaignStore = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  const assetStore = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });
  return { campaignStore, assetStore };
}

test('syncMarketingWorkspaceFromCmoOutput end-to-end links assets and campaigns on disk', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-store-int-'));
  const { campaignStore, assetStore } = await createStorePair(tmpDir);
  const composed = buildWorkspaceCmoOutput();

  const first = await syncMarketingWorkspaceFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-int-1',
    output: composed,
    marketingCampaignDraftsStore: campaignStore,
    marketingContentAssetsStore: assetStore,
  });

  assert.equal(first.assetSync.syncedCount, 5);
  assert.equal(first.campaignSync.syncedCount, 1);
  assert.deepEqual(first.marketingDraftIds, ['launch-q2']);
  assert.ok(first.assetSync.byCampaignId['launch-q2'].length >= 5);

  const campaign = await campaignStore.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.equal(campaign.status, 'pending_approval');
  assert.equal(campaign.complianceStatus, 'passed');
  assert.equal(campaign.payload.trigger, 'quarterly');
  assert.equal(campaign.payload.targetSegment, 'klinikledning');
  assert.ok(campaign.payload.assetIds.length >= 5);

  await campaignStore.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-blocked',
    campaigns: [
      { id: 'blocked-c', name: 'Blocked', channel: 'email', readiness: 'compliance_blocked' },
    ],
    complianceReview: { status: 'blocked' },
  });
  const blocked = await campaignStore.getCampaign({ tenantId: 'default', id: 'blocked-c' });
  assert.equal(blocked.status, 'compliance_blocked');

  const reloadedCampaignStore = await createMarketingCampaignDraftsStore({
    filePath: campaignStore.filePath,
  });
  const reloadedAssetStore = await createMarketingContentAssetsStore({
    filePath: assetStore.filePath,
  });
  const relaunch = await reloadedCampaignStore.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.equal(relaunch.name, 'Launch Q2');
  assert.equal((await reloadedAssetStore.listAssets({ tenantId: 'default' })).length, 5);
});

test('campaign store lifecycle approve schedule queue preserves approved terminal status', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-store-life-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-life',
    campaigns: [{ id: 'life-1', name: 'Life', readiness: 'ready', channel: 'linkedin' }],
    complianceReview: { status: 'passed' },
  });

  await store.patchCampaign({
    tenantId: 'default',
    id: 'life-1',
    fields: { owner: 'alice' },
    changedBy: 'alice',
  });

  await store.patchCampaign({
    tenantId: 'default',
    id: 'life-1',
    fields: { scheduleProposal: '2026-06-01 (linkedin) — Life' },
    changedBy: 'alice',
  });

  await store.applyScheduleProposals({
    tenantId: 'default',
    sourceAgentRunId: 'run-sched',
    scheduleItems: [
      {
        campaignId: 'life-1',
        platform: 'linkedin',
        proposedAt: '2026-06-01T09:00:00.000Z',
        topic: 'Life',
        pilotAutoPublishEligible: true,
        publishPolicy: { publishMode: 'pilot_auto_queue' },
      },
      { campaignId: 'missing-id', platform: 'email', proposedAt: '2026-06-02T09:00:00.000Z' },
    ],
  });

  const scheduled = await store.getCampaign({ tenantId: 'default', id: 'life-1' });
  assert.equal(scheduled.payload.publishSchedule.pilotAutoPublishEligible, true);
  assert.equal(scheduled.payload.publishSchedule.publishMode, 'pilot_auto_queue');

  const approved = await store.approveCampaign({
    tenantId: 'default',
    id: 'life-1',
    approvedBy: 'owner-1',
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedBy, 'owner-1');
  assert.ok(approved.versions.length >= 2);

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-resync',
    campaigns: [{ id: 'life-1', name: 'Life v2', readiness: 'ready', channel: 'linkedin' }],
    complianceReview: { status: 'passed' },
  });
  const afterResync = await store.getCampaign({ tenantId: 'default', id: 'life-1' });
  assert.equal(afterResync.status, 'approved');
  assert.equal(afterResync.name, 'Life v2');
  assert.match(afterResync.scheduleProposal, /linkedin/);

  const queued = await store.markPublishQueued({
    tenantId: 'default',
    id: 'life-1',
    publishResult: { queuedAt: '2026-06-01T10:00:00.000Z', mode: 'pilot_queue_stub' },
    changedBy: 'scheduler',
  });
  assert.equal(queued.payload.publishSchedule.publishStatus, 'publish_queued');
  assert.equal(queued.payload.publishSchedule.publishQueueMode, 'pilot_queue_stub');

  const ownerList = await store.listCampaigns({ tenantId: 'default', owner: 'alice' });
  assert.equal(ownerList.length, 1);
  assert.equal(await store.approveCampaign({ tenantId: 'default', id: 'nope' }), null);
  assert.equal(await store.rejectCampaign({ tenantId: 'default', id: 'nope' }), null);
});

test('campaign store sync retains assetIds when resync has no linked assets', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-store-assets-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-a',
    campaigns: [{ id: 'c1', name: 'C1', readiness: 'ready' }],
    complianceReview: { status: 'passed' },
    assetIdsByCampaign: { c1: ['asset-1', 'asset-2'] },
  });

  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-b',
    campaigns: [{ id: 'c1', name: 'C1 v2', readiness: 'ready' }],
    complianceReview: { status: 'passed' },
    assetIdsByCampaign: {},
  });

  const campaign = await store.getCampaign({ tenantId: 'default', id: 'c1' });
  assert.deepEqual(campaign.payload.assetIds, ['asset-1', 'asset-2']);
  assert.equal(mapReadinessToStatus('compliance_blocked'), 'compliance_blocked');
});

test('content assets store workspace approve and filter integration', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-asset-int-'));
  const { campaignStore, assetStore } = await createStorePair(tmpDir);
  const composed = buildWorkspaceCmoOutput();

  await syncMarketingWorkspaceFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-assets',
    output: composed,
    marketingCampaignDraftsStore: campaignStore,
    marketingContentAssetsStore: assetStore,
  });

  const pendingSocial = await assetStore.listAssets({
    tenantId: 'default',
    campaignId: 'launch-q2',
    assetType: 'social_post',
    status: 'pending_approval',
    limit: 10,
  });
  assert.equal(pendingSocial.length, 1);
  assert.equal(pendingSocial[0].requiresOwnerApproval, true);

  const firstApprove = await assetStore.approveAssetsForCampaign({
    tenantId: 'default',
    campaignId: 'launch-q2',
    approvedBy: 'owner-1',
  });
  assert.equal(firstApprove.approvedCount, 5);
  assert.equal(firstApprove.assetIds.length, 5);

  const secondApprove = await assetStore.approveAssetsForCampaign({
    tenantId: 'default',
    campaignId: 'launch-q2',
    approvedBy: 'owner-1',
  });
  assert.equal(secondApprove.approvedCount, 5);

  await assetStore.linkAssetsToCampaign({
    tenantId: 'default',
    campaignId: 'launch-q2',
    assetIds: ['social-1'],
  });
  const relink = await assetStore.linkAssetsToCampaign({
    tenantId: 'default',
    campaignId: 'launch-q2',
    assetIds: ['social-1'],
  });
  assert.equal(relink.updatedCount, 0);

  await campaignStore.approveCampaign({ tenantId: 'default', id: 'launch-q2', approvedBy: 'owner-1' });
  await syncMarketingWorkspaceFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-assets-2',
    output: composed,
    marketingCampaignDraftsStore: campaignStore,
    marketingContentAssetsStore: assetStore,
  });

  const approvedAssets = await assetStore.listAssets({
    tenantId: 'default',
    campaignId: 'launch-q2',
    status: 'approved',
  });
  assert.equal(approvedAssets.length, 5);
  assert.ok(approvedAssets.every((asset) => asset.status === 'approved'));

  const campaign = await campaignStore.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.equal(campaign.status, 'approved');
});

test('content assets store upsert preserves approved terminal status', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-asset-upsert-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  await store.upsertAsset({
    tenantId: 'default',
    id: 'mail-1',
    assetType: 'mail',
    channel: 'email',
    title: 'Mail',
    status: 'approved',
    campaignId: 'c1',
    approvedBy: 'owner',
  });

  const blockedUpdate = await store.upsertAsset({
    tenantId: 'default',
    id: 'mail-1',
    title: 'Should not downgrade',
    status: 'draft',
  });
  assert.equal(blockedUpdate.status, 'approved');
  assert.equal(blockedUpdate.title, 'Should not downgrade');
  assert.equal(blockedUpdate.version, 2);
});
