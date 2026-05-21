const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { composeCmoMarketingCopilot } = require('../../src/agents/cmoContentAgent');
const {
  PUBLISH_MODES,
  evaluateChannelPublishEligibility,
  resolvePublishPolicyConfig,
  listDuePilotPublishCandidates,
  executePilotChannelPublish,
} = require('../../src/ops/cmoPublishPolicy');
const { runCmoPilotPublishDue } = require('../../src/ops/cmoSchedulerJobs');
const { createMarketingCampaignDraftsStore } = require('../../src/ops/marketingCampaignDraftsStore');
const { createMarketingWorkspaceRouter } = require('../../src/routes/marketingWorkspace');

function buildCompliantCmoOutput(overrides = {}) {
  return composeCmoMarketingCopilot({
    contentBriefOutput: { data: { summary: 'Brief ok', topics: [] }, warnings: [] },
    campaignOutput: {
      data: {
        campaigns: [{ id: 'launch-q2', name: 'Launch', readiness: 'ready', complianceCleared: true, status: 'approved', approvedAt: new Date().toISOString() }],
      },
      warnings: [],
    },
    complianceOutput: { data: { status: 'passed', passed: true, flaggedClaims: [] }, warnings: [] },
    trackingOutput: { data: { status: 'passed', passed: true }, warnings: [] },
    scheduleOutput: {
      data: {
        scheduleItems: [
          {
            id: 'launch-q2',
            campaignId: 'launch-q2',
            platform: 'linkedin',
            proposedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            status: 'proposed',
          },
        ],
      },
      warnings: [],
    },
    orchestrationSnapshot: {
      appConfig: {
        marketingPublishPilotEnabled: true,
        marketingAutoPublishPilotChannels: ['linkedin'],
        marketingPublishPilotMaxRiskLevel: 3,
      },
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 0, p1Open: 0 },
    },
    ...overrides,
  });
}

test('evaluateChannelPublishEligibility blocks channels above pilot max risk', () => {
  const email = evaluateChannelPublishEligibility({
    channel: 'email',
    policyConfig: { pilotEnabled: true, pilotChannels: ['email'], maxRiskLevel: 3 },
    gateContext: {
      scheduleAllowed: true,
      compliancePassed: true,
      campaignApproved: true,
      pauseAllExternal: false,
      orchestrationBlocked: false,
    },
    campaignStatus: 'approved',
  });
  assert.equal(email.autoPublish, false);
  assert.equal(email.pilotAutoPublishEligible, false);
  assert.match(email.autoPublishBlockedReason, /L4/);
});

test('evaluateChannelPublishEligibility allows pilot queue for approved linkedin L3', () => {
  const eligible = evaluateChannelPublishEligibility({
    channel: 'linkedin',
    policyConfig: resolvePublishPolicyConfig({
      marketingPublishPilotEnabled: true,
      marketingAutoPublishPilotChannels: ['linkedin'],
      marketingPublishPilotMaxRiskLevel: 3,
    }),
    gateContext: {
      scheduleAllowed: true,
      compliancePassed: true,
      campaignApproved: true,
      pauseAllExternal: false,
      orchestrationBlocked: false,
    },
    campaignStatus: 'approved',
  });
  assert.equal(eligible.publishMode, PUBLISH_MODES.PILOT_AUTO_QUEUE);
  assert.equal(eligible.pilotAutoPublishEligible, true);
  assert.equal(eligible.autoPublish, false);
});

test('composeCmoMarketingCopilot exposes channel publish policy without global autoPublish', () => {
  const composed = buildCompliantCmoOutput();
  assert.equal(composed.data.autoPublish, false);
  assert.equal(composed.data.publishPilotEnabled, true);
  assert.ok(composed.data.pilotAutoPublishEligibleCount >= 1);
  assert.ok(Array.isArray(composed.data.channelPublishEvaluations));
});

test('composeCmoMarketingCopilot blocks pilot when incident pause required', () => {
  const composed = buildCompliantCmoOutput({
    orchestrationSnapshot: {
      appConfig: {
        marketingPublishPilotEnabled: true,
        marketingAutoPublishPilotChannels: ['linkedin'],
      },
      operationalReadiness: { score: 90, band: 'controlled_go', goAllowed: true },
      incidentSummary: { p0Open: 1, p1Open: 0 },
    },
  });
  assert.equal(composed.data.autoPublish, false);
  assert.equal(composed.data.pauseAllExternalCampaigns, true);
  assert.equal(composed.data.pilotAutoPublishEligibleCount, 0);
});

test('listDuePilotPublishCandidates finds approved due linkedin campaign', () => {
  const policyConfig = resolvePublishPolicyConfig({
    marketingPublishPilotEnabled: true,
    marketingAutoPublishPilotChannels: ['linkedin'],
  });
  const due = listDuePilotPublishCandidates({
    campaigns: [
      {
        id: 'c1',
        status: 'approved',
        channel: 'linkedin',
        payload: {
          publishSchedule: {
            platform: 'linkedin',
            proposedAt: new Date(Date.now() - 3600000).toISOString(),
          },
        },
      },
    ],
    policyConfig,
    gateContext: {
      scheduleAllowed: true,
      compliancePassed: true,
      campaignApproved: true,
      pauseAllExternal: false,
      orchestrationBlocked: false,
    },
  });
  assert.equal(due.length, 1);
  assert.equal(due[0].channel, 'linkedin');
});

test('runCmoPilotPublishDue queues due campaigns without external publish', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmo-publish-'));
  const store = await createMarketingCampaignDraftsStore({
    filePath: path.join(tmpDir, 'drafts.json'),
  });
  const past = new Date(Date.now() - 3600000).toISOString();
  await store.upsertCampaign({
    tenantId: 'default',
    id: 'launch-q2',
    name: 'Launch',
    status: 'approved',
    channel: 'linkedin',
    approvedAt: past,
    payload: {
      publishSchedule: {
        platform: 'linkedin',
        proposedAt: past,
        status: 'proposed',
      },
    },
  });

  const audits = [];
  const result = await runCmoPilotPublishDue({
    tenantId: 'default',
    marketingCampaignDraftsStore: store,
    config: {
      marketingPublishPilotEnabled: true,
      marketingAutoPublishPilotChannels: ['linkedin'],
    },
    authStore: {
      addAuditEvent: async (event) => {
        audits.push(event);
      },
    },
  });

  assert.equal(result.queuedCount, 1);
  assert.equal(result.queued[0].publishResult.externalPublishInvoked, false);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'cmo.pilot_publish.queue');

  const updated = await store.getCampaign({ tenantId: 'default', id: 'launch-q2' });
  assert.equal(updated.payload.publishSchedule.publishStatus, 'publish_queued');
});

test('GET /marketing/publish-policy returns pilot config snapshot', async () => {
  const app = express();
  app.use(
    createMarketingWorkspaceRouter({
      authStore: {},
      marketingCampaignDraftsStore: null,
      config: {
        marketingPublishPilotEnabled: true,
        marketingAutoPublishPilotChannels: ['linkedin'],
        marketingPublishPilotMaxRiskLevel: 3,
      },
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
    const response = await fetch(`${baseUrl}/marketing/publish-policy`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.summary.autoPublishGlobal, false);
    assert.equal(body.summary.pilotEnabled, true);
    assert.deepEqual(body.summary.pilotChannels, ['linkedin']);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
