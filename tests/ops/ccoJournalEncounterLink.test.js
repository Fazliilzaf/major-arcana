'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const { createCcoTreatmentEncounterStore } = require('../../src/ops/ccoTreatmentEncounterStore');
const {
  syncJournalEntryToEncounter,
  lockEncounterOnJournalSign,
} = require('../../src/ops/ccoJournalBookingBridge');

async function createFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'journal-encounter-'));
  const journalStore = await createCcoJournalStore({ filePath: path.join(dir, 'journal.json') });
  const treatmentEncounterStore = await createCcoTreatmentEncounterStore({
    filePath: path.join(dir, 'encounters.json'),
  });
  const tenantId = 'hair-tp-clinic';
  const patientId = 'patient-enc-1';
  const actor = { userId: 'staff-1', role: 'OWNER', displayName: 'Staff' };

  const plan = await journalStore.ensureConsultationPlan({
    tenantId,
    patientId,
    personnummer: '19960830-4698',
    actor,
  });
  const encounter = await treatmentEncounterStore.upsertEncounter({
    tenantId,
    patientId,
    serviceId: 'consultation-physical',
    serviceLabel: 'Konsultation',
    startsAt: '2026-05-20T10:00:00.000Z',
    status: 'confirmed',
  });
  await journalStore.upsertEntry(
    {
      ...plan,
      treatmentEncounterId: encounter.encounterId,
      fields: {
        ...plan.fields,
        bookingSlotStart: '2026-05-20T10:00:00.000Z',
      },
    },
    { actor }
  );

  return { journalStore, treatmentEncounterStore, tenantId, patientId, actor, encounter };
}

test('syncJournalEntryToEncounter links health declaration to plan encounter', async () => {
  const { journalStore, treatmentEncounterStore, tenantId, patientId, actor, encounter } =
    await createFixture();

  let entry = await journalStore.upsertEntry(
    {
      tenantId,
      patientId,
      personnummer: '19960830-4698',
      journalType: 'health_declaration',
      formVariant: 'hair_tp',
      title: 'Hälsodeklaration',
      fields: { fornamn: 'Test' },
    },
    { actor }
  );
  assert.equal(entry.treatmentEncounterId, '');

  const synced = await syncJournalEntryToEncounter({
    treatmentEncounterStore,
    journalStore,
    tenantId,
    entry,
    actor,
  });
  assert.equal(synced.skipped, false);
  assert.equal(synced.entry.treatmentEncounterId, encounter.encounterId);

  const linked = await treatmentEncounterStore.getEncounter({
    tenantId,
    patientId,
    encounterId: encounter.encounterId,
  });
  assert.ok(linked.journalEntryIds.includes(synced.entry.entryId));
});

test('lockEncounterOnJournalSign marks encounter metadata', async () => {
  const { journalStore, treatmentEncounterStore, tenantId, patientId, actor, encounter } =
    await createFixture();

  const entry = await journalStore.upsertEntry(
    {
      tenantId,
      patientId,
      personnummer: '19960830-4698',
      journalType: 'tp_treatment',
      formVariant: 'hair_tp',
      treatmentEncounterId: encounter.encounterId,
      title: 'TP journal',
      fields: {},
    },
    { actor }
  );
  const signed = await journalStore.signEntry({
    tenantId,
    patientId,
    entryId: entry.entryId,
    actor,
  });
  assert.ok(signed.locked);

  const locked = await lockEncounterOnJournalSign({
    treatmentEncounterStore,
    tenantId,
    entry: signed,
  });
  assert.equal(locked.skipped, false);
  assert.ok(locked.encounter.metadata.journalLockedAt);
  assert.ok(locked.encounter.metadata.lockedEntryIds.includes(signed.entryId));
});
