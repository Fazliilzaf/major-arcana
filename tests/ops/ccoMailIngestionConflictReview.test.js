'use strict';

/* B2 — conflict → review, aldrig auto-bind.
 *
 * Verifierar match-pipelinen (matchPatientOrEntity) + review-sweepen
 * (runUnmatchedResolutionSweep):
 *   1. conflict/ambiguous (flera träffar) → review-kö, ingen bindning
 *   2. confirmed exakt e-postträff → får bindas
 *   3. suggested (heuristisk namn-gissning) → visas som förslag, ingen
 *      permanent bindning utan beslut
 *   4. ingen patientkoppling skrivs vid conflict/suggested
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { matchPatientOrEntity } = require('../../src/ops/ccoMailIngestion/pipeline');
const { runUnmatchedResolutionSweep } = require('../../src/ops/ccoMailIngestion/resolveUnmatched');

const INBOUND = {
  folderType: 'inbox',
  mailboxId: 'info@hairtpclinic.com',
  direction: 'inbound',
};

// ── Pipeline: matchPatientOrEntity ───────────────────────────────────────────

test('B2: confirmed exakt e-postträff → MATCHED och patientId sätts', () => {
  const directory = [
    { id: 'p-1', displayName: 'Anna Andersson', primaryEmail: 'anna@example.com' },
  ];
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'anna@example.com' },
    { patientDirectory: directory }
  );
  assert.equal(match.status, 'MATCHED');
  assert.equal(match.patientId, 'p-1');
  assert.equal(match.reason, 'exact_email_match');
});

test('B2: ambiguous — samma e-post pekar på flera patienter → NEEDS_REVIEW utan bindning', () => {
  const directory = [
    { id: 'p-1', displayName: 'Anna A', primaryEmail: 'delad@example.com' },
    { id: 'p-2', displayName: 'Anna B', primaryEmail: 'delad@example.com' },
  ];
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'delad@example.com' },
    { patientDirectory: directory }
  );
  assert.equal(match.status, 'NEEDS_REVIEW', 'ambiguous ska till review');
  assert.equal(match.patientId, null, 'ingen auto-bindning vid ambiguous');
  assert.equal(match.reason, 'multiple_email_matches');
  assert.ok(match.candidates.length >= 2, 'kandidater bevaras för review');
});

test('B2: okänd avsändare → UNMATCHED utan bindning', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'okand@example.com' },
    { patientDirectory: [{ id: 'p-1', primaryEmail: 'anna@example.com' }] }
  );
  assert.equal(match.status, 'UNMATCHED');
  assert.equal(match.patientId, null);
});

// ── Sweep: runUnmatchedResolutionSweep ───────────────────────────────────────

function makeIngestionStore(rows) {
  const linkCalls = [];
  return {
    linkCalls,
    listReviewQueue() {
      return rows;
    },
    async linkPatientToMessage(args) {
      linkCalls.push(args);
      return true;
    },
    async updateLedger() {
      return {};
    },
    async save() {
      return true;
    },
  };
}

function unmatchedRow(id, email) {
  return {
    rawMessage: { id, fromEmail: email, subject: 'Fråga' },
    patientMatch: { counterpartyEmail: email },
  };
}

test('B2: confirmed exakt e-postträff i sweepen → länkas (bind ok)', async () => {
  const ingestionStore = makeIngestionStore([unmatchedRow('m-1', 'anna@example.com')]);
  const upsertCalls = [];
  const patientMasterStore = {
    async findPatientByEmail() {
      return { id: 'p-1', primaryEmail: 'anna@example.com' };
    },
    async listPatients() {
      return { patients: [] };
    },
    async upsertPatient(args) {
      upsertCalls.push(args);
    },
  };

  const result = await runUnmatchedResolutionSweep({
    ingestionStore,
    patientMasterStore,
    tenantId: 'hair-tp',
    closeRemainingAsNoPatientRecord: false,
  });

  assert.equal(result.linked, 1, 'bekräftad match ska länkas');
  assert.equal(result.suggested, 0);
  assert.equal(ingestionStore.linkCalls.length, 1);
  assert.equal(ingestionStore.linkCalls[0].patientId, 'p-1');
});

test('B2: suggested (namn-gissning) → INGEN permanent bindning, hamnar i review som förslag', async () => {
  const ingestionStore = makeIngestionStore([unmatchedRow('m-2', 'anna.andersson@example.com')]);
  const upsertCalls = [];
  const patientMasterStore = {
    async findPatientByEmail() {
      return null; // ingen exakt e-postträff
    },
    async listPatients() {
      return { patients: [{ id: 'p-9', displayName: 'Anna Andersson' }] };
    },
    async upsertPatient(args) {
      upsertCalls.push(args);
    },
  };

  const result = await runUnmatchedResolutionSweep({
    ingestionStore,
    patientMasterStore,
    tenantId: 'hair-tp',
    closeRemainingAsNoPatientRecord: false,
  });

  assert.equal(result.linked, 0, 'suggested får INTE länkas');
  assert.equal(result.suggested, 1, 'ska räknas som suggested');
  assert.equal(ingestionStore.linkCalls.length, 0, 'ingen patientkoppling skrivs vid suggested');
  assert.equal(upsertCalls.length, 0, 'ingen patient-enrichment på en gissning');

  const group = result.groups.find((g) => g.email === 'anna.andersson@example.com');
  assert.ok(group);
  assert.equal(group.action, 'suggested');
  assert.equal(group.patientId, null, 'ingen bindning');
  assert.equal(group.suggestedPatientId, 'p-9', 'förslaget bevaras för review');
  assert.ok(result.remaining >= 1, 'suggested lämnas kvar för review-beslut');
});

test('B2: ingen patientkoppling skrivs när ingen bekräftad match finns', async () => {
  const ingestionStore = makeIngestionStore([unmatchedRow('m-3', 'ingen.match@example.com')]);
  const patientMasterStore = {
    async findPatientByEmail() {
      return null;
    },
    async listPatients() {
      return { patients: [] }; // ingen kandidat
    },
    async upsertPatient() {},
  };

  const result = await runUnmatchedResolutionSweep({
    ingestionStore,
    patientMasterStore,
    tenantId: 'hair-tp',
    closeRemainingAsNoPatientRecord: false,
  });

  assert.equal(result.linked, 0);
  assert.equal(ingestionStore.linkCalls.length, 0, 'ingen bindning utan match');
  assert.ok(result.remaining >= 1);
});
