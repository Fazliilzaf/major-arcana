'use strict';

/**
 * P0.9 — ccoJournalQaDashboardStore tests.
 *
 * Verifierar att aggregatorn:
 *   - returnerar alla 5 status-block
 *   - cachar i 60s (snapshot:s timestamp ändras inte vid omedelbart andra-call)
 *   - räknar counts korrekt från injicerade fake-stores
 *   - INTE inkluderar PII (patient-id:n) i block-payload
 *   - DoD-10 är komplett
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createJournalQaDashboardStore } = require('../../src/ops/ccoJournalQaDashboardStore');

function fakeCustomerStore(directory) {
  // Matchar real ccoCustomerStore.peekTenantCustomerState — returnerar
  // customerState direkt (inte wrapped).
  return {
    peekTenantCustomerState: async () => ({ directory }),
  };
}

function fakeJournalStore(entries) {
  return {
    listAllEntries: async () => entries,
  };
}

function fakePhotoStore(stats) {
  return {
    stats: () => stats,
    listForPatient: () => [],
  };
}

function fakeTemplateRegistry(byType) {
  return {
    stats: () => ({ byType }),
  };
}

test('P0.9.1 — snapshot har alla 5 block + tenantId + generatedAt', async () => {
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore({}),
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.tenantId, 'hair_tp');
  assert.ok(snap.generatedAt);
  assert.ok(snap.block1);
  assert.ok(snap.block2);
  assert.ok(snap.block3);
  assert.ok(snap.block4);
  assert.ok(snap.block5);
});

test('P0.9.2 — block1 räknar cliento/meridiq/drive korrekt', async () => {
  const directory = {
    k1: { meridiqMeta: { hasJournal: true }, driveFolderId: 'd1' },
    k2: { meridiqMeta: { hasJournal: true } },
    k3: {}, // bara cliento
  };
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore(directory),
    journalStore: fakeJournalStore([
      { entryId: 'e1', status: 'signed', locked: true, pdfHash: 'abc', patientId: 'k1' },
      { entryId: 'e2', status: 'draft', patientId: 'k2' },
    ]),
    photoStore: fakePhotoStore({ total: 5, linkedToEncounter: 3, unlinked: 2, byType: {}, bySource: {} }),
    templateRegistry: fakeTemplateRegistry({
      consent: 43,
      patient_information: 14,
      health_declaration: 2,
      fitness_certificate: 2,
      followup: 6,
      aftercare: 5,
    }),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block1.cliento, 3);
  assert.equal(snap.block1.meridiq, 2);
  assert.equal(snap.block1.driveFolders, 1);
  assert.equal(snap.block1.journalEntries, 2);
  assert.equal(snap.block1.journalPdfs, 1);
  assert.equal(snap.block1.photos, 5);
  assert.equal(snap.block1.consents, 43);
  assert.equal(snap.block1.forms, 14 + 2 + 2 + 6 + 5);
});

test('P0.9.3 — block2 matching: matchedAll3, withClientoOnly, dubbletter', async () => {
  const directory = {
    k1: { meridiqMeta: { via: 'email' }, driveFolderId: 'd1' }, // matchedAll3
    k2: { meridiqMeta: { via: 'email' } }, // matchedClientoMeridiq
    k3: {}, // withClientoOnly
    k4: { duplicateCandidate: true, meridiqMeta: { via: 'email' } }, // dupe
    k5: { meridiqMeta: { via: 'name' } }, // uncertain
    k6: { meridiqMeta: { via: 'new_from_meridiq' } }, // withMeridiqOnly
  };
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore(directory),
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block2.totalPatients, 6);
  assert.equal(snap.block2.matchedAll3, 1);
  assert.equal(snap.block2.withClientoOnly, 1);
  assert.equal(snap.block2.withMeridiqOnly, 1);
  assert.equal(snap.block2.duplicates, 1);
  assert.equal(snap.block2.uncertain, 1);
});

test('P0.9.4 — block3 journal-status counts signed/locked/pdf/draft', async () => {
  const entries = [
    { entryId: 'e1', status: 'signed', locked: true, pdfHash: 'abc', patientId: 'p1' },
    { entryId: 'e2', status: 'signed', locked: true, patientId: 'p2' }, // no pdf
    { entryId: 'e3', status: 'draft', patientId: 'p3' },
    { entryId: 'e4', journalType: 'historical_import', status: 'signed', locked: true, pdfHash: 'xx', patientId: 'p4' },
    { entryId: 'e5', status: 'corrected', patientId: 'p5' },
  ];
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore({}),
    journalStore: fakeJournalStore(entries),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block3.totalEntries, 5);
  assert.equal(snap.block3.signed, 3);
  assert.equal(snap.block3.locked, 3);
  assert.equal(snap.block3.drafts, 1);
  assert.equal(snap.block3.corrected, 1);
  assert.equal(snap.block3.withPdf, 2);
  assert.equal(snap.block3.withoutPdf, 3);
  assert.equal(snap.block3.withMeridiqImport, 1);
  assert.equal(snap.block3.patientsWithHistoricJournal, 5);
});

test('P0.9.5 — block4 photo-status counts + status-färg', async () => {
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore({}),
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({
      total: 10,
      linkedToEncounter: 9,
      unlinked: 1,
      byType: { before: 4, after: 4, reference: 2 },
      bySource: { cco_camera: 8, drive: 2 },
    }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block4.total, 10);
  assert.equal(snap.block4.linkedToEncounter, 9);
  assert.equal(snap.block4.unlinked, 1);
  assert.equal(snap.block4.byType.before, 4);
  assert.equal(snap.block4.byType.after, 4);
  assert.equal(snap.block4.bySource.cco_camera, 8);
  assert.equal(snap.block4.bySource.drive, 2);
});

test('P0.9.6 — block5 Cutover-readiness ger DoD-10 + status-färg', async () => {
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore({}),
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block5.definitionOfDone.length, 10);
  assert.equal(snap.block5.totalCriteria, 10);
  assert.ok(['green', 'yellow', 'red'].includes(snap.block5.status));
  assert.ok(snap.block5.nextAction);
  assert.ok(snap.block5.blockers.length > 0);
});

test('P0.9.7 — cache fungerar (samma snapshot returneras inom TTL)', async () => {
  let callCount = 0;
  const store = createJournalQaDashboardStore({
    customerStore: {
      peekTenantCustomerState: async () => {
        callCount++;
        return { customerState: { directory: {} } };
      },
    },
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  await store.getSnapshot({ tenantId: 'hair_tp' });
  const before = callCount;
  assert.ok(before > 0, 'första anropet ska träffa customerStore minst en gång');
  await store.getSnapshot({ tenantId: 'hair_tp' });
  await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(callCount, before, 'cache ska göra att customerStore inte träffas igen');
  store.invalidate('hair_tp');
  await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(callCount, before * 2, 'invalidate ska tvinga ny aggregering (samma antal calls igen)');
});

test('P0.9.8 — snapshot innehåller INGA personnummer/email/patient-ID-payloads (counts only)', async () => {
  const directory = {
    'pn-1234567890': { meridiqMeta: { pnrSuffix: '7890', hasJournal: true } },
    'anna@example.com': { meridiqMeta: { via: 'email' } },
  };
  const store = createJournalQaDashboardStore({
    customerStore: fakeCustomerStore(directory),
    journalStore: fakeJournalStore([
      { entryId: 'e1', status: 'signed', patientId: 'pn-1234567890', pnr: '195501011234' },
    ]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  const json = JSON.stringify(snap);
  // Inga directory-keys (innehåller email/pnr-mönster) ska läcka
  assert.equal(json.includes('pn-1234567890'), false);
  assert.equal(json.includes('anna@example.com'), false);
  assert.equal(json.includes('195501011234'), false);
});

test('P0.9.9 — graceful degradation: saknade stores ger 0 utan att kasta', async () => {
  const store = createJournalQaDashboardStore({});
  const snap = await store.getSnapshot({ tenantId: 'hair_tp' });
  assert.equal(snap.block1.cliento, 0);
  assert.equal(snap.block3.totalEntries, 0);
  assert.equal(snap.block4.total, 0);
  assert.ok(snap.block5);
});

test('P0.9.10 — invalidate utan tenantId rensar hela cachen', async () => {
  let callCount = 0;
  const store = createJournalQaDashboardStore({
    customerStore: {
      peekTenantCustomerState: async () => {
        callCount++;
        return { customerState: { directory: {} } };
      },
    },
    journalStore: fakeJournalStore([]),
    photoStore: fakePhotoStore({ total: 0 }),
    templateRegistry: fakeTemplateRegistry({}),
  });
  await store.getSnapshot({ tenantId: 't1' });
  const afterFirst = callCount;
  await store.getSnapshot({ tenantId: 't2' });
  const afterSecond = callCount;
  assert.ok(afterSecond > afterFirst, 'olika tenant ska ge ny cache-miss');
  store.invalidate();
  await store.getSnapshot({ tenantId: 't1' });
  await store.getSnapshot({ tenantId: 't2' });
  assert.ok(callCount > afterSecond, 'efter invalidate ska båda tenants träffa store igen');
});
