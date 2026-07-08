'use strict';

/* Idempotens-store för portal-nudgen: en kund nudgas bara en gång. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createCcoPortalNudgeStore } = require('../../src/ops/ccoPortalNudgeStore');

function tmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nudge-store-'));
  return path.join(dir, 'n.json');
}

test('wasNudged false → recordNudge → true (idempotent)', async () => {
  const store = await createCcoPortalNudgeStore({ filePath: tmp() });
  const ref = { tenantId: 'hairtpclinic', customerId: 'CUST-1' };
  assert.equal(store.wasNudged(ref), false);
  const first = await store.recordNudge({ ...ref, draftId: 'D1', token: 'abcdef1234567890' });
  assert.equal(first.created, true);
  assert.equal(store.wasNudged(ref), true);
  // Andra recordNudge skapar inte om.
  const second = await store.recordNudge({ ...ref, draftId: 'D2' });
  assert.equal(second.created, false);
  assert.equal(store.getNudge(ref).draftId, 'D1'); // behåller första
});

test('token lagras bara maskad (tokenHint), aldrig i klartext', async () => {
  const store = await createCcoPortalNudgeStore({ filePath: tmp() });
  await store.recordNudge({
    tenantId: 't',
    customerId: 'C',
    token: 'SUPERSECRETTOKENVALUE1234567890',
  });
  const rec = store.getNudge({ tenantId: 't', customerId: 'C' });
  assert.match(rec.tokenHint, /…$/);
  assert.doesNotMatch(JSON.stringify(rec), /SUPERSECRETTOKENVALUE1234567890/);
});

test('persisterar över instanser (atomär skrivning)', async () => {
  const file = tmp();
  const s1 = await createCcoPortalNudgeStore({ filePath: file });
  await s1.recordNudge({ tenantId: 't', customerId: 'C' });
  const s2 = await createCcoPortalNudgeStore({ filePath: file });
  assert.equal(s2.wasNudged({ tenantId: 't', customerId: 'C' }), true);
});

test('kräver tenantId + customerId', async () => {
  const store = await createCcoPortalNudgeStore({ filePath: tmp() });
  assert.throws(() => store.wasNudged({ customerId: 'C' }), /tenantId/);
  assert.throws(() => store.wasNudged({ tenantId: 't' }), /customerId/);
});
