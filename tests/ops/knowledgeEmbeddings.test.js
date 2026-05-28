'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  cosineSimilarity,
  semanticSearch,
  mergeHybrid,
  isEmbeddingsConfigured,
  loadEmbeddingStore,
  isStoreStale,
} = require('../../src/ops/knowledgeEmbeddings');

test('isStoreStale: missing/unparsable store is stale; fresh vs old by mtime', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'emb-stale-'));
  try {
    await fs.mkdir(path.join(root, 'docs', 'strategy'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs', 'strategy', 'a.md'), '# A\n', 'utf8');

    assert.equal(await isStoreStale(null, root), true);
    assert.equal(await isStoreStale({}, root), true);
    assert.equal(await isStoreStale({ generatedAt: 'not-a-date' }, root), true);

    const future = new Date(Date.now() + 3600_000).toISOString();
    assert.equal(await isStoreStale({ generatedAt: future }, root), false);

    const past = new Date(Date.now() - 3600_000).toISOString();
    assert.equal(await isStoreStale({ generatedAt: past }, root), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cosineSimilarity handles identical, orthogonal, and bad input', () => {
  assert.equal(Number(cosineSimilarity([1, 2, 3], [1, 2, 3]).toFixed(3)), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1, 0, 0]), 0); // mismatched dims
  assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
  assert.equal(cosineSimilarity(null, [1]), 0);
});

test('semanticSearch ranks by cosine and respects limit', () => {
  const store = {
    entries: [
      { path: 'a.md', content: 'A', vector: [1, 0, 0] },
      { path: 'b.md', content: 'B', vector: [0, 1, 0] },
      { path: 'c.md', content: 'C', vector: [0.8, 0.2, 0] },
    ],
  };
  const hits = semanticSearch([0.9, 0.1, 0], store, { limit: 2 });
  assert.equal(hits.length, 2);
  assert.equal(hits[0].path, 'a.md');
  assert.ok(hits[0].score >= hits[1].score);
  assert.deepEqual(semanticSearch(null, store), []);
  assert.deepEqual(semanticSearch([1, 0, 0], null), []);
});

test('mergeHybrid dedupes by path and boosts docs found by both', () => {
  const merged = mergeHybrid(
    [
      { path: 'a.md', score: 10 },
      { path: 'c.md', score: 5 },
    ],
    [
      { path: 'a.md', score: 0.9 },
      { path: 'b.md', score: 0.8 },
    ],
    { limit: 5 }
  );
  const paths = merged.map((h) => h.path);
  assert.equal(new Set(paths).size, paths.length, 'no duplicate paths');
  assert.equal(merged[0].path, 'a.md', 'doc found by both ranks first');
  assert.deepEqual(merged.find((h) => h.path === 'a.md').sources.sort(), ['keyword', 'semantic']);
});

test('isEmbeddingsConfigured requires openai provider + key', () => {
  assert.equal(isEmbeddingsConfigured({ aiProvider: 'openai', openaiApiKey: 'x' }), true);
  assert.equal(isEmbeddingsConfigured({ aiProvider: 'openai' }), false);
  assert.equal(isEmbeddingsConfigured({ aiProvider: 'fallback', openaiApiKey: 'x' }), false);
  assert.equal(isEmbeddingsConfigured({}), false);
});

test('loadEmbeddingStore returns null for a missing file', async () => {
  assert.equal(await loadEmbeddingStore('/nope/does-not-exist-embeddings.json'), null);
});
