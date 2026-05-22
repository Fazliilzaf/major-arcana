const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createScheduler } = require('../../src/ops/scheduler');
const { createCapabilityAnalysisStore } = require('../../src/capabilities/analysisStore');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');
const { createCcoHistoryStore } = require('../../src/ops/ccoHistoryStore');
const { createStateBackup } = require('../../src/ops/stateBackup');

function buildBaseConfig(tmpDir) {
  const dataDir = path.join(tmpDir, 'state');
  const backupDir = path.join(tmpDir, 'backups');
  return {
    schedulerEnabled: true,
    defaultTenantId: 'tenant-a',
    schedulerReportWindowDays: 14,
    schedulerCcoHistorySyncIntervalHours: 6,
    schedulerCcoHistoryMailboxId: 'kons@hairtpclinic.com',
    schedulerCcoHistoryRecentWindowDays: 30,
    schedulerCcoHistoryBackfillLookbackDays: 90,
    schedulerCcoHistoryBackfillChunkDays: 30,
    schedulerCcoShadowRunIntervalHours: 6,
    schedulerCcoShadowReviewIntervalHours: 24,
    schedulerCcoShadowMailboxIds: ['kons@hairtpclinic.com'],
    schedulerCcoShadowLookbackDays: 14,
    schedulerCcoShadowReviewLookbackDays: 14,
    schedulerReportIntervalHours: 24,
    schedulerBackupIntervalHours: 24,
    schedulerRestoreDrillIntervalHours: 168,
    schedulerRestoreDrillFullIntervalHours: 720,
    schedulerAuditIntegrityIntervalHours: 24,
    schedulerSecretRotationIntervalHours: 24,
    schedulerReleaseGovernanceIntervalHours: 24,
    schedulerReleaseGovernanceAutoReviewEnabled: true,
    schedulerSecretRotationDryRun: true,
    schedulerSecretRotationNote: 'Scheduled secret rotation snapshot',
    schedulerAlertProbeIntervalMinutes: 15,
    schedulerIncidentAutoAssignOwnerEnabled: true,
    schedulerIncidentAutoAssignOwnerLimit: 50,
    schedulerIncidentAutoEscalationEnabled: true,
    schedulerIncidentAutoEscalationLimit: 25,
    schedulerSloAutoTicketingEnabled: false,
    schedulerSloTicketMaxPerRun: 8,
    schedulerStartupDelaySec: 0,
    schedulerJitterSec: 0,
    schedulerRunOnStartup: false,
    monitorRestoreDrillMaxAgeDays: 30,
    monitorPilotReportMaxAgeHours: 24,
    observabilityAlertMaxErrorRatePct: 2.5,
    observabilityAlertMaxP95Ms: 1800,
    observabilityAlertMaxSlowRequests: 25,
    metricsSlowRequestMs: 1000,
    reportsDir: path.join(tmpDir, 'reports'),
    reportRetentionMaxFiles: 20,
    reportRetentionMaxAgeDays: 45,
    backupDir,
    backupRetentionMaxFiles: 20,
    backupRetentionMaxAgeDays: 30,
    authStorePath: path.join(dataDir, 'auth.json'),
    templateStorePath: path.join(dataDir, 'templates.json'),
    tenantConfigStorePath: path.join(dataDir, 'tenant-config.json'),
    memoryStorePath: path.join(dataDir, 'memory.json'),
    secretRotationStorePath: path.join(dataDir, 'secret-rotation.json'),
    patientSignalStorePath: path.join(dataDir, 'patient-signals.json'),
    sloTicketStorePath: path.join(dataDir, 'slo-tickets.json'),
    releaseGovernanceStorePath: path.join(dataDir, 'release-governance.json'),
    releaseNoGoFreeDays: 14,
    releasePentestMaxAgeDays: 120,
    releaseRequirePentestEvidence: false,
    releaseRequireDistinctSignoffUsers: true,
    releasePostLaunchReviewWindowDays: 30,
    releasePostLaunchStabilizationDays: 14,
    releaseEnforcePostLaunchStabilization: false,
    releaseRealityAuditIntervalDays: 90,
  };
}

function createHistorySnapshotForWindow({
  mailboxId = 'kons@hairtpclinic.com',
  customerEmail = 'patient@example.com',
  messageId = 'msg-1',
  sentAt,
} = {}) {
  return {
    conversations: [
      {
        conversationId: `conv-${messageId}`,
        subject: 'Kons historik',
        customerEmail,
        mailboxId,
        mailboxAddress: mailboxId,
        userPrincipalName: mailboxId,
        messages: [
          {
            messageId,
            sentAt,
            direction: 'inbound',
            bodyPreview: 'Historiskt meddelande.',
            senderEmail: customerEmail,
            senderName: 'Patient',
            recipients: [mailboxId],
            replyToRecipients: [],
          },
        ],
      },
    ],
  };
}

function createBaseAuthStore({ verifyAuditIntegrityResult = null } = {}) {
  return {
    async addAuditEvent() {
      return true;
    },
    async listTenantMembers() {
      return [
        {
          user: { id: 'owner-1' },
          membership: { role: 'OWNER', status: 'active' },
        },
      ];
    },
    async verifyAuditIntegrity() {
      return (
        verifyAuditIntegrityResult || {
          ok: true,
          checkedEvents: 10,
          issues: [],
        }
      );
    },
  };
}

function createBaseTemplateStore() {
  return {
    async summarizeRisk() {
      return {
        highCriticalOpen: [],
        topReasonCodes: [],
      };
    },
    async summarizeIncidents() {
      return {
        totals: {
          openUnresolved: 0,
          breachedOpen: 0,
        },
      };
    },
    async autoAssignOpenIncidentOwners() {
      return {
        assignedCount: 0,
        eligibleOpenUnowned: 0,
        assigned: [],
      };
    },
    async autoEscalateBreachedIncidents() {
      return {
        escalatedCount: 0,
        eligibleBreachedOpen: 0,
        escalated: [],
      };
    },
  };
}

test('scheduler audit_integrity_check sends critical alert on integrity failure', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-integrity-job-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const alerts = [];

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore({
        verifyAuditIntegrityResult: {
          ok: false,
          checkedEvents: 42,
          issues: [{ id: 'gap-1' }],
        },
      }),
      templateStore: createBaseTemplateStore(),
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('audit_integrity_check', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.ok, false);
    assert.equal(run.result.checkedEvents, 42);
    assert.equal(run.result.issues, 1);
    assert.ok(alerts.some((item) => String(item?.eventType || '') === 'audit.integrity.failure'));
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler secrets_rotation_snapshot runs and notifies on stale required secrets', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-secrets-rotation-job-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const alerts = [];
    const captureCalls = [];

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      secretRotationStore: {
        async captureSnapshot(input) {
          captureCalls.push(input);
          return {
            totals: {
              tracked: 3,
              required: 2,
              staleRequired: 1,
              pendingRotation: 1,
              changedCount: 1,
            },
          };
        },
      },
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('secrets_rotation_snapshot', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.tracked, 3);
    assert.equal(run.result.required, 2);
    assert.equal(run.result.staleRequired, 1);
    assert.equal(captureCalls.length, 1);
    assert.equal(captureCalls[0].dryRun, true);
    assert.ok(
      alerts.some((item) => String(item?.eventType || '') === 'secrets.rotation.stale_required')
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler restore_drill_full performs sandbox restore validation', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-restore-drill-full-job-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const stateFileMap = {
      auth: config.authStorePath,
      templates: config.templateStorePath,
      tenantConfig: config.tenantConfigStorePath,
      memory: config.memoryStorePath,
      secretRotation: config.secretRotationStorePath,
      patientSignals: config.patientSignalStorePath,
      sloTickets: config.sloTicketStorePath,
      releaseGovernance: config.releaseGovernanceStorePath,
    };

    for (const filePath of Object.values(stateFileMap)) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify({ version: 1 }, null, 2), 'utf8');
    }

    await createStateBackup({
      stateFileMap,
      backupDir: config.backupDir,
      createdBy: 'test',
    });

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('restore_drill_full', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.ok, true);
    assert.equal(run.result.parseErrorCount, 0);
    assert.equal(run.result.missingCount, 0);
    assert.ok(run.result.restoredCount >= 7);
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler release_governance_review alerts when release gate has blockers', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-governance-job-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const alerts = [];

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      releaseGovernanceStore: {
        async evaluateCycle() {
          return {
            cycle: {
              id: 'rel_1',
              status: 'planning',
            },
            evaluation: {
              releaseGatePassed: false,
              blockers: [{ id: 'strict_ops_failed' }, { id: 'signoff_missing' }],
              postLaunchReview: {
                healthy: true,
              },
              realityAudit: {
                healthy: true,
              },
            },
          };
        },
      },
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('release_governance_review', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.releaseGatePassed, false);
    assert.equal(run.result.blockerCount, 2);
    assert.ok(alerts.some((item) => String(item?.eventType || '') === 'release.governance.blocked'));
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler cco_history_sync värmer senaste fönstret och backfillar bakåt chunkvis', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-history-sync-job-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    config.schedulerCcoHistoryMailboxIds = [
      'kons@hairtpclinic.com',
      'info@hairtpclinic.com',
    ];
    const ccoHistoryStore = await createCcoHistoryStore({
      filePath: path.join(tmpDir, 'cco-history.json'),
    });
    const ccoCustomerStore = await createCcoCustomerStore({
      filePath: path.join(tmpDir, 'cco-customers.json'),
      historyStore: ccoHistoryStore,
    });
    const baseNowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const graphCalls = [];

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      ccoHistoryStore,
      ccoCustomerStore,
      graphReadConnector: {
        async fetchInboxSnapshot(options = {}) {
          graphCalls.push({
            sinceIso: options.sinceIso,
            untilIso: options.untilIso,
            mailboxIds: options.mailboxIds,
          });
          const ageDays = Math.round(
            (baseNowMs - Date.parse(String(options.untilIso || ''))) / dayMs
          );
          const bucket =
            ageDays >= 55 ? 'backfill-2' : ageDays >= 25 ? 'backfill-1' : 'recent';
          return createHistorySnapshotForWindow({
            mailboxId: options.mailboxIds?.[0] || 'kons@hairtpclinic.com',
            messageId: bucket,
            sentAt: new Date(
              Date.parse(String(options.sinceIso || '')) + 60 * 60 * 1000
            ).toISOString(),
          });
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const firstRun = await scheduler.runJob('cco_history_sync', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(firstRun.ok, true);
    assert.deepEqual(firstRun.result.mailboxIds, [
      'kons@hairtpclinic.com',
      'info@hairtpclinic.com',
    ]);
    assert.equal(firstRun.result.mailboxes.length, 2);
    assert.equal(firstRun.result.mailboxes[0].recentSync.messageCount, 1);
    assert.equal(firstRun.result.mailboxes[0].backfill.performed, true);
    assert.equal(firstRun.result.mailboxes[1].recentSync.messageCount, 1);
    assert.equal(firstRun.result.mailboxes[1].backfill.performed, true);
    assert.equal(firstRun.result.totalMessageCount, 4);
    assert.equal(firstRun.result.missingWindowCount, 2);
    assert.equal(firstRun.result.complete, false);
    assert.equal(firstRun.result.backfillPerformedCount, 2);
    assert.equal(firstRun.result.customerReplyMaterializedCount, 0);
    assert.equal(firstRun.result.customerStateWriteBack.attempted, false);
    assert.equal(graphCalls.length, 4);

    await assert.rejects(
      fs.readFile(path.join(tmpDir, 'cco-customers.json'), 'utf8'),
      (error) => error && error.code === 'ENOENT'
    );

    const secondRun = await scheduler.runJob('cco_history_sync', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(secondRun.ok, true);
    assert.equal(secondRun.result.mailboxes[0].backfill.performed, true);
    assert.equal(secondRun.result.mailboxes[1].backfill.performed, true);
    assert.equal(secondRun.result.totalMessageCount, 6);
    assert.equal(secondRun.result.missingWindowCount, 0);
    assert.equal(secondRun.result.complete, true);
    assert.equal(secondRun.result.completeMailboxCount, 2);
    assert.equal(secondRun.result.customerReplyMaterializedCount, 0);
    assert.equal(secondRun.result.customerStateWriteBack.attempted, true);
    assert.equal(secondRun.result.customerStateWriteBack.changed, true);
    assert.equal(graphCalls.length, 8);

    const secondCustomerStateRaw = JSON.parse(
      await fs.readFile(path.join(tmpDir, 'cco-customers.json'), 'utf8')
    );
    assert.ok(
      Object.keys(secondCustomerStateRaw.tenants?.['tenant-a']?.customerState?.identityByKey || {})
        .length > 0
    );
    assert.ok(
      Object.keys(
        secondCustomerStateRaw.tenants?.['tenant-a']?.customerState?.primaryEmailByKey || {}
      ).length > 0
    );

    const secondCustomerStateRawText = await fs.readFile(
      path.join(tmpDir, 'cco-customers.json'),
      'utf8'
    );
    const thirdRun = await scheduler.runJob('cco_history_sync', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });
    assert.equal(thirdRun.ok, true);
    assert.equal(thirdRun.result.customerStateWriteBack.attempted, true);
    assert.equal(thirdRun.result.customerStateWriteBack.changed, false);
    const thirdCustomerStateRawText = await fs.readFile(
      path.join(tmpDir, 'cco-customers.json'),
      'utf8'
    );
    assert.equal(thirdCustomerStateRawText, secondCustomerStateRawText);

    const konsMessages = await ccoHistoryStore.listMailboxMessages({
      tenantId: 'tenant-a',
      mailboxId: 'kons@hairtpclinic.com',
    });
    const infoMessages = await ccoHistoryStore.listMailboxMessages({
      tenantId: 'tenant-a',
      mailboxId: 'info@hairtpclinic.com',
    });
    assert.equal(konsMessages.length, 3);
    assert.equal(infoMessages.length, 3);
    assert.deepEqual(
      konsMessages.map((message) => message.messageId).sort(),
      ['backfill-1', 'backfill-2', 'recent']
    );
    assert.deepEqual(
      infoMessages.map((message) => message.messageId).sort(),
      ['backfill-1', 'backfill-2', 'recent']
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler release_governance_review auto-adds daily post-launch review when missing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-release-governance-auto-review-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const alerts = [];
    const addedReviews = [];
    let evaluationCalls = 0;

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: {
        ...createBaseTemplateStore(),
        async summarizeRisk() {
          return {
            highCriticalOpen: [],
            topReasonCodes: [],
          };
        },
        async summarizeIncidents() {
          return {
            totals: {
              openUnresolved: 2,
              breachedOpen: 0,
            },
          };
        },
      },
      releaseGovernanceStore: {
        async evaluateCycle() {
          evaluationCalls += 1;
          if (evaluationCalls === 1) {
            return {
              cycle: {
                id: 'rel_auto_1',
                status: 'launched',
                postLaunchReviews: [],
              },
              evaluation: {
                releaseGatePassed: true,
                blockers: [],
                postLaunchReview: {
                  healthy: false,
                  expectedReviews: 4,
                  actualReviews: 3,
                  coveragePercent: 75,
                },
                realityAudit: {
                  healthy: true,
                },
              },
            };
          }
          return {
            cycle: {
              id: 'rel_auto_1',
              status: 'launched',
              postLaunchReviews: [{ id: 'rr_auto_1', ts: new Date().toISOString() }],
            },
            evaluation: {
              releaseGatePassed: true,
              blockers: [],
              postLaunchReview: {
                healthy: true,
                expectedReviews: 4,
                actualReviews: 4,
                coveragePercent: 100,
              },
              realityAudit: {
                healthy: true,
              },
            },
          };
        },
        async addPostLaunchReview(input) {
          addedReviews.push(input);
          return {
            review: {
              id: 'rr_auto_1',
              status: input.status,
            },
          };
        },
      },
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('release_governance_review', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(evaluationCalls, 2);
    assert.equal(addedReviews.length, 1);
    assert.equal(addedReviews[0].status, 'risk');
    assert.equal(run.result.autoReview.created, true);
    assert.equal(run.result.autoReview.status, 'risk');
    assert.ok(
      alerts.some(
        (item) => String(item?.eventType || '') === 'release.governance.post_launch_review_auto'
      )
    );
    assert.ok(
      !alerts.some(
        (item) => String(item?.eventType || '') === 'release.governance.post_launch_review_missing'
      )
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler release_governance_review skips auto-review when review already exists today', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-release-governance-auto-review-dedupe-')
  );
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const alerts = [];
    let addCalled = 0;

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      releaseGovernanceStore: {
        async evaluateCycle() {
          return {
            cycle: {
              id: 'rel_auto_2',
              status: 'launched',
              postLaunchReviews: [{ id: 'rr_today', ts: new Date().toISOString() }],
            },
            evaluation: {
              releaseGatePassed: true,
              blockers: [],
              postLaunchReview: {
                healthy: false,
                expectedReviews: 6,
                actualReviews: 4,
                coveragePercent: 66.67,
              },
              realityAudit: {
                healthy: true,
              },
            },
          };
        },
        async addPostLaunchReview() {
          addCalled += 1;
          return {
            review: {
              id: 'rr_should_not_create',
              status: 'ok',
            },
          };
        },
      },
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('release_governance_review', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(addCalled, 0);
    assert.equal(run.result.autoReview.created, false);
    assert.equal(run.result.autoReview.reason, 'already_reviewed_today');
    assert.ok(
      alerts.some(
        (item) =>
          String(item?.eventType || '') === 'release.governance.post_launch_review_missing'
      )
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler release_governance_review alerts on enforced post-launch stabilization gap', async () => {
  const tmpDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'arcana-release-governance-stabilization-alert-')
  );
  let scheduler = null;

  try {
    const config = {
      ...buildBaseConfig(tmpDir),
      schedulerReleaseGovernanceAutoReviewEnabled: false,
      releaseEnforcePostLaunchStabilization: true,
    };
    const alerts = [];

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      releaseGovernanceStore: {
        async evaluateCycle() {
          return {
            cycle: {
              id: 'rel_stabilization_1',
              status: 'launched',
              postLaunchReviews: [],
            },
            evaluation: {
              releaseGatePassed: true,
              blockers: [],
              postLaunchReview: {
                healthy: true,
              },
              postLaunchStabilization: {
                requiredDays: 14,
                daysSinceLaunch: 8,
                daysObserved: 8,
                expectedReviews: 8,
                actualReviews: 5,
                hasNoGoTrigger: false,
                completed: false,
                healthy: false,
                enforced: true,
              },
              realityAudit: {
                healthy: true,
              },
            },
          };
        },
      },
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return { ok: true, skipped: false, status: 200 };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    const run = await scheduler.runJob('release_governance_review', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.postLaunchStabilization?.healthy, false);
    assert.ok(
      alerts.some(
        (item) =>
          String(item?.eventType || '') ===
          'release.governance.post_launch_stabilization_incomplete'
      )
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('scheduler cco_shadow_run stores recommendations and cco_shadow_review summarizes real outcomes', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-shadow-run-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const capabilityAnalysisStore = await createCapabilityAnalysisStore({
      filePath: path.join(tmpDir, 'capability-analysis.json'),
    });
    const ccoHistoryStore = await createCcoHistoryStore({
      filePath: path.join(tmpDir, 'cco-history.json'),
    });
    const graphReadConnector = {
      async fetchInboxSnapshot(options = {}) {
        assert.equal(options.days, 14);
        assert.deepEqual(options.mailboxIds, ['kons@hairtpclinic.com']);
        return {
          conversations: [
            {
              conversationId: 'conv-shadow-1',
              subject: 'Kan jag boka om min tid?',
              customerEmail: 'patient@example.com',
              mailboxId: 'kons@hairtpclinic.com',
              mailboxAddress: 'kons@hairtpclinic.com',
              userPrincipalName: 'kons@hairtpclinic.com',
              messages: [
                {
                  messageId: 'msg-shadow-1',
                  sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                  direction: 'inbound',
                  bodyPreview: 'Hej, kan jag boka om min tid till fredag eftermiddag?',
                  senderEmail: 'patient@example.com',
                  senderName: 'Patient',
                  recipients: ['kons@hairtpclinic.com'],
                  replyToRecipients: [],
                },
              ],
            },
          ],
        };
      },
    };

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      capabilityAnalysisStore,
      ccoHistoryStore,
      graphReadConnector,
      logger: {
        log() {},
        error() {},
      },
    });

    const shadowRun = await scheduler.runJob('cco_shadow_run', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(shadowRun.ok, true);
    assert.equal(shadowRun.result.recommendationCount, 1);

    const shadowEntries = await capabilityAnalysisStore.list({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.ShadowRun',
      limit: 1,
    });
    const recommendation = shadowEntries[0]?.output?.data?.recommendations?.[0];
    assert.equal(recommendation.conversationId, 'conv-shadow-1');

    await ccoHistoryStore.recordAction({
      tenantId: 'tenant-a',
      conversationId: 'conv-shadow-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      actionType: 'reply_sent',
      actionLabel: 'Svar skickat',
      recordedAt: new Date().toISOString(),
      selectedMode: 'professional',
      recommendedMode: recommendation.recommendedMode,
      recommendedAction: recommendation.recommendedAction,
      intent: recommendation.intent,
    });
    await ccoHistoryStore.recordOutcome({
      tenantId: 'tenant-a',
      conversationId: 'conv-shadow-1',
      mailboxId: 'kons@hairtpclinic.com',
      customerEmail: 'patient@example.com',
      outcomeCode: 'rebooked',
      outcomeLabel: 'Ombokad',
      recordedAt: new Date().toISOString(),
      selectedMode: 'professional',
      recommendedMode: recommendation.recommendedMode,
      recommendedAction: recommendation.recommendedAction,
      intent: recommendation.intent,
    });

    const shadowReview = await scheduler.runJob('cco_shadow_review', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(shadowReview.ok, true);
    assert.equal(shadowReview.result.recommendationCount, 1);
    assert.equal(shadowReview.result.positiveCount, 1);
    assert.equal(shadowReview.result.customerReplyMaterializedCount, 0);

    const reviewEntries = await capabilityAnalysisStore.list({
      tenantId: 'tenant-a',
      capabilityName: 'CCO.ShadowReview',
      limit: 1,
    });
    assert.equal(reviewEntries.length, 1);
    assert.equal(reviewEntries[0]?.output?.data?.totals?.positiveCount, 1);
    assert.equal(
      reviewEntries[0]?.output?.data?.summaries?.actionSummaryByIntent?.[0]?.intent,
      recommendation.intent
    );
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
