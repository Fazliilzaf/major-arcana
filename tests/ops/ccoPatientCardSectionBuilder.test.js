const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPatientCardSections,
  FORE_EFTERVARD_DOCUMENT_IDS,
} = require('../../src/ops/ccoPatientCardSectionBuilder');

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

  assert.equal(card.sections[0].id, 'ordination');
  assert.equal(card.sections[0].status, 'approved');
  assert.equal(card.sections[0].summary.approved, 1);
  assert.equal(card.sections[0].items[0].ordinationStatus, 'approved');
  assert.equal(card.sections[0].items[0].ordinationReview.signature, 'Dr Test');
});

// ── ORD-141 rad 1 · tre lägen (ett test per läge) ─────────────────────────

test('rad 1 läge 1: sändposter finns men ingen för dokumentet → "inte skickad"', async () => {
  // Sändloggen svarar, men det finns bara en (o relaterad) hälsodeklaration —
  // ingen post kopplad till en för-/eftervårdsrad.
  const sendActionStore = {
    async listSends({ customerId }) {
      assert.equal(customerId, 'cust-1');
      return [
        {
          sendId: 'send-form',
          customerId: 'cust-1',
          kind: 'form',
          status: 'sent',
          linkedDocumentId: 'haelso_tp_sve',
          createdAt: '2026-08-01T09:00:00.000Z',
        },
      ];
    },
  };

  const card = await buildPatientCardSections({
    customerId: 'cust-1',
    stores: { sendActionStore },
  });

  const section = card.sections.find((s) => s.id === 'eftervard');
  assert.ok(section, 'eftervårdssektionen ska finnas (rad 1 alltid närvarande)');
  assert.equal(section.rows.instructions.present, true);
  assert.equal(section.rows.instructions.state, 'not_sent');
  assert.equal(section.rows.instructions.sentAt, null);
  // Inget larm om sändstoret — det svarade ärligt.
  assert.ok(!card.warnings.includes('send_action_store_missing'));
  assert.ok(!card.warnings.includes('send_action_store_unresponsive'));
});

test('rad 1 läge 2: en sändpost matchar → "skickad <datum>"', async () => {
  const sendActionStore = {
    async listSends({ customerId }) {
      assert.equal(customerId, 'cust-1');
      return [
        {
          sendId: 'send-1',
          customerId: 'cust-1',
          kind: 'file',
          status: 'sent',
          linkedDocumentId: 'forberedelse_tp',
          createdAt: '2026-08-30T09:15:00.000Z',
        },
      ];
    },
  };

  const card = await buildPatientCardSections({
    customerId: 'cust-1',
    stores: { sendActionStore },
  });

  const section = card.sections.find((s) => s.id === 'eftervard');
  assert.ok(section);
  assert.equal(section.rows.instructions.present, true);
  assert.equal(section.rows.instructions.state, 'sent');
  assert.equal(section.rows.instructions.sentAt, '2026-08-30T09:15:00.000Z');
  assert.equal(section.rows.instructions.documentId, 'forberedelse_tp');
  assert.equal(section.rows.instructions.sendId, 'send-1');
});

test('rad 1 läge 3 (mutation): sändstoret bortkopplat → "kan inte avgöras", INTE "inte skickad"', async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (message) => logs.push(String(message));
  try {
    // Sändstoret är bortkopplat — precis buggen ORD-141 §3 lagar: saknad koppling
    // får inte se ut som svaret "inte skickad".
    const card = await buildPatientCardSections({
      customerId: 'cust-1',
      stores: {},
    });

    const section = card.sections.find((s) => s.id === 'eftervard');
    assert.ok(section, 'rad 1 ska finnas även när källan saknas');
    assert.equal(section.rows.instructions.state, 'unknown');
    assert.equal(section.rows.instructions.reason, 'send_store_missing');
    assert.equal(section.rows.instructions.sentAt, null);
    assert.ok(card.warnings.includes('send_action_store_missing'));
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(
    logs.some((line) => /ccoSendActionStore/.test(line)),
    'console.warn ska larma om den saknade ccoSendActionStore'
  );
});

test('rad 1 känner bara igen för-/eftervårdsraden, inte andra dokument', () => {
  assert.deepEqual(
    FORE_EFTERVARD_DOCUMENT_IDS,
    ['forberedelse_tp', 'eftervard_tp', 'forberedelse_curatiio', 'eftervard_curatiio']
  );
  assert.ok(!FORE_EFTERVARD_DOCUMENT_IDS.includes('haelso_tp_sve'));
});

// ── Eftervård rad 2 + rad 3 (befintliga, ORD-141 §1/§4) ───────────────────

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
  const sendActionStore = {
    async listSends() {
      return [];
    },
  };

  const card = await buildPatientCardSections({
    customerId: 'cust-1',
    stores: { aftercareStore, aftercareScheduler, sendActionStore },
  });

  const section = card.sections.find((s) => s.id === 'eftervard');
  assert.ok(section, 'eftervårdssektionen ska finnas');
  assert.equal(section.displayName, 'Eftervård');
  assert.equal(section.kind, 'aftercare');
  assert.equal(section.status, 'on_track');

  // Rad 1 — ingen för-/eftervårdsinstruktion skickad ännu.
  assert.equal(section.rows.instructions.present, true);
  assert.equal(section.rows.instructions.state, 'not_sent');

  // Rad 2 — nästa uppföljning (4m, inte 8m, och inte 1h-touchpointen).
  assert.equal(section.rows.nextFollowup.present, true);
  assert.equal(section.rows.nextFollowup.dueAt, '2030-06-01T10:00:00.000Z');
  assert.equal(section.rows.nextFollowup.offsetToken, '4m');
  assert.equal(section.rows.nextFollowup.journalDraftEntryId, 'j1');

  // Rad 3 — kontakt & utfall.
  assert.equal(section.rows.contactOutcome.present, true);
  assert.equal(section.rows.contactOutcome.status, 'scheduled');
  assert.equal(section.rows.contactOutcome.queueBucket, 'planned');

  assert.equal(section.summary.followupCount, 2);
  assert.equal(section.summary.aftercareCaseCount, 1);
  assert.equal(card.warnings.length, 0);
});

test('mutation: koppla bort eftervårdsstoret → rad 2/3 larmar, rad 1 finns kvar (ORD-141 §7)', async () => {
  const logs = [];
  const originalWarn = console.warn;
  console.warn = (message) => logs.push(String(message));
  try {
    // Eftervårdsstoret är bortkopplat — rad 3 får inte renderas tyst-tom.
    const card = await buildPatientCardSections({
      customerId: 'cust-1',
      stores: {},
    });
    assert.ok(card.warnings.includes('aftercare_store_missing'));
    assert.ok(card.warnings.includes('aftercare_scheduler_missing'));
    // Rad 1 (instruktionerna) är fortfarande där, med sitt eget läge.
    const section = card.sections.find((s) => s.id === 'eftervard');
    assert.ok(section, 'eftervårdssektionen ska finnas p.g.a. rad 1');
    assert.equal(section.rows.instructions.state, 'unknown');
    assert.equal(section.rows.nextFollowup.present, false);
    assert.equal(section.rows.contactOutcome.present, false);
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
