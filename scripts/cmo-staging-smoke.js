#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createExecutiveDecisionFeed } = require('../src/ops/executiveDecisionFeed');
const { runCmoWeeklyContentPlan, CMO_SCHEDULER_JOB_IDS } = require('../src/ops/cmoSchedulerJobs');
const { ProposeContentCalendarCapability } = require('../src/capabilities/proposeContentCalendar');
const { GenerateUtmPackCapability } = require('../src/capabilities/generateUtmPack');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exitCode = 1;
    throw new Error(message);
  }
}

async function smokeCapabilities() {
  const calendar = new ProposeContentCalendarCapability();
  const calendarResult = await calendar.execute({
    input: { horizonWeeks: 2 },
    systemStateSnapshot: {
      contentTopics: [{ topic: 'Arcana release', suggestedFormat: 'guide' }],
      tenantConfig: { brand: { displayName: 'Arcana' } },
    },
  });
  assert(calendarResult.data.weeklyPlan.length >= 2, 'calendar should propose weekly slots');
  assert(calendarResult.data.autoPublish === false, 'calendar must not auto-publish');

  const utm = new GenerateUtmPackCapability();
  const utmResult = await utm.execute({
    input: { maxLinks: 3 },
    systemStateSnapshot: {
      campaigns: [{ id: 'launch', name: 'Launch' }],
      tenantConfig: { marketing: { websiteUrl: 'https://arcana.test' } },
    },
  });
  assert(utmResult.data.links.length >= 1, 'utm pack should contain links');
  console.log('OK capabilities');
}

async function smokeSchedulerJob() {
  const feed = createExecutiveDecisionFeed();
  const result = await runCmoWeeklyContentPlan({
    tenantId: 'default',
    trigger: 'smoke',
    capabilityExecutor: {
      async runCapability({ capabilityName }) {
        if (capabilityName === 'ProposeContentCalendar') {
          return {
            output: {
              data: {
                weeklyPlan: [{ week: 1, topic: 'Smoke', channel: 'linkedin', targetDate: '2026-06-01' }],
                summary: 'smoke calendar',
              },
            },
          };
        }
        if (capabilityName === 'ProposePublishSchedule') {
          return {
            output: {
              data: {
                scheduleItems: [
                  {
                    id: 's1',
                    platform: 'linkedin',
                    proposedAt: '2026-06-01T08:00:00.000Z',
                    topic: 'Smoke',
                    status: 'proposed',
                  },
                  {
                    id: 's2',
                    platform: 'email',
                    proposedAt: '2026-06-02T09:00:00.000Z',
                    topic: 'Smoke mail',
                    status: 'proposed',
                  },
                ],
                missedPublications: [],
              },
            },
          };
        }
        if (capabilityName === 'GenerateUtmPack') {
          return {
            output: {
              data: {
                links: [
                  {
                    id: 'u1',
                    url: 'https://arcana.test/?utm_source=linkedin&utm_medium=social&utm_campaign=smoke',
                  },
                ],
              },
            },
          };
        }
        if (capabilityName === 'ValidateMarketingTracking') {
          return { output: { data: { status: 'passed', passed: true, issues: [] } } };
        }
        return { output: { data: {} } };
      },
    },
    templateStore: { async listTemplates() { return []; } },
    tenantConfigStore: { async getTenantConfig() { return { brand: { displayName: 'Arcana' } }; } },
    executiveDecisionFeed: feed,
    minNotifyRiskLevel: 'L3',
    config: {},
  });

  assert(result.scheduleItems >= 2, 'scheduler job should produce schedule items');
  assert(feed.list().length >= 1, 'scheduler job should notify executive feed');
  console.log('OK scheduler job');
}

async function smokeDraftStoreOptional() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-smoke-drafts-'));
  const { createMarketingCampaignDraftsStore } = require('../src/ops/marketingCampaignDraftsStore');
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tempDir, 'drafts.json'),
  });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'smoke-run',
    campaigns: [{ id: 'launch', name: 'Launch', readiness: 'ready', channel: 'email' }],
    complianceReview: { status: 'passed' },
  });
  const applied = await store.applyScheduleProposals({
    tenantId: 'default',
    scheduleItems: [{ id: 'launch', platform: 'email', proposedAt: '2026-06-01T09:00:00.000Z', topic: 'Launch' }],
  });
  assert(applied.updatedCount === 1, 'schedule proposal should update draft');
  console.log('OK draft store schedule apply');
}

async function smokeApproveFlow() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-smoke-approve-'));
  const { createMarketingCampaignDraftsStore } = require('../src/ops/marketingCampaignDraftsStore');
  const { createExecutiveDecisionFeed } = require('../src/ops/executiveDecisionFeed');
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tempDir, 'drafts.json'),
  });
  await store.syncFromCmoOutput({
    tenantId: 'default',
    agentRunId: 'smoke-approve',
    campaigns: [{ id: 'launch', name: 'Launch', readiness: 'ready', channel: 'email' }],
    complianceReview: { status: 'passed' },
  });
  const feed = createExecutiveDecisionFeed();
  const items = feed.addFromAgentOutput({
    agent: 'CMO',
    tenantId: 'default',
    marketingDraftIds: ['launch'],
    output: {
      data: {
        campaigns: [{ id: 'launch', readiness: 'ready' }],
        executiveSummary: 'smoke approve flow',
        disclaimer: 'utkast only',
      },
    },
  });
  assert(items.length >= 1, 'feed should receive approve_campaigns entry');
  const approved = await store.approveCampaign({
    tenantId: 'default',
    id: 'launch',
    approvedBy: 'smoke-owner',
  });
  assert(approved.status === 'approved', 'approve flow should mark campaign approved');
  const resolved = feed.resolve({ entryId: items[0].id, resolvedBy: 'smoke-owner' });
  assert(resolved.status === 'acknowledged', 'feed entry should resolve');
  console.log('OK approve + feed resolve flow');
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
  console.log('OK http executive feed summary');
}

async function main() {
  console.log('CMO staging smoke — schedule + UTM + scheduler');
  console.log('CMO scheduler jobs:', CMO_SCHEDULER_JOB_IDS.join(', '));
  await smokeCapabilities();
  await smokeSchedulerJob();
  await smokeDraftStoreOptional();
  await smokeApproveFlow();
  await smokeHttpOptional();
  if (process.exitCode) process.exit(process.exitCode);
  console.log('CMO staging smoke passed');
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
