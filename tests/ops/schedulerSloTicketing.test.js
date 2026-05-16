const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createScheduler } = require('../../src/ops/scheduler');
const { createSloTicketStore } = require('../../src/ops/sloTicketStore');

test('scheduler alert_probe auto-creates slo tickets on breach signals', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-scheduler-slo-ticket-'));
  const ticketFilePath = path.join(tmpDir, 'slo-tickets.json');
  let scheduler = null;

  try {
    const sloTicketStore = await createSloTicketStore({
      filePath: ticketFilePath,
      maxTickets: 300,
    });

    const alerts = [];
    const audits = [];
    let breachMode = true;

    scheduler = createScheduler({
      config: {
        schedulerEnabled: true,
        defaultTenantId: 'tenant-a',
        schedulerReportWindowDays: 14,
        schedulerReportIntervalHours: 24,
        schedulerBackupIntervalHours: 24,
        schedulerRestoreDrillIntervalHours: 168,
        schedulerAlertProbeIntervalMinutes: 15,
        schedulerIncidentAutoAssignOwnerEnabled: true,
        schedulerIncidentAutoAssignOwnerLimit: 50,
        schedulerIncidentAutoEscalationEnabled: true,
        schedulerIncidentAutoEscalationLimit: 25,
        schedulerSloAutoTicketingEnabled: true,
        schedulerSloTicketMaxPerRun: 8,
        schedulerStartupDelaySec: 0,
        schedulerJitterSec: 0,
        schedulerRunOnStartup: false,
        observabilityAlertMaxErrorRatePct: 1.0,
        observabilityAlertMaxP95Ms: 1200,
        observabilityAlertMaxSlowRequests: 3,
        metricsSlowRequestMs: 1000,
        monitorRestoreDrillMaxAgeDays: 30,
        monitorPilotReportMaxAgeHours: 24,
      },
      authStore: {
        async addAuditEvent(event) {
          audits.push(event);
        },
        async listTenantMembers() {
          return [
            {
              user: { id: 'owner-1' },
              membership: { role: 'OWNER', status: 'active' },
            },
          ];
        },
      },
      templateStore: {
        async autoAssignOpenIncidentOwners() {
          return { assignedCount: 0, eligibleOpenUnowned: 0, assigned: [] };
        },
        async autoEscalateBreachedIncidents() {
          return { escalatedCount: 0, eligibleBreachedOpen: 0, escalated: [] };
        },
        async summarizeRisk() {
          return {
            highCriticalOpen: [],
            topReasonCodes: [],
          };
        },
        async summarizeIncidents() {
          if (!breachMode) {
            return {
              totals: {
                openUnresolved: 0,
                breachedOpen: 0,
              },
            };
          }
          return {
            totals: {
              openUnresolved: 3,
              breachedOpen: 2,
            },
          };
        },
      },
      runtimeMetricsStore: {
        getSnapshot() {
          if (!breachMode) {
            return {
              totals: {
                requests: 120,
                sampledRequests: 120,
                slowRequests: 0,
                statusBuckets: {
                  '5xx': 0,
                },
              },
              latency: {
                p95Ms: 320,
              },
            };
          }
          return {
            totals: {
              requests: 100,
              sampledRequests: 100,
              slowRequests: 9,
              statusBuckets: {
                '5xx': 7,
              },
            },
            latency: {
              p95Ms: 2400,
            },
          };
        },
      },
      sloTicketStore,
      alertNotifier: {
        enabled: true,
        async send(payload) {
          alerts.push(payload);
          return {
            ok: true,
            skipped: false,
            status: 200,
          };
        },
      },
      logger: {
        log() {},
        error() {},
      },
    });

    await scheduler.start();
    const run = await scheduler.runJob('alert_probe', {
      trigger: 'manual',
      actorUserId: 'owner-1',
      tenantId: 'tenant-a',
    });

    assert.equal(run.ok, true);
    assert.equal(run.result.sloAutoTicketing.enabled, true);
    assert.ok(run.result.sloAutoTicketing.created >= 1);
    assert.ok(run.result.sloAutoTicketing.processed >= 1);

    const openTickets = await sloTicketStore.listTickets({
      tenantId: 'tenant-a',
      status: 'open',
      limit: 20,
    });
    assert.ok(openTickets.count >= 1);
    assert.ok(alerts.some((item) => String(item?.eventType || '') === 'slo.breach.ticket'));
    assert.ok(audits.some((item) => String(item?.action || '') === 'slo.ticket.created'));

    breachMode = false;
    const clearRun = await scheduler.runJob('alert_probe', {
      trigger: 'manual',
      actorUserId: 'owner-1',
      tenantId: 'tenant-a',
    });
    assert.equal(clearRun.ok, true);
    assert.ok(clearRun.result.sloAutoTicketing.autoResolved >= 1);
    const remainingOpenTickets = await sloTicketStore.listTickets({
      tenantId: 'tenant-a',
      status: 'open',
      limit: 20,
    });
    const remainingSignatures = new Set(
      (remainingOpenTickets.tickets || []).map((item) => String(item?.signature || ''))
    );
    assert.equal(remainingSignatures.has('incident_response_breach'), false);
    assert.equal(remainingSignatures.has('availability_http_breach'), false);
    assert.equal(remainingSignatures.has('latency_p95_breach'), false);
    assert.equal(remainingSignatures.has('slow_requests_breach'), false);
    assert.ok(audits.some((item) => String(item?.action || '') === 'slo.ticket.auto_resolved'));

  } finally {
    if (scheduler && typeof scheduler.stop === 'function') {
      await scheduler.stop();
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
