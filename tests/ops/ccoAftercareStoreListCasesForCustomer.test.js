const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const { createCcoAftercareStore } = require('../../src/ops/ccoAftercareStore');

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cco-aftercare-'));
  const filePath = path.join(dir, 'cco-aftercare.json');
  const store = await createCcoAftercareStore({ filePath });
  return { store, dir };
}

test('listCasesForCustomer filtrerar på kund (case-okänsligt) och utesluter stängda som default', async () => {
  const { store, dir } = await makeStore();
  try {
    await store.upsertCase({
      tenantId: 'hairtpclinic',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-a',
      customerId: 'Customer@Example.com',
      customerName: 'Kund A',
      aftercareStatus: 'scheduled',
      scheduledForIso: '2030-06-01T10:00:00.000Z',
    });
    // Samma kund, annan casing + ett avslutat ärende.
    await store.upsertCase({
      tenantId: 'hairtpclinic',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-b',
      customerId: 'customer@example.com',
      customerName: 'Kund A',
      aftercareStatus: 'complete',
      outcomeStatus: 'stable',
    });
    // En annan kund som inte ska komma med.
    await store.upsertCase({
      tenantId: 'hairtpclinic',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-c',
      customerId: 'other@example.com',
      customerName: 'Kund B',
      aftercareStatus: 'scheduled',
    });

    const list = await store.listCasesForCustomer({ customerId: 'customer@example.com' });
    assert.equal(list.length, 1, 'stängda (complete) utesluts som default');
    assert.equal(list[0].conversationId, 'conv-a');
    assert.ok(list[0].readout, 'buildAftercareCaseReadout ska finnas med');
    assert.equal(list[0].readout.queueBucket, 'planned');

    const withClosed = await store.listCasesForCustomer({
      customerId: 'CUSTOMER@EXAMPLE.COM',
      includeClosed: true,
    });
    assert.equal(withClosed.length, 2, 'includeClosed tar med avslutade ärenden');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('listCasesForCustomer returnerar [] utan customerId', async () => {
  const { store, dir } = await makeStore();
  try {
    assert.deepEqual(await store.listCasesForCustomer({}), []);
    assert.deepEqual(await store.listCasesForCustomer({ customerId: '  ' }), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
