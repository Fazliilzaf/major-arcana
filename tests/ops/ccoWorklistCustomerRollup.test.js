'use strict';

/* C8 — multi-mailbox customer rollup + missed-reply verification.
 *
 * Verifierar buildCustomerRollupRows / buildWorklistRollupRow i
 * ccoMailboxTruthWorklistReadModel:
 *  - samma kund över flera klinikmailboxar → EN operativ kundrad
 *  - mailbox-trail: adresser kunden mailat till + senaste svar-mailbox
 *  - missat svar räknas över kundens samlade historik (needsReply OR)
 *  - outgoing från valfri mailbox släcker needsReply för sin tråd
 *  - dedupe: samma conversationId över mailboxar → en tråd
 *  - conflict/osäker match auto-bindas ALDRIG över mailboxar
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCustomerRollupRows,
  hasWorklistHardMergeConflict,
} = require('../../src/ops/ccoMailboxTruthWorklistReadModel');

function makeRow({
  canonicalCustomerId = null,
  customerEmail = 'kund@example.com',
  mailboxId,
  conversationId,
  needsReply = false,
  hasUnreadInbound = false,
  lastInboundAt = null,
  lastOutboundAt = null,
  inbox = true,
  sent = false,
  identityExtra = {},
} = {}) {
  const identity = { customerEmail, ...identityExtra };
  if (canonicalCustomerId) identity.canonicalCustomerId = canonicalCustomerId;
  const convKey = `${mailboxId}:${conversationId}`;
  return {
    id: convKey,
    conversationKey: convKey,
    conversationId,
    mailboxId,
    ownershipMailbox: mailboxId,
    mailbox: { mailboxId, mailboxAddress: mailboxId },
    customerEmail,
    customerIdentity: Object.keys(identity).length ? identity : undefined,
    needsReply,
    hasUnreadInbound,
    messageCount: 1,
    lane: needsReply ? 'act-now' : 'all',
    folderPresence: { inbox, sent, drafts: false, deleted: false },
    timing: {
      latestMessageAt: lastOutboundAt || lastInboundAt,
      lastInboundAt,
      lastOutboundAt,
      hoursSinceInbound: 1,
    },
  };
}

test('C8: bekräftad kund över två mailboxar → en operativ kundrad', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: 'cust-1',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'conv-a',
      lastInboundAt: '2026-06-01T10:00:00.000Z',
    }),
    makeRow({
      canonicalCustomerId: 'cust-1',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'conv-b',
      lastInboundAt: '2026-06-02T10:00:00.000Z',
    }),
  ]);

  assert.equal(rows.length, 1, 'kunden ska bli EN rad');
  const [row] = rows;
  assert.equal(row.rollup.enabled, true);
  assert.equal(row.rollup.mailboxCount, 2);
  assert.equal(row.rollup.threadCount, 2);
  assert.deepEqual([...row.rollup.underlyingMailboxIds].sort(), [
    'boka@hairtpclinic.com',
    'info@hairtpclinic.com',
  ]);
  assert.match(row.rollup.provenanceLabel, /2 mailboxar/);
});

test('C8: mailbox-trail — inbound-adresser + senaste svar från rätt mailbox', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: 'cust-2',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'conv-a',
      inbox: true,
      lastInboundAt: '2026-06-01T09:00:00.000Z',
      lastOutboundAt: '2026-06-01T10:00:00.000Z',
      sent: true,
    }),
    makeRow({
      canonicalCustomerId: 'cust-2',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'conv-b',
      inbox: true,
      lastInboundAt: '2026-06-03T09:00:00.000Z',
      lastOutboundAt: '2026-06-03T12:00:00.000Z',
      sent: true,
    }),
  ]);

  const [row] = rows;
  assert.deepEqual(
    [...row.rollup.inboundMailboxIds].sort(),
    ['boka@hairtpclinic.com', 'info@hairtpclinic.com'],
    'visar vilka adresser kunden mailat till'
  );
  assert.equal(
    row.rollup.latestReplyMailbox,
    'boka@hairtpclinic.com',
    'senaste svar kom från boka@ (senare lastOutboundAt)'
  );
  assert.equal(row.rollup.latestReplyAt, '2026-06-03T12:00:00.000Z');
});

test('C8: missat svar räknas över samlad historik (obesvarat i mailbox B maskeras inte av svar i mailbox A)', () => {
  const rows = buildCustomerRollupRows([
    // Mailbox A: besvarad tråd (outgoing efter inbound) → needsReply false
    makeRow({
      canonicalCustomerId: 'cust-3',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'conv-a',
      needsReply: false,
      lastInboundAt: '2026-06-01T09:00:00.000Z',
      lastOutboundAt: '2026-06-01T10:00:00.000Z',
      sent: true,
    }),
    // Mailbox B: obesvarad tråd → needsReply true
    makeRow({
      canonicalCustomerId: 'cust-3',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'conv-b',
      needsReply: true,
      lastInboundAt: '2026-06-05T09:00:00.000Z',
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(
    rows[0].needsReply,
    true,
    'kundraden behöver svar eftersom en tråd i mailbox B är obesvarad'
  );
  assert.equal(rows[0].rollup.operationalSummary.needsReplyCount, 1);
});

test('C8: outgoing från valfri mailbox släcker needsReply när alla trådar är besvarade', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: 'cust-4',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'conv-a',
      needsReply: false,
      lastInboundAt: '2026-06-01T09:00:00.000Z',
      lastOutboundAt: '2026-06-01T10:00:00.000Z',
      sent: true,
    }),
    makeRow({
      canonicalCustomerId: 'cust-4',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'conv-b',
      needsReply: false,
      lastInboundAt: '2026-06-02T09:00:00.000Z',
      lastOutboundAt: '2026-06-02T11:00:00.000Z',
      sent: true,
    }),
  ]);

  assert.equal(rows[0].needsReply, false, 'inga obesvarade trådar → kundraden behöver inte svar');
});

test('C8: dedupe — samma conversationId över två mailboxar räknas som en tråd', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: 'cust-5',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'shared-conv',
      lastInboundAt: '2026-06-01T09:00:00.000Z',
    }),
    makeRow({
      canonicalCustomerId: 'cust-5',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'shared-conv',
      lastOutboundAt: '2026-06-01T12:00:00.000Z',
      inbox: false,
      sent: true,
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rollup.mailboxCount, 2, 'två mailboxar');
  assert.equal(rows[0].rollup.threadCount, 1, 'men EN logisk tråd (samma conversationId)');
});

test('C8: outgoing från annan mailbox i SAMMA tråd registreras som senaste svar', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: 'cust-6',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'shared-conv',
      needsReply: true,
      lastInboundAt: '2026-06-01T09:00:00.000Z',
    }),
    makeRow({
      canonicalCustomerId: 'cust-6',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'shared-conv',
      needsReply: false,
      lastOutboundAt: '2026-06-01T12:00:00.000Z',
      inbox: false,
      sent: true,
    }),
  ]);

  assert.equal(rows[0].rollup.latestReplyMailbox, 'boka@hairtpclinic.com');
  assert.equal(rows[0].rollup.latestReplyAt, '2026-06-01T12:00:00.000Z');
});

// ── Säkerhet: conflict/osäker match auto-bindas ALDRIG ────────────────────────

test('C8: hård identitetskonflikt (olika verifierat telefonnr) mergas ALDRIG', () => {
  const left = makeRow({
    canonicalCustomerId: 'cust-7',
    mailboxId: 'info@hairtpclinic.com',
    conversationId: 'conv-a',
    identityExtra: { verifiedPhoneE164: '+46700000001' },
  });
  const right = makeRow({
    canonicalCustomerId: 'cust-7',
    mailboxId: 'boka@hairtpclinic.com',
    conversationId: 'conv-b',
    identityExtra: { verifiedPhoneE164: '+46700000002' },
  });
  assert.equal(hasWorklistHardMergeConflict(left, right), true, 'guarden ska flagga konflikt');

  const rows = buildCustomerRollupRows([left, right]);
  assert.equal(rows.length, 2, 'konflikt → två separata rader, ingen auto-bind');
});

test('C8: osäker email-only-match auto-bindas ALDRIG över mailboxar', () => {
  const rows = buildCustomerRollupRows([
    makeRow({
      canonicalCustomerId: null, // ingen bekräftad kanonisk identitet
      customerEmail: 'gissning@example.com',
      mailboxId: 'info@hairtpclinic.com',
      conversationId: 'conv-a',
    }),
    makeRow({
      canonicalCustomerId: null,
      customerEmail: 'gissning@example.com',
      mailboxId: 'boka@hairtpclinic.com',
      conversationId: 'conv-b',
    }),
  ]);

  assert.equal(rows.length, 2, 'email-only-match hålls mailbox-scopad → ingen cross-mailbox-bind');
});
