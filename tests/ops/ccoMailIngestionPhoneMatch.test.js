'use strict';

/* Kontrakt: endast exakt, unik, normaliserad e-post får sätta patientId.
 *
 * Telefon kan vara underlag i review-kön, men blir aldrig en auto-bindning.
 * Namn och annan heuristik är inte en del av kontraktet.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { matchPatientOrEntity } = require('../../src/ops/ccoMailIngestion/pipeline');

const INBOUND = { folderType: 'inbox', mailboxId: 'info@hairtpclinic.com', direction: 'inbound' };

test('patientmatch: unik normaliserad e-post → MATCHED med patientId', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: '  ANNA@EXAMPLE.COM  ' },
    {
      patientDirectory: [
        { id: 'p-1', primaryEmail: 'anna@example.com' },
      ],
    }
  );
  assert.equal(match.status, 'MATCHED');
  assert.equal(match.patientId, 'p-1');
  assert.equal(match.reason, 'exact_email_match');
});

test('patientmatch: dubbel e-post → NEEDS_REVIEW utan patientId', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'delad@example.com' },
    {
      patientDirectory: [
        { id: 'p-1', primaryEmail: 'delad@example.com' },
        { id: 'p-2', primaryEmail: 'DELAD@example.com' },
      ],
    }
  );
  assert.equal(match.status, 'NEEDS_REVIEW');
  assert.equal(match.patientId, null);
  assert.equal(match.reason, 'multiple_email_matches');
  assert.equal(match.candidates.length, 2);
});

test('patientmatch: unik telefon → NEEDS_REVIEW utan auto-bindning', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'okand@example.com', counterpartyPhone: '0701234567' },
    {
      patientDirectory: [
        { id: 'p-1', primaryEmail: 'anna@example.com', primaryPhone: '+46701234567' },
      ],
    }
  );
  assert.equal(match.status, 'NEEDS_REVIEW');
  assert.equal(match.patientId, null, 'telefon får aldrig skriva patientId');
  assert.equal(match.reason, 'exact_phone_match_requires_review');
  assert.deepEqual(match.candidates, [
    {
      patientId: 'p-1',
      method: 'phone',
      confidence: 0.45,
      phone: '0701234567',
    },
  ]);
});

test('patientmatch: dubbel telefon → NEEDS_REVIEW utan patientId', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, counterpartyPhone: '+46701234567' },
    {
      patientDirectory: [
        { id: 'p-1', primaryPhone: '+46701234567' },
        { id: 'p-2', primaryPhone: '0701234567' },
      ],
    }
  );
  assert.equal(match.status, 'NEEDS_REVIEW');
  assert.equal(match.patientId, null, 'ambiguous telefon binder aldrig');
  assert.equal(match.reason, 'multiple_phone_matches');
  assert.ok(match.candidates.length >= 2);
});

test('patientmatch: telefon utan katalogträff → UNMATCHED', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, counterpartyPhone: '+46709999999' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED');
  assert.equal(match.patientId, null);
});

test('patientmatch: exakt e-post har företräde framför telefonkandidat', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'anna@example.com', counterpartyPhone: '+46701234567' },
    {
      patientDirectory: [
        { id: 'p-email', primaryEmail: 'anna@example.com' },
        { id: 'p-phone', primaryPhone: '+46701234567' },
      ],
    }
  );
  assert.equal(match.status, 'MATCHED');
  assert.equal(match.patientId, 'p-email', 'e-post-träff vinner');
  assert.equal(match.reason, 'exact_email_match');
});

test('patientmatch: varken e-post eller telefon → UNMATCHED', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: '' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED');
  assert.equal(match.reason, 'missing_counterparty_email');
});

test('patientmatch: ren mail utan telefon → endast e-post avgör', () => {
  // Ingen counterpartyPhone → phone-grenen rör inget; okänd e-post → UNMATCHED.
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'okand@example.com' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED', 'inget telefonnr → ingen telefonmatch');
  assert.equal(match.patientId, null);
});
