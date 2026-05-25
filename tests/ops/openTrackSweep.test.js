'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isFinalFollowUpTreatment,
  listEligiblePostOpAutoCases,
} = require('../../src/ops/postOpAutoTrigger');
const {
  normalizePatientDemographics,
  buildDemographicsReadout,
} = require('../../src/ops/patientDemographics');
const { loadLegacyCatalogBundle } = require('../../src/ops/legacyCatalogLoader');

test('postOpAutoTrigger — final follow-up treatment detection', () => {
  assert.equal(isFinalFollowUpTreatment('12_manader'), true);
  assert.equal(isFinalFollowUpTreatment('follow_up_final'), true);
  assert.equal(isFinalFollowUpTreatment('4_manader'), false);
});

test('postOpAutoTrigger — eligible cases skip existing submissions', async () => {
  const bookingStore = {
    async listCases() {
      return [
        {
          bookingCaseId: 'case-1',
          status: 'confirmed_external',
          requestedTreatment: '12_manader',
          customerEmail: 'a@example.com',
          confirmedExternalAt: '2020-01-01T10:00:00.000Z',
          events: [],
        },
        {
          bookingCaseId: 'case-2',
          status: 'confirmed_external',
          requestedTreatment: '4_manader',
          confirmedExternalAt: '2020-01-01T10:00:00.000Z',
          events: [],
        },
      ];
    },
  };
  const postOpReviewStore = {
    findByBookingCaseId(id) {
      return id === 'case-1' ? { submissionId: 'sub-1' } : null;
    },
  };
  const eligible = await listEligiblePostOpAutoCases({
    bookingStore,
    postOpReviewStore,
    graceHours: 0,
  });
  assert.equal(eligible.length, 0);
});

test('patientDemographics — normalize + readout', () => {
  const normalized = normalizePatientDemographics({
    idVerification: { status: 'verified', documentType: 'pass' },
    nextOfKin: { name: 'Anna', phone: '0701234567' },
    importantNote: 'Allergi mot penicillin',
    addresses: { items: [{ line1: 'Storgatan 1', postalCode: '11122', city: 'Stockholm' }] },
  });
  assert.equal(normalized.idVerification.status, 'verified');
  const readout = buildDemographicsReadout(normalized);
  assert.equal(readout.nextOfKinName, 'Anna');
  assert.equal(readout.addressCount, 1);
});

test('legacyCatalogLoader — loads migration catalogs when present', () => {
  const bundle = loadLegacyCatalogBundle();
  assert.ok(bundle.counts);
  assert.ok(typeof bundle.counts.clientoServices === 'number');
});
