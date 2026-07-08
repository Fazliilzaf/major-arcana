'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPostSendMailboxSync,
  normalizeEmail,
} = require('../../src/ops/ccoPostSendMailboxSync');

test('post-send-sync normaliserar mailbox och kör smal Graph-backfill i bakgrunden', async () => {
  const calls = [];
  const broadcasts = [];
  const done = new Promise((resolve) => {
    const sync = createPostSendMailboxSync({
      graphReadConnector: { ok: true },
      ccoMailboxTruthStore: { ok: true },
      runtimeStreamRouter: { broadcast: (event, payload) => broadcasts.push({ event, payload }) },
      lookbackDays: 30,
      runGraphBackfill: async (args) => {
        calls.push(args);
        return { folderCount: 4 };
      },
      logger: { warn: () => {} },
    });
    const scheduled = sync({
      mailboxId: ' KONS@HairTPClinic.com ',
      source: 'cco_reply_sent',
      conversationKey: 'conv-1',
    });
    assert.deepEqual(scheduled, {
      scheduled: true,
      mailboxId: 'kons@hairtpclinic.com',
      lookbackDays: 14,
    });
    setImmediate(resolve);
  });
  await done;
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].mailboxIds, ['kons@hairtpclinic.com']);
  assert.equal(calls[0].lookbackDays, 14);
  assert.equal(broadcasts[0].event, 'worklist_updated');
  assert.equal(broadcasts[0].payload.source, 'post_send_mailbox_sync');
  assert.equal(broadcasts[0].payload.trigger, 'cco_reply_sent');
});

test('post-send-sync hoppar säkert när Graph read saknas', () => {
  const sync = createPostSendMailboxSync({
    graphReadConnector: null,
    ccoMailboxTruthStore: { ok: true },
  });
  assert.deepEqual(sync({ mailboxId: 'kons@hairtpclinic.com' }), {
    scheduled: false,
    reason: 'graph_read_unavailable',
    mailboxId: 'kons@hairtpclinic.com',
  });
});

test('normalizeEmail kräver giltig e-post', () => {
  assert.equal(normalizeEmail(' KONS@HairTPClinic.com '), 'kons@hairtpclinic.com');
  assert.equal(normalizeEmail('inte-en-mailbox'), '');
});
