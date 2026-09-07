'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const access = require('../../public/staff-portal-agent-access.js');

test('WP-006: AGENT_CHOICES = 6 roller, CM utelämnad', () => {
  assert.deepEqual(access.AGENT_CHOICES, ['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']);
  assert.equal(access.AGENT_CHOICES.indexOf('CM'), -1);
});

test('WP-006: normalizeAgentChoice whitelist (fail-closed)', () => {
  assert.equal(access.normalizeAgentChoice('CCO'), 'CCO');
  assert.equal(access.normalizeAgentChoice('cfo'), 'CFO');
  assert.equal(access.normalizeAgentChoice('CM'), '');
  assert.equal(access.normalizeAgentChoice('XYZ'), '');
});

test('WP-006: renderAgentAccessHtml — 6 boxar, ingen CM, aktiva checkade', () => {
  const html = access.renderAgentAccessHtml('anna@clinic.se', ['CCO', 'CAO']);
  assert.match(html, /data-agent="CCO"/);
  assert.match(html, /data-agent="CAO"/);
  assert.doesNotMatch(html, /data-agent="CM"/);
  const checked = (html.match(/checked/g) || []).length;
  assert.equal(checked, 2); // CCO + CAO
});

test('WP-006: buildDiff beräknar grant/revoke korrekt', () => {
  const diff = access.buildDiff(['CCO', 'CAO'], ['CCO', 'CFO']);
  assert.deepEqual(diff.grant, ['CFO']);
  assert.deepEqual(diff.revoke, ['CAO']);
});

test('WP-006: buildDiff ignorerar CM/okänt i nästa', () => {
  const diff = access.buildDiff(['CCO'], ['CCO', 'CM', 'XYZ']);
  assert.deepEqual(diff.grant, []);
  assert.deepEqual(diff.revoke, []);
});
