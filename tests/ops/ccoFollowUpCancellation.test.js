'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decideFollowUpAction,
  resolveBookingCancellation,
} = require('../../src/ops/ccoFollowUpCancellation');

test('decideFollowUpAction: A = uppföljningstiden avbokas → stäng bara tillfället', () => {
  const d = decideFollowUpAction({ encounterType: 'follow_up', hasSignedTreatmentJournal: false });
  assert.equal(d.case, 'A');
  assert.equal(d.action, 'close_single_follow_up');
});

test('decideFollowUpAction: B = behandling utan signerad journal → stäng alla', () => {
  const d = decideFollowUpAction({ encounterType: 'transplant_fue', hasSignedTreatmentJournal: false });
  assert.equal(d.case, 'B');
  assert.equal(d.action, 'close_all_follow_ups');
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

test('resolveBookingCancellation: fall B stänger alla följare på encountern', async () => {
  const encounter = {
    encounterId: 'enc-t',
    patientId: 'p1',
    encounterType: 'transplant_fue',
    journalEntryIds: [],
  };
  const encounterStore = { async findByBooking() { return encounter; } };
  const journalStore = { async getEntry() { return { status: 'draft' }; } };
  let called = null;
  const aftercareStore = {
    async cancelFollowUpsForEncounter(args) {
      called = args;
      return { cancelled: 2, skipped: 0, closedDrafts: 2 };
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
  assert.equal(result.handled, true);
  assert.equal(called.encounterId, 'enc-t');
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
