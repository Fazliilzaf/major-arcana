'use strict';

/* Dublettvarning: lätt uppslag "finns mottagaren redan som kontakt?". Ren
 * läsning via patientMasterStore. Bara staff-vänlig metadata. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { lookupContactByEmail } = require('../../src/ops/ccoContactLookup');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lookup-'));
  return path.join(dir, 'pm.json');
}

test('känd e-post → exists:true med namn + id', async () => {
  const patientMasterStore = await createCcoPatientMasterStore({ filePath: tmp() });
  const created = await patientMasterStore.upsertPatient({
    tenantId: 'hairtpclinic',
    displayName: 'Anna Karlsson',
    emails: ['anna@example.com'],
  });
  const res = await lookupContactByEmail(
    { tenantId: 'hairtpclinic', email: 'ANNA@example.com' }, // versaler → normaliseras
    { patientMasterStore }
  );
  assert.equal(res.exists, true);
  assert.equal(res.displayName, 'Anna Karlsson');
  assert.ok(res.customerId);
  assert.equal(res.customerId, created.id || created.patientId);
});

test('okänd e-post → exists:false', async () => {
  const patientMasterStore = await createCcoPatientMasterStore({ filePath: tmp() });
  const res = await lookupContactByEmail({ email: 'nyperson@example.com' }, { patientMasterStore });
  assert.equal(res.exists, false);
});

test('ogiltig e-post → exists:false (invalid_email), inget uppslag', async () => {
  let called = false;
  const res = await lookupContactByEmail(
    { email: 'inte-en-mejl' },
    { patientMasterStore: { findPatientByEmail: async () => ((called = true), null) } }
  );
  assert.equal(res.exists, false);
  assert.equal(res.reason, 'invalid_email');
  assert.equal(called, false);
});

test('store saknas → exists:false (store_unavailable), kraschar inte', async () => {
  const res = await lookupContactByEmail({ email: 'a@b.se' }, {});
  assert.equal(res.exists, false);
  assert.equal(res.reason, 'store_unavailable');
});
