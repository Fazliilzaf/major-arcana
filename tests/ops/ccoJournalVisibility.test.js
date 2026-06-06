'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoJournalStore,
  buildJournalReadout,
  isPatientPortalJournalVisible,
  normalizeJournalVisibility,
} = require('../../src/ops/ccoJournalStore');

test('normalizeJournalVisibility defaults to shared', () => {
  assert.equal(normalizeJournalVisibility(''), 'shared');
  assert.equal(normalizeJournalVisibility('PRIVATE_INTERNAL'), 'private_internal');
  assert.equal(normalizeJournalVisibility('nonsense'), 'shared');
});

test('private_internal entries are hidden from patient portal filter', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-journal-vis-'));
  const filePath = path.join(dir, 'journal.json');
  const store = await createCcoJournalStore({ filePath });
  const entry = await store.upsertEntry(
    {
      tenantId: 'hairtpclinic',
      patientId: 'cco-pilot-20260602-a',
      journalType: 'tp_treatment',
      title: 'Intern anteckning',
      visibility: 'private_internal',
      fields: {},
    },
    { actor: { userId: 'test', role: 'owner', displayName: 'Test' } }
  );
  assert.equal(isPatientPortalJournalVisible(entry), false);
  const readout = buildJournalReadout(entry);
  assert.equal(readout.visibility, 'private_internal');
});

test('shared entries remain patient-portal visible', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-journal-vis-'));
  const filePath = path.join(dir, 'journal.json');
  const store = await createCcoJournalStore({ filePath });
  const entry = await store.upsertEntry(
    {
      tenantId: 'hairtpclinic',
      patientId: 'cco-pilot-20260602-a',
      journalType: 'tp_treatment',
      title: 'Delad journal',
      fields: {},
    },
    { actor: { userId: 'test', role: 'owner', displayName: 'Test' } }
  );
  assert.equal(isPatientPortalJournalVisible(entry), true);
  assert.equal(buildJournalReadout(entry).visibility, 'shared');
});

test('upsertEntry återanvänder öppet utkast per journalType+formVariant', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-journal-draft-'));
  const filePath = path.join(dir, 'journal.json');
  const store = await createCcoJournalStore({ filePath });
  const actor = { userId: 'test', role: 'owner', displayName: 'Test' };
  const first = await store.upsertEntry(
    {
      tenantId: 'hairtpclinic',
      patientId: 'cco-kkx-uat-del3-a',
      journalType: 'tp_treatment',
      formVariant: 'hair_tp',
      title: 'TP A',
      fields: { a: 1 },
    },
    { actor }
  );
  const second = await store.upsertEntry(
    {
      tenantId: 'hairtpclinic',
      patientId: 'cco-kkx-uat-del3-a',
      journalType: 'tp_treatment',
      formVariant: 'hair_tp',
      title: 'TP B',
      fields: { b: 2 },
    },
    { actor }
  );
  assert.equal(second.entryId, first.entryId);
  const rows = await store.listEntries({
    tenantId: 'hairtpclinic',
    patientId: 'cco-kkx-uat-del3-a',
    journalType: 'tp_treatment',
  });
  assert.equal(rows.length, 1);
});

test('deleteEntry tillåter radering av olåst utkast', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-journal-del-'));
  const filePath = path.join(dir, 'journal.json');
  const store = await createCcoJournalStore({ filePath });
  const actor = { userId: 'test', role: 'owner', displayName: 'Test' };
  const draft = await store.upsertEntry(
    {
      tenantId: 'hairtpclinic',
      patientId: 'cco-kkx-uat-del3-a',
      journalType: 'tp_treatment',
      title: 'Raderas',
      fields: {},
    },
    { actor }
  );
  await store.deleteEntry({
    tenantId: 'hairtpclinic',
    patientId: 'cco-kkx-uat-del3-a',
    entryId: draft.entryId,
    actor,
  });
  const rows = await store.listEntries({
    tenantId: 'hairtpclinic',
    patientId: 'cco-kkx-uat-del3-a',
  });
  assert.equal(rows.length, 0);
});
