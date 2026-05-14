const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { createTenantKnowledgeStore } = require('../../src/knowledge/tenantKnowledgeStore');

async function createTempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-ks-'));
  const storePath = path.join(dir, 'knowledge.json');
  const store = createTenantKnowledgeStore({ storePath });
  await store.load();
  return { store, storePath, dir };
}

test('upsertDocument skapar dokument med chunks och content hash', async () => {
  const { store } = await createTempStore();
  const doc = await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: {
      title: 'DHI-metoden',
      content: 'DHI-metoden innebar att harfolliklar transplanteras direkt med en Choi-penna.\n\nDetta ger naturligt resultat med minimal atertid.',
      category: 'treatment',
    },
  });

  assert.ok(doc.documentId.startsWith('kd_'));
  assert.equal(doc.tenantId, 'hair-tp-clinic');
  assert.equal(doc.category, 'treatment');
  assert.equal(doc.version, 1);
  assert.ok(doc.contentHash.startsWith('sha256:'));
  assert.ok(doc.chunks.length >= 1);
  assert.ok(doc.chunks[0].tokenCount > 0);
});

test('listDocuments filtrerar pa tenant och kategori', async () => {
  const { store } = await createTempStore();
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'Doc 1', content: 'Innehall 1', category: 'treatment' },
  });
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'Doc 2', content: 'Innehall 2', category: 'pricing' },
  });
  await store.upsertDocument({
    tenantId: 'curatiio',
    document: { title: 'Doc 3', content: 'Innehall 3', category: 'treatment' },
  });

  const all = store.listDocuments({ tenantId: 'hair-tp-clinic' });
  assert.equal(all.length, 2);

  const treatments = store.listDocuments({ tenantId: 'hair-tp-clinic', category: 'treatment' });
  assert.equal(treatments.length, 1);
  assert.equal(treatments[0].title, 'Doc 1');

  const curatiio = store.listDocuments({ tenantId: 'curatiio' });
  assert.equal(curatiio.length, 1);
});

test('search hittar relevanta chunks', async () => {
  const { store } = await createTempStore();
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: {
      title: 'Hartransplantation prisinfo',
      content: 'DHI hartransplantation kostar fran 45000 kr. FUE kostar fran 35000 kr. Priset beror pa antal grafter.',
      category: 'pricing',
    },
  });
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: {
      title: 'PRP behandling',
      content: 'PRP-behandling stimulerar hartillvaxt med blodplattsrik plasma.',
      category: 'treatment',
    },
  });

  const results = store.search({ tenantId: 'hair-tp-clinic', query: 'pris hartransplantation' });
  assert.ok(results.length > 0);
  assert.ok(results[0].text.includes('kostar'));
});

test('tenant-isolering — curatiio ser inte hair-tp-clinics data', async () => {
  const { store } = await createTempStore();
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'Hemlig data', content: 'Intern prisstrategi for Hair TP', category: 'pricing' },
  });

  const results = store.search({ tenantId: 'curatiio', query: 'prisstrategi' });
  assert.equal(results.length, 0);

  const docs = store.listDocuments({ tenantId: 'curatiio' });
  assert.equal(docs.length, 0);
});

test('deleteDocument raderar och returnerar true', async () => {
  const { store } = await createTempStore();
  const doc = await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'Temp', content: 'Temp content', category: 'general' },
  });

  const deleted = await store.deleteDocument({ tenantId: 'hair-tp-clinic', documentId: doc.documentId });
  assert.equal(deleted, true);

  const after = store.getDocument({ tenantId: 'hair-tp-clinic', documentId: doc.documentId });
  assert.equal(after, null);
});

test('getStats returnerar korrekt statistik per tenant', async () => {
  const { store } = await createTempStore();
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'D1', content: 'Kort innehall', category: 'faq' },
  });
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: { title: 'D2', content: 'Annat innehall', category: 'treatment' },
  });

  const stats = store.getStats({ tenantId: 'hair-tp-clinic' });
  assert.equal(stats.documentCount, 2);
  assert.ok(stats.chunkCount >= 2);
  assert.ok(stats.estimatedTokens > 0);
  assert.equal(stats.categories.faq, 1);
  assert.equal(stats.categories.treatment, 1);
});
