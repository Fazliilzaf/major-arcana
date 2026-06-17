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

function fakeAuthStore() {
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
