'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const chat = require('../../public/staff-agent-chat.js');

test('WP-004: labelFor ger portal-neutral etikett per agent', () => {
  assert.match(chat.labelFor('CCO'), /CCO/);
  assert.match(chat.labelFor('CFO'), /CFO/);
  assert.match(chat.labelFor('CMO'), /CMO/);
});

test('WP-004: tom historik -> tomt läge med agentlabel', () => {
  assert.match(chat.renderMessagesHtml([]), /Starta ett samtal/);
});

test('WP-004: meddelanden renderas med rätt roll + escaping (XSS-skydd)', () => {
  const html = chat.renderMessagesHtml([{ role: 'user', content: '<script>alert(1)</script>' }]);
  assert.match(html, /chat-msg--user/);
  assert.doesNotMatch(html, /<script>/); // esc() neutraliserar
});

test('WP-004: shell renderar agentlabel + ingen secret', () => {
  const html = chat.renderShellHtml({ agentId: 'CFO', messages: [] });
  assert.match(html, /CFO/);
  assert.doesNotMatch(html, /ARCANA_ADMIN_TOKEN|Bearer|password/);
});

test('WP-004: data-agent är bunden till angiven agent (ingen hårdkodad roll→agent)', () => {
  const html = chat.renderShellHtml({ agentId: 'CCO' });
  assert.match(html, /data-agent="CCO"/);
  assert.doesNotMatch(html, /data-agent="CFO"/);
});

test('WP-004: CM är inte en chat-agent', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(chat.AGENT_LABELS, 'CM'), false);
});

test('WP-004b: CFO entitlement -> chat visible', () => {
  assert.equal(chat.shouldShowChat(['CFO'], 'CFO'), true);
});

test('WP-004b: no CFO entitlement -> hidden', () => {
  assert.equal(chat.shouldShowChat([], 'CFO'), false);
});

test('WP-004b: CCO-only user -> CFO chat deny (UX-hide)', () => {
  assert.equal(chat.shouldShowChat(['CCO'], 'CFO'), false);
});

test('WP-004b: CM kan aldrig vara chatt-agent', () => {
  assert.equal(chat.shouldShowChat(['CM'], 'CM'), false);
});

test('WP-005: CCO-user kan inte öppna CFO', () => {
  assert.equal(chat.shouldShowChat(['CCO'], 'CFO'), false);
});

test('WP-005: CMO-user kan inte öppna COO', () => {
  assert.equal(chat.shouldShowChat(['CMO'], 'COO'), false);
});

test('WP-005: multi-entitled user kan exakt sina tilldelade portaler', () => {
  const agents = ['CCO', 'CAO'];
  assert.equal(chat.shouldShowChat(agents, 'CCO'), true);
  assert.equal(chat.shouldShowChat(agents, 'CAO'), true);
  assert.equal(chat.shouldShowChat(agents, 'CFO'), false);
  assert.equal(chat.shouldShowChat(agents, 'CMO'), false);
  assert.equal(chat.shouldShowChat(agents, 'COO'), false);
});

test('WP-005: alla fem rollout-agenter har advisory-kontext (label)', () => {
  for (const a of ['CCO', 'CFO', 'CMO', 'CAO', 'COO']) {
    assert.ok(chat.AGENT_LABELS[a], a);
  }
});
