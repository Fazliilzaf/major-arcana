const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoAftercareStore } = require('../../src/ops/ccoAftercareStore');

test('cco aftercare store skapar och uppdaterar eftervårdsärenden idempotent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-aftercare-store-'));
  const filePath = path.join(tempDir, 'cco-aftercare.json');

  try {
    const store = await createCcoAftercareStore({ filePath });

    const first = await store.ensureCase({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-1',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      category: 'PRP uppföljning',
    });

    const second = await store.upsertCase({
      ...first,
      aftercareStatus: 'in_progress',
      outcomeStatus: 'needs_attention',
      requiredActions: ['Verifiera eftervårdsutfall med ansvarig kliniker'],
    });

    assert.equal(second.aftercareCaseId, first.aftercareCaseId);
    assert.equal(second.aftercareStatus, 'in_progress');
    assert.equal(second.outcomeStatus, 'needs_attention');
    assert.deepEqual(second.requiredActions, ['Verifiera eftervårdsutfall med ansvarig kliniker']);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('cco aftercare store registrerar schemalagd uppföljning som eget ärende', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-aftercare-followup-'));
  const filePath = path.join(tempDir, 'cco-aftercare.json');

  try {
    const store = await createCcoAftercareStore({ filePath });

    const created = await store.recordFollowUpSchedule({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-2',
      customerId: 'anna@example.com',
      customerName: 'Anna',
      category: 'PRP uppföljning',
      scheduledForIso: '2026-03-27T10:30:00.000Z',
      doctorName: 'Dr. Eriksson',
      linkedFollowUpId: 'followup-1',
      notes: 'Ring kunden efter första PRP-serien.',
    });

    assert.equal(created.aftercareStatus, 'scheduled');
    assert.equal(created.linkedFollowUpId, 'followup-1');
    assert.equal(created.events.at(-1)?.type, 'aftercare_followup_scheduled');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
