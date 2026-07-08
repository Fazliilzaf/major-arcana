'use strict';

/* Portal-access-token-store (Fas 2, steg 2) — den magiska länkens auth-primitiv.
 * Testar utfärda (idempotent), resolve, rotation (gammal token dör), revoke, och
 * att en okänd/återkallad token aldrig släpps igenom. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createCcoPortalAccessStore } = require('../../src/ops/ccoPortalAccessStore');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-access-'));
  return path.join(dir, 'portal-access.json');
}

test('issueToken → resolve ger tillbaka rätt kund', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  const { token } = await store.issueToken({ tenantId: 'hairtpclinic', customerId: 'CUST-1' });
  assert.ok(token && token.length > 20);
  const r = store.resolveToken(token);
  assert.equal(r.tenantId, 'hairtpclinic');
  assert.equal(r.customerId, 'CUST-1');
});

test('issueToken är idempotent — samma aktiva länk återanvänds', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  const ref = { tenantId: 't', customerId: 'c' };
  const a = await store.issueToken(ref);
  const b = await store.issueToken(ref);
  assert.equal(a.token, b.token);
  assert.equal(b.reused, true);
});

test('rotateToken → gammal token dör, ny funkar', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  const ref = { tenantId: 't', customerId: 'c' };
  const a = await store.issueToken(ref);
  const b = await store.rotateToken(ref);
  assert.notEqual(a.token, b.token);
  assert.equal(store.resolveToken(a.token), null); // gammal ogiltig
  assert.equal(store.resolveToken(b.token).customerId, 'c');
});

test('revokeToken → token slutar funka', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  const ref = { tenantId: 't', customerId: 'c' };
  const { token } = await store.issueToken(ref);
  await store.revokeToken(ref);
  assert.equal(store.resolveToken(token), null);
});

test('okänd token → null', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  assert.equal(store.resolveToken('finns-inte'), null);
  assert.equal(store.resolveToken(''), null);
});

test('utgången token → null', async () => {
  const store = await createCcoPortalAccessStore({ filePath: tmpFile() });
  // negativ ttl → redan utgången
  const { token } = await store.issueToken({ tenantId: 't', customerId: 'c', ttlDays: -1 });
  assert.equal(store.resolveToken(token), null);
});

test('persistens: token överlever ny store-instans', async () => {
  const file = tmpFile();
  const s1 = await createCcoPortalAccessStore({ filePath: file });
  const { token } = await s1.issueToken({ tenantId: 't', customerId: 'c' });
  const s2 = await createCcoPortalAccessStore({ filePath: file });
  assert.equal(s2.resolveToken(token).customerId, 'c');
});
