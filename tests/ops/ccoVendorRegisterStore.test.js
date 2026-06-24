const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoVendorRegisterStore } = require('../../src/ops/ccoVendorRegisterStore');

async function withStore(fn, { auditLog } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-vendor-register-'));
  const filePath = path.join(tempDir, 'cco-vendor-register.json');
  try {
    const store = await createCcoVendorRegisterStore({ filePath, auditLog });
    await fn({ store, filePath });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('createCcoVendorRegisterStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoVendorRegisterStore({ filePath: '   ' }), /filePath krävs/);
});

test('createVendor -> getById -> listAll', async () => {
  await withStore(async ({ store }) => {
    const created = await store.createVendor(
      { name: 'Fortnox AB', category: 'Bokföring', purpose: 'Fakturering', country: 'SE' },
      { role: 'dpo', userId: 'dpo-1' }
    );
    assert.ok(created.id);
    assert.equal(created.name, 'Fortnox AB');
    assert.equal(created.dpaReviewed, false);
    assert.equal(created.underbilaga1Completed, false);
    assert.deepEqual(created.subprocessors, []);

    const fetched = store.getById(created.id);
    assert.equal(fetched.id, created.id);
    assert.equal(fetched.name, 'Fortnox AB');

    assert.equal(store.getById('does-not-exist'), null);

    const all = store.listAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, created.id);
  });
});

test('createVendor rejects when name is blank', async () => {
  await withStore(async ({ store }) => {
    await assert.rejects(() => store.createVendor({ name: '   ' }), /namn/);
  });
});

test('addSubprocessor appends to subprocessors and resets underbilaga1', async () => {
  await withStore(async ({ store }) => {
    const vendor = await store.createVendor({ name: 'Google Cloud' });
    await store.markUnderbilaga1Completed({ vendorId: vendor.id, actor: { userId: 'u1' } });

    const updated = await store.addSubprocessor({
      vendorId: vendor.id,
      subprocessor: { name: 'Google LLC', country: 'US', purpose: 'Hosting' },
      actor: { role: 'dpo', userId: 'dpo-1' },
    });

    assert.equal(updated.subprocessors.length, 1);
    assert.equal(updated.subprocessors[0].name, 'Google LLC');
    assert.ok(updated.subprocessors[0].id);
    // Adding a sub-processor invalidates the previously completed appendix.
    assert.equal(updated.underbilaga1Completed, false);
  });
});

test('addSubprocessor rejects unknown vendor and blank name', async () => {
  await withStore(async ({ store }) => {
    await assert.rejects(
      () => store.addSubprocessor({ vendorId: 'nope', subprocessor: { name: 'X' } }),
      /hittades inte/
    );
    const vendor = await store.createVendor({ name: 'Acme' });
    await assert.rejects(
      () => store.addSubprocessor({ vendorId: vendor.id, subprocessor: { name: '  ' } }),
      /namn/
    );
  });
});

test('markDpaReviewed shrinks listNeedsReview', async () => {
  await withStore(async ({ store }) => {
    const v = await store.createVendor({ name: 'Stripe' });
    // Needs review initially (no DPA review, no underbilaga1).
    assert.equal(store.listNeedsReview().length, 1);

    await store.markDpaReviewed({ vendorId: v.id, actor: { userId: 'dpo-1' }, note: 'Granskat' });
    await store.markUnderbilaga1Completed({ vendorId: v.id, actor: { userId: 'dpo-1' } });

    const after = store.listNeedsReview();
    assert.equal(after.length, 0);

    const fetched = store.getById(v.id);
    assert.equal(fetched.dpaReviewed, true);
    assert.equal(fetched.dpaReviewedBy, 'dpo-1');
    assert.equal(fetched.dpaNote, 'Granskat');
    assert.ok(fetched.dpaReviewedAt);
  });
});

test('markUnderbilaga1Completed sets completion fields', async () => {
  await withStore(async ({ store }) => {
    const v = await store.createVendor({ name: 'Microsoft 365' });
    const updated = await store.markUnderbilaga1Completed({
      vendorId: v.id,
      actor: { role: 'dpo', userId: 'dpo-9' },
    });
    assert.equal(updated.underbilaga1Completed, true);
    assert.equal(updated.underbilaga1CompletedBy, 'dpo-9');
    assert.ok(updated.underbilaga1CompletedAt);
    await assert.rejects(
      () => store.markUnderbilaga1Completed({ vendorId: 'nope' }),
      /hittades inte/
    );
  });
});

test('markLegacyExit and listLegacyExit, removed from needsReview', async () => {
  await withStore(async ({ store }) => {
    const v = await store.createVendor({ name: 'OldVendor' });
    assert.equal(store.listLegacyExit().length, 0);
    assert.equal(store.listNeedsReview().length, 1);

    const exited = await store.markLegacyExit({
      vendorId: v.id,
      actor: { userId: 'owner-1' },
      reason: 'Avtal uppsagt',
    });
    assert.equal(exited.legacyExit, true);
    assert.equal(exited.legacyExitReason, 'Avtal uppsagt');
    assert.ok(exited.legacyExitAt);

    assert.equal(store.listLegacyExit().length, 1);
    // Exited vendors drop out of the review queue.
    assert.equal(store.listNeedsReview().length, 0);
  });
});

test('updateVendor patches descriptive fields only', async () => {
  await withStore(async ({ store }) => {
    const v = await store.createVendor({ name: 'A', category: 'old' });
    const updated = await store.updateVendor(
      v.id,
      { category: 'new', purpose: 'p' },
      { userId: 'u' }
    );
    assert.equal(updated.category, 'new');
    assert.equal(updated.purpose, 'p');
    assert.equal(updated.name, 'A');
    await assert.rejects(() => store.updateVendor('nope', {}), /hittades inte/);
    await assert.rejects(() => store.updateVendor(v.id, { name: '   ' }), /namn/);
  });
});

test('exportRegister shape', async () => {
  await withStore(async ({ store }) => {
    const v = await store.createVendor({ name: 'ExportCo' });
    await store.addSubprocessor({ vendorId: v.id, subprocessor: { name: 'Sub A' } });

    const exported = store.exportRegister();
    assert.equal(typeof exported.version, 'number');
    assert.ok(exported.generatedAt);
    assert.ok(exported.createdAt);
    assert.ok(exported.updatedAt);
    assert.equal(exported.vendorCount, 1);
    assert.ok(Array.isArray(exported.vendors));
    assert.equal(exported.vendors[0].name, 'ExportCo');
    assert.equal(exported.vendors[0].subprocessors[0].name, 'Sub A');

    // Deep copy: mutating export does not affect store.
    exported.vendors[0].name = 'mutated';
    exported.vendors[0].subprocessors[0].name = 'mutated';
    assert.equal(store.getById(v.id).name, 'ExportCo');
    assert.equal(store.getById(v.id).subprocessors[0].name, 'Sub A');
  });
});

test('persistence across store instances', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-vendor-persist-'));
  const filePath = path.join(tempDir, 'cco-vendor-register.json');
  try {
    const store1 = await createCcoVendorRegisterStore({ filePath });
    const v = await store1.createVendor({ name: 'PersistCo', category: 'X' });
    await store1.addSubprocessor({ vendorId: v.id, subprocessor: { name: 'PersistSub' } });
    await store1.markDpaReviewed({ vendorId: v.id, actor: { userId: 'dpo-1' } });

    const store2 = await createCcoVendorRegisterStore({ filePath });
    const reloaded = store2.getById(v.id);
    assert.ok(reloaded);
    assert.equal(reloaded.name, 'PersistCo');
    assert.equal(reloaded.dpaReviewed, true);
    assert.equal(reloaded.subprocessors.length, 1);
    assert.equal(reloaded.subprocessors[0].name, 'PersistSub');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('auditLog.append is invoked when provided', async () => {
  const calls = [];
  const auditLog = { append: (entry) => calls.push(entry) };
  await withStore(
    async ({ store }) => {
      const v = await store.createVendor({ name: 'AuditCo' }, { role: 'dpo', userId: 'dpo-1' });
      await store.markDpaReviewed({ vendorId: v.id, actor: { role: 'dpo', userId: 'dpo-1' } });
      assert.ok(calls.length >= 2);
      const created = calls.find((c) => c.action === 'cco.vendor.create');
      assert.ok(created);
      assert.equal(created.target.kind, 'cco_vendor');
      assert.equal(created.actor.role, 'dpo');
      assert.equal(created.actor.userId, 'dpo-1');
    },
    { auditLog }
  );
});
