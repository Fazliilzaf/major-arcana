'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FAZLI_MAILBOX,
  KONS_MAILBOX,
  createCcoMailIngestionPoller,
  resolveInitialDelayMs,
  resolveIntervalMs,
  resolvePollMailboxes,
} = require('../../src/ops/ccoMailIngestion/poller');

test('KONS-pollern är avstängd utan explicit gate', async () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: KONS_MAILBOX,
    },
    syncService: { runDeltaSync: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'kons_poller_disabled' });
  assert.deepEqual(await poller.runOnce(), { skipped: true, reason: 'kons_poller_disabled' });
});

test('mailbox-pollern låser kons + fazli och mode till read_only', async () => {
  const calls = [];
  const broadcasts = [];
  let scheduled = null;
  let initial = null;
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: KONS_MAILBOX,
      ccoMailIngestionPollMailboxes: [KONS_MAILBOX, FAZLI_MAILBOX],
      ccoMailIngestionPollIntervalMinutes: 3,
      ccoMailIngestionPollInitialDelayMs: 120000,
      ccoMailIngestionPollTruthLimit: 100,
      ccoMailIngestionPollDeltaPageSize: 25,
      ccoMailIngestionPollDeltaMaxPages: 1,
    },
    runtimeStreamRouter: {
      broadcast(event, payload) {
        broadcasts.push({ event, payload });
      },
    },
    syncService: {
      runDeltaSync: async (options) => {
        calls.push(options);
        return {
          affectedConversationIds: ['conversation-1'],
        };
      },
    },
    logger: { log() {}, error() {} },
    timers: {
      setInterval(fn, ms) {
        scheduled = { fn, ms };
        return { unref() {} };
      },
      clearInterval() {},
      setTimeout(fn, ms) {
        initial = { fn, ms };
        return { unref() {} };
      },
      clearTimeout() {},
    },
  });

  assert.deepEqual(poller.start(), {
    started: true,
    mailboxEmails: [KONS_MAILBOX, FAZLI_MAILBOX],
    initialDelayMs: 120000,
    intervalMs: 180000,
  });
  assert.equal(scheduled, null);
  assert.equal(initial.ms, 120000);
  assert.equal(calls.length, 0);
  await initial.fn();
  assert.equal(scheduled.ms, 180000);
  await poller.runOnce();
  assert.deepEqual(calls, [
    {
      mailboxIds: [KONS_MAILBOX],
      folderTypes: ['inbox', 'sent'],
      pageSize: 25,
      maxPagesPerFolder: 1,
    },
    {
      mailboxIds: [FAZLI_MAILBOX],
      folderTypes: ['inbox', 'sent'],
      pageSize: 25,
      maxPagesPerFolder: 1,
    },
    {
      mailboxIds: [KONS_MAILBOX],
      folderTypes: ['inbox', 'sent'],
      pageSize: 25,
      maxPagesPerFolder: 1,
    },
    {
      mailboxIds: [FAZLI_MAILBOX],
      folderTypes: ['inbox', 'sent'],
      pageSize: 25,
      maxPagesPerFolder: 1,
    },
  ]);
  assert.equal(broadcasts.length, 2);
  assert.equal(broadcasts[0].event, 'worklist_updated');
  assert.equal(broadcasts[0].payload.truthChanged, 2);
  assert.deepEqual(broadcasts[0].payload.mailboxIds, [KONS_MAILBOX, FAZLI_MAILBOX]);
});

test('mailbox-pollern avvisar konton utanför den låsta live-listan', () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: 'info@hairtpclinic.com',
    },
    syncService: { runDeltaSync: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'kons_poller_disabled' });
  assert.deepEqual(
    resolvePollMailboxes({
      ccoMailIngestionPollMailboxes: [KONS_MAILBOX, 'info@hairtpclinic.com', FAZLI_MAILBOX],
    }),
    [KONS_MAILBOX, FAZLI_MAILBOX]
  );
  assert.equal(resolveIntervalMs({ ccoMailIngestionPollIntervalMinutes: 0 }), 60000);
  assert.equal(resolveInitialDelayMs({ ccoMailIngestionPollInitialDelayMs: 0 }), 10000);
  assert.equal(resolveInitialDelayMs({}), 120000);
});
