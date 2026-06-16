'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPatientCardReadout,
  derivePatientHealthProjection,
  hydratePatientHealthProjection,
} = require('../../src/ops/ccoPatientMasterStore');

describe('patientHealthProjection', () => {
  it('hydrates top-level HD fields from nested healthDeclaration (ORD-29 Fall A)', () => {
    const patient = {
      id: '2d88a53c-db59-44aa-af59-57c4620b760c',
      displayName: 'Tawab Samadi',
      personnummer: '19990303-8611',
      missingHealthDeclaration: false,
      healthDeclaration: {
        source: 'halso_mailbox',
        signedAt: '2026-06-05T11:13:00.000Z',
        matchMethod: 'personnummer',
        matchConfidence: 0.98,
      },
    };

    const projection = derivePatientHealthProjection(patient);
    assert.equal(projection.hdSignedAt, '2026-06-05T11:13:00.000Z');
    assert.equal(projection.hdSource, 'halso_mailbox');
    assert.equal(projection.hasHealthDeclaration, true);
    assert.equal(projection.missingHealthDeclaration, false);

    const hydrated = hydratePatientHealthProjection(patient);
    assert.equal(hydrated.hasHealthDeclaration, true);
    assert.equal(hydrated.hdSignedAt, '2026-06-05T11:13:00.000Z');

    const card = buildPatientCardReadout(patient);
    assert.equal(card.hdSignedAt, '2026-06-05T11:13:00.000Z');
    assert.equal(card.hdSource, 'halso_mailbox');
    assert.equal(card.hasHealthDeclaration, true);
    assert.equal(card.missingHealthDeclaration, false);
  });

  it('marks missing HD when nested signedAt is absent', () => {
    const patient = { id: 'p1', healthDeclaration: null };
    const projection = derivePatientHealthProjection(patient);
    assert.equal(projection.hasHealthDeclaration, false);
    assert.equal(projection.missingHealthDeclaration, true);
    assert.equal(projection.hdSignedAt, null);
  });
});
