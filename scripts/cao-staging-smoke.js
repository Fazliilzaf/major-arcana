#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createPersistentExecutiveDecisionFeed,
  createExecutiveDecisionFeed,
} = require('../src/ops/executiveDecisionFeed');
const { loadExecutiveFeedEntries } = require('../src/ops/executiveDecisionFeedStore');
const { notifyOwnerIfNeeded } = require('../src/ops/caoSchedulerJobs');
const { CAO_SCHEDULER_JOB_IDS } = require('../src/ops/readinessEvaluator');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exitCode = 1;
    throw new Error(message);
  }
}

async function smokePersistence() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-feed-smoke-'));
  const filePath = path.join(tempDir, 'executive-decision-feed.json');

  const feed = await createPersistentExecutiveDecisionFeed({ filePath });
  const entry = feed.addFromSchedulerNotification({
    eventType: 'cao.quality_gate_failed',
    tenantId: 'tenant-a',
    severity: 'high',
    riskLevel: 'L4',
    payload: { summary: 'smoke gate failed', flaggedTasks: 2 },
  });
  assert(entry && entry.id, 'scheduler notification should create feed entry');

  await new Promise((resolve) => setTimeout(resolve, 50));
  const reloaded = await loadExecutiveFeedEntries(filePath);
  assert(reloaded.length >= 1, 'persisted feed should survive reload');
  assert(reloaded.some((item) => item.id === entry.id), 'entry id should match after reload');

  const feed2 = await createPersistentExecutiveDecisionFeed({ filePath });
  const listed = feed2.list({ requiredOwnerAction: true });
  assert(listed.some((item) => item.id === entry.id), 'rehydrated feed should list saved entry');
  console.log('OK persistence');
}

async function smokeSchedulerNotifyFeed() {
  const feed = createExecutiveDecisionFeed();
  const webhookCalls = [];
  const result = await notifyOwnerIfNeeded({
    sendAlertNotification: async (payload) => {
      webhookCalls.push(payload);
      return { ok: true };
    },
    executiveDecisionFeed: feed,
    tenantId: 'tenant-a',
    eventType: 'cao.sla_risk',
    severity: 'warn',
    riskLevel: 'L2',
    minRiskLevel: 'L4',
    payload: { summary: '1 unowned', unownedCount: 1, criticalOpen: 0 },
  });
  assert(result.feedEntryId, 'notify should return feedEntryId');
  assert(feed.list().length === 1, 'feed should contain scheduler entry');
  assert(webhookCalls.length === 0, 'L2 should skip webhook');
  console.log('OK scheduler notify + feed');
}

async function smokeHttpOptional() {
  const baseUrl = String(process.env.ARCANA_SMOKE_BASE_URL || '').trim();
  if (!baseUrl) {
    console.log('SKIP http (set ARCANA_SMOKE_BASE_URL to enable)');
    return;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/executive/feed/summary`, {
    headers: { accept: 'application/json' },
  });
  assert(response.ok, `executive feed summary HTTP ${response.status}`);
  const payload = await response.json();
  assert(typeof payload.totalActive === 'number', 'summary should include totalActive');
  console.log('OK http executive feed summary');
}

async function main() {
  console.log('CAO staging smoke — executive feed + scheduler wiring');
  console.log('CAO scheduler jobs:', CAO_SCHEDULER_JOB_IDS.join(', '));
  await smokePersistence();
  await smokeSchedulerNotifyFeed();
  await smokeHttpOptional();
  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log('CAO staging smoke passed');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
