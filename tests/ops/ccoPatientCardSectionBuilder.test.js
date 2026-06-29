const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPatientCardSections } = require('../../src/ops/ccoPatientCardSectionBuilder');

test('patient card section builder exposes ordination status from booking cases', async () => {
  const bookingCaseStore = {
    async listCasesForCustomer({ customerId, patientId }) {
      assert.equal(customerId, 'cust-1');
      assert.equal(patientId, 'cust-1');
      return [
        {
          id: 'case-1',
          customerId: 'cust-1',
          patientId: 'patient-1',
          serviceLabel: 'Hårtransplantation',
          startsAt: '2030-06-29T10:00:00.000Z',
          state: 'confirmed',
          ordinationReview: {
            status: 'approved',
            decidedAt: '2030-06-28T12:00:00.000Z',
            decidedBy: 'dr-1',
            signature: 'Dr Test',
            comment: 'Allmän ordination OK.',
          },
        },
      ];
    },
  };

  const card = await buildPatientCardSections({
    customerId: 'cust-1',
    stores: { bookingCaseStore },
  });

  assert.equal(card.isStub, false);
  assert.equal(card.sections.length, 1);
  assert.equal(card.sections[0].id, 'ordination');
  assert.equal(card.sections[0].status, 'approved');
  assert.equal(card.sections[0].summary.approved, 1);
  assert.equal(card.sections[0].items[0].ordinationStatus, 'approved');
  assert.equal(card.sections[0].items[0].ordinationReview.signature, 'Dr Test');
});

test('patient card section builder stays safe when no live sections exist', async () => {
  const card = await buildPatientCardSections({ customerId: 'missing', stores: {} });
  assert.equal(card.isStub, true);
  assert.deepEqual(card.sections, []);
  assert.match(card.note, /inga matchande live-sektioner/);
});
