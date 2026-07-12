'use strict';

function idleState() {
  return {
    running: false,
    mailboxId: null,
    startedAt: null,
    finishedAt: null,
    rounds: 0,
    result: null,
    lastError: null,
  };
}

const jobs = new Map();

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function getMailboxTruthBackfillJob(mailboxId = '') {
  return clone(jobs.get(String(mailboxId).trim().toLowerCase()) || idleState());
}

function resetMailboxTruthBackfillJobsForTests() {
  jobs.clear();
}

function startMailboxTruthBackfillJob({ mailboxId = '', run } = {}) {
  const key = String(mailboxId).trim().toLowerCase();
  if (!key || typeof run !== 'function') {
    throw new Error('Mailbox truth async-jobb kräver mailboxId och run.');
  }
  const current = jobs.get(key);
  if (current?.running) {
    return { accepted: false, already: true, state: clone(current) };
  }
  const state = {
    ...idleState(),
    running: true,
    mailboxId: key,
    startedAt: new Date().toISOString(),
  };
  jobs.set(key, state);
  setImmediate(async () => {
    try {
      state.result = await run({
        onRound: (rounds) => {
          state.rounds = Number(rounds || 0);
        },
      });
    } catch (error) {
      state.lastError = error?.message || String(error);
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
  });
  return { accepted: true, already: false, state: clone(state) };
}

module.exports = {
  getMailboxTruthBackfillJob,
  resetMailboxTruthBackfillJobsForTests,
  startMailboxTruthBackfillJob,
};
