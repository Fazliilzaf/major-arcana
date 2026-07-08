'use strict';

/* Kundkort/dossier för Svarstudion — ren aggregering av "all info om kunden".
 * Testlåser: samlar från alla källor, TOLERERAR trasiga/saknade källor, och —
 * viktigast — att RÅ JOURNALTEXT aldrig läcker ut (bara antal + senaste datum).
 * Personnummer maskas. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomerDossier } = require('../../src/ops/ccoCustomerDossier');

const stores = {
  patientMasterStore: {
    getPatient: async () => ({
      name: 'Anna Karlsson',
      personnummer: '19900101-1234',
      emails: ['anna@mail.se', 'ANNA@mail.se'],
      phone: '+46701234567',
    }),
  },
  journeyStore: {
    getOverview: async () => ({ step: 'offert', status: 'väntar_signering' }),
  },
  bookingStore: {
    getBookingsForCustomer: async () => [
      { id: 'b1', serviceLabel: 'Konsultation', startsAt: '2026-09-15T09:00', status: 'confirmed' },
      { id: 'b2', serviceLabel: 'PRP', startsAt: '2026-03-01T10:00', status: 'done' },
    ],
  },
  caseStore: {
    listCasesForCustomer: async () => [{ id: 'c1', title: 'DHI-plan', status: 'open' }],
  },
  threadStore: {
    buildThreadsForCustomer: async () => ({
      threads: [{ needsReplyStatus: 'needs_reply' }, { status: 'closed' }],
      summary: 'Två trådar',
    }),
  },
  journalStore: {
    listEntries: async () => [
      { createdAt: '2026-02-01', body: 'HEMLIG JOURNALTEXT om diagnos' },
      { createdAt: '2026-05-10', note: 'ÄNNU MER KÄNSLIGT' },
    ],
  },
  portalMessageStore: {
    listMessagesForCustomer: () => [
      { direction: 'inbound', createdAt: '2026-06-01', readAt: null },
      { direction: 'outbound', createdAt: '2026-06-02', readAt: null },
    ],
    countUnreadInbound: () => 1,
  },
};

test('dossier samlar identitet, kontakt, journey, bokningar, ärenden, trådar', async () => {
  const d = await buildCustomerDossier(
    { tenantId: 'hairtpclinic', customerId: 'CUST-1', nowIso: '2026-07-08T00:00' },
    stores
  );
  assert.equal(d.identity.name, 'Anna Karlsson');
  assert.match(d.identity.personnummerMasked, /•/); // maskad, ej klartext
  assert.doesNotMatch(d.identity.personnummerMasked, /19900101-123/);
  assert.deepEqual(d.contact.emails, ['anna@mail.se']); // dedupe (case-insensitiv)
  assert.equal(d.contact.phones[0], '+46701234567');
  assert.equal(d.journey.step, 'offert');
  assert.equal(d.bookings.count, 2);
  assert.equal(d.bookings.upcoming[0].service, 'Konsultation'); // framtida
  assert.equal(d.bookings.recent[0].service, 'PRP'); // förfluten
  assert.equal(d.cases[0].title, 'DHI-plan');
  assert.equal(d.threads.count, 2);
  assert.equal(d.threads.needsReply, 1);
  assert.equal(d.portal.count, 2);
  assert.equal(d.portal.unread, 1);
  assert.equal(d.portal.latestAt, '2026-06-02');
});

test('RÅ JOURNALTEXT läcker ALDRIG — bara antal + senaste datum', async () => {
  const d = await buildCustomerDossier({ tenantId: 'hairtpclinic', customerId: 'CUST-1' }, stores);
  assert.equal(d.journal.count, 2);
  assert.equal(d.journal.latestAt, '2026-05-10');
  const serialized = JSON.stringify(d);
  assert.doesNotMatch(serialized, /HEMLIG JOURNALTEXT/);
  assert.doesNotMatch(serialized, /ÄNNU MER KÄNSLIGT/);
  assert.doesNotMatch(serialized, /diagnos/);
});

test('trasig/saknad källa stjälper inte kortet — noteras i warnings', async () => {
  const broken = {
    patientMasterStore: {
      getPatient: async () => {
        throw new Error('nere');
      },
    },
    // journeyStore saknas helt
    threadStore: stores.threadStore,
  };
  const d = await buildCustomerDossier({ tenantId: 't', customerId: 'CUST-2' }, broken);
  assert.ok(d.warnings.some((w) => w.includes('patient_master')));
  assert.equal(d.threads.count, 2); // resten byggdes ändå
  assert.equal(d.identity.name, null);
});

test('ingen kundnyckel → tomt kort med varning, ingen krasch', async () => {
  const d = await buildCustomerDossier({}, stores);
  assert.ok(d.warnings.some((w) => w.includes('ingen kundnyckel')));
  assert.equal(d.customerId, null);
});
