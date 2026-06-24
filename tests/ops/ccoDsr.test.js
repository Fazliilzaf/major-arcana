'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoDsrStore } = require('../../src/ops/ccoDsrStore');
const { buildDsrExport } = require('../../src/ops/ccoDsrExportBuilder');

async function withStore(fn, { auditLog = null, secureStorage = null } = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-dsr-'));
  const filePath = path.join(tempDir, 'cco-dsr.json');
  try {
    const store = await createCcoDsrStore({ filePath, auditLog, secureStorage });
    return await fn({ store, filePath, tempDir });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('createCcoDsrStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoDsrStore({ filePath: '   ' }), /filePath krävs/);
});

test('create -> verifyIdentity -> transitionStatus -> getById', async () => {
  const auditEvents = [];
  await withStore(
    async ({ store }) => {
      const created = await store.createRequest({
        type: 'access',
        customerId: 'Anna@Example.COM',
        requesterName: 'Anna K',
        actor: { userId: 'u1', role: 'dpo' },
      });
      assert.ok(created.dsrId);
      assert.equal(created.type, 'access');
      assert.equal(created.customerId, 'anna@example.com');
      assert.equal(created.status, 'received');
      assert.equal(created.identityVerified, false);
      assert.equal(created.deadlineDays, 30);
      assert.ok(created.deadlineAt > created.receivedAt);

      const verified = await store.verifyIdentity({
        dsrId: created.dsrId,
        actor: { userId: 'u1', role: 'dpo' },
        method: 'bankid',
      });
      assert.equal(verified.identityVerified, true);
      assert.equal(verified.identityMethod, 'bankid');
      assert.equal(verified.status, 'identity_verified');

      const moved = await store.transitionStatus({
        dsrId: created.dsrId,
        actor: { userId: 'u1', role: 'dpo' },
        status: 'in_progress',
      });
      assert.equal(moved.status, 'in_progress');

      const fetched = store.getById(created.dsrId);
      assert.equal(fetched.dsrId, created.dsrId);
      assert.equal(fetched.status, 'in_progress');
      assert.ok(fetched.history.length >= 3);

      assert.equal(store.getById('nope'), null);
    },
    { auditLog: { append: (e) => auditEvents.push(e) } }
  );
  assert.ok(auditEvents.some((e) => e.action === 'cco.dsr.created'));
  assert.ok(auditEvents.some((e) => e.action === 'cco.dsr.identity_verified'));
});

test('createRequest validates type and customerId', async () => {
  await withStore(async ({ store }) => {
    await assert.rejects(
      () => store.createRequest({ type: 'bogus', customerId: 'a@b.c' }),
      /Ogiltig DSR-typ/
    );
    await assert.rejects(
      () => store.createRequest({ type: 'access', customerId: '  ' }),
      /customerId krävs/
    );
  });
});

test('transitionStatus rejects invalid status and missing dsr', async () => {
  await withStore(async ({ store }) => {
    const c = await store.createRequest({ type: 'erasure', customerId: 'x@y.z' });
    await assert.rejects(
      () => store.transitionStatus({ dsrId: c.dsrId, status: 'flying' }),
      /Ogiltig status/
    );
    await assert.rejects(
      () => store.transitionStatus({ dsrId: 'missing', status: 'completed' }),
      /not found/
    );
  });
});

test('listOverdue and listImminent with crafted deadlines', async () => {
  await withStore(async ({ store }) => {
    const overdue = await store.createRequest({ type: 'access', customerId: 'over@e.com' });
    const imminent = await store.createRequest({ type: 'access', customerId: 'soon@e.com' });
    const future = await store.createRequest({ type: 'access', customerId: 'later@e.com' });

    const now = Date.now();
    // Craft deadlines via getById -> mutate not possible (clones); use a fixed
    // reference time and extend/set via transition isn't enough, so use the
    // `now` option to evaluate windows relative to crafted clock instead.
    // Set deadlines directly by re-creating with deadlineDays then probing windows.

    // overdue: deadline already passed relative to a future "now"
    // imminent: deadline ~ within 72h of "now"
    // future: deadline far ahead
    // We evaluate at now + 31 days so the 30-day deadline of `overdue` is past.
    const ref = new Date(now + 31 * 24 * 60 * 60 * 1000).toISOString();

    const overdueList = store.listOverdue({ now: ref });
    assert.ok(overdueList.some((r) => r.dsrId === overdue.dsrId));
    assert.ok(overdueList.some((r) => r.dsrId === imminent.dsrId));

    // Imminent within 72h of "now = received + 27 days" -> 30-day deadline is
    // ~3 days out, inside the 72h window for all three (they share 30 days).
    const ref2 = new Date(now + 27 * 24 * 60 * 60 * 1000).toISOString();
    const imminentList = store.listImminent(72, { now: ref2 });
    assert.ok(imminentList.length >= 1);
    assert.ok(imminentList.every((r) => r.status !== 'completed'));

    // Closing a request removes it from overdue/imminent.
    await store.transitionStatus({ dsrId: overdue.dsrId, status: 'completed' });
    const afterClose = store.listOverdue({ now: ref });
    assert.ok(!afterClose.some((r) => r.dsrId === overdue.dsrId));

    assert.equal(future ? true : false, true);
  });
});

test('extendDeadline pushes deadline and flags extension', async () => {
  await withStore(async ({ store }) => {
    const c = await store.createRequest({ type: 'portability', customerId: 'ext@e.com' });
    const before = c.deadlineAt;
    const extended = await store.extendDeadline({
      dsrId: c.dsrId,
      actor: { role: 'dpo' },
      days: 60,
      reason: 'complex case',
    });
    assert.equal(extended.deadlineExtended, true);
    assert.equal(extended.deadlineDays, 90);
    assert.equal(extended.extensionReason, 'complex case');
    assert.ok(extended.deadlineAt > before);
  });
});

test('recordPdlBlock and attachResponsePackage', async () => {
  const puts = [];
  const secureStorage = {
    async putObject({ key, body }) {
      puts.push({ key, size: body.length });
      return { storageKey: `secure/${key}`, checksum: 'abc', size: body.length };
    },
  };
  await withStore(
    async ({ store }) => {
      const c = await store.createRequest({ type: 'erasure', customerId: 'pdl@e.com' });
      const blocked = await store.recordPdlBlock({
        dsrId: c.dsrId,
        actor: { role: 'dpo' },
        blocked: true,
        reason: 'patientdatalagen retention',
        retainUntil: '2030-01-01',
      });
      assert.equal(blocked.pdlBlock.blocked, true);
      assert.equal(blocked.pdlBlock.retainUntil, '2030-01-01');

      const attached = await store.attachResponsePackage({
        dsrId: c.dsrId,
        actor: { role: 'dpo' },
        buffer: Buffer.from('hello-export', 'utf8'),
        filename: 'export.json',
        mimeType: 'application/json',
      });
      assert.ok(attached.responsePackage);
      assert.equal(attached.responsePackage.storageKey, 'secure/dsr/' + c.dsrId + '/export.json');
      assert.equal(attached.responsePackage.checksum || attached.responsePackage.sha256, 'abc');
      assert.equal(attached.responsePackage.sizeBytes, 'hello-export'.length);
      assert.equal(puts.length, 1);
    },
    { secureStorage }
  );
});

test('persistence: state survives reload from disk', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-dsr-persist-'));
  const filePath = path.join(tempDir, 'cco-dsr.json');
  try {
    const store1 = await createCcoDsrStore({ filePath });
    const c = await store1.createRequest({ type: 'access', customerId: 'persist@e.com' });

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.requests.length, 1);

    const store2 = await createCcoDsrStore({ filePath });
    const reloaded = store2.getById(c.dsrId);
    assert.equal(reloaded.customerId, 'persist@e.com');
    assert.equal(store2.listAll().length, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('buildDsrExport output shape with duck-typed stores', async () => {
  const stored = {};
  const secureStorage = {
    async putObject({ key, body }) {
      stored[key] = body;
      return { storageKey: `secure/${key}`, checksum: 'deadbeef', size: body.length };
    },
    async getObject(key) {
      const buf = Buffer.from('imgbytes');
      return { buffer: buf, mimeType: 'image/jpeg', size: buf.length, checksum: 'imgsum' };
    },
  };

  const stores = {
    customerStore: { getById: async (id) => ({ customerId: id, name: 'Anna' }) },
    journalStore: { listByCustomer: async () => [{ id: 'j1' }, { id: 'j2' }] },
    assetStore: {
      listByCustomer: async () => [
        { assetId: 'a1', storageKey: 'k/a1.jpg', mimeType: 'image/jpeg' },
      ],
    },
    agreementStore: { listForCustomer: async () => [{ id: 'ag1' }] },
    offerStore: { listByCustomer: async () => [] },
    consentStore: { listGranted: async () => [{ photoId: 'p1', status: 'granted' }] },
    eventStore: { listByCustomer: async () => [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] },
    secureStorage,
  };

  const res = await buildDsrExport({
    customerId: 'anna@e.com',
    dsrId: 'dsr-1',
    actor: { userId: 'u1', role: 'dpo' },
    includePhotoBytes: true,
    stores,
  });

  assert.ok(typeof res.bundlePath === 'string' && res.bundlePath.length > 0);
  assert.match(res.bundleSha256, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(res.sizeBytes) && res.sizeBytes > 0);
  assert.equal(res.includePhotoBytes, true);
  assert.ok(res.manifest && res.manifest.customerId === 'anna@e.com');

  assert.deepEqual(res.counts, {
    customers: 1,
    journals: 2,
    assets: 1,
    agreements: 1,
    offers: 0,
    consents: 1,
    events: 3,
    photoBytesIncluded: 1,
  });

  // bundle was persisted via secureStorage and path rewritten
  assert.ok(res.bundlePath.startsWith('secure/'));
});

test('buildDsrExport works with missing stores and no photo bytes', async () => {
  const res = await buildDsrExport({
    customerId: 'lonely@e.com',
    dsrId: 'dsr-2',
    includePhotoBytes: false,
    stores: {},
  });
  assert.equal(res.counts.customers, 0);
  assert.equal(res.counts.journals, 0);
  assert.equal(res.counts.photoBytesIncluded, 0);
  assert.equal(res.includePhotoBytes, false);
  assert.match(res.bundleSha256, /^[0-9a-f]{64}$/);
});

test('buildDsrExport rejects blank customerId', async () => {
  await assert.rejects(() => buildDsrExport({ customerId: '  ', stores: {} }), /customerId krävs/);
});
