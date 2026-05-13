const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoOperationStore } = require('../../src/ops/ccoOperationStore');

test('cco operation store skapar och uppdaterar operationsärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-operation-store-'));
  const filePath = path.join(tempDir, 'cco-operations.json');

  try {
    const store = await createCcoOperationStore({ filePath });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      procedureType: 'Hårtransplantation',
    });

    const second = await store.upsertCase({
      ...first,
      operationStatus: 'planned',
      clearanceStatus: 'blocked',
      requiredActions: ['Verifiera operationsberedskap med ansvarig kliniker'],
    });

    assert.equal(second.operationCaseId, first.operationCaseId);
    assert.equal(second.operationStatus, 'planned');
    assert.equal(second.clearanceStatus, 'blocked');
    assert.deepEqual(second.requiredActions, [
      'Verifiera operationsberedskap med ansvarig kliniker',
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
