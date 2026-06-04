'use strict';

/**
 * P0.5 — Journal sign → auto-PDF flow.
 *
 * Verifierar:
 *  1. signEntry() anropar onAfterSign-hooken med signed entry.
 *  2. applyPdfArtifact() sparar pdfPath/pdfTamperHash/pdfGeneratedAt på låst entry.
 *  3. PDF-fil hamnar på disk vid full flow (hook → exporter → applyPdfArtifact).
 *  4. Auto-gen händer INTE om entry inte signeras (draft förblir utan pdfPath).
 *  5. applyPdfArtifact är 409 för icke-signerade entries.
 *  6. Hook-fel kraschar inte signering — entry blir signed ändå.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { createCcoJournalStore } = require('../../src/ops/ccoJournalStore');
const {
  computeTamperHash,
  buildHtml,
} = require('../../src/ops/ccoJournalPdfExport');

async function mkTmp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('P0.5 — signEntry calls onAfterSign hook with signed entry', async () => {
  const dir = await mkTmp('journal-sign-pdf-hook-');
  let hookCalled = 0;
  let hookEntry = null;
  const store = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
    onAfterSign: async (entry) => {
      hookCalled += 1;
      hookEntry = entry;
    },
  });
  const draft = await store.upsertEntry(
    {
      tenantId: 't1',
      patientId: 'p1',
      journalType: 'tp_treatment',
      title: 'TP draft',
      fields: { method: 'FUE' },
    },
    { actor: { userId: 'u1', role: 'OWNER', displayName: 'U1' } }
  );
  await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1', role: 'OWNER', displayName: 'U1' },
  });
  assert.equal(hookCalled, 1, 'hook should run once');
  assert.equal(hookEntry?.locked, true);
  assert.equal(hookEntry?.status, 'signed');
});

test('P0.5 — applyPdfArtifact stores pdfPath/pdfTamperHash/pdfGeneratedAt on locked entry', async () => {
  const dir = await mkTmp('journal-sign-pdf-apply-');
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'journal.json') });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment', fields: { x: 1 } },
    { actor: {} }
  );
  await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1', role: 'OWNER' },
  });
  const result = await store.applyPdfArtifact({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    pdfPath: '/tmp/fake.pdf',
    pdfTamperHash: 'abc123',
    pdfSizeBytes: 42,
  });
  assert.equal(result.pdfPath, '/tmp/fake.pdf');
  assert.equal(result.pdfTamperHash, 'abc123');
  assert.equal(result.pdfSizeBytes, 42);
  assert.ok(result.pdfGeneratedAt, 'pdfGeneratedAt should be set');
});

test('P0.5 — applyPdfArtifact returns 409 for draft entries', async () => {
  const dir = await mkTmp('journal-sign-pdf-409-');
  const store = await createCcoJournalStore({ filePath: path.join(dir, 'journal.json') });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  await assert.rejects(
    () =>
      store.applyPdfArtifact({
        tenantId: 't1',
        patientId: 'p1',
        entryId: draft.entryId,
        pdfPath: '/tmp/x.pdf',
        pdfTamperHash: 'x',
      }),
    /signerad\/låst/i
  );
});

test('P0.5 — hook NOT called on upsert/draft (only on sign)', async () => {
  const dir = await mkTmp('journal-sign-pdf-noupsert-');
  let hookCalls = 0;
  const store = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
    onAfterSign: async () => {
      hookCalls += 1;
    },
  });
  await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  assert.equal(hookCalls, 0, 'hook must not run for draft create');
});

test('P0.5 — sign succeeds even if hook throws', async () => {
  const dir = await mkTmp('journal-sign-pdf-throws-');
  // Suppress console.error in test
  const store = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
    onAfterSign: async () => {
      throw new Error('simulated playwright failure');
    },
  });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment' },
    { actor: {} }
  );
  const signed = await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1' },
  });
  assert.equal(signed.locked, true);
  assert.equal(signed.status, 'signed');
});

test('P0.5 — full flow: sign hook writes PDF to disk + sets metadata', async () => {
  const dir = await mkTmp('journal-sign-pdf-full-');
  const pdfDir = path.join(dir, 'cco-journal-pdfs');
  await fs.mkdir(pdfDir, { recursive: true });

  // Bygg en hook som simulerar PDF-export utan att kräva Playwright:
  // skapa en deterministisk "fake-pdf" baserad på buildHtml + tamperHash.
  const auditEvents = [];
  let store;
  const hook = async (signedEntry, { actor } = {}) => {
    const tamperHash = computeTamperHash(signedEntry);
    const html = buildHtml(signedEntry, { tamperHash });
    // Skriv html som "pdf-buffer" — vi testar bara att fil + metadata sätts
    const fakeBuffer = Buffer.from(html, 'utf8');
    const target = path.join(pdfDir, `${signedEntry.entryId}.pdf`);
    await fs.writeFile(target, fakeBuffer);
    await store.applyPdfArtifact({
      tenantId: signedEntry.tenantId,
      patientId: signedEntry.patientId,
      entryId: signedEntry.entryId,
      pdfPath: target,
      pdfTamperHash: tamperHash,
      pdfSizeBytes: fakeBuffer.length,
    });
    auditEvents.push({
      action: 'journal.pdf_generated_at_signing',
      actor,
      tamperHash,
      sizeBytes: fakeBuffer.length,
    });
  };
  store = await createCcoJournalStore({
    filePath: path.join(dir, 'journal.json'),
    onAfterSign: hook,
  });
  const draft = await store.upsertEntry(
    { tenantId: 't1', patientId: 'p1', journalType: 'tp_treatment', fields: { m: 'FUE' } },
    { actor: { userId: 'u1' } }
  );
  const signed = await store.signEntry({
    tenantId: 't1',
    patientId: 'p1',
    entryId: draft.entryId,
    actor: { userId: 'u1', role: 'OWNER', displayName: 'Owner' },
  });

  // Verify entry has PDF metadata
  assert.ok(signed.pdfPath, 'pdfPath should be set');
  assert.ok(signed.pdfTamperHash, 'pdfTamperHash should be set');
  assert.ok(signed.pdfGeneratedAt, 'pdfGeneratedAt should be set');
  assert.ok(signed.pdfSizeBytes > 0, 'pdfSizeBytes should be > 0');

  // Verify file on disk
  const fileExists = await fs
    .stat(signed.pdfPath)
    .then(() => true)
    .catch(() => false);
  assert.equal(fileExists, true, 'PDF file should exist on disk');

  // Verify hash matches re-computation
  const recomputedHash = computeTamperHash(signed);
  assert.equal(signed.pdfTamperHash, recomputedHash, 'tamperHash should match recompute');

  // Verify audit event captured
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, 'journal.pdf_generated_at_signing');
});
