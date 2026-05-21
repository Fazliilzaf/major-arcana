const test = require('node:test');
const assert = require('node:assert/strict');

const { createExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const { notifyOwnerIfNeeded } = require('../../src/ops/caoSchedulerJobs');

test('addFromSchedulerNotification publishes CAO quality gate to executive feed', () => {
  const feed = createExecutiveDecisionFeed();
  const entry = feed.addFromSchedulerNotification({
    eventType: 'cao.quality_gate_failed',
    tenantId: 'tenant-a',
    severity: 'high',
    riskLevel: 'L4',
    payload: { summary: '2 tasks flagged', flaggedTasks: 2 },
  });
  assert.ok(entry);
  assert.equal(entry.agent, 'CAO');
  assert.equal(entry.actionType, 'assign_owner');
  assert.equal(entry.requiredOwnerAction, true);

  const pending = feed.list({ requiredOwnerAction: true });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, entry.id);
});

test('notifyOwnerIfNeeded always writes executive feed before webhook threshold', async () => {
  const feed = createExecutiveDecisionFeed();
  const result = await notifyOwnerIfNeeded({
    sendAlertNotification: async () => ({ ok: true }),
    executiveDecisionFeed: feed,
    tenantId: 'tenant-a',
    eventType: 'cao.sla_risk',
    severity: 'warn',
    riskLevel: 'L2',
    minRiskLevel: 'L4',
    payload: { summary: '1 unowned', unownedCount: 1 },
  });
  assert.equal(result.skipped, true);
  assert.ok(result.feedEntryId);
  assert.equal(feed.list().length, 1);
});

test('addFromAgentOutput publishes CAO go/no-go brief to feed', () => {
  const feed = createExecutiveDecisionFeed();
  const items = feed.addFromAgentOutput({
    agent: 'CAO',
    tenantId: 'tenant-a',
    output: {
      data: {
        executiveSummary: 'Test',
        disclaimerResults: { compliantCount: 1, totalCount: 1, violationCount: 0 },
        adminQualityGate: { gatePassed: true, flaggedTasks: [] },
        templateLibraryHealth: { healthScore: 90, flags: [] },
        goNoGoBrief: {
          goRecommendation: 'no_go_pending_owner',
          ownerDecisionRequired: true,
          summary: 'No go pending owner review',
          score: 78,
        },
      },
    },
  });
  assert.ok(items.some((item) => item.actionType === 'review_go_nogo'));
});
