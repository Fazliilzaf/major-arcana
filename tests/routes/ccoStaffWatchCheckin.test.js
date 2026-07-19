'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoStaffRouter } = require('../../src/routes/ccoStaff');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoTreatmentEncounterStore } = require('../../src/ops/ccoTreatmentEncounterStore');

const TENANT = 'hair-tp-clinic';
const ACTOR = { userId: 'u-owner-1', role: 'OWNER', displayName: 'Owner' };

function fakeAuthStore(events = []) {
  return {
    requireAuth(req, _res, next) {
      req.auth = { tenantId: TENANT, userId: ACTOR.userId, role: ACTOR.role };
      req.currentUser = {
        id: ACTOR.userId,
        email: 'owner@test.se',
        displayName: ACTOR.displayName,
      };
      req.currentMembership = { tenantId: TENANT, role: ACTOR.role };
      next();
    },
    async addAuditEvent(event) {
      const safe = {
        ...event,
        id: `audit-${events.length + 1}`,
        ts: new Date().toISOString(),
      };
      events.push(safe);
      return safe;
    },
  };
}

function requireRole() {
  return (_req, _res, next) => next();
}

async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

test('watch-checkin persists checked_in on today encounter', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-staff-checkin-'));
  try {
    const patientMasterStore = await createCcoPatientMasterStore({
      filePath: path.join(tmp, 'patient-master.json'),
    });
    const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
      filePath: path.join(tmp, 'encounters.json'),
    });
    const authStore = fakeAuthStore();
    const patient = await patientMasterStore.upsertPatient({
      tenantId: TENANT,
      displayName: 'Today Visit',
      primaryEmail: 'today@example.com',
    });
    const encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      bookingId: 'booking-today',
      serviceLabel: 'Konsultation',
      startsAt: new Date().toISOString(),
      status: 'confirmed',
    });

    const app = express();
    app.use(express.json());
    app.use(
      createCcoStaffRouter({
        patientMasterStore,
        treatmentEncounterStore,
        authStore,
        config: {
          defaultTenant: TENANT,
          ccoBookingEngineStorePath: path.join(tmp, 'booking-engine.json'),
          ccoBookingStorePath: path.join(tmp, 'booking-store.json'),
          ccoTreatmentEncounterStorePath: path.join(tmp, 'encounters.json'),
        },
        requireAuth: authStore.requireAuth.bind(authStore),
        requireRole,
      })
    );

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/cco/staff/watch-checkin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, bookingId: 'booking-today' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.persisted, true);
      assert.equal(body.encounterId, encounter.encounterId);
    });

    const persisted = await treatmentEncounterStore.getEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      encounterId: encounter.encounterId,
    });
    assert.equal(persisted.status, 'checked_in');
    assert.ok(persisted.metadata.checkedInAt);
    assert.equal(persisted.metadata.checkedInSource, 'v9_watch_swipe');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('watch-complete-visit persists completed on today encounter', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-staff-complete-'));
  try {
    const patientMasterStore = await createCcoPatientMasterStore({
      filePath: path.join(tmp, 'patient-master.json'),
    });
    const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
      filePath: path.join(tmp, 'encounters.json'),
    });
    const authStore = fakeAuthStore();
    const patient = await patientMasterStore.upsertPatient({
      tenantId: TENANT,
      displayName: 'Today Complete',
      primaryEmail: 'complete@example.com',
    });
    const encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      bookingId: 'booking-today-complete',
      serviceLabel: 'PRP',
      startsAt: new Date().toISOString(),
      status: 'in_progress',
      metadata: { checkedInAt: new Date().toISOString() },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createCcoStaffRouter({
        patientMasterStore,
        treatmentEncounterStore,
        authStore,
        config: {
          defaultTenant: TENANT,
          ccoBookingEngineStorePath: path.join(tmp, 'booking-engine.json'),
          ccoBookingStorePath: path.join(tmp, 'booking-store.json'),
          ccoTreatmentEncounterStorePath: path.join(tmp, 'encounters.json'),
        },
        requireAuth: authStore.requireAuth.bind(authStore),
        requireRole,
      })
    );

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/cco/staff/watch-complete-visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, bookingId: 'booking-today-complete' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.persisted, true);
      assert.equal(body.encounterId, encounter.encounterId);
    });

    const persisted = await treatmentEncounterStore.getEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      encounterId: encounter.encounterId,
    });
    assert.equal(persisted.status, 'completed');
    assert.ok(persisted.metadata.completedAt);
    assert.equal(persisted.metadata.completedSource, 'v9_active_visit');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('watch-complete-visit fails closed when critical warning is not acknowledged', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-staff-complete-critical-'));
  try {
    const patientMasterStore = await createCcoPatientMasterStore({
      filePath: path.join(tmp, 'patient-master.json'),
    });
    const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
      filePath: path.join(tmp, 'encounters.json'),
    });
    const authStore = fakeAuthStore();
    const patient = await patientMasterStore.upsertPatient({
      tenantId: TENANT,
      displayName: 'Critical Warning',
      primaryEmail: 'critical@example.com',
    });
    const encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      bookingId: 'booking-critical',
      serviceLabel: 'HT',
      startsAt: new Date().toISOString(),
      status: 'in_progress',
      metadata: {
        checkedInAt: new Date().toISOString(),
        automationSignals: [
          {
            ruleId: 'customer.missing_agreement_consent_bundle',
            what: 'Avtal + samtycke saknas',
            risk: 'legal_blocker',
            status: 'active',
          },
        ],
      },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createCcoStaffRouter({
        patientMasterStore,
        treatmentEncounterStore,
        authStore,
        config: {
          defaultTenant: TENANT,
          ccoBookingEngineStorePath: path.join(tmp, 'booking-engine.json'),
          ccoBookingStorePath: path.join(tmp, 'booking-store.json'),
          ccoTreatmentEncounterStorePath: path.join(tmp, 'encounters.json'),
        },
        requireAuth: authStore.requireAuth.bind(authStore),
        requireRole,
      })
    );

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/cco/staff/watch-complete-visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: patient.id, bookingId: 'booking-critical' }),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.metadata.code, 'critical_warning_ack_required');
      assert.equal(body.metadata.warnings[0].ruleId, 'customer.missing_agreement_consent_bundle');
    });

    const persisted = await treatmentEncounterStore.getEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      encounterId: encounter.encounterId,
    });
    assert.equal(persisted.status, 'in_progress');
    assert.equal(persisted.metadata.completedAt, undefined);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('watch-complete-visit stores scoped critical warning acknowledgement metadata', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-staff-complete-critical-ack-'));
  try {
    const patientMasterStore = await createCcoPatientMasterStore({
      filePath: path.join(tmp, 'patient-master.json'),
    });
    const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
      filePath: path.join(tmp, 'encounters.json'),
    });
    const auditEvents = [];
    const authStore = fakeAuthStore(auditEvents);
    const patient = await patientMasterStore.upsertPatient({
      tenantId: TENANT,
      displayName: 'Critical Ack',
      primaryEmail: 'critical-ack@example.com',
    });
    const encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      bookingId: 'booking-critical-ack',
      serviceLabel: 'HT',
      startsAt: new Date().toISOString(),
      status: 'in_progress',
      metadata: {
        checkedInAt: new Date().toISOString(),
        criticalWarnings: [
          {
            warningId: 'allergy',
            what: 'Penicillin-allergi',
            critical: true,
            status: 'active',
          },
        ],
      },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createCcoStaffRouter({
        patientMasterStore,
        treatmentEncounterStore,
        authStore,
        config: {
          defaultTenant: TENANT,
          ccoBookingEngineStorePath: path.join(tmp, 'booking-engine.json'),
          ccoBookingStorePath: path.join(tmp, 'booking-store.json'),
          ccoTreatmentEncounterStorePath: path.join(tmp, 'encounters.json'),
        },
        requireAuth: authStore.requireAuth.bind(authStore),
        requireRole,
      })
    );

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/cco/staff/watch-complete-visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          bookingId: 'booking-critical-ack',
          criticalWarningAcknowledgements: [
            {
              warningId: 'allergy',
              acknowledged: true,
              tenantId: TENANT,
              patientId: patient.id,
              encounterId: encounter.encounterId,
              bookingId: 'booking-critical-ack',
            },
          ],
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.persisted, true);
    });

    const persisted = await treatmentEncounterStore.getEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      encounterId: encounter.encounterId,
    });
    assert.equal(persisted.status, 'completed');
    assert.equal(persisted.metadata.criticalWarningAcknowledgements.length, 1);
    const ack = persisted.metadata.criticalWarningAcknowledgements[0];
    assert.equal(ack.warningId, 'allergy');
    assert.equal(ack.acknowledgedBy, ACTOR.userId);
    assert.equal(ack.actorRole, ACTOR.role);
    assert.equal(ack.patientId, patient.id);
    assert.equal(ack.tenantId, TENANT);
    assert.ok(ack.acknowledgedAt);
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, 'cco.visit.critical_warning_ack');
    assert.equal(auditEvents[0].metadata.actorUserId, ACTOR.userId);
    assert.equal(auditEvents[0].metadata.actorRole, ACTOR.role);
    assert.equal(auditEvents[0].metadata.warnings[0].warningId, 'allergy');
    assert.ok(auditEvents[0].metadata.warnings[0].acknowledgedAt);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('watch-complete-visit rejects cross-patient or cross-tenant warning acknowledgement', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-staff-complete-critical-cross-'));
  try {
    const patientMasterStore = await createCcoPatientMasterStore({
      filePath: path.join(tmp, 'patient-master.json'),
    });
    const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
      filePath: path.join(tmp, 'encounters.json'),
    });
    const authStore = fakeAuthStore();
    const patient = await patientMasterStore.upsertPatient({
      tenantId: TENANT,
      displayName: 'Critical Cross',
      primaryEmail: 'critical-cross@example.com',
    });
    const encounter = await treatmentEncounterStore.upsertEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      bookingId: 'booking-critical-cross',
      serviceLabel: 'HT',
      startsAt: new Date().toISOString(),
      status: 'in_progress',
      metadata: {
        checkedInAt: new Date().toISOString(),
        criticalWarnings: [
          {
            warningId: 'critical-red-flag',
            what: 'Röd riskflagga',
            critical: true,
            status: 'active',
          },
        ],
      },
    });

    const app = express();
    app.use(express.json());
    app.use(
      createCcoStaffRouter({
        patientMasterStore,
        treatmentEncounterStore,
        authStore,
        config: {
          defaultTenant: TENANT,
          ccoBookingEngineStorePath: path.join(tmp, 'booking-engine.json'),
          ccoBookingStorePath: path.join(tmp, 'booking-store.json'),
          ccoTreatmentEncounterStorePath: path.join(tmp, 'encounters.json'),
        },
        requireAuth: authStore.requireAuth.bind(authStore),
        requireRole,
      })
    );

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/cco/staff/watch-complete-visit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          bookingId: 'booking-critical-cross',
          criticalWarningAcknowledgements: [
            {
              warningId: 'critical-red-flag',
              acknowledged: true,
              tenantId: 'other-tenant',
              patientId: 'other-patient',
              encounterId: encounter.encounterId,
              bookingId: 'booking-critical-cross',
            },
          ],
        }),
      });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.metadata.code, 'critical_warning_ack_required');
    });

    const persisted = await treatmentEncounterStore.getEncounter({
      tenantId: TENANT,
      patientId: patient.id,
      encounterId: encounter.encounterId,
    });
    assert.equal(persisted.status, 'in_progress');
    assert.equal(persisted.metadata.completedAt, undefined);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
