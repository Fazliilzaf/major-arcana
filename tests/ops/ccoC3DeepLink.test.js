'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseC3DeepLinkParams, buildC3DeepLinkUrl } = require('../../src/ops/ccoC3DeepLink');

// ── parseC3DeepLinkParams ──────────────────────────────────────────────────

test('parseC3DeepLinkParams extracts conversationId and customerId', () => {
  const result = parseC3DeepLinkParams(
    '?view=conversations&conv=conv-abc123&customerId=patient-456'
  );
  assert.equal(result.conversationId, 'conv-abc123');
  assert.equal(result.customerId, 'patient-456');
});

test('parseC3DeepLinkParams returns empty strings when params absent', () => {
  const result = parseC3DeepLinkParams('?view=conversations');
  assert.equal(result.conversationId, '');
  assert.equal(result.customerId, '');
});

test('parseC3DeepLinkParams handles empty search string', () => {
  const result = parseC3DeepLinkParams('');
  assert.equal(result.conversationId, '');
  assert.equal(result.customerId, '');
});

test('parseC3DeepLinkParams handles null/undefined gracefully', () => {
  assert.doesNotThrow(() => parseC3DeepLinkParams(null));
  assert.doesNotThrow(() => parseC3DeepLinkParams(undefined));
  const result = parseC3DeepLinkParams(undefined);
  assert.equal(result.conversationId, '');
  assert.equal(result.customerId, '');
});

test('parseC3DeepLinkParams trims whitespace from param values', () => {
  const result = parseC3DeepLinkParams('?conv=+conv-1+&customerId=+cust-1+');
  // URLSearchParams decodes + as space, trim() removes it
  assert.equal(result.conversationId, 'conv-1');
  assert.equal(result.customerId, 'cust-1');
});

test('parseC3DeepLinkParams handles URL-encoded values', () => {
  const encoded =
    '?view=conversations&conv=' +
    encodeURIComponent('conv/abc@123') +
    '&customerId=' +
    encodeURIComponent('patient abc');
  const result = parseC3DeepLinkParams(encoded);
  assert.equal(result.conversationId, 'conv/abc@123');
  assert.equal(result.customerId, 'patient abc');
});

// ── buildC3DeepLinkUrl ─────────────────────────────────────────────────────

test('buildC3DeepLinkUrl builds correct URL with conv and customerId', () => {
  const url = buildC3DeepLinkUrl({ conversationId: 'conv-abc', customerId: 'cust-1' });
  const params = new URLSearchParams(url.slice(1)); // strip leading '?'
  assert.equal(params.get('view'), 'conversations');
  assert.equal(params.get('conv'), 'conv-abc');
  assert.equal(params.get('customerId'), 'cust-1');
});

test('buildC3DeepLinkUrl omits customerId when not provided', () => {
  const url = buildC3DeepLinkUrl({ conversationId: 'conv-abc' });
  const params = new URLSearchParams(url.slice(1));
  assert.equal(params.get('view'), 'conversations');
  assert.equal(params.get('conv'), 'conv-abc');
  assert.equal(params.get('customerId'), null);
});

test('buildC3DeepLinkUrl returns empty string when conversationId is absent', () => {
  assert.equal(buildC3DeepLinkUrl({ customerId: 'cust-1' }), '');
  assert.equal(buildC3DeepLinkUrl({}), '');
  assert.equal(buildC3DeepLinkUrl(), '');
});

test('buildC3DeepLinkUrl round-trips with parseC3DeepLinkParams', () => {
  const original = { conversationId: 'conv-xyz', customerId: 'patient-99' };
  const url = buildC3DeepLinkUrl(original);
  const parsed = parseC3DeepLinkParams(url);
  assert.equal(parsed.conversationId, original.conversationId);
  assert.equal(parsed.customerId, original.customerId);
});

test('buildC3DeepLinkUrl supports optional base prefix', () => {
  const url = buildC3DeepLinkUrl({
    conversationId: 'conv-1',
    customerId: 'cust-1',
    base: '/major-arcana-preview/',
  });
  assert.ok(url.startsWith('/major-arcana-preview/?'), `expected base prefix, got: ${url}`);
  const [, search] = url.split('?');
  const params = new URLSearchParams(search);
  assert.equal(params.get('conv'), 'conv-1');
});
