'use strict';

/* PR #678: Svarstudions valda signatur måste följa med utkastet hela vägen
 * till live-send. Från-mailbox och signatur är separata val i CCO. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

test('comm draft store bevarar signatureId vid create, update och reload', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-signature-id-'));
  const filePath = path.join(tempDir, 'cco-comm-drafts.json');
  const store = await createCcoCommDraftStore({ filePath });

  const created = await store.createDraft(
    {
      tenantId: 'hairtpclinic',
      customerId: 'cust-1',
      channel: 'email',
      subject: 'Hej',
      body: 'Text',
      signatureId: 'fazli',
    },
    { actor: { userId: 'staff-1' } }
  );
  assert.equal(created.signatureId, 'fazli');

  const updated = await store.updateDraft(
    created.draftId,
    { body: 'Ny text', signatureId: 'egzona' },
    { actor: { userId: 'staff-1' }, tenantId: 'hairtpclinic' }
  );
  assert.equal(updated.signatureId, 'egzona');

  const bodyOnly = await store.updateDraft(
    created.draftId,
    { body: 'Bara texten ändrades' },
    { actor: { userId: 'staff-1' }, tenantId: 'hairtpclinic' }
  );
  assert.equal(bodyOnly.signatureId, 'egzona');

  const reloaded = await createCcoCommDraftStore({ filePath });
  assert.equal(
    reloaded.getDraft(created.draftId, { tenantId: 'hairtpclinic' }).signatureId,
    'egzona'
  );
});
