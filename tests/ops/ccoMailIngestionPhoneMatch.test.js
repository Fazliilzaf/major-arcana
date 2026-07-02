'use strict';

/* B1 — telefonmatch/trösklar i matchPatientOrEntity.
 *
 * Ägarbeslut: exakt e-post ELLER exakt telefon (mot verifierat patient-nr) =
 * confirmed. Flera träffar = review. Namn/heuristik blir aldrig confirmed här.
 *
 * OBS: mail bär inget telefonnummer idag → telefongrenen är vilande för ren
 * mail och aktiveras först när en SMS-/enrichment-källa sätter ett nummer på
 * meddelandet (counterpartyPhone/fromPhone/senderPhone).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { matchPatientOrEntity } = require('../../src/ops/ccoMailIngestion/pipeline');

const INBOUND = { folderType: 'inbox', mailboxId: 'info@hairtpclinic.com', direction: 'inbound' };

test('B1: exakt telefon mot verifierat nr → MATCHED (confirmed)', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'okand@example.com', counterpartyPhone: '0701234567' },
    {
      patientDirectory: [
        { id: 'p-1', primaryEmail: 'anna@example.com', primaryPhone: '+46701234567' },
      ],
    }
  );
  assert.equal(match.status, 'MATCHED');
  assert.equal(match.patientId, 'p-1');
  assert.equal(match.reason, 'exact_phone_match');
});

test('B1: flera patienter med samma telefon → NEEDS_REVIEW utan bindning', () => {
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

test('B1: telefon utan katalogträff → UNMATCHED', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, counterpartyPhone: '+46709999999' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED');
  assert.equal(match.patientId, null);
});

test('B1: exakt e-post har företräde före telefon', () => {
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

test('B1: varken e-post eller telefon → UNMATCHED (missing_counterparty_email)', () => {
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: '' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED');
  assert.equal(match.reason, 'missing_counterparty_email');
});

test('B1: ren mail utan telefon → telefongrenen är vilande (endast e-post avgör)', () => {
  // Ingen counterpartyPhone → phone-grenen rör inget; okänd e-post → UNMATCHED.
  const match = matchPatientOrEntity(
    { ...INBOUND, fromEmail: 'okand@example.com' },
    { patientDirectory: [{ id: 'p-1', primaryPhone: '+46701234567' }] }
  );
  assert.equal(match.status, 'UNMATCHED', 'inget telefonnr → ingen telefonmatch');
  assert.equal(match.patientId, null);
});
