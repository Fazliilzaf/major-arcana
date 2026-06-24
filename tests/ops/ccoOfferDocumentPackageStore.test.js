const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoOfferDocumentPackageStore,
  VALID_DOC_STATUSES,
} = require('../../src/ops/ccoOfferDocumentPackageStore');

function sampleOffer(overrides = {}) {
  return {
    id: 'offer-1',
    customerId: 'Anna.Karlsson@email.com',
    title: 'PRP-behandling',
    attachments: [{ id: 'att-1', title: 'Prislista' }],
    consents: [{ id: 'consent-1', title: 'Fotosamtycke' }],
    ...overrides,
  };
}

test('preparePackage -> getById -> listByCustomer', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'cco-offer-document-packages.json');
  try {
    const store = await createCcoOfferDocumentPackageStore({ filePath });

    const pkg = await store.preparePackage({
      offer: sampleOffer(),
      plan: { planId: 'plan-1', offerId: 'offer-1', title: 'Plan A' },
      actor: { userId: 'owner-a', role: 'owner' },
    });

    assert.ok(pkg.packageId, 'paketet får ett id');
    assert.equal(pkg.offerId, 'offer-1');
    assert.equal(pkg.customerId, 'anna.karlsson@email.com', 'customerId normaliseras');
    assert.equal(pkg.planId, 'plan-1');
    assert.equal(pkg.status, 'prepared');
    // offert + plan + 1 bilaga + 1 samtycke = 4 dokument
    assert.equal(pkg.docs.length, 4);
    const kinds = pkg.docs.map((d) => d.kind).sort();
    assert.deepEqual(kinds, ['attachment', 'consent', 'offer', 'treatment_plan']);
    assert.ok(pkg.docs.every((d) => d.status === 'pending'));

    const fetched = store.getById(pkg.packageId);
    assert.equal(fetched.packageId, pkg.packageId);
    assert.equal(store.getById('saknas'), null);

    const list = store.listByCustomer('anna.karlsson@email.com');
    assert.equal(list.length, 1);
    assert.equal(list[0].packageId, pkg.packageId);
    assert.equal(store.listByCustomer('annan@email.com').length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('preparePackage respekterar existingDocsState och kräver fält', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'pkg.json');
  try {
    const store = await createCcoOfferDocumentPackageStore({ filePath });

    const pkg = await store.preparePackage({
      offer: sampleOffer(),
      existingDocsState: { 'offer-1': { status: 'signed' } },
    });
    const offerDoc = pkg.docs.find((d) => d.kind === 'offer');
    assert.equal(offerDoc.status, 'signed');

    await assert.rejects(() => store.preparePackage({}), /offer krävs/);
    await assert.rejects(
      () => store.preparePackage({ offer: { customerId: 'x' } }),
      /offer.id krävs/
    );
    await assert.rejects(
      () => store.preparePackage({ offer: { id: 'o' } }),
      /offer.customerId krävs/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('updateDocStatus uppdaterar status och validerar', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'pkg.json');
  try {
    const store = await createCcoOfferDocumentPackageStore({ filePath });
    const pkg = await store.preparePackage({ offer: sampleOffer(), actor: { role: 'staff' } });
    const docId = pkg.docs[0].docId;

    const updated = await store.updateDocStatus({
      packageId: pkg.packageId,
      docId,
      status: 'sent',
      actor: { userId: 'u1', role: 'doctor' },
    });
    const doc = updated.docs.find((d) => d.docId === docId);
    assert.equal(doc.status, 'sent');
    assert.equal(doc.history.at(-1).status, 'sent');
    assert.equal(doc.history.at(-1).role, 'doctor');

    assert.ok(VALID_DOC_STATUSES.includes('signed'));
    await assert.rejects(
      () => store.updateDocStatus({ packageId: pkg.packageId, docId, status: 'bogus' }),
      /Ogiltig status/
    );
    await assert.rejects(
      () => store.updateDocStatus({ packageId: 'saknas', docId, status: 'sent' }),
      /Dokumentpaketet saknas/
    );
    await assert.rejects(
      () => store.updateDocStatus({ packageId: pkg.packageId, docId: 'saknas', status: 'sent' }),
      /Dokumentet saknas/
    );
    await assert.rejects(() => store.updateDocStatus({ docId, status: 'sent' }), /packageId krävs/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('timelineStore-stub anropas när paket förbereds', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'pkg.json');
  try {
    const events = [];
    const timelineStore = { appendEvent: (e) => events.push(e) };
    const store = await createCcoOfferDocumentPackageStore({ filePath, timelineStore });

    const pkg = await store.preparePackage({ offer: sampleOffer() });
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'offer_document_package_prepared');
    assert.equal(events[0].packageId, pkg.packageId);
    assert.equal(events[0].customerId, 'anna.karlsson@email.com');
    assert.equal(events[0].docCount, pkg.docs.length);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('timelineStore=null hanteras utan fel', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'pkg.json');
  try {
    const store = await createCcoOfferDocumentPackageStore({ filePath, timelineStore: null });
    const pkg = await store.preparePackage({ offer: sampleOffer() });
    assert.ok(pkg.packageId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('persisteras till fil och läses tillbaka', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-pkg-store-'));
  const filePath = path.join(tempDir, 'pkg.json');
  try {
    const store1 = await createCcoOfferDocumentPackageStore({ filePath });
    const pkg = await store1.preparePackage({ offer: sampleOffer() });
    await store1.updateDocStatus({
      packageId: pkg.packageId,
      docId: pkg.docs[0].docId,
      status: 'ready',
    });

    const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.equal(onDisk.packages.length, 1);

    const store2 = await createCcoOfferDocumentPackageStore({ filePath });
    const reloaded = store2.getById(pkg.packageId);
    assert.ok(reloaded);
    assert.equal(reloaded.docs[0].status, 'ready');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
