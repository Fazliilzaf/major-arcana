'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');

test('findPatientsByEmails returnerar alla canonical-träffar utan full listkloning', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cco-patient-email-batch-'));
  const store = await createCcoPatientMasterStore({ filePath: path.join(dir, 'patients.json') });
  await store.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-a',
    displayName: 'Anna',
    primaryEmail: 'anna@example.com',
    drive: { files: [{ id: 'large-dossier-file', content: 'x'.repeat(10000) }] },
  });
  await store.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-b',
    displayName: 'Bo',
    emails: ['shared@example.com'],
  });
  await store.upsertPatient({
    tenantId: 'hair-tp-clinic',
    id: 'patient-c',
    displayName: 'Cecilia',
    primaryEmail: 'shared@example.com',
  });

  const result = await store.findPatientsByEmails({
    tenantId: 'hair-tp-clinic',
    emails: ['ANNA@example.com', 'shared@example.com', 'missing@example.com'],
  });

  assert.deepEqual(
    result.matches['anna@example.com'].map((patient) => patient.id),
    ['patient-a']
  );
  assert.deepEqual(
    result.matches['shared@example.com'].map((patient) => patient.id).sort(),
    ['patient-b', 'patient-c']
  );
  assert.deepEqual(result.matches['missing@example.com'], []);
  assert.equal(result.matches['anna@example.com'][0].drive, undefined);
  assert.deepEqual(Object.keys(result.matches['anna@example.com'][0]).sort(), [
    'cliento',
    'displayName',
    'emails',
    'id',
    'patientId',
    'pipedrive',
    'primaryEmail',
  ]);
});
