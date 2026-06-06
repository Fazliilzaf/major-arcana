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
