'use strict';

/* Delad patientidentitets-resolver.
 *
 * Verifierar att asset-alias-resolution (groupByPatientId/resolveAliasKeyFn) och
 * kontaktuppslag (email/phone) fungerar i samma modul. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  groupByPatientId,
  assertPatientsResolved,
  buildPatientContactLookup,
  resolvePatientByEmail,
  resolvePatientByPhone,
} = require('../../src/ops/ccoIdentityResolution/sharedPatientResolver');

test('groupByPatientId grupperar på rå patientId som default', () => {
  const assets = [
    { id: 'a1', patientId: 'p-1' },
    { id: 'a2', patientId: 'p-1' },
    { id: 'a3', patientId: 'p-2' },
  ];
  const map = groupByPatientId(assets);
  assert.equal(map.get('p-1').length, 2);
  assert.equal(map.get('p-2').length, 1);
});

test('groupByPatientId ignorerar tomma nycklar', () => {
  const map = groupByPatientId([{ id: 'a1', patientId: '' }, { id: 'a2', patientId: 'p-1' }]);
  assert.equal(map.size, 1);
  assert.equal(map.get('p-1')[0].id, 'a2');
});

test('assertPatientsResolved kastar vid tom patientlista', () => {
  assert.throws(() => assertPatientsResolved([], { tenant: 'hair-tp-clinic' }), /0 patienter/);
});

test('assertPatientsResolved gör inget när patienter finns', () => {
  assert.doesNotThrow(() => assertPatientsResolved([{ id: 'p-1' }]));
});

test('buildPatientContactLookup samlar primaryEmail, emails, cliento och pipedrive', () => {
  const lookup = buildPatientContactLookup([
    {
      id: 'p-1',
      primaryEmail: 'a@example.com',
      emails: ['b@example.com'],
      cliento: { emails: ['c@example.com'] },
      pipedrive: { emails: ['d@example.com'] },
    },
  ]);
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']) {
    assert.equal(lookup.byEmail.get(email).length, 1, `${email} ska finnas`);
  }
});

test('resolvePatientByEmail: exakt match → matched med rätt källa och konfidens', () => {
  const lookup = buildPatientContactLookup([
    { id: 'p-1', displayName: 'Anna', primaryEmail: 'anna@example.com' },
  ]);
  const r = resolvePatientByEmail(lookup, 'ANNA@example.com');
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-1');
  assert.equal(r.matchedBy, 'primaryEmail');
  assert.equal(r.confidence, 1);
});

test('resolvePatientByEmail: cliento-emails ger 0.9 konfidens', () => {
  const lookup = buildPatientContactLookup([
    { id: 'p-1', displayName: 'Legacy', cliento: { emails: ['legacy@example.com'] } },
  ]);
  const r = resolvePatientByEmail(lookup, 'legacy@example.com');
  assert.equal(r.status, 'matched');
  assert.equal(r.matchedBy, 'cliento.emails');
  assert.equal(r.confidence, 0.9);
});

test('resolvePatientByEmail: flera patienter → ambiguous', () => {
  const lookup = buildPatientContactLookup([
    { id: 'p-a', displayName: 'A', primaryEmail: 'dup@example.com' },
    { id: 'p-b', displayName: 'B', emails: ['dup@example.com'] },
  ]);
  const r = resolvePatientByEmail(lookup, 'dup@example.com');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.patientId, null);
  assert.equal(r.candidates.length, 2);
});

test('resolvePatientByEmail: samma patient via flera källor dedupliceras', () => {
  const lookup = buildPatientContactLookup([
    {
      id: 'p-multi',
      displayName: 'Multi',
      primaryEmail: 'multi@example.com',
      cliento: { emails: ['multi@example.com'] },
    },
  ]);
  const r = resolvePatientByEmail(lookup, 'multi@example.com');
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-multi');
  assert.equal(r.matchedBy, 'primaryEmail');
});

test('resolvePatientByEmail: ingen match → unmatched', () => {
  const lookup = buildPatientContactLookup([{ id: 'p-1', primaryEmail: 'x@x.se' }]);
  const r = resolvePatientByEmail(lookup, 'okänd@example.com');
  assert.equal(r.status, 'unmatched');
  assert.equal(r.patientId, null);
});

test('resolvePatientByPhone: exakt match → matched', () => {
  const lookup = buildPatientContactLookup([{ id: 'p-1', displayName: 'Anna', primaryPhone: '0701234567' }]);
  const r = resolvePatientByPhone(lookup, '0701234567');
  assert.equal(r.status, 'matched');
  assert.equal(r.patientId, 'p-1');
});

test('resolvePatientByPhone: flera patienter → ambiguous', () => {
  const lookup = buildPatientContactLookup([
    { id: 'p-a', displayName: 'A', phones: ['0701234567'] },
    { id: 'p-b', displayName: 'B', primaryPhone: '0701234567' },
  ]);
  const r = resolvePatientByPhone(lookup, '0701234567');
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.candidates.length, 2);
});
