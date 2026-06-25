const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoPhotoConsentStore } = require('../../src/ops/ccoPhotoConsentStore');
const retention = require('../../src/ops/ccoRetentionPolicy');

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-photo-'));
  return path.join(dir, 'consents.json');
}

test('photo consent: setStatus → getConsent → listGranted → stats', async () => {
  const filePath = await tmpFile();
  const audited = [];
  const store = await createCcoPhotoConsentStore({
    filePath,
    auditLog: { append: (e) => audited.push(e) },
  });

  // okänt samtycke → pending, exists:false
  const before = store.getConsent('CUST1', 'photo-1');
  assert.equal(before.status, 'pending');
  assert.equal(before.exists, false);

  const set = await store.setStatus(
    'CUST1',
    'photo-1',
    'granted',
    { role: 'staff' },
    { note: 'ok' }
  );
  assert.equal(set.status, 'granted');
  assert.equal(set.exists, true);

  const after = store.getConsent('CUST1', 'photo-1');
  assert.equal(after.status, 'granted');
  assert.equal(after.history.length, 1);

  const granted = store.listGranted({ customerId: 'CUST1' });
  assert.equal(granted.length, 1);
  assert.equal(store.listGranted({ customerId: 'OTHER' }).length, 0);

  const s = store.stats();
  assert.equal(s.total, 1);
  assert.equal(s.byStatus.granted, 1);

  assert.equal(audited.length, 1);
  assert.equal(audited[0].action, 'cco.photo_consent.set');

  // persistens: ny instans läser samma fil
  const store2 = await createCcoPhotoConsentStore({ filePath });
  assert.equal(store2.getConsent('CUST1', 'photo-1').status, 'granted');
});

test('photo consent: ogiltig status kastar 400', async () => {
  const store = await createCcoPhotoConsentStore({ filePath: await tmpFile() });
  await assert.rejects(
    () => store.setStatus('C', 'P', 'nonsense'),
    (e) => e.statusCode === 400
  );
});

test('retention: färsk aktivitet blockerar radering', () => {
  const r = retention.readoutForCustomer({ lastActivityAt: new Date().toISOString() });
  assert.equal(r.eligibleForDeletion, false);
  assert.equal(r.retentionPassed, false);
  assert.ok(r.yearsRemaining > 9);
});

test('retention: >10 år gammal aktivitet är gallringsbar', () => {
  const old = new Date();
  old.setUTCFullYear(old.getUTCFullYear() - 11);
  const r = retention.readoutForCustomer({ lastActivityAt: old.toISOString() });
  assert.equal(r.retentionPassed, true);
  assert.equal(r.eligibleForDeletion, true);
});

test('retention: lås/öppet ärende blockerar även efter 10 år', () => {
  const old = new Date();
  old.setUTCFullYear(old.getUTCFullYear() - 11);
  const r = retention.readoutForCustomer({ lastActivityAt: old.toISOString(), isLocked: true });
  assert.equal(r.eligibleForDeletion, false);
  assert.ok(r.reasons.includes('record_locked'));
});

test('retention: enforceRetention middleware blockerar med 403', () => {
  let blocked = null;
  const res = {
    status: (c) => ({
      json: (b) => {
        blocked = { c, b };
      },
    }),
  };
  let nexted = false;
  retention.enforceRetention({ query: { lastActivityAt: new Date().toISOString() } }, res, () => {
    nexted = true;
  });
  assert.equal(nexted, false);
  assert.equal(blocked.c, 403);
});
