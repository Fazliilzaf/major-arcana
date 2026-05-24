'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildCustomerReminderQueue,
  buildJournalDraftProposals,
  buildMissingFormsReport,
  classifyMissingForms,
  dispatchCustomerReminderDigest,
  resolveMaintenanceWindow,
} = require('../../src/ops/ccoPatientCareOps');
const { createCcoPatientCareStateStore } = require('../../src/ops/ccoPatientCareStateStore');

function mockJournalStore(entriesByPatient = {}) {
  return {
    async listEntries({ patientId }) {
      return { entries: entriesByPatient[patientId] || [] };
    },
  };
}

function mockPatientMasterStore(patients = []) {
  return {
    async listPatients() {
      return { patients };
    },
  };
}

function mockBookingEngineStore({ bookings = [], reservations = [] } = {}) {
  return {
    state: { bookings, reservations },
  };
}

test('classifyMissingForms flaggar hälsodeklaration och plan', () => {
  const missing = classifyMissingForms([
    { journalType: 'health_declaration', status: 'draft' },
  ]);
  assert.ok(missing.includes('health_declaration_signature'));
  assert.ok(missing.includes('consultation_plan'));
});

test('classifyMissingForms flaggar treatment_agreement när avtal inte är bookable', () => {
  const missing = classifyMissingForms(
    [
      { journalType: 'health_declaration', locked: true },
      { journalType: 'consultation_plan', locked: true },
    ],
    { agreementStatus: 'pending_signature' }
  );
  assert.ok(missing.includes('treatment_agreement'));
});

test('buildMissingFormsReport returnerar endast patienter med luckor', async () => {
  const report = await buildMissingFormsReport({
    tenantId: 'hair-tp-clinic',
    patientMasterStore: mockPatientMasterStore([
      { patientId: 'p1', displayName: 'Anna' },
      { patientId: 'p2', displayName: 'Bertil' },
    ]),
    journalStore: mockJournalStore({
      p1: [
        { journalType: 'health_declaration', locked: true },
        { journalType: 'consultation_plan', locked: true },
      ],
      p2: [{ journalType: 'health_declaration', status: 'draft' }],
    }),
  });
  assert.equal(report.patientCount, 2);
  assert.equal(report.patientsWithMissing, 1);
  assert.equal(report.rows[0].patientId, 'p2');
  assert.ok(report.rows[0].missing.includes('health_declaration_signature'));
});

test('buildJournalDraftProposals sparar pending-förslag i care state store', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-care-ops-'));
  try {
    const patientCareStateStore = await createCcoPatientCareStateStore({
      filePath: path.join(tempDir, 'care-state.json'),
    });
    const result = await buildJournalDraftProposals({
      tenantId: 'hair-tp-clinic',
      patientMasterStore: mockPatientMasterStore([{ patientId: 'p1', displayName: 'Anna' }]),
      journalStore: mockJournalStore({
        p1: [{ journalType: 'health_declaration', status: 'draft' }],
      }),
      patientCareStateStore,
    });
    assert.equal(result.proposalCount, 1);
    assert.equal(result.proposals[0].status, 'pending');
    assert.equal(result.proposals[0].reviewRequired, true);
    const stored = await patientCareStateStore.listDraftProposals({
      tenantId: 'hair-tp-clinic',
      status: 'pending',
    });
    assert.equal(stored.length, 1);
    assert.ok(stored[0].draftFields.healthDeclaration);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildCustomerReminderQueue hittar kommande besök och undviker dubbletter', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-care-reminders-'));
  try {
    const patientCareStateStore = await createCcoPatientCareStateStore({
      filePath: path.join(tempDir, 'care-state.json'),
    });
    const startsAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const bookingEngineStore = mockBookingEngineStore({
      bookings: [
        {
          bookingId: 'b1',
          patientId: 'p1',
          customerName: 'Anna',
          startsAt,
        },
      ],
    });

    const first = await buildCustomerReminderQueue({
      tenantId: 'hair-tp-clinic',
      bookingEngineStore,
      patientCareStateStore,
    });
    assert.equal(first.visitReminders.length, 1);
    assert.equal(first.total, 1);

    await patientCareStateStore.logReminder({
      tenantId: 'hair-tp-clinic',
      reminderKey: first.visitReminders[0].reminderKey,
      reminderType: 'visit_upcoming',
      patientId: 'p1',
    });

    const second = await buildCustomerReminderQueue({
      tenantId: 'hair-tp-clinic',
      bookingEngineStore,
      patientCareStateStore,
    });
    assert.equal(second.visitReminders.length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('resolveMaintenanceWindow returns inactive when start/end missing', () => {
  const result = resolveMaintenanceWindow({});
  assert.equal(result.active, false);
  assert.equal(result.message, '');
  assert.equal(result.startsAt, null);
  assert.equal(result.endsAt, null);
});

test('resolveMaintenanceWindow returns inactive when end before start', () => {
  const result = resolveMaintenanceWindow({
    maintenanceWindowStart: '2026-06-01T10:00:00.000Z',
    maintenanceWindowEnd: '2026-06-01T09:00:00.000Z',
  });
  assert.equal(result.active, false);
});

test('resolveMaintenanceWindow marks active inside window', () => {
  const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const result = resolveMaintenanceWindow({
    maintenanceWindowStart: start,
    maintenanceWindowEnd: end,
    maintenanceWindowMessage: 'DB-migrering',
  });
  assert.equal(result.active, true);
  assert.equal(result.upcoming, false);
  assert.equal(result.message, 'DB-migrering');
  assert.equal(result.startsAt, start);
  assert.equal(result.endsAt, end);
});

test('resolveMaintenanceWindow marks upcoming before window', () => {
  const start = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const result = resolveMaintenanceWindow({
    maintenanceWindowStart: start,
    maintenanceWindowEnd: end,
  });
  assert.equal(result.active, false);
  assert.equal(result.upcoming, true);
  assert.match(result.message, /underhåll/i);
});

test('dispatchCustomerReminderDigest skips empty queue', async () => {
  const result = await dispatchCustomerReminderDigest({
    graphSendConnector: { sendMail: async () => {} },
    queue: { total: 0, visitReminders: [], aftercareReminders: [] },
    toEmail: 'ops@example.com',
  });
  assert.equal(result.skipped, true);
});

test('dispatchCustomerReminderDigest sends when queue has items', async () => {
  let sent = null;
  const result = await dispatchCustomerReminderDigest({
    graphSendConnector: {
      sendMail: async (payload) => {
        sent = payload;
      },
    },
    queue: {
      total: 1,
      visitReminders: [{ customerName: 'Test', message: 'Besök om 2h' }],
      aftercareReminders: [],
    },
    toEmail: 'ops@example.com',
    tenantId: 'hair-tp-clinic',
  });
  assert.equal(result.skipped, false);
  assert.equal(sent.to, 'ops@example.com');
  assert.match(sent.subject, /CCO påminnelser/);
});
