'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideFollowUpAction,
  resolveBookingCancellation,
  linkFollowUpDraftToEncounter,
} = require('../../src/ops/ccoFollowUpCancellation');

test('decideFollowUpAction: A = uppföljningstiden avbokas → stäng bara tillfället', () => {
  const d = decideFollowUpAction({ encounterType: 'follow_up', hasSignedTreatmentJournal: false });
  assert.equal(d.case, 'A');
  assert.equal(d.action, 'close_single_follow_up');
});

test('decideFollowUpAction: B = behandling utan signerad journal → flagga (stäng inte)', () => {
  const d = decideFollowUpAction({ encounterType: 'transplant_fue', hasSignedTreatmentJournal: false });
  assert.equal(d.case, 'B');
  assert.equal(d.action, 'flag_for_human');
});

test('decideFollowUpAction: C = behandling med signerad journal → flagga', () => {
  const d = decideFollowUpAction({ encounterType: 'transplant_fue', hasSignedTreatmentJournal: true });
  assert.equal(d.case, 'C');
  assert.equal(d.action, 'flag_for_human');
});

test('resolveBookingCancellation: fall C flaggar och rör ingenting', async () => {
  const encounter = {
    encounterId: 'enc-t',
    patientId: 'p1',
    encounterType: 'transplant_fue',
    journalEntryIds: ['je-1'],
  };
  const encounterStore = { async findByBooking() { return encounter; } };
  const journalStore = { async getEntry() { return { status: 'signed' }; } };
  const aftercareStore = {
    async cancelFollowUpsForEncounter() {
      throw new Error('aftercare-storet får inte anropas i fall C');
    },
  };
  const result = await resolveBookingCancellation({
    tenantId: 't',
    bookingId: 'b',
    encounterStore,
    journalStore,
    aftercareStore,
  });
  assert.equal(result.case, 'C');
  assert.equal(result.flagForHuman, true);
  assert.equal(result.handled, false);
});

test('resolveBookingCancellation: fall B flaggar och stänger INTE (ORD-148)', async () => {
  const encounter = {
    encounterId: 'enc-t',
    patientId: 'p1',
    encounterType: 'transplant_fue',
    journalEntryIds: [],
  };
  const encounterStore = { async findByBooking() { return encounter; } };
  const journalStore = { async getEntry() { return { status: 'draft' }; } };
  const aftercareStore = {
    async cancelFollowUpsForEncounter() {
      throw new Error('aftercare-storet får inte anropas i fall B (ORD-148)');
    },
  };
  const result = await resolveBookingCancellation({
    tenantId: 't',
    bookingId: 'b',
    encounterStore,
    journalStore,
    aftercareStore,
    reason: 'avbokad',
  });
  assert.equal(result.case, 'B');
  assert.equal(result.handled, false);
  assert.equal(result.flagForHuman, true);
});

test('resolveBookingCancellation: fall A utan länk gör ingenting (flagga)', async () => {
  const encounter = {
    encounterId: 'enc-f',
    patientId: 'p1',
    encounterType: 'follow_up',
    journalEntryIds: [],
  };
  const encounterStore = { async findByBooking() { return encounter; } };
  const journalStore = { async getEntry() { return null; } };
  const aftercareStore = {
    async cancelFollowUpsForEncounter() {
      throw new Error('aftercare-storet får inte anropas i fall A utan länk');
    },
  };
  const result = await resolveBookingCancellation({
    tenantId: 't',
    bookingId: 'b',
    encounterStore,
    journalStore,
    aftercareStore,
  });
  assert.equal(result.case, 'A');
  assert.equal(result.handled, false);
  assert.equal(result.flagForHuman, true);
});

test('resolveBookingCancellation: okänd booking → handled false', async () => {
  const encounterStore = { async findByBooking() { return null; } };
  const journalStore = { async getEntry() { return null; } };
  const aftercareStore = { async cancelFollowUpsForEncounter() { return {}; } };
  const result = await resolveBookingCancellation({
    tenantId: 't',
    bookingId: 'b',
    encounterStore,
    journalStore,
    aftercareStore,
  });
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'no_encounter_for_booking');
});

test('resolveBookingCancellation: fall A med länk stänger utkast + jobb', async () => {
  const encounter = {
    encounterId: 'enc-f',
    patientId: 'p1',
    encounterType: 'follow_up',
    journalEntryIds: ['draft-1'],
  };
  const encounterStore = { async findByBooking() { return encounter; } };
  const journalStore = {
    async getEntry() {
      return { entryId: 'draft-1', journalType: 'follow_up', status: 'draft', fields: { aftercareJobId: 'job-1' } };
    },
    async closeEntry() { return { entryId: 'draft-1', closedAt: 'x' }; },
  };
  let cancelledId = null;
  const aftercareStore = {
    async cancelJob(id) { cancelledId = id; return {}; },
  };
  const result = await resolveBookingCancellation({
    tenantId: 't', bookingId: 'b', encounterStore, journalStore, aftercareStore, reason: 'avbokad',
  });
  assert.equal(result.case, 'A');
  assert.equal(result.handled, true);
  assert.equal(result.closedDrafts, 1);
  assert.equal(result.cancelledJobs, 1);
  assert.equal(cancelledId, 'job-1');
});

test('linkFollowUpDraftToEncounter: länkar ett öppet follow-up-utkast', async () => {
  let linkedArgs = null;
  const encounterStore = {
    async getEncounter() { return { encounterId: 'enc-f', patientId: 'p1' }; },
    async linkJournalEntry(args) { linkedArgs = args; return { linked: true }; },
  };
  const journalStore = {
    async getEntry() { return { entryId: 'draft-1', journalType: 'follow_up', status: 'draft', closedAt: null }; },
  };
  const result = await linkFollowUpDraftToEncounter({
    tenantId: 't', patientId: 'p1', encounterId: 'enc-f', entryId: 'draft-1', encounterStore, journalStore,
  });
  assert.equal(result.linked, true);
  assert.equal(linkedArgs.entryId, 'draft-1');
});

test('linkFollowUpDraftToEncounter: vägrar stängt / signerat / icke-follow-up', async () => {
  const encounterStore = { async getEncounter() { return { encounterId: 'enc-f', patientId: 'p1' }; } };
  const base = { tenantId: 't', patientId: 'p1', encounterId: 'enc-f', entryId: 'd', encounterStore };
  await assert.rejects(
    () => linkFollowUpDraftToEncounter({ ...base, journalStore: { async getEntry() { return { journalType: 'follow_up', status: 'draft', closedAt: 'x' }; } } }),
    /inte öppet/
  );
  await assert.rejects(
    () => linkFollowUpDraftToEncounter({ ...base, journalStore: { async getEntry() { return { journalType: 'follow_up', status: 'signed', closedAt: null }; } } }),
    /inte öppet/
  );
  await assert.rejects(
    () => linkFollowUpDraftToEncounter({ ...base, journalStore: { async getEntry() { return { journalType: 'tp_treatment', status: 'draft', closedAt: null }; } } }),
    /inte ett uppföljningsutkast/
  );
});
