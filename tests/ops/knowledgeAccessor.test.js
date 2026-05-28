'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKnowledgeIndex,
  docsForRole,
  availableRoles,
  rolesForPath,
  tagsForPath,
  searchKnowledge,
} = require('../../src/ops/knowledgeAccessor');

test('knowledge index covers every doc with metadata', async () => {
  const index = await buildKnowledgeIndex();
  assert.ok(index.totalDocuments >= 100);
  assert.equal(index.curatedCount + index.uncuratedCount, index.totalDocuments);
  assert.ok(index.roles.length >= 5);
  for (const doc of index.documents) {
    assert.ok(doc.path && doc.title && doc.segment);
    assert.ok(Array.isArray(doc.roles));
    assert.ok(Array.isArray(doc.tags));
  }
});

test('docsForRole returns curated role docs and segment fallback', async () => {
  const cmo = await docsForRole('cmo');
  assert.ok(cmo.length >= 1, 'cmo role has curated docs');
  assert.ok(cmo.every((d) => d.roles.includes('cmo') || d.segment === 'cmo'));

  // Segment fallback: an uncurated folder (uiux) still resolves by segment id.
  const uiux = await docsForRole('uiux');
  assert.ok(uiux.length >= 1, 'uiux resolves via segment');
  assert.ok(uiux.every((d) => d.segment === 'uiux' || d.roles.includes('uiux')));
});

test('rolesForPath maps curated docs; tagsForPath derives from path', () => {
  assert.deepEqual(rolesForPath('docs/strategy/MASTER-TODO.md').sort(), ['overview']);
  assert.equal(rolesForPath('docs/this/does-not-exist.md').length, 0);
  assert.ok(tagsForPath('docs/strategy/cco-booking-mvp-spec.md').includes('booking'));
});

test('availableRoles lists the curated sections', () => {
  const roles = availableRoles();
  assert.ok(roles.includes('cmo') && roles.includes('compliance') && roles.includes('ops'));
});

test('searchKnowledge retrieves doc chunks and respects role + empty query', async () => {
  const gdpr = await searchKnowledge('gdpr personuppgifter', { limit: 3 });
  assert.ok(gdpr.length >= 1);
  assert.ok(gdpr.every((h) => h.path.startsWith('docs/') && typeof h.content === 'string'));
  assert.ok(gdpr.some((h) => /legal\//.test(h.path)), 'gdpr query surfaces legal docs');

  const cmo = await searchKnowledge('marketing rollout', { role: 'cmo', limit: 3 });
  assert.ok(cmo.length >= 1);
  assert.ok(cmo.every((h) => h.roles.includes('cmo') || h.path.includes('/cmo/')));

  assert.deepEqual(await searchKnowledge(''), []);
});
