'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { syncConsultationPhotoToEncounter } = require('../../src/ops/ccoJournalBookingBridge');

test('foto från ett besöksrum behåller uttryckligt encounterId', async () => {
  const calls = [];
  const encounter = {
    tenantId: 'tenant-a',
    patientId: 'patient-a',
    encounterId: 'encounter-selected',
    startsAt: '2026-07-12T10:00:00.000Z',
  };
  const treatmentEncounterStore = {
    async getEncounter(query) {
      calls.push(['get', query]);
      return query.encounterId === encounter.encounterId ? encounter : null;
    },
    async listByPatient() {
      throw new Error('explicit encounter ska vinna före datumfallback');
    },
    async linkJournalEntry(payload) {
      calls.push(['link', payload]);
      return encounter;
    },
  };
  const journalStore = {
    async upsertEntry(entry) {
      calls.push(['upsert', entry]);
      return entry;
    },
    async patchConsultationPhotoEncounter(payload) {
      calls.push(['photo', payload]);
      return { entryId: payload.entryId, treatmentEncounterId: payload.treatmentEncounterId };
    },
  };

  const result = await syncConsultationPhotoToEncounter({
    treatmentEncounterStore,
    journalStore,
    tenantId: 'tenant-a',
    encounterId: encounter.encounterId,
    planEntry: { entryId: 'entry-a', patientId: 'patient-a', fields: {} },
    photo: { photoId: 'photo-a' },
    actor: { userId: 'staff-a' },
  });

  assert.equal(result.encounter.encounterId, encounter.encounterId);
  assert.equal(result.plan.treatmentEncounterId, encounter.encounterId);
  assert.equal(
    calls.find(([kind]) => kind === 'photo')[1].treatmentEncounterId,
    encounter.encounterId
  );
});
