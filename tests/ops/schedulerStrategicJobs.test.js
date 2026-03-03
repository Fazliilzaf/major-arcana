const test = require('node:test');
const assert = require('node:assert/strict');

const { createScheduler } = require('../../src/ops/scheduler');

function buildConfig() {
  return {
    schedulerEnabled: true,
    defaultTenantId: 'tenant-a',
    schedulerCcoWeeklyBriefIntervalHours: 24,
    schedulerCcoMonthlyRiskIntervalHours: 24,
    schedulerCcoForwardOutlookIntervalHours: 6,
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
    reportsDir: '/tmp/arcana-reports',
    reportRetentionMaxFiles: 20,
    reportRetentionMaxAgeDays: 45,
    backupDir: '/tmp/arcana-backups',
    backupRetentionMaxFiles: 20,
    backupRetentionMaxAgeDays: 30,
  };
}

function makeInboxAnalysisEntry(ts, rows = []) {
  return {
    ts,
    output: {
      data: {
        conversationWorklist: rows,
      },
    },
  };
}

test('scheduler strategic jobs persist weekly/monthly/forward insights', async () => {
  const appended = [];
  const analysisStore = {
    async list({ capabilityName }) {
      if (capabilityName !== 'CCO.InboxAnalysis') return [];
      return [
        makeInboxAnalysisEntry('2026-02-28T10:00:00.000Z', [
          {
            conversationId: 'conv-1',
            needsReplyStatus: 'needs_reply',
            intent: 'complaint',
            tone: 'frustrated',
            slaStatus: 'breach',
            hoursSinceInbound: 10,
            priorityLevel: 'Critical',
          },
        ]),
        makeInboxAnalysisEntry('2026-02-27T10:00:00.000Z', [
          {
            conversationId: 'conv-2',
            needsReplyStatus: 'needs_reply',
            intent: 'booking_request',
            tone: 'anxious',
            slaStatus: 'warning',
            hoursSinceInbound: 8,
            priorityLevel: 'High',
          },
        ]),
      ];
    },
    async append(entry) {
      appended.push(entry);
      return {
        id: `entry-${appended.length}`,
        ...entry,
      };
    },
  };

  const scheduler = createScheduler({
    config: buildConfig(),
    authStore: {
      async addAuditEvent() {
        return true;
      },
      async listAuditEvents() {
        return [];
      },
      async listTenantMembers() {
        return [];
      },
      async verifyAuditIntegrity() {
        return { ok: true, checkedEvents: 1, issues: [] };
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
    capabilityAnalysisStore: analysisStore,
    logger: { log() {}, error() {} },
  });

  try {
    const weekly = await scheduler.runJob('cco_weekly_brief', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });
    const monthly = await scheduler.runJob('cco_monthly_risk', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });
    const forward = await scheduler.runJob('cco_forward_outlook', {
      trigger: 'manual',
      tenantId: 'tenant-a',
      actorUserId: 'owner-1',
    });

    assert.equal(weekly.ok, true);
    assert.equal(monthly.ok, true);
    assert.equal(forward.ok, true);
    const capabilityNames = appended.map((item) => item?.capabilityName).filter(Boolean);
    assert.equal(capabilityNames.includes('CCO.WeeklyBriefComposer'), true);
    assert.equal(capabilityNames.includes('CCO.MonthlyRiskAnalyzer'), true);
    assert.equal(capabilityNames.includes('CCO.BusinessThreatAnalyzer'), true);
    assert.equal(capabilityNames.includes('CCO.ForwardOutlookEngine'), true);
    assert.equal(capabilityNames.includes('CCO.ScenarioEngine'), true);
    assert.equal(capabilityNames.includes('CCO.StrategicInsights'), true);
  } finally {
    await scheduler.stop();
  }
});

