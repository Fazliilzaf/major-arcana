'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AuditDocumentationMetadataCapability,
  ProposeDocumentStructureCapability,
} = require('../../src/capabilities/caoCapabilityKit');

test('AuditDocumentationMetadata now audits the full knowledge corpus', async () => {
  const result = await new AuditDocumentationMetadataCapability().execute({});
  // Was limited to ~18 index links; now covers the whole docs/ tree.
  assert.ok(result.data.indexedDocuments >= 100, `expected full corpus, got ${result.data.indexedDocuments}`);
  assert.equal(typeof result.data.ownerCoverage, 'number');
  assert.equal(typeof result.data.nextStepCoverage, 'number');
  assert.ok(Array.isArray(result.data.gaps));
  assert.ok(Array.isArray(result.data.documentsWithGaps));
  assert.match(result.data.summary, /Granskade \d+ dokument/);
});

test('AuditDocumentationMetadata honors an explicit snapshot link override', async () => {
  const result = await new AuditDocumentationMetadataCapability().execute({
    systemStateSnapshot: { documentationIndex: { links: ['strategy/MASTER-TODO.md'] } },
  });
  assert.equal(result.data.indexedDocuments, 1);
});

test('ProposeDocumentStructure reflects the live segments + flags uncurated docs', async () => {
  const result = await new ProposeDocumentStructureCapability().execute({});
  assert.ok(result.data.totalDocuments >= 100);
  assert.ok(result.data.totalSegments >= 5);
  assert.ok(result.data.proposals.length === result.data.totalSegments);
  assert.ok(result.data.proposals.every((p) => p.path && typeof p.count === 'number'));
  assert.equal(typeof result.data.uncuratedDocuments, 'number');
});
