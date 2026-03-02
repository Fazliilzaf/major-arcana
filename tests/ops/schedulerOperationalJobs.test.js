const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createScheduler } = require('../../src/ops/scheduler');
const { createStateBackup } = require('../../src/ops/stateBackup');

function buildBaseConfig(tmpDir) {
  const dataDir = path.join(tmpDir, 'state');
  const backupDir = path.join(tmpDir, 'backups');
  return {
    schedulerEnabled: true,
    defaultTenantId: 'tenant-a',
    schedulerReportWindowDays: 14,
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
    schedulerStrategicWeeklyIntervalHours: 168,
    schedulerStrategicMonthlyIntervalHours: 720,
    schedulerStrategicForwardIntervalHours: 24,
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

test('scheduler strategic snapshot jobs persist weekly/monthly/forward intelligence snapshots', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-strategic-scheduler-jobs-'));
  let scheduler = null;

  try {
    const config = buildBaseConfig(tmpDir);
    const appendedEntries = [];
    const capabilityAnalysisStore = {
      async list({ capabilityName }) {
        if (String(capabilityName || '') !== 'CCO.InboxAnalysis') return [];
        return [
          {
            id: 'cco-analysis-1',
            capabilityRunId: 'cap-run-1',
            output: {
              data: {
                conversationWorklist: [
                  {
                    conversationId: 'conv-1',
                    priorityLevel: 'High',
                    intent: 'booking_request',
                    tone: 'anxious',
                    needsReplyStatus: 'needs_reply',
                    hoursSinceInbound: 9,
                    engagementScore: 0.66,
                    lastInboundAt: '2026-03-01T08:00:00.000Z',
                    lastOutboundAt: null,
                    riskWords: ['oro'],
                  },
                ],
                usageAnalytics: {
                  avgResponseTimeHours: 8.2,
                  ccoUsageRate: 0.81,
                  systemRecommendationFollowRate: 0.64,
                },
                focusContext: {
                  isActive: false,
                  primaryDrivers: [],
                  severity: 'low',
                },
                strategicFlags: [],
              },
            },
          },
        ];
      },
      async append(entry) {
        appendedEntries.push(entry);
        return { id: `snapshot-${appendedEntries.length}` };
      },
    };

    scheduler = createScheduler({
      config,
      authStore: createBaseAuthStore(),
      templateStore: createBaseTemplateStore(),
      capabilityAnalysisStore,
      logger: {
        log() {},
        error() {},
      },
    });

    const weeklyRun = await scheduler.runJob('strategic_weekly_brief', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });
    const monthlyRun = await scheduler.runJob('strategic_monthly_risk', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });
    const forwardRun = await scheduler.runJob('strategic_forward_outlook', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(weeklyRun.ok, true);
    assert.equal(monthlyRun.ok, true);
    assert.equal(forwardRun.ok, true);
    assert.equal(weeklyRun.result.skipped, false);
    assert.equal(monthlyRun.result.skipped, false);
    assert.equal(forwardRun.result.skipped, false);
    assert.equal(appendedEntries.length, 3);
    const modes = appendedEntries.map((entry) => String(entry?.metadata?.mode || '').trim());
    assert.deepEqual(modes, ['weekly', 'monthly', 'forward']);
    appendedEntries.forEach((entry) => {
      assert.equal(entry?.capability?.name, 'Strategic.IntelligenceSnapshot');
      assert.equal(typeof entry?.output?.data?.weeklyBrief, 'object');
      assert.equal(typeof entry?.output?.data?.monthlyRisk, 'object');
      assert.equal(typeof entry?.output?.data?.scenarioSimulation, 'object');
      assert.equal(typeof entry?.output?.data?.businessThreats, 'object');
      assert.equal(typeof entry?.output?.data?.forwardOutlook, 'object');
    });
  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
