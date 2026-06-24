const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoIdVerificationStore } = require('../../src/ops/ccoIdVerificationStore');

async function withTempFile(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-id-verify-store-'));
  const filePath = path.join(tempDir, 'cco-id-verifications.json');
  try {
    await run(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('setStatus sätter status som getStatus läser tillbaka', async () => {
  await withTempFile(async (filePath) => {
    const store = await createCcoIdVerificationStore({ filePath });

    const result = await store.setStatus('Anna.Karlsson@email.com', 'verified', {
      role: 'cco_agent',
      last4: '4321',
      docType: 'passport',
      verifiedBy: 'owner-a',
      note: 'Verifierad vid besök.',
    });

    assert.equal(result.status, 'verified');
    assert.equal(result.customerId, 'anna.karlsson@email.com');
    assert.equal(result.last4, '4321');
    assert.equal(result.docType, 'passport');
    assert.equal(result.verifiedBy, 'owner-a');
    assert.equal(result.exists, true);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].role, 'cco_agent');

    const read = store.getStatus('anna.karlsson@email.com');
    assert.equal(read.exists, true);
    assert.equal(read.status, 'verified');
    assert.equal(read.last4, '4321');
  });
});

test('getStatus returnerar standardvärde för okänd kund', async () => {
  await withTempFile(async (filePath) => {
    const store = await createCcoIdVerificationStore({ filePath });
    const read = store.getStatus('okand@email.com');
    assert.equal(read.exists, false);
    assert.equal(read.status, 'unverified');
    assert.equal(read.last4, '');
    assert.deepEqual(read.history, []);
  });
});

test('setStatus uppdaterar befintlig post och lägger till historik', async () => {
  await withTempFile(async (filePath) => {
    const store = await createCcoIdVerificationStore({ filePath });

    await store.setStatus('kund@email.com', 'pending', { role: 'cco_agent' });
    const updated = await store.setStatus('kund@email.com', 'verified', {
      role: 'cco_admin',
      last4: '0001',
    });

    assert.equal(updated.status, 'verified');
    assert.equal(updated.history.length, 2);
    assert.equal(updated.history[0].status, 'pending');
    assert.equal(updated.history[1].status, 'verified');

    const stats = store.stats();
    assert.equal(stats.total, 1);
  });
});

test('stats räknar per status', async () => {
  await withTempFile(async (filePath) => {
    const store = await createCcoIdVerificationStore({ filePath });

    await store.setStatus('a@email.com', 'verified', { role: 'cco_agent' });
    await store.setStatus('b@email.com', 'verified', { role: 'cco_agent' });
    await store.setStatus('c@email.com', 'rejected', { role: 'cco_agent' });
    await store.setStatus('d@email.com', 'pending', { role: 'cco_agent' });

    const stats = store.stats();
    assert.equal(stats.total, 4);
    assert.equal(stats.byStatus.verified, 2);
    assert.equal(stats.byStatus.rejected, 1);
    assert.equal(stats.byStatus.pending, 1);
    assert.equal(stats.byStatus.unverified, 0);
  });
});

test('setStatus avvisar ogiltig status', async () => {
  await withTempFile(async (filePath) => {
    const store = await createCcoIdVerificationStore({ filePath });
    await assert.rejects(
      () => store.setStatus('x@email.com', 'bogus', { role: 'cco_agent' }),
      /Ogiltig status/
    );
  });
});

test('tillstånd persisteras till disk mellan instanser', async () => {
  await withTempFile(async (filePath) => {
    const store1 = await createCcoIdVerificationStore({ filePath });
    await store1.setStatus('persist@email.com', 'verified', {
      role: 'cco_agent',
      last4: '9999',
    });

    const store2 = await createCcoIdVerificationStore({ filePath });
    const read = store2.getStatus('persist@email.com');
    assert.equal(read.exists, true);
    assert.equal(read.status, 'verified');
    assert.equal(read.last4, '9999');
    assert.equal(store2.stats().total, 1);
  });
});

test('auditLog.append anropas vid setStatus', async () => {
  await withTempFile(async (filePath) => {
    const calls = [];
    const auditLog = { append: (entry) => calls.push(entry) };
    const store = await createCcoIdVerificationStore({ filePath, auditLog });

    await store.setStatus('audit@email.com', 'verified', { role: 'cco_agent' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'cco.id_verification.set');
    assert.equal(calls[0].target.id, 'audit@email.com');
    assert.equal(calls[0].detail.status, 'verified');
  });
});
