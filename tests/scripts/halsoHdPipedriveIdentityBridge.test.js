'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHalsoPipedriveIdentityBridge,
} = require('../../scripts/lib/halsoHdPipedriveIdentityBridge');

function csv(rows) {
  return [
    '"ID","Namn","Telefon - Mobil","E-post - Arbete","Social Number"',
    ...rows,
  ].join('\n');
}

test('bridges a Pipedrive social number through one exact canonical email', () => {
  const result = buildHalsoPipedriveIdentityBridge(
    csv(['"1","Anna Andersson","","anna@example.com","19800101-1234"']),
    [{ id: 'patient-1', primaryEmail: 'anna@example.com', personnummer: '' }]
  );

  assert.equal(result.stats.linked, 1);
  assert.equal(result.patients[0].personnummer, '19800101-1234');
  assert.equal(result.patients[0].halsoIdentityBridge, 'pipedrive_social_number_exact_contact');
});

test('rejects conflicting exact email and phone candidates', () => {
  const result = buildHalsoPipedriveIdentityBridge(
    csv(['"1","Anna Andersson","0701112233","anna@example.com","19800101-1234"']),
    [
      { id: 'patient-email', primaryEmail: 'anna@example.com' },
      { id: 'patient-phone', primaryPhone: '0701112233' },
    ]
  );

  assert.equal(result.stats.linked, 0);
  assert.equal(result.stats.ambiguousPnr, 1);
});

test('rejects multiple social numbers resolving to the same canonical patient', () => {
  const result = buildHalsoPipedriveIdentityBridge(
    csv([
      '"1","Anna Andersson","","anna@example.com","19800101-1234"',
      '"2","Anna Andersson","","anna@example.com","19810101-5678"',
    ]),
    [{ id: 'patient-1', primaryEmail: 'anna@example.com' }]
  );

  assert.equal(result.stats.linked, 0);
  assert.equal(result.stats.rejectedPatientConflicts, 2);
});
