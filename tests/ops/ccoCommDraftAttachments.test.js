'use strict';

/* Steg 1 (PR 1a) — bilage-stöd på utkast i comm-draft-storen. Endast metadata
 * lagras på utkastet (bytes ligger på disk och refereras via storagePath). Bilagor
 * kan läggas till/tas bort på redigerbara utkast, med audit; sent/cancelled är
 * låsta. Ingen live-send. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

async function makeStore() {
  const filePath = path.join(os.tmpdir(), `cco-comm-draft-att-${Date.now()}-${Math.random()}.json`);
  const events = [];
  const store = await createCcoCommDraftStore({
    filePath,
    auditLog: { append: (e) => events.push(e) },
  });
  return { store, events, filePath };
}

test('addDraftAttachment lägger till metadata + audit, getDraftAttachment hämtar den', async () => {
  const { store, events, filePath } = await makeStore();
  const draft = await store.createDraft(
    { tenantId: 't1', customerId: 'c1', channel: 'email', subject: 'Hej' },
    { actor: { userId: 'staff-1', role: 'STAFF' } }
  );
  assert.deepEqual(draft.attachments, [], 'nytt utkast har inga bilagor');

  const { attachment } = await store.addDraftAttachment(
    draft.draftId,
    {
      name: 'preop.pdf',
      contentType: 'application/pdf',
      size: 20480,
      storagePath: '/var/data/cco-comm-attachments/x/preop.pdf',
      sha256: 'abc',
    },
    { actor: { userId: 'staff-1', role: 'STAFF' }, tenantId: 't1' }
  );
  assert.ok(attachment.attachmentId, 'bilagan får ett id');
  assert.equal(attachment.uploadedBy, 'staff-1');

  const fetched = store.getDraftAttachment(draft.draftId, attachment.attachmentId, {
    tenantId: 't1',
  });
  assert.equal(fetched.name, 'preop.pdf');
  assert.equal(fetched.storagePath, '/var/data/cco-comm-attachments/x/preop.pdf');

  assert.ok(events.some((e) => e.action === 'communication.draft.attachment_added'));

  // Persisteras
  const reloaded = await createCcoCommDraftStore({ filePath });
  assert.equal(reloaded.getDraft(draft.draftId, { tenantId: 't1' }).attachments.length, 1);
});

test('removeDraftAttachment tar bort bilagan + audit', async () => {
  const { store, events } = await makeStore();
  const draft = await store.createDraft(
    { tenantId: 't1', customerId: 'c1', channel: 'email' },
    { actor: { userId: 'staff-1' } }
  );
  const { attachment } = await store.addDraftAttachment(
    draft.draftId,
    { name: 'bild.png', contentType: 'image/png', size: 100 },
    { actor: { userId: 'staff-1' }, tenantId: 't1' }
  );
  const { draft: after } = await store.removeDraftAttachment(
    draft.draftId,
    attachment.attachmentId,
    {
      actor: { userId: 'staff-1' },
      tenantId: 't1',
    }
  );
  assert.equal(after.attachments.length, 0);
  assert.ok(events.some((e) => e.action === 'communication.draft.attachment_removed'));
});

test('okänd bilaga → 404; fel tenant → 404 (ingen läcka)', async () => {
  const { store } = await makeStore();
  const draft = await store.createDraft(
    { tenantId: 't1', customerId: 'c1', channel: 'email' },
    { actor: { userId: 'staff-1' } }
  );
  await assert.rejects(
    () => store.removeDraftAttachment(draft.draftId, 'nope', { tenantId: 't1' }),
    (e) => e.statusCode === 404
  );
  await assert.rejects(
    () => store.addDraftAttachment(draft.draftId, { name: 'x' }, { tenantId: 'other' }),
    (e) => e.statusCode === 404
  );
});
