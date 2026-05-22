'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMarketingCampaignDraftsStore } = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingContentAssetsStore } = require('../../src/ops/marketingContentAssetsStore');

test('marketing stores reject whitespace-only filePath or fail on cwd fallback', async () => {
  await assert.rejects(
    () => createMarketingContentAssetsStore({ filePath: '' }),
    (error) => /filePath saknas|EISDIR|ENOENT/.test(String(error.message || error))
  );
  await assert.rejects(
    () => createMarketingCampaignDraftsStore({ filePath: '   ' }),
    (error) => /filePath saknas|EISDIR|ENOENT/.test(String(error.message || error))
  );
});

test('campaign store applyScheduleProposals skips unknown items without save', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-sched-'));
  const filePath = path.join(tmpDir, 'drafts.json');
  const store = await createMarketingCampaignDraftsStore({ filePath });

  await store.upsertCampaign({ tenantId: 'default', id: 'c1', name: 'C1' });
  const before = JSON.parse(await fs.readFile(filePath, 'utf8'));

  const empty = await store.applyScheduleProposals({
    tenantId: 'default',
    scheduleItems: [{ campaignId: 'missing' }, { proposedAt: '2026-01-01' }],
  });
  assert.equal(empty.updatedCount, 0);

  const after = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(after.updatedAt, before.updatedAt);
});

test('campaign store caps version history at 20 entries', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-ver-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  await store.upsertCampaign({ tenantId: 'default', id: 'v-cap', name: 'Version cap' });
  for (let i = 0; i < 22; i += 1) {
    await store.patchCampaign({
      tenantId: 'default',
      id: 'v-cap',
      fields: { owner: `owner-${i}` },
      changedBy: `actor-${i}`,
    });
  }

  const campaign = await store.getCampaign({ tenantId: 'default', id: 'v-cap' });
  assert.equal(campaign.versions.length, 20);
  assert.equal(campaign.versions[0].changeType, 'patch');
  assert.equal(campaign.version, 23);
});

test('campaign store sync returns pendingApprovalIds and compliance payload flags', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-sync-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  const result = await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'run-flags',
    campaigns: [
      {
        id: 'pending-1',
        name: 'Pending',
        readiness: 'ready',
        complianceBlocked: true,
        complianceOwnerRequired: true,
        complianceCleared: false,
        suggestedActions: ['review'],
      },
      { id: 'draft-1', name: 'Draft', readiness: 'draft' },
    ],
    complianceReview: { status: 'needs_owner' },
  });

  assert.deepEqual(result.pendingApprovalIds, ['pending-1']);
  assert.equal(result.syncedCount, 2);

  const pending = await store.getCampaign({ tenantId: 'default', id: 'pending-1' });
  assert.equal(pending.payload.complianceBlocked, true);
  assert.equal(pending.payload.complianceOwnerRequired, true);
  assert.equal(pending.payload.complianceCleared, false);
  assert.deepEqual(pending.payload.suggestedActions, ['review']);
  assert.equal(pending.complianceStatus, 'needs_owner');

  const draft = await store.getCampaign({ tenantId: 'default', id: 'draft-1' });
  assert.equal(draft.status, 'draft');
});

test('campaign store schedule proposal uses channel fallback and patch clears empty schedule', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-fallback-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  await store.upsertCampaign({ tenantId: 'default', id: 'sched-fb', name: 'Fallback Name' });
  await store.applyScheduleProposals({
    tenantId: 'default',
    scheduleItems: [{ campaignId: 'sched-fb', proposedAt: '2026-08-01T08:00:00.000Z' }],
  });

  const scheduled = await store.getCampaign({ tenantId: 'default', id: 'sched-fb' });
  assert.match(scheduled.scheduleProposal, /channel/);
  assert.match(scheduled.scheduleProposal, /Fallback Name/);
  assert.equal(scheduled.payload.publishSchedule.publishMode, 'proposal_only');

  const cleared = await store.patchCampaign({
    tenantId: 'default',
    id: 'sched-fb',
    fields: { scheduleProposal: '   ' },
    changedBy: 'owner',
  });
  assert.equal(cleared.item.scheduleProposal, null);
  assert.deepEqual(cleared.updatedFields, ['scheduleProposal']);
});

test('campaign store list clamps limit and returns newest patches first', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-list-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });

  for (let i = 0; i < 6; i += 1) {
    await store.upsertCampaign({ tenantId: 'default', id: `sort-${i}`, name: `Sort ${i}` });
  }
  await store.patchCampaign({
    tenantId: 'default',
    id: 'sort-0',
    fields: { owner: 'latest-touch' },
    changedBy: 'tester',
  });

  const capped = await store.listCampaigns({ tenantId: 'default', limit: 9999 });
  assert.equal(capped.length, 6);

  const minLimit = await store.listCampaigns({ tenantId: 'default', limit: -5 });
  assert.equal(minLimit.length, 1);

  const sorted = await store.listCampaigns({ tenantId: 'default', limit: 3 });
  assert.equal(sorted[0].id, 'sort-0');
  assert.equal(sorted[0].owner, 'latest-touch');
});

test('campaign store markPublishQueued returns null for missing campaign', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-queue-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  assert.equal(
    await store.markPublishQueued({ tenantId: 'default', id: 'missing', publishResult: {} }),
    null
  );
});

test('content assets store link skips empty campaignId and caps list limit', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-asset-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  await store.upsertAsset({
    tenantId: 'default',
    id: 'a1',
    assetType: 'social_post',
    channel: 'linkedin',
    title: 'A1',
  });

  const emptyLink = await store.linkAssetsToCampaign({
    tenantId: 'default',
    campaignId: '',
    assetIds: ['a1'],
  });
  assert.equal(emptyLink.updatedCount, 0);

  for (let i = 2; i <= 6; i += 1) {
    await store.upsertAsset({
      tenantId: 'default',
      id: `a${i}`,
      assetType: 'mail',
      channel: 'email',
      title: `A${i}`,
    });
  }
  await store.upsertAsset({
    tenantId: 'default',
    id: 'a1',
    title: 'A1 refreshed',
  });

  const listed = await store.listAssets({ tenantId: 'default', limit: 9999 });
  assert.equal(listed.length, 6);
  assert.equal(listed[0].id, 'a1');
  assert.equal(listed[0].title, 'A1 refreshed');

  const minListed = await store.listAssets({ tenantId: 'default', limit: -5 });
  assert.equal(minListed.length, 1);
});

test('content assets store version history cap and requiresOwnerApproval on create', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-asset-ver-'));
  const store = await createMarketingContentAssetsStore({
    filePath: path.join(tmpDir, 'assets.json'),
  });

  const created = await store.upsertAsset({
    tenantId: 'default',
    id: 'ver-asset',
    assetType: 'social_post',
    channel: 'linkedin',
    title: 'Versioned',
    requiresOwnerApproval: false,
  });
  assert.equal(created.requiresOwnerApproval, false);

  for (let i = 0; i < 22; i += 1) {
    await store.upsertAsset({
      tenantId: 'default',
      id: 'ver-asset',
      title: `Title ${i}`,
      requiresOwnerApproval: false,
    });
  }

  const asset = await store.getAsset({ tenantId: 'default', id: 'ver-asset' });
  assert.equal(asset.requiresOwnerApproval, false);
  assert.equal(asset.versions.length, 20);
  assert.equal(asset.version, 23);
});

test('stores recover from invalid persisted state shape', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-edge-state-'));
  const campaignPath = path.join(tmpDir, 'drafts.json');
  const assetPath = path.join(tmpDir, 'assets.json');

  await fs.writeFile(campaignPath, JSON.stringify({ version: 1, campaigns: null }), 'utf8');
  await fs.writeFile(assetPath, JSON.stringify({ version: 1, assets: null }), 'utf8');

  const campaignStore = await createMarketingCampaignDraftsStore({ filePath: campaignPath });
  const assetStore = await createMarketingContentAssetsStore({ filePath: assetPath });

  assert.deepEqual(await campaignStore.listCampaigns({ tenantId: 'default' }), []);
  assert.deepEqual(await assetStore.listAssets({ tenantId: 'default' }), []);
});
