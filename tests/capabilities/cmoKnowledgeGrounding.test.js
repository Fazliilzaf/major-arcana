'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { groundingReferences } = require('../../src/ops/knowledgeGrounding');
const { GenerateMarketingBriefCapability } = require('../../src/capabilities/generateMarketingBrief');
const { GenerateContentBriefCapability } = require('../../src/capabilities/generateContentBrief');
const { GenerateSeoBriefCapability } = require('../../src/capabilities/generateSeoBrief');

test('groundingReferences returns deduped, markdown-only, archive-free citations', async () => {
  const refs = await groundingReferences('marketing rollout strategi', { limit: 3 });
  assert.ok(Array.isArray(refs));
  assert.ok(refs.length >= 1);
  const paths = refs.map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length, 'deduped');
  assert.ok(refs.every((r) => /\.md$/i.test(r.path)), 'markdown only');
  assert.ok(refs.every((r) => !r.path.startsWith('docs/archives/')), 'no archives');
  assert.ok(refs.every((r) => typeof r.snippet === 'string'));
});

test('groundingReferences is empty for a blank query', async () => {
  assert.deepEqual(await groundingReferences(''), []);
});

test('CMO briefs are grounded with knowledge-layer references', async () => {
  for (const Cls of [
    GenerateMarketingBriefCapability,
    GenerateContentBriefCapability,
    GenerateSeoBriefCapability,
  ]) {
    const result = await new Cls().execute({});
    const refs = (result.data && result.data.references) || [];
    assert.ok(Array.isArray(refs) && refs.length >= 1, `${Cls.name} has references`);
    const paths = refs.map((r) => r.path);
    assert.equal(new Set(paths).size, paths.length, `${Cls.name} deduped`);
    assert.ok(refs.every((r) => /\.md$/i.test(r.path)), `${Cls.name} markdown only`);
  }
});
