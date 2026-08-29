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
  // ORD-141: tomt resultat ska inte vara tyst — källorna är bortkopplade.
  assert.ok(card.warnings.includes('aftercare_store_missing'));
  assert.ok(card.warnings.includes('aftercare_scheduler_missing'));
});

test('eftervårdssektionen visar nästa uppföljning + kontakt/utfall (rad 2+3)', async () => {
  const aftercareScheduler = {
    async listJobs({ customerId }) {
      assert.equal(customerId, 'cust-1');
      return [
        // 1h-touchpoint ska INTE räknas som "nästa uppföljning".
        { kind: 'aftercare', dueAt: '2030-01-01T01:00:00.000Z', treatmentKey: 'tp' },
        {
          kind: 'followup',
          dueAt: '2030-06-01T10:00:00.000Z',
          offsetToken: '4m',
          treatmentKey: 'tp',
          channel: 'email',
          journalDraftEntryId: 'j1',
          status: 'queued',
        },
        {
          kind: 'followup',
          dueAt: '2030-10-01T10:00:00.000Z',
          offsetToken: '8m',
          treatmentKey: 'tp',
          channel: 'email',
          journalDraftEntryId: 'j2',
          status: 'queued',
        },
      ];
    },
  };
  const aftercareStore = {
    async listCasesForCustomer({ customerId }) {
      assert.equal(customerId, 'cust-1');
      return [
        {
          aftercareCaseId: 'ac-1',
          customerId: 'cust-1',
          status: 'scheduled',
          readout: {
            status: 'scheduled',
            phase: 'follow_up_planned',
            contactStatus: 'pending',
            outcomeStatus: 'unknown',
            nextStep: 'Genomför planerad uppföljning och dokumentera utfallet',
            scheduledForIso: '2030-06-01T10:00:00.000Z',
            isOverdue: false,
            queueBucket: 'planned',
          },
        },
      ];
    },
  };

  const card = await buildPatientCardSections({
    customerId: 'cust-1',
    stores: { aftercareStore, aftercareScheduler },
  });

  const section = card.sections.find((s) => s.id === 'eftervard');
  assert.ok(section, 'eftervårdssektionen ska finnas');
  assert.equal(section.displayName, 'Eftervård');
  assert.equal(section.kind, 'aftercare');
  assert.equal(section.status, 'on_track');

  // Rad 2 — nästa uppföljning (4m, inte 8m, och inte 1h-touchpointen).
  assert.equal(section.rows.nextFollowup.present, true);
  assert.equal(section.rows.nextFollowup.dueAt, '2030-06-01T10:00:00.000Z');
  assert.equal(section.rows.nextFollowup.offsetToken, '4m');
  assert.equal(section.rows.nextFollowup.journalDraftEntryId, 'j1');

  // Rad 3 — kontakt & utfall.
  assert.equal(section.rows.contactOutcome.present, true);
  assert.equal(section.rows.contactOutcome.status, 'scheduled');
  assert.equal(section.rows.contactOutcome.queueBucket, 'planned');

  // Rad 1 — blockerar på kanonfil-valet, markeras som pending.
  assert.equal(section.rows.instructions.present, false);
  assert.equal(section.rows.instructions.pending, true);

  assert.equal(section.summary.followupCount, 2);
  assert.equal(section.summary.aftercareCaseCount, 1);
  assert.equal(card.warnings.length, 0);
});

test('mutation: koppla bort eftervårdsstoret → larm, inte tyst tom (ORD-141 §7)', async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (message) => logs.push(String(message));
  try {
    // Eftervårdsstoret är bortkopplat — precis buggen som ORD-141 lagar.
    const card = await buildPatientCardSections({
      customerId: 'cust-1',
      stores: {},
    });
    assert.ok(card.warnings.includes('aftercare_store_missing'));
    assert.ok(card.warnings.includes('aftercare_scheduler_missing'));
    assert.ok(
      card.sections.every((s) => s.id !== 'eftervard'),
      'ingen sektion ska renderas tyst-tom'
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    logs.some((line) => /ccoAftercareStore/.test(line)),
    'console.warn ska larma om den saknade ccoAftercareStore'
  );
  assert.ok(
    logs.some((line) => /ccoAftercareScheduler/.test(line)),
    'console.warn ska larma om den saknade ccoAftercareScheduler'
  );
});
