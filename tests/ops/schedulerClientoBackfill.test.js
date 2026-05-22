const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createScheduler } = require('../../src/ops/scheduler');
const { createCcoCustomerStore } = require('../../src/ops/ccoCustomerStore');
const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-scheduler-cliento-'));
  const csvPath = path.join(tempDir, 'hair-tp-clinic-customers.csv');
  const truthStorePath = path.join(tempDir, 'cco-mailbox-truth.json');
  const customerStorePath = path.join(tempDir, 'cco-customers.json');

  await fs.writeFile(
    csvPath,
    [
      'Namn,Telefon (mobil),Telefon (annat),Epost,Personnummer',
      'Alice Test,0701234567,,alice@example.com,198001019876',
    ].join('\n'),
    'utf8'
  );
  await fs.writeFile(truthStorePath, JSON.stringify({}, null, 2), 'utf8');

  const truthStore = await createCcoMailboxTruthStore({ filePath: truthStorePath });
  const run = await truthStore.startBackfillRun({
    mailboxIds: ['egzona@hairtpclinic.com'],
    folderTypes: ['inbox'],
  });
  await truthStore.recordFolderPage({
    runId: run.runId,
    account: {
      mailboxId: 'egzona@hairtpclinic.com',
      mailboxAddress: 'egzona@hairtpclinic.com',
      userPrincipalName: 'egzona@hairtpclinic.com',
    },
    folder: {
      folderId: 'inbox',
      folderName: 'Inbox',
      folderType: 'inbox',
      wellKnownName: 'inbox',
      totalItemCount: 1,
      unreadItemCount: 1,
      messageCollectionCount: 1,
    },
    messages: [
      {
        graphMessageId: 'msg-1',
        conversationId: 'conv-1',
        subject: 'Hej Alice',
        bodyPreview: 'Vi hörs gärna angående din bokning.',
        direction: 'inbound',
        folderType: 'inbox',
        isRead: false,
        from: {
          address: 'alice@example.com',
          name: 'Alice Test',
        },
        receivedAt: '2026-04-01T08:00:00.000Z',
        lastModifiedAt: '2026-04-01T08:00:00.000Z',
      },
    ],
    complete: true,
  });
  await truthStore.finishBackfillRun(run.runId, { status: 'completed', error: null });

  const customerStore = await createCcoCustomerStore({ filePath: customerStorePath });

  const scheduler = createScheduler({
    config: {
      schedulerEnabled: true,
      defaultTenantId: 'hair-tp-clinic',
      schedulerCcoWeeklyBriefIntervalHours: 24,
      schedulerCcoMonthlyRiskIntervalHours: 24,
      schedulerCcoForwardOutlookIntervalHours: 6,
      schedulerCcoClientoBackfillIntervalHours: 24,
      schedulerReportWindowDays: 14,
      schedulerReportIntervalHours: 24,
      schedulerBackupIntervalHours: 24,
      schedulerRestoreDrillIntervalHours: 168,
      schedulerRestoreDrillFullIntervalHours: 720,
      schedulerAuditIntegrityIntervalHours: 24,
      schedulerSecretRotationIntervalHours: 24,
      schedulerReleaseGovernanceIntervalHours: 24,
      schedulerAlertProbeIntervalMinutes: 15,
      schedulerStartupDelaySec: 0,
      schedulerJitterSec: 0,
      schedulerRunOnStartup: false,
      schedulerSloAutoTicketingEnabled: false,
      schedulerSloTicketMaxPerRun: 8,
      schedulerReleaseGovernanceAutoReviewEnabled: false,
      schedulerSecretRotationDryRun: true,
      schedulerSecretRotationNote: 'note',
      monitorRestoreDrillMaxAgeDays: 30,
      monitorPilotReportMaxAgeHours: 24,
      observabilityAlertMaxErrorRatePct: 2.5,
      observabilityAlertMaxP95Ms: 1800,
      observabilityAlertMaxSlowRequests: 25,
      metricsSlowRequestMs: 1000,
      reportsDir: path.join(tempDir, 'reports'),
      reportRetentionMaxFiles: 20,
      reportRetentionMaxAgeDays: 45,
      backupDir: path.join(tempDir, 'backups'),
      backupRetentionMaxFiles: 20,
      backupRetentionMaxAgeDays: 30,
      ccoCustomerStorePath: customerStorePath,
      ccoMailboxTruthStorePath: truthStorePath,
      schedulerCcoClientoBackfillCsvPath: csvPath,
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
    },
    ccoHistoryStore: truthStore,
    ccoCustomerStore: customerStore,
    logger: { log() {}, error() {} },
  });

  return {
    tempDir,
    scheduler,
    customerStore,
    truthStorePath,
    customerStorePath,
    csvPath,
  };
}

test('scheduler cco_cliento_backfill kör om stabilt och exponerar coverage/status', async () => {
  const fixture = await createFixture();

  try {
    const firstRun = await fixture.scheduler.runJob('cco_cliento_backfill', {
      trigger: 'manual',
      tenantId: 'hair-tp-clinic',
      actorUserId: 'owner-1',
    });

    assert.equal(firstRun.ok, true);
    assert.equal(firstRun.result.selectedRowCount, 1);
    assert.equal(firstRun.result.after.identityCount, 1);
    assert.equal(firstRun.result.after.canonicalCount, 1);
    assert.equal(firstRun.result.after.sourceCounts.cliento, 1);
    assert.equal(firstRun.result.truth.identityCount, 1);
    assert.equal(firstRun.result.consumer.identityCount, 1);
    assert.equal(firstRun.result.shadow.shadowIdentityCount, 1);

    const firstStatus = fixture.scheduler.getStatus();
    const firstJob = firstStatus.jobs.find((job) => job.id === 'cco_cliento_backfill');
    assert.ok(firstJob);
    assert.equal(firstJob.lastStatus, 'success');
    assert.equal(firstJob.lastResult?.after?.canonicalCount, 1);
    assert.equal(firstJob.lastResult?.sourceCounts?.cliento, 1);

    const secondRun = await fixture.scheduler.runJob('cco_cliento_backfill', {
      trigger: 'manual',
      tenantId: 'hair-tp-clinic',
      actorUserId: 'owner-1',
    });

    assert.equal(secondRun.ok, true);
    assert.equal(secondRun.result.after.identityCount, 1);
    assert.equal(secondRun.result.after.canonicalCount, 1);
    assert.equal(secondRun.result.after.sourceCounts.cliento, 1);
    assert.equal(secondRun.result.truth.identityCount, 1);
    assert.equal(secondRun.result.consumer.identityCount, 1);
    assert.equal(secondRun.result.shadow.shadowIdentityCount, 1);

    const secondStatus = fixture.scheduler.getStatus();
    const secondJob = secondStatus.jobs.find((job) => job.id === 'cco_cliento_backfill');
    assert.ok(secondJob);
    assert.equal(secondJob.runCount >= 2, true);
    assert.equal(secondJob.lastStatus, 'success');
    assert.equal(secondJob.lastResult?.after?.canonicalCount, 1);
    assert.equal(secondJob.lastResult?.sourceCounts?.cliento, 1);
  } finally {
    await fixture.scheduler.stop();
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('scheduler cco_cliento_backfill kräver explicit csv path och fail-closar annars', async () => {
  const fixture = await createFixture();
  const truthStore = await createCcoMailboxTruthStore({ filePath: fixture.truthStorePath });

  try {
    const schedulerWithoutCsv = createScheduler({
      config: {
        schedulerEnabled: true,
        defaultTenantId: 'hair-tp-clinic',
        schedulerCcoWeeklyBriefIntervalHours: 24,
        schedulerCcoMonthlyRiskIntervalHours: 24,
        schedulerCcoForwardOutlookIntervalHours: 6,
        schedulerCcoClientoBackfillIntervalHours: 24,
        schedulerReportWindowDays: 14,
        schedulerReportIntervalHours: 24,
        schedulerBackupIntervalHours: 24,
        schedulerRestoreDrillIntervalHours: 168,
        schedulerRestoreDrillFullIntervalHours: 720,
        schedulerAuditIntegrityIntervalHours: 24,
        schedulerSecretRotationIntervalHours: 24,
        schedulerReleaseGovernanceIntervalHours: 24,
        schedulerAlertProbeIntervalMinutes: 15,
        schedulerStartupDelaySec: 0,
        schedulerJitterSec: 0,
        schedulerRunOnStartup: false,
        schedulerSloAutoTicketingEnabled: false,
        schedulerSloTicketMaxPerRun: 8,
        schedulerReleaseGovernanceAutoReviewEnabled: false,
        schedulerSecretRotationDryRun: true,
        schedulerSecretRotationNote: 'note',
        monitorRestoreDrillMaxAgeDays: 30,
        monitorPilotReportMaxAgeHours: 24,
        observabilityAlertMaxErrorRatePct: 2.5,
        observabilityAlertMaxP95Ms: 1800,
        observabilityAlertMaxSlowRequests: 25,
        metricsSlowRequestMs: 1000,
        reportsDir: path.join(fixture.tempDir, 'reports-2'),
        reportRetentionMaxFiles: 20,
        reportRetentionMaxAgeDays: 45,
        backupDir: path.join(fixture.tempDir, 'backups-2'),
        backupRetentionMaxFiles: 20,
        backupRetentionMaxAgeDays: 30,
        ccoCustomerStorePath: fixture.customerStorePath,
        ccoMailboxTruthStorePath: fixture.truthStorePath,
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
      },
      ccoHistoryStore: truthStore,
      ccoCustomerStore: fixture.customerStore,
      logger: { log() {}, error() {} },
    });

    const skippedRun = await schedulerWithoutCsv.runJob('cco_cliento_backfill', {
      trigger: 'manual',
      tenantId: 'hair-tp-clinic',
      actorUserId: 'owner-1',
    });

    assert.equal(skippedRun.ok, true);
    assert.equal(skippedRun.result.skipped, true);
    assert.equal(skippedRun.result.reason, 'cliento_backfill_csv_path_missing');
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
