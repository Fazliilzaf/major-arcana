'use strict';

/* A1 — mailbox-allowlist resolver: prioritet env → scheduler → curated default,
 * och att curated default = kundkonversations-inkorgarna (marknad exkluderad). */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CURATED_CUSTOMER_MAILBOX_ALLOWLIST,
  normalizeMailboxList,
  resolveIngestMailboxAllowlist,
} = require('../../src/ops/ccoMailboxAllowlist');

test('A1: curated default = kundinkorgar, marknad/funktionsadresser exkluderade', () => {
  assert.deepEqual([...CURATED_CUSTOMER_MAILBOX_ALLOWLIST].sort(), [
    'contact@hairtpclinic.com',
    'egzona@hairtpclinic.com',
    'fazli@hairtpclinic.com',
    'info@hairtpclinic.com',
    'kons@hairtpclinic.com',
  ]);
  for (const excluded of [
    'marknad@hairtpclinic.com',
    'kvitto@hairtpclinic.com',
    'booking@hairtpclinic.com',
    'halso@hairtpclinic.com',
  ]) {
    assert.ok(
      !CURATED_CUSTOMER_MAILBOX_ALLOWLIST.includes(excluded),
      `${excluded} ska inte ingesta som kundkonversation`
    );
  }
});

test('A1: tom env + tom scheduler → curated default', () => {
  const { mailboxIds, source } = resolveIngestMailboxAllowlist({});
  assert.deepEqual(mailboxIds, [...CURATED_CUSTOMER_MAILBOX_ALLOWLIST]);
  assert.equal(source, 'curated_customer_mailbox_allowlist');
});

test('A1: env-allowlist överstyr allt (full kontroll per miljö)', () => {
  const { mailboxIds, source } = resolveIngestMailboxAllowlist({
    envAllowlist: 'A@clinic.se, B@clinic.se',
    schedulerHistoryMailboxIds: ['C@clinic.se'],
  });
  assert.deepEqual(mailboxIds, ['a@clinic.se', 'b@clinic.se']);
  assert.equal(source, 'ARCANA_MAILBOX_ALLOWLIST');
});

test('A1: scheduler-history används när env är tom', () => {
  const { mailboxIds, source } = resolveIngestMailboxAllowlist({
    envAllowlist: '',
    schedulerHistoryMailboxIds: ['Kons@hairtpclinic.com', 'kons@hairtpclinic.com'],
  });
  assert.deepEqual(mailboxIds, ['kons@hairtpclinic.com'], 'normaliserar + deduplicerar');
  assert.equal(source, 'ARCANA_SCHEDULER_CCO_HISTORY_MAILBOX_IDS');
});

test('A1: normalizeMailboxList trimmar, gemener, splittar på komma/whitespace', () => {
  assert.deepEqual(normalizeMailboxList('  Info@X.se ,  contact@X.se\nkons@X.se '), [
    'info@x.se',
    'contact@x.se',
    'kons@x.se',
  ]);
  assert.deepEqual(normalizeMailboxList(['A@x.se', ' ', 'b@X.SE']), ['a@x.se', 'b@x.se']);
  assert.deepEqual(normalizeMailboxList(null), []);
});
