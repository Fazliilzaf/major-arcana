'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const {
  enrichRetrievalResults,
  buildRetrievalSummary,
} = require('../../src/knowledge/retrievalQuality');
const { createTenantKnowledgeStore } = require('../../src/knowledge/tenantKnowledgeStore');

test('enrichRetrievalResults lägger till citation, quality och usedInAnswer', () => {
  const enriched = enrichRetrievalResults(
    [
      {
        title: 'Prislista',
        documentId: 'kd_1',
        chunkId: 'kc_1',
        score: 8,
        tokenCount: 200,
        position: 0,
        updatedAt: new Date().toISOString(),
      },
    ],
    { query: 'pris', tenantId: 'hair-tp-clinic' }
  );
  assert.equal(enriched.length, 1);
  const r = enriched[0];
  assert.equal(r.citation.source, 'Prislista');
  assert.equal(r.citation.position, 1);
  assert.ok(r.quality.confidence > 0);
  assert.ok(['Hög', 'Medel', 'Låg'].includes(r.quality.confidenceLabel));
  assert.equal(r.quality.staleness.stale, false);
  assert.equal(r.usedInAnswer, false);
});

test('staleness flaggar gamla dokument som föråldrade', () => {
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  const [r] = enrichRetrievalResults([{ title: 'Gammalt', score: 5, updatedAt: old }], {});
  assert.equal(r.quality.staleness.stale, true);
  assert.ok(r.quality.staleness.ageDays > 90);
});

test('buildRetrievalSummary: tom lista → high risk', () => {
  const s = buildRetrievalSummary([]);
  assert.equal(s.resultCount, 0);
  assert.equal(s.riskLevel, 'high');
});

test('buildRetrievalSummary aggregerar konfidens och citationer', () => {
  const enriched = enrichRetrievalResults(
    [
      { title: 'A', score: 10, tokenCount: 300, position: 0, updatedAt: new Date().toISOString() },
      { title: 'B', score: 9, tokenCount: 200, position: 1, updatedAt: new Date().toISOString() },
    ],
    {}
  );
  const s = buildRetrievalSummary(enriched);
  assert.equal(s.resultCount, 2);
  assert.ok(s.averageConfidence > 0);
  assert.equal(s.citations.length, 2);
  assert.ok(['low', 'medium', 'high'].includes(s.riskLevel));
});

test('integration: store.search-resultat innehåller position + updatedAt och kan berikas', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-rq-'));
  const store = createTenantKnowledgeStore({ storePath: path.join(dir, 'k.json') });
  await store.load();
  await store.upsertDocument({
    tenantId: 'hair-tp-clinic',
    document: {
      title: 'Prislista hårtransplantation',
      content: 'DHI kostar från 45000 kr. FUE från 35000 kr.',
      category: 'pricing',
    },
  });
  const raw = store.search({ tenantId: 'hair-tp-clinic', query: 'pris dhi' });
  assert.ok(raw.length > 0);
  assert.ok(Object.prototype.hasOwnProperty.call(raw[0], 'position'));
  assert.ok(Object.prototype.hasOwnProperty.call(raw[0], 'updatedAt'));

  const enriched = enrichRetrievalResults(raw, { query: 'pris dhi', tenantId: 'hair-tp-clinic' });
  const summary = buildRetrievalSummary(enriched);
  assert.ok(enriched[0].citation.label.includes('Prislista'));
  assert.ok(summary.averageConfidence >= 0);
});
