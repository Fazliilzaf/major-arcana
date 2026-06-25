const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoDataFlowMapStore } = require('../../src/ops/ccoDataFlowMapStore');

async function withStore(fn) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-dataflow-store-'));
  const filePath = path.join(tempDir, 'cco-dataflow-map.json');
  try {
    await fn({ filePath, tempDir });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('upsertSystem skapar och uppdaterar, listSystems returnerar sorterat', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });

    const created = await store.upsertSystem(
      'CRM',
      {
        name: 'Customer CRM',
        role: 'controller',
        dataCategories: ['name', 'email'],
        location: 'EU',
      },
      { userId: 'owner-a', role: 'owner' }
    );
    assert.equal(created.id, 'crm');
    assert.equal(created.role, 'controller');
    assert.deepEqual(created.dataCategories, ['name', 'email']);

    await store.upsertSystem('billing', { name: 'Billing' }, { userId: 'u', role: 'dpo' });

    // Update existing — createdAt preserved, updatedAt changes.
    const updated = await store.upsertSystem(
      'crm',
      { name: 'CRM v2', role: 'processor' },
      { userId: 'owner-a', role: 'owner' }
    );
    assert.equal(updated.name, 'CRM v2');
    assert.equal(updated.role, 'processor');
    assert.equal(updated.createdAt, created.createdAt);

    const systems = store.listSystems();
    assert.equal(systems.length, 2);
    assert.deepEqual(
      systems.map((s) => s.id),
      ['billing', 'crm']
    );
  });
});

test('addFlow lägger till flöden och listFlows returnerar dem', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });

    const flow = await store.addFlow({
      fromSystem: 'CRM',
      toSystem: 'Analytics',
      description: 'Daily export',
      dataCategories: ['email'],
      crossBorder: true,
      transferMechanism: 'SCC',
      actor: { userId: 'u1', role: 'dpo' },
    });
    assert.ok(flow.id);
    assert.equal(flow.fromSystem, 'crm');
    assert.equal(flow.toSystem, 'analytics');
    assert.equal(flow.crossBorder, true);
    assert.equal(flow.reviewed, false);
    assert.equal(flow.createdBy, 'u1');

    await store.addFlow({ fromSystem: 'a', toSystem: 'b', actor: { role: 'owner' } });

    const flows = store.listFlows();
    assert.equal(flows.length, 2);
  });
});

test('addFlow kräver fromSystem och toSystem', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });
    await assert.rejects(() => store.addFlow({ fromSystem: 'only-from' }), /fromSystem/);
  });
});

test('markReviewed minskar listNeedsLegalReview', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });

    const f1 = await store.addFlow({ fromSystem: 'a', toSystem: 'b', actor: { role: 'dpo' } });
    await store.addFlow({ fromSystem: 'c', toSystem: 'd', actor: { role: 'dpo' } });

    assert.equal(store.listNeedsLegalReview().length, 2);

    const reviewed = await store.markReviewed({
      flowId: f1.id,
      reviewNote: 'OK enligt SCC',
      actor: { userId: 'dpo-1', role: 'dpo' },
    });
    assert.equal(reviewed.reviewed, true);
    assert.ok(reviewed.reviewedAt);
    assert.equal(reviewed.reviewedBy, 'dpo-1');

    const needs = store.listNeedsLegalReview();
    assert.equal(needs.length, 1);
    assert.equal(needs[0].fromSystem, 'c');
  });
});

test('markReviewed kräver giltigt flowId', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });
    await assert.rejects(() => store.markReviewed({ actor: {} }), /flowId/);
    await assert.rejects(
      () => store.markReviewed({ flowId: 'does-not-exist', actor: {} }),
      /hittades inte/
    );
  });
});

test('exportArt30Register har förväntad form', async () => {
  await withStore(async ({ filePath }) => {
    const store = await createCcoDataFlowMapStore({ filePath });

    await store.upsertSystem('crm', { name: 'CRM', role: 'controller' }, { role: 'owner' });
    const flow = await store.addFlow({
      fromSystem: 'crm',
      toSystem: 'analytics',
      crossBorder: true,
      actor: { role: 'dpo' },
    });
    await store.addFlow({ fromSystem: 'a', toSystem: 'b', actor: { role: 'dpo' } });
    await store.markReviewed({ flowId: flow.id, actor: { userId: 'dpo-1', role: 'dpo' } });

    const reg = store.exportArt30Register();
    assert.ok(reg.generatedAt);
    assert.equal(reg.version, 1);
    assert.equal(reg.summary.systemCount, 1);
    assert.equal(reg.summary.flowCount, 2);
    assert.equal(reg.summary.crossBorderFlowCount, 1);
    assert.equal(reg.summary.needsLegalReviewCount, 1);
    assert.equal(reg.systems.length, 1);
    assert.equal(reg.systems[0].id, 'crm');
    assert.equal(reg.flows.length, 2);
    assert.ok('transferMechanism' in reg.flows[0]);
  });
});

test('persisterar state mellan instanser', async () => {
  await withStore(async ({ filePath }) => {
    const store1 = await createCcoDataFlowMapStore({ filePath });
    await store1.upsertSystem('crm', { name: 'CRM' }, { role: 'owner' });
    const flow = await store1.addFlow({ fromSystem: 'crm', toSystem: 'x', actor: { role: 'dpo' } });
    await store1.markReviewed({ flowId: flow.id, actor: { userId: 'dpo-1', role: 'dpo' } });

    const store2 = await createCcoDataFlowMapStore({ filePath });
    assert.equal(store2.listSystems().length, 1);
    assert.equal(store2.listFlows().length, 1);
    assert.equal(store2.listNeedsLegalReview().length, 0);
    assert.equal(store2.listFlows()[0].reviewed, true);
  });
});

test('auditLog.append anropas för mutationer', async () => {
  await withStore(async ({ filePath }) => {
    const events = [];
    const auditLog = { append: (e) => events.push(e) };
    const store = await createCcoDataFlowMapStore({ filePath, auditLog });

    await store.upsertSystem('crm', { name: 'CRM' }, { userId: 'u', role: 'owner' });
    const flow = await store.addFlow({
      fromSystem: 'crm',
      toSystem: 'x',
      actor: { userId: 'u', role: 'dpo' },
    });
    await store.markReviewed({ flowId: flow.id, actor: { userId: 'u', role: 'dpo' } });

    const actions = events.map((e) => e.action);
    assert.deepEqual(actions, [
      'cco.dataflow.system.upsert',
      'cco.dataflow.flow.add',
      'cco.dataflow.flow.reviewed',
    ]);
    assert.equal(events[0].target.kind, 'dataflow_system');
  });
});
