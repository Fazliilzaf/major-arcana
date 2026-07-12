'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getMailboxTruthBackfillJob,
  resetMailboxTruthBackfillJobsForTests,
  startMailboxTruthBackfillJob,
} = require('../../src/ops/ccoMailboxTruthBackfillAsyncJob');

function waitForFinished(mailboxId) {
  return new Promise((resolve) => {
    const poll = () => {
      const state = getMailboxTruthBackfillJob(mailboxId);
      if (!state.running) return resolve(state);
      setTimeout(poll, 5);
    };
    poll();
  });
}

test('serializes mailbox truth backfill jobs per mailbox', async () => {
  resetMailboxTruthBackfillJobsForTests();
  let release;
  const blocker = new Promise((resolve) => {
    release = resolve;
  });
  const first = startMailboxTruthBackfillJob({
    mailboxId: 'contact@hairtpclinic.com',
    run: async ({ onRound }) => {
      onRound(1);
      await blocker;
      return { complete: true };
    },
  });
  const second = startMailboxTruthBackfillJob({
    mailboxId: 'contact@hairtpclinic.com',
    run: async () => ({ complete: true }),
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(second.already, true);
  release();
  const finished = await waitForFinished('contact@hairtpclinic.com');
  assert.equal(finished.rounds, 1);
  assert.deepEqual(finished.result, { complete: true });
  assert.equal(finished.lastError, null);
});

test('keeps async job errors in pollable state', async () => {
  resetMailboxTruthBackfillJobsForTests();
  startMailboxTruthBackfillJob({
    mailboxId: 'contact@hairtpclinic.com',
    run: async () => {
      throw new Error('graph failed');
    },
  });
  const finished = await waitForFinished('contact@hairtpclinic.com');
  assert.equal(finished.running, false);
  assert.equal(finished.lastError, 'graph failed');
});
