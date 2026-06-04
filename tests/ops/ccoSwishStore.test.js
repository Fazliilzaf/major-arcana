const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoSwishStore } = require('../../src/ops/ccoSwishStore');

test('createCcoSwishStore rejects empty filePath', async () => {
  await assert.rejects(() => createCcoSwishStore({ filePath: '' }), /filePath/i);
});

test('swish store saves connection and payment records', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-swish-'));
  const filePath = path.join(dir, 'swish.json');
  const store = await createCcoSwishStore({ filePath });

  await store.saveConnection({
    tenantId: 'tenant-a',
    actorUserId: 'owner-1',
    connection: {
      payeeAlias: '1231181189',
      connected: true,
    },
  });

  const status = await store.getPublicStatus({ tenantId: 'tenant-a' });
  assert.equal(status.connected, true);
  assert.equal(status.payeeAlias, '1231181189');

  const payment = await store.savePayment({
    tenantId: 'tenant-a',
    payment: {
      id: 'PAYMENT123',
      instructionUUID: 'PAYMENT123',
      amount: '100.00',
      status: 'CREATED',
    },
  });
  assert.equal(payment.amount, '100.00');

  const found = await store.findPaymentByInstruction({ instructionUUID: 'PAYMENT123' });
  assert.equal(found.tenantId, 'tenant-a');
  assert.equal(found.payment.id, 'PAYMENT123');

  await fs.rm(dir, { recursive: true, force: true });
});
