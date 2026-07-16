'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CONTACT_MAILBOX,
  EGZONA_MAILBOX,
  FAZLI_MAILBOX,
  HALSO_MAILBOX,
  INFO_MAILBOX,
  KONS_MAILBOX,
  KVITTO_MAILBOX,
  MARKNAD_MAILBOX,
  createCcoMailIngestionPoller,
  resolveInitialDelayMs,
  resolveIntervalMs,
  resolveMaxMailboxesPerCycle,
  resolvePollMailboxes,
} = require('../../src/ops/ccoMailIngestion/poller');

test('mailbox-pollern är avstängd utan explicit gate', async () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: KONS_MAILBOX,
    },
    syncService: { runDeltaSync: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'mailbox_poller_disabled' });
  assert.deepEqual(await poller.runOnce(), { skipped: true, reason: 'mailbox_poller_disabled' });
});

test('mailbox-pollern roterar en mailbox per read_only-runda', async () => {
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
      ccoMailIngestionPollMailboxes: [KONS_MAILBOX, CONTACT_MAILBOX, FAZLI_MAILBOX],
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
    mailboxEmails: [KONS_MAILBOX, CONTACT_MAILBOX, FAZLI_MAILBOX],
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
      mailboxIds: [CONTACT_MAILBOX],
      folderTypes: ['inbox', 'sent'],
      pageSize: 25,
      maxPagesPerFolder: 1,
    },
  ]);
  assert.equal(broadcasts.length, 4);
  assert.equal(broadcasts[0].event, 'worklist_updated');
  assert.equal(broadcasts[0].payload.truthChanged, 1);
  assert.deepEqual(broadcasts[0].payload.mailboxIds, [KONS_MAILBOX]);
  assert.equal(broadcasts[1].event, 'mailbox_sync_updated');
  assert.deepEqual(broadcasts[2].payload.mailboxIds, [CONTACT_MAILBOX]);
  assert.equal(broadcasts[2].event, 'worklist_updated');
  assert.equal(broadcasts[3].event, 'mailbox_sync_updated');
});

test('mailbox-pollern fortsätter med nästa konto efter en misslyckad runda', async () => {
  const calls = [];
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionPollMailboxes: [KONS_MAILBOX, CONTACT_MAILBOX],
    },
    syncService: {
      runDeltaSync: async ({ mailboxIds }) => {
        calls.push(mailboxIds[0]);
        if (mailboxIds[0] === KONS_MAILBOX) throw new Error('graph_timeout');
        return { affectedConversationIds: ['contact-thread'] };
      },
    },
    logger: { log() {}, error() {} },
  });

  const failedResult = await poller.runOnce();
  const recoveredResult = await poller.runOnce();
  assert.deepEqual(calls, [KONS_MAILBOX, CONTACT_MAILBOX]);
  assert.deepEqual(failedResult.failedMailboxIds, [KONS_MAILBOX]);
  assert.equal(failedResult.results[0].error, 'graph_timeout');
  assert.deepEqual(recoveredResult.failedMailboxIds, []);
  assert.deepEqual(recoveredResult.results[0].result.affectedConversationIds, ['contact-thread']);
});

test('mailbox-pollern tillåter alla CCO-mailboxar och avvisar övriga konton', () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: 'booking@hairtpclinic.com',
    },
    syncService: { runDeltaSync: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'mailbox_poller_disabled' });
  assert.deepEqual(
    resolvePollMailboxes({
    ccoMailIngestionPollMailboxes: [
      KONS_MAILBOX,
      INFO_MAILBOX,
      CONTACT_MAILBOX,
      EGZONA_MAILBOX,
      FAZLI_MAILBOX,
      MARKNAD_MAILBOX,
      KVITTO_MAILBOX,
      HALSO_MAILBOX,
      'booking@hairtpclinic.com',
    ],
    }),
    [
      KONS_MAILBOX,
      INFO_MAILBOX,
      CONTACT_MAILBOX,
      EGZONA_MAILBOX,
      FAZLI_MAILBOX,
      MARKNAD_MAILBOX,
      KVITTO_MAILBOX,
      HALSO_MAILBOX,
    ]
  );
  assert.equal(resolveIntervalMs({ ccoMailIngestionPollIntervalMinutes: 0 }), 60000);
  assert.equal(resolveInitialDelayMs({ ccoMailIngestionPollInitialDelayMs: 0 }), 10000);
  assert.equal(resolveInitialDelayMs({}), 120000);
  assert.equal(resolveMaxMailboxesPerCycle({}, 8), 1);
  assert.equal(resolveMaxMailboxesPerCycle({ ccoMailIngestionPollMaxMailboxesPerCycle: 3 }, 8), 3);
  assert.equal(resolveMaxMailboxesPerCycle({ ccoMailIngestionPollMaxMailboxesPerCycle: 99 }, 8), 8);
});
