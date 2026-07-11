'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KONS_MAILBOX,
  createCcoMailIngestionPoller,
  resolveIntervalMs,
} = require('../../src/ops/ccoMailIngestion/poller');

test('KONS-pollern är avstängd utan explicit gate', async () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: KONS_MAILBOX,
    },
    syncService: { runMailboxCycle: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'kons_poller_disabled' });
  assert.deepEqual(await poller.runOnce(), { skipped: true, reason: 'kons_poller_disabled' });
});

test('KONS-pollern låser mailbox och mode till read_only', async () => {
  const calls = [];
  const broadcasts = [];
  let scheduled = null;
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: KONS_MAILBOX,
      ccoMailIngestionPollIntervalMinutes: 3,
    },
    runtimeStreamRouter: {
      broadcast(event, payload) {
        broadcasts.push({ event, payload });
      },
    },
    syncService: {
      runMailboxCycle: async (options) => {
        calls.push(options);
        return {
          ingestResult: { totalFetched: 1, totalSaved: 1 },
          processResult: { processed: 1 },
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
    },
  });

  assert.deepEqual(poller.start(), {
    started: true,
    mailboxEmail: KONS_MAILBOX,
    intervalMs: 180000,
  });
  assert.equal(scheduled.ms, 180000);
  // start() kör första cykeln direkt; vänta ett tick innan explicit verifiering.
  await new Promise((resolve) => setImmediate(resolve));
  await poller.runOnce();
  assert.deepEqual(calls, [
    {
      mailboxEmail: KONS_MAILBOX,
      mode: 'read_only',
      trigger: 'kons_poller',
      createdBy: 'system:cco_kons_poller',
      folderTypes: ['inbox', 'sent'],
    },
    {
      mailboxEmail: KONS_MAILBOX,
      mode: 'read_only',
      trigger: 'kons_poller',
      createdBy: 'system:cco_kons_poller',
      folderTypes: ['inbox', 'sent'],
    },
  ]);
  assert.equal(broadcasts.length, 2);
  assert.equal(broadcasts[0].event, 'worklist_updated');
  assert.equal(broadcasts[0].payload.saved, 1);
});

test('KONS-pollern avvisar annan default-brevlåda', () => {
  const poller = createCcoMailIngestionPoller({
    config: {
      ccoMailIngestionPollEnabled: true,
      ccoMailIngestionEnabled: true,
      ccoMailIngestionMode: 'read_only',
      ccoMailIngestionDefaultMailbox: 'info@hairtpclinic.com',
    },
    syncService: { runMailboxCycle: async () => assert.fail('ska inte köras') },
  });
  assert.deepEqual(poller.start(), { started: false, reason: 'kons_poller_disabled' });
  assert.equal(resolveIntervalMs({ ccoMailIngestionPollIntervalMinutes: 0 }), 60000);
});
