'use strict';

/**
 * P0.8 — Audit på journal-read + correction-as-new-entry + unlock owner.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const {
  readJournalWithAudit,
  withReadAuditFactory,
} = require('../../src/ops/ccoJournalReadAudit');
const { ACTIONS, isHighSeverity } = require('../../src/security/ccoAuditLog');

async function mkTmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'journal-audit-'));
}

function fakeAudit() {
  const events = [];
  return {
    events,
    append: (e) => {
      events.push(e);
      return e;
    },
  };
}

test('P0.8.1 — readJournalWithAudit emits journal.read with started + ok', async () => {
  const audit = fakeAudit();
  const result = await readJournalWithAudit(
    {
      auditLog: audit,
      actor: { role: 'operator', userId: 'u1' },
      tenantId: 't1',
      patientId: 'p1',
      endpoint: 'GET /api/test',
      scope: 'list_entries',
    },
    async () => [{ entryId: 'a' }, { entryId: 'b' }]
  );
  assert.deepEqual(result, [{ entryId: 'a' }, { entryId: 'b' }]);
  assert.equal(audit.events.length, 2);
  assert.equal(audit.events[0].action, 'journal.read');
  assert.equal(audit.events[0].result, 'started');
  assert.equal(audit.events[1].result, 'ok');
  assert.equal(audit.events[1].detail.entriesCount, 2);
  assert.equal(audit.events[1].detail.scope, 'list_entries');
  assert.equal(audit.events[1].target.id, 'p1');
});

test('P0.8.2 — readJournalWithAudit emits started + error when callback throws', async () => {
  const audit = fakeAudit();
  await assert.rejects(
    () =>
      readJournalWithAudit(
        {
          auditLog: audit,
          actor: { role: 'konsult' },
          tenantId: 't1',
          patientId: 'p1',
          scope: 'list_entries',
        },
        async () => {
          throw new Error('boom');
        }
      ),
    /boom/
  );
  assert.equal(audit.events.length, 2);
  assert.equal(audit.events[0].result, 'started');
  assert.equal(audit.events[1].result, 'error');
  assert.equal(audit.events[1].detail.error, 'boom');
});

test('P0.8.3 — withReadAuditFactory bundles actor+tenant+endpoint', async () => {
  const audit = fakeAudit();
  const withRead = withReadAuditFactory({
    auditLog: audit,
    actor: { role: 'owner', userId: 'owner-1' },
    tenantId: 't1',
    patientId: 'p7',
    endpoint: 'GET /test',
  });
  const data = await withRead('get_entry', () => ({ entryId: 'X' }));
  assert.equal(data.entryId, 'X');
  assert.equal(audit.events[0].action, 'journal.read');
  assert.equal(audit.events[0].detail.scope, 'get_entry');
  assert.equal(audit.events[1].detail.entriesCount, 1);
});

test('P0.8.4 — audit failure must NOT break read flow', async () => {
  const brokenAudit = {
    append: () => {
      throw new Error('audit-write disk full');
    },
  };
  const data = await readJournalWithAudit(
    { auditLog: brokenAudit, actor: {}, tenantId: 't1', patientId: 'p1' },
    async () => 'ok-result'
  );
  assert.equal(data, 'ok-result');
});

test('P0.8.5 — correction creates NEW entry with correctionOfEntryId, original untouched', async () => {
  const dir = await mkTmp();
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  const draft = await store.upsertEntry(
    {
      tenantId: 't1',
      patientId: 'p1',
      journalType: 'tp_treatment',
      title: 'Original',
      fields: { method: 'FUE', grafts: '2500' },
    },
    { actor: { userId: 'u1' } }
  );
  const signed = await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1' },
  });
  assert.equal(signed.locked, true);

  // Correction
  const correction = await store.addCorrection({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    fields: { method: 'DHI' },
    actor: { userId: 'u2' },
  });
  assert.notEqual(correction.entryId, draft.entryId, 'correction has NEW entryId');
  assert.equal(correction.correctionOfEntryId, draft.entryId);
  assert.equal(correction.fields.method, 'DHI');
  assert.equal(correction.fields.grafts, '2500', 'inherited untouched fields');
  assert.equal(correction.source, 'cco_journal_correction');

  // Original is unchanged
  const original = await store.getEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
  });
  assert.equal(original.locked, true);
  assert.equal(original.fields.method, 'FUE', 'original method must NOT be DHI');
  assert.equal(original.signedAt, signed.signedAt);
});

test('P0.8.6 — signed entry cannot be upserted directly (immutable check)', async () => {
  const dir = await mkTmp();
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1' },
  });
  await assert.rejects(
    () =>
      store.upsertEntry(
        {
          entryId: draft.entryId,
          tenantId: 't1',
          patientId: 'p1',
          journalType: 'tp_treatment',
          fields: { method: 'CHANGED' },
        },
        { actor: { userId: 'attacker' } }
      ),
    /[Ss]ignerad.*kan inte ändras/
  );
});

test('P0.8.7 — unlock requires existing locked entry (404 if missing)', async () => {
  const dir = await mkTmp();
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  await assert.rejects(
    () =>
      store.unlockEntry({
        tenantId: 't1',
        patientId: 'p1',
        entryId: 'nope',
        reason: 'x',
        actor: { role: 'owner', userId: 'o1' },
      }),
    /hittades inte/
  );
});

test('P0.8.8 — unlock 409 on non-locked entry', async () => {
  const dir = await mkTmp();
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  await assert.rejects(
    () =>
      store.unlockEntry({
        tenantId: 't1',
        patientId: 'p1',
        entryId: draft.entryId,
        reason: 'bypass attempt',
        actor: { role: 'owner', userId: 'o1' },
      }),
    /inte låst/
  );
});

test('P0.8.9 — unlock preserves snapshot of signed-state', async () => {
  const dir = await mkTmp();
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'j.json') });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  const signed = await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'staff-A', displayName: 'A' },
  });
  const unlocked = await store.unlockEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    reason: 'patient requested correction outside reach of correction-flow',
    actor: { role: 'owner', userId: 'owner-1', displayName: 'Owner1' },
  });
  assert.equal(unlocked.locked, false);
  assert.equal(unlocked.status, 'draft');
  assert.ok(unlocked.unlockSnapshot);
  assert.equal(unlocked.unlockSnapshot.previouslySignedAt, signed.signedAt);
  assert.equal(unlocked.unlockSnapshot.previousLocked, true);
  assert.equal(unlocked.unlockSnapshot.unlockedByUserId, 'owner-1');
  // Audit-trail-event added
  const lastEvent = unlocked.events[unlocked.events.length - 1];
  assert.equal(lastEvent.type, 'journal_entry_unlocked_high_severity');
});

test('P0.8.10 — ACTIONS vocabulary documented + isHighSeverity flags unlock+delete', () => {
  assert.equal(ACTIONS.JOURNAL_READ, 'journal.read');
  assert.equal(ACTIONS.JOURNAL_WRITE, 'journal.write');
  assert.equal(ACTIONS.JOURNAL_SIGN, 'journal.sign');
  assert.equal(ACTIONS.JOURNAL_LOCK, 'journal.lock');
  assert.equal(ACTIONS.JOURNAL_UNLOCK, 'journal.unlock');
  assert.equal(ACTIONS.JOURNAL_CORRECTION, 'journal.correction');
  assert.equal(ACTIONS.JOURNAL_PDF_GENERATED, 'journal.pdf_generated');
  assert.equal(ACTIONS.JOURNAL_PDF_GENERATED_AT_SIGNING, 'journal.pdf_generated_at_signing');
  assert.equal(ACTIONS.JOURNAL_EXPORT, 'journal.export');
  assert.equal(ACTIONS.PHOTO_READ, 'photo.read');
  assert.equal(ACTIONS.PHOTO_WRITE, 'photo.write');
  assert.equal(ACTIONS.PHOTO_DELETE, 'photo.delete');
  assert.equal(isHighSeverity('journal.unlock'), true);
  assert.equal(isHighSeverity('photo.delete'), true);
  assert.equal(isHighSeverity('journal.read'), false);
});
