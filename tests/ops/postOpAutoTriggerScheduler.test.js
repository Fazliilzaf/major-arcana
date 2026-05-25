const test = require('node:test');
const assert = require('node:assert/strict');

const { createScheduler } = require('../../src/ops/scheduler');

test('scheduler post_op_auto_trigger runs RequestPostOpReview flow for eligible cases', async () => {
  const postOpReviewStore = {
    findByBookingCaseId() {
      return null;
    },
    async markSent() {
      return true;
    },
  };
  const bookingStore = {
    async listCases() {
      return [
        {
          bookingCaseId: 'case-post-op-1',
          status: 'confirmed_external',
          requestedTreatment: '12_manader',
          customerEmail: 'postop@example.com',
          customerName: 'Post Op',
          confirmedExternalAt: '2020-01-01T00:00:00.000Z',
          events: [],
        },
      ];
    },
    findCaseByRef() {
      return {
        workspaceId: 'major-arcana-preview',
        conversationId: 'conv-post-op-1',
        customerEmail: 'postop@example.com',
      };
    },
    async updateStatus() {
      return true;
    },
    async addEvent() {
      return true;
    },
  };

  const capabilityCalls = [];
  const capabilityExecutor = {
    async runCapability(input) {
      capabilityCalls.push(input);
      return {
        gatewayResult: {
          response_payload: {
            output: {
              data: {
                submissionId: 'sub-post-op-1',
                emailDraft: {
                  subject: 'Din uppföljning',
                  plain: 'Hej',
                  html: '<p>Hej</p>',
                },
              },
              warnings: [],
            },
          },
        },
      };
    },
  };

  const scheduler = createScheduler({
    config: {
      schedulerEnabled: true,
      defaultTenantId: 'tenant-a',
      schedulerStartupDelaySec: 0,
      schedulerJitterSec: 0,
      schedulerRunOnStartup: false,
      schedulerPostOpAutoTriggerIntervalHours: 1,
      schedulerReportIntervalHours: 24,
      schedulerBackupIntervalHours: 24,
      schedulerRestoreDrillIntervalHours: 168,
      schedulerRestoreDrillFullIntervalHours: 720,
      schedulerAuditIntegrityIntervalHours: 24,
      schedulerSecretRotationIntervalHours: 24,
      schedulerReleaseGovernanceIntervalHours: 24,
      schedulerAlertProbeIntervalMinutes: 15,
    },
    authStore: {
      async addAuditEvent() {
        return true;
      },
      async listTenantMembers() {
        return [];
      },
      async verifyAuditIntegrity() {
        return { ok: true, checkedEvents: 0, issues: [] };
      },
    },
    templateStore: {
      async summarizeRisk() {
        return { highCriticalOpen: [], topReasonCodes: [] };
      },
      async summarizeIncidents() {
        return { totals: { openUnresolved: 0, breachedOpen: 0 } };
      },
      async autoAssignOpenIncidentOwners() {
        return { assignedCount: 0, eligibleOpenUnowned: 0, assigned: [] };
      },
      async autoEscalateBreachedIncidents() {
        return { escalatedCount: 0, eligibleBreachedOpen: 0, escalated: [] };
      },
    },
    postOpReviewStore,
    bookingStore,
    postOpAutoTriggerDeps: {
      capabilityExecutor,
      bookingStore,
    },
    logger: {
      log() {},
      warn() {},
      error() {},
    },
  });

  try {
    const run = await scheduler.runJob('post_op_auto_trigger', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.triggered, 1);
    assert.equal(capabilityCalls.length, 1);
    assert.equal(capabilityCalls[0].capabilityName, 'RequestPostOpReview');
    assert.equal(capabilityCalls[0].input.bookingCaseId, 'case-post-op-1');
  } finally {
    await scheduler.stop();
  }
});
