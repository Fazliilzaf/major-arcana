'use strict';

/* Konversation → kund-resolver. Matchar motpartens e-post mot patient-mastern
 * (primaryEmail/emails/cliento.emails/pipedrive.emails). Exakt en → matched.
 * Flera → ambiguous. Ingen → unmatched. Canonical id = patient.id, ALDRIG
 * cliento- eller pipedrive-id. Read-only, ingen send/Graph. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveConversationPatient,
  resolveConversationPatients,
} = require('../../src/ops/ccoConversationPatientResolver');

function storeWith(patients) {
  return {
    patientMasterStore: { listPatients: async () => ({ patients, total: patients.length }) },
  };
}

test('exakt primaryEmail-match → patientId = patient.id, confidence 1', async () => {
  const stores = storeWith([
    { id: 'p-uuid-1', displayName: 'Anna Karlsson', primaryEmail: 'anna@example.com' },
    { id: 'p-uuid-2', displayName: 'Bo Ek', primaryEmail: 'bo@example.com' },
  ]);
  const r = await resolveConversationPatient({ email: 'ANNA@example.com' }, stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-uuid-1');
  assert.equal(r.displayName, 'Anna Karlsson');
  assert.equal(r.matchedBy, 'primaryEmail');
  assert.equal(r.confidence, 1);
});

test('match via emails[] fungerar', async () => {
  const stores = storeWith([
    { id: 'p-3', displayName: 'C', primaryEmail: 'c@x.se', emails: ['c.alt@x.se'] },
  ]);
  const r = await resolveConversationPatient({ email: 'c.alt@x.se' }, stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-3');
  assert.equal(r.matchedBy, 'emails');
});

test('cliento_* används INTE som canonical id — patientId är patient.id', async () => {
  const stores = storeWith([
    {
      id: 'p-uuid-9',
      displayName: 'Legacy Kund',
      primaryEmail: '',
      cliento: { id: 'cliento_99999', emails: ['legacy@example.com'] },
    },
  ]);
  const r = await resolveConversationPatient({ email: 'legacy@example.com' }, stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-uuid-9'); // canonical, inte cliento_99999
  assert.doesNotMatch(r.patientId, /^cliento_/);
  assert.equal(r.matchedBy, 'cliento.emails');
  assert.equal(r.confidence, 0.9);
});

test('match via pipedrive.emails', async () => {
  const stores = storeWith([
    { id: 'p-7', displayName: 'Pipe', pipedrive: { emails: ['pipe@example.com'] } },
  ]);
  const r = await resolveConversationPatient({ email: 'pipe@example.com' }, stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-7');
  assert.equal(r.matchedBy, 'pipedrive.emails');
});

test('flera kunder med samma e-post → ambiguous, länkas INTE', async () => {
  const stores = storeWith([
    { id: 'p-a', displayName: 'A', primaryEmail: 'dup@example.com' },
    { id: 'p-b', displayName: 'B', emails: ['dup@example.com'] },
  ]);
  const r = await resolveConversationPatient({ email: 'dup@example.com' }, stores);
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.patientId, null);
  assert.equal(r.candidates.length, 2);
});

test('samma patient matchar via flera källor → EN match (ingen falsk ambiguitet)', async () => {
  const stores = storeWith([
    {
      id: 'p-multi',
      displayName: 'Multi',
      primaryEmail: 'multi@example.com',
      cliento: { emails: ['multi@example.com'] },
    },
  ]);
  const r = await resolveConversationPatient({ email: 'multi@example.com' }, stores);
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-multi');
  assert.equal(r.matchedBy, 'primaryEmail'); // starkaste källan behålls
});

test('ingen match → unmatched, patientId null (okopplad konversation)', async () => {
  const stores = storeWith([{ id: 'p-1', primaryEmail: 'x@x.se' }]);
  const r = await resolveConversationPatient({ email: 'okänd@example.com' }, stores);
  assert.equal(r.status, 'unmatched');
  assert.equal(r.patientId, null);
});

test('ingen/ogiltig e-post → no_email (inget uppslag)', async () => {
  let called = false;
  const stores = {
    patientMasterStore: { listPatients: async () => ((called = true), { patients: [] }) },
  };
  const r = await resolveConversationPatient({ email: 'inte-en-mejl' }, stores);
  assert.equal(r.status, 'no_email');
  assert.equal(r.patientId, null);
  assert.equal(called, false);
});

test('store saknas → store_unavailable, kraschar inte', async () => {
  const r = await resolveConversationPatient({ email: 'a@b.se' }, {});
  assert.equal(r.status, 'store_unavailable');
  assert.equal(r.patientId, null);
});

test('batch-resolver läser patient-mastern en gång och behåller ordningen', async () => {
  let calls = 0;
  const patientMasterStore = {
    async listPatients() {
      calls += 1;
      return {
        patients: [
          { id: 'patient-a', displayName: 'Anna', primaryEmail: 'anna@example.com' },
          { id: 'patient-b', displayName: 'Bo', primaryEmail: 'bo@example.com' },
        ],
      };
    },
  };
  const rows = await resolveConversationPatients(
    [{ email: 'bo@example.com' }, { email: 'missing@example.com' }, { email: 'anna@example.com' }],
    { patientMasterStore }
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    rows.map((row) => row.patientId),
    ['patient-b', null, 'patient-a']
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    ['matched', 'unmatched', 'matched']
  );
});

test('batch-resolver använder smalt e-postuppslag när store stöder det', async () => {
  let batchCalls = 0;
  const patientMasterStore = {
    async findPatientsByEmails({ emails }) {
      batchCalls += 1;
      assert.deepEqual(emails, ['bo@example.com', 'anna@example.com']);
      return {
        matches: {
          'bo@example.com': [
            { id: 'patient-b', displayName: 'Bo', primaryEmail: 'bo@example.com' },
          ],
          'anna@example.com': [
            { id: 'patient-a', displayName: 'Anna', primaryEmail: 'anna@example.com' },
          ],
        },
      };
    },
    async listPatients() {
      assert.fail('full patient list must not be read');
    },
  };
  const rows = await resolveConversationPatients(
    [{ email: 'bo@example.com' }, { email: 'missing' }, { email: 'anna@example.com' }],
    { patientMasterStore }
  );
  assert.equal(batchCalls, 1);
  assert.deepEqual(
    rows.map((row) => row.patientId),
    ['patient-b', null, 'patient-a']
  );
  assert.deepEqual(
    rows.map((row) => row.status),
    ['matched', 'no_email', 'matched']
  );
});
