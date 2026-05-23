#!/usr/bin/env node
'use strict';

/**
 * Fas P — sandbox LinkedIn publish demo (ingen prod, ingen live API utan sandbox).
 *
 *   npm run demo:cmo-sandbox-publish
 */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createMarketingCampaignDraftsStore } = require('../src/ops/marketingCampaignDraftsStore');
const { runCmoPilotPublishDue } = require('../src/ops/cmoSchedulerJobs');

function log(title, payload) {
  console.log(`\n=== ${title} ===`);
  console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
}

async function seedApprovedLinkedInCampaign(store, { tenantId, id, proposedAt }) {
  await store.upsertCampaign({
    tenantId,
    id,
    name: 'Fas P sandbox demo — LinkedIn launch',
    status: 'approved',
    channel: 'linkedin',
    owner: 'OWNER',
    approvedAt: proposedAt,
    payload: {
      bodyOutline: 'Hair TP Clinic — försiktig pilotpost från CMO sandbox (ingen prod).',
      publishSchedule: {
        platform: 'linkedin',
        proposedAt,
        topic: 'Pilot launch',
        windowLabel: '7d',
        status: 'proposed',
        publishMode: 'pilot_auto_queue',
        pilotAutoPublishEligible: true,
      },
    },
  });
}

async function runDemoPass({
  label,
  config,
  expectPublished,
  store,
  tenantId,
  campaignId,
  audits,
}) {
  const past = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await seedApprovedLinkedInCampaign(store, { tenantId, id: campaignId, proposedAt: past });

  const result = await runCmoPilotPublishDue({
    tenantId,
    trigger: 'manual',
    actorUserId: 'sandbox-demo',
    marketingCampaignDraftsStore: store,
    config,
    authStore: {
      addAuditEvent: async (event) => {
        audits.push(event);
      },
    },
  });

  const updated = await store.getCampaign({ tenantId, id: campaignId });
  const schedule = updated?.payload?.publishSchedule || {};

  log(label, {
    queuedCount: result.queuedCount,
    publishStatus: schedule.publishStatus,
    publishQueueMode: schedule.publishQueueMode,
    externalPublishInvoked: schedule.externalPublishInvoked,
    externalPublishId: schedule.externalPublishId,
    publishMessage: schedule.publishMessage,
    auditAction: audits.at(-1)?.action || null,
  });

  if (expectPublished) {
    if (schedule.publishStatus !== 'published') {
      throw new Error(`Expected publishStatus=published, got ${schedule.publishStatus}`);
    }
    if (schedule.externalPublishInvoked !== true) {
      throw new Error('Expected externalPublishInvoked=true in sandbox mode');
    }
    if (!String(schedule.externalPublishId || '').includes('sandbox-linkedin')) {
      throw new Error(`Expected sandbox external id, got ${schedule.externalPublishId}`);
    }
  } else if (schedule.publishStatus !== 'publish_queued') {
    throw new Error(`Expected publish_queued, got ${schedule.publishStatus}`);
  }

  return { result, updated, schedule };
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-sandbox-publish-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  const tenantId = 'hair-tp-clinic';
  const audits = [];

  console.log('CMO Fas P — sandbox publish demo');
  console.log(`Temp store: ${tmpDir}`);
  console.log('Prod/live API: AV (sandbox eller queue-only)');

  await runDemoPass({
    label: '1) Queue-only (ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=false)',
    config: {
      marketingPublishPilotEnabled: true,
      marketingAutoPublishPilotChannels: ['linkedin'],
      marketingPublishLiveEnabled: false,
    },
    expectPublished: false,
    store,
    tenantId,
    campaignId: 'demo-queue-only',
    audits,
  });

  await runDemoPass({
    label: '2) Sandbox publish (live enabled + sandbox=true)',
    config: {
      marketingPublishPilotEnabled: true,
      marketingAutoPublishPilotChannels: ['linkedin'],
      marketingPublishLiveEnabled: true,
      marketingPublishSandbox: true,
    },
    expectPublished: true,
    store,
    tenantId,
    campaignId: 'demo-sandbox-published',
    audits,
  });

  console.log('\n✅ Sandbox publish demo passed');
  console.log('   Admin: Kampanjer-fliken visar publish=… efter scheduler/queue.');
}

main().catch((error) => {
  console.error('\n❌ Demo failed:', error.message || error);
  process.exit(1);
});
