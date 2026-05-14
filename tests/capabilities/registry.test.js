const test = require('node:test');
const assert = require('node:assert/strict');

const {
  listCapabilities,
  getCapabilityByName,
  listAgentBundles,
  getAgentBundleByName,
} = require('../../src/capabilities/registry');

test('listCapabilities includes core entries with metadata', () => {
  const caps = listCapabilities();
  assert.ok(caps.length >= 8);
  const names = new Set(caps.map((c) => c.name));
  assert.ok(names.has('GenerateTaskPlan'));
  assert.ok(names.has('GdprExportCustomer'));
  const gtp = caps.find((c) => c.name === 'GenerateTaskPlan');
  assert.equal(typeof gtp.version, 'string');
  assert.ok(Array.isArray(gtp.allowedRoles));
  assert.ok(Array.isArray(gtp.allowedChannels));
});

test('getCapabilityByName resolves case-insensitively', () => {
  const cap = getCapabilityByName('  generateTaskPlan ');
  assert.ok(cap);
  assert.equal(cap.name, 'GenerateTaskPlan');
  assert.equal(getCapabilityByName(''), null);
  assert.equal(getCapabilityByName('no-such-capability-xyz'), null);
});

test('listAgentBundles and getAgentBundleByName', () => {
  const bundles = listAgentBundles();
  assert.ok(bundles.length >= 1);
  const coo = getAgentBundleByName('coo');
  assert.ok(coo);
  assert.ok(Array.isArray(coo.capabilities));
  assert.equal(getAgentBundleByName(''), null);
});

test('getCapabilityByName returnerar null for nullish eller icke-sträng', () => {
  assert.equal(getCapabilityByName(null), null);
  assert.equal(getCapabilityByName(undefined), null);
  assert.equal(getCapabilityByName(123), null);
});

test('getCapabilityByName trimmar whitespace kring namn', () => {
  const cap = getCapabilityByName('\n\t GdprExportCustomer \r');
  assert.ok(cap);
  assert.equal(cap.name, 'GdprExportCustomer');
});

test('getAgentBundleByName trimmar whitespace kring roll eller namn', () => {
  assert.ok(getAgentBundleByName('  COO  '));
  assert.equal(getAgentBundleByName('  cco  ')?.role, 'CCO');
});

test('listAgentBundles returnerar farska arrayer per anrop', () => {
  const a = listAgentBundles();
  const b = listAgentBundles();
  assert.notEqual(a, b);
  const cao = a.find((x) => x.name === 'CAO');
  assert.ok(cao);
  cao.plannedCapabilities.push('MUTATED_SHOULD_NOT_LEAK');
  const fresh = listAgentBundles().find((x) => x.name === 'CAO');
  assert.equal(fresh.plannedCapabilities.includes('MUTATED_SHOULD_NOT_LEAK'), false);
});

test('getAgentBundleByName hittar COO CCO och CAO med olika casing', () => {
  assert.ok(getAgentBundleByName('COO'));
  assert.ok(getAgentBundleByName('coo'));
  assert.equal(getAgentBundleByName('CCO')?.role, 'CCO');
  assert.equal(getAgentBundleByName('cco')?.role, 'CCO');
  assert.equal(getAgentBundleByName('CAO')?.name, 'CAO');
  assert.equal(getAgentBundleByName('cao')?.name, 'CAO');
});

test('getAgentBundleByName nullish eller icke-sträng ger null', () => {
  assert.equal(getAgentBundleByName(null), null);
  assert.equal(getAgentBundleByName(undefined), null);
  assert.equal(getAgentBundleByName(1), null);
});

test('listCapabilities returnerar farska arrayer per anrop', () => {
  const a = listCapabilities();
  const b = listCapabilities();
  assert.notEqual(a, b);
  const idx = a.findIndex((c) => c.name === 'GenerateTaskPlan');
  assert.ok(idx >= 0);
  a[idx].allowedRoles.push('SHOULD_NOT_LEAK');
  const fresh = listCapabilities().find((c) => c.name === 'GenerateTaskPlan');
  assert.equal(fresh.allowedRoles.includes('SHOULD_NOT_LEAK'), false);
});
