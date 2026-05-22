const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { extractContentAssetsFromCmoOutput } = require('../../src/ops/cmoContentAssetExtract');
const { createMarketingContentAssetsStore } = require('../../src/ops/marketingContentAssetsStore');
const { createMarketingCampaignDraftsStore } = require('../../src/ops/marketingCampaignDraftsStore');
const { syncMarketingWorkspaceFromCmoOutput } = require('../../src/ops/cmoMarketingWorkspaceSync');
const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');
const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');

function buildSampleCmoData() {
  return {
    campaigns: [{ id: 'launch-q2', name: 'Launch', channel: 'linkedin', readiness: 'ready' }],
    complianceReview: { status: 'passed', passed: true },
    socialPostPack: {
      posts: [{ id: 'social-1', platform: 'linkedin', text: 'Arcana för kliniker', hook: 'Trygg admin' }],
    },
    seoBrief: {
      articles: [{ id: 'seo-1', title: 'Compliance guide', keyword: 'vårdadministration', outline: 'Intro...' }],
    },
    adCopyPack: {
      ads: [{ id: 'ad-1', channel: 'google_ads', headline: 'Arcana', body: 'Ad utkast' }],
    },
    emailDrafts: {
      emails: [{ id: 'mail-1', subject: 'Veckans insikter', body: 'Hej!' }],
    },
    repurposedContent: {
      variants: [{ id: 'rep-1', format: 'carousel', sourceTopic: 'Admin', body: 'Carousel copy' }],
    },
  };
}

test('extractContentAssetsFromCmoOutput extracts nested packs into flat assets', () => {
  const assets = extractContentAssetsFromCmoOutput({
    cmoData: buildSampleCmoData(),
    tenantId: 'default',
    agentRunId: 'run-1',
  });
  assert.equal(assets.length, 5);
  assert.ok(assets.every((asset) => asset.autoPublish === false));
  assert.equal(assets[0].campaignId, 'launch-q2');
  assert.equal(assets[0].assetType, 'social_post');
});

test('marketingContentAssetsStore sync preserves approved assets', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-assets-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  const first = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-1',
    cmoData: buildSampleCmoData(),
  });
  assert.equal(first.syncedCount, 5);

  await store.approveAssetsForCampaign({
    tenantId: 'default',
    campaignId: 'launch-q2',
    approvedBy: 'owner-1',
  });

  const second = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-2',
    cmoData: {
      ...buildSampleCmoData(),
      socialPostPack: {
        posts: [{ id: 'social-1', platform: 'linkedin', text: 'Uppdaterad copy', hook: 'Ny hook' }],
      },
    },
  });
  assert.equal(second.syncedCount, 5);
  const social = await store.getAsset({ tenantId: 'default', id: 'social-1' });
  assert.equal(social.status, 'approved');
  assert.match(social.body, /Uppdaterad copy/);
});

test('syncMarketingWorkspaceFromCmoOutput links asset ids on campaign payload', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-sync-'));
  const campaignStore = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  const assetStore = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  const composed = composeCmoMarketingCopilot({
    campaignOutput: { data: { campaigns: buildSampleCmoData().campaigns }, warnings: [] },
    complianceOutput: { data: buildSampleCmoData().complianceReview, warnings: [] },
    socialOutput: { data: buildSampleCmoData().socialPostPack, warnings: [] },
    seoOutput: { data: buildSampleCmoData().seoBrief, warnings: [] },
    adOutput: { data: buildSampleCmoData().adCopyPack, warnings: [] },
    emailOutput: { data: buildSampleCmoData().emailDrafts, warnings: [] },
    repurposeOutput: { data: buildSampleCmoData().repurposedContent, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
  });

  const sync = await syncMarketingWorkspaceFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-sync-1',
    output: composed,
    marketingCampaignDraftsStore: campaignStore,
    marketingContentAssetsStore: assetStore,
  });

  assert.equal(sync.assetSync.syncedCount, 5);
  assert.equal(sync.campaignSync.syncedCount, 1);
  assert.deepEqual(sync.marketingDraftIds, ['launch-q2']);

  const campaign = await campaignStore.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.ok(Array.isArray(campaign.payload.assetIds));
  assert.ok(campaign.payload.assetIds.length >= 5);
});

test('campaign approve also approves linked content assets', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-approve-assets-'));
  const campaignStore = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  const assetStore = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  await syncMarketingWorkspaceFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-approve',
    output: { data: buildSampleCmoData() },
    marketingCampaignDraftsStore: campaignStore,
    marketingContentAssetsStore: assetStore,
  });

  const app = express();
  app.use(express.json());
  app.use(
    createMarketingWorkspaceRouter({
      authStore: { addAuditEvent: async () => {} },
      marketingCampaignDraftsStore: campaignStore,
      marketingContentAssetsStore: assetStore,
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'default', userId: 'owner-1', role: 'OWNER' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const approveRes = await fetch(`${baseUrl}/marketing/campaigns/launch-q2/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(approveRes.status, 200);
    const body = await approveRes.json();
    assert.equal(body.item.status, 'approved');
    assert.ok(body.assetApproval.approvedCount >= 5);

    const assets = await assetStore.listAssets({
      tenantId: 'default',
      campaignId: 'launch-q2',
      status: 'approved',
    });
    assert.ok(assets.length >= 5);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('GET /marketing/content-assets lists synced assets', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-assets-api-'));
  const assetStore = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });
  await assetStore.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-api',
    cmoData: buildSampleCmoData(),
  });

  const app = express();
  app.use(
    createMarketingWorkspaceRouter({
      authStore: {},
      marketingCampaignDraftsStore: null,
      marketingContentAssetsStore: assetStore,
      requireAuth: (req, _res, next) => {
        req.auth = { tenantId: 'default', role: 'OWNER' };
        next();
      },
      requireRole: () => (_req, _res, next) => next(),
    })
  );

  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/marketing/content-assets?campaignId=launch-q2`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.total, 5);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
