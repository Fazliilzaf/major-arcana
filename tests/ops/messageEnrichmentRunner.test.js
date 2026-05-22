const test = require('node:test');
const assert = require('node:assert/strict');

const { runEnrichment } = require('../../src/ops/messageEnrichmentRunner');
const { ENGINE_VERSION } = require('../../src/intelligence/messageEnrichment');

function minimalIntelligenceStore() {
  const enrichments = new Map();
  const key = (t, m, g) => `${t}|${m}|${g}`;
  return {
    getEnrichment: ({ tenantId, mailboxId, graphMessageId }) =>
      enrichments.get(key(tenantId, mailboxId, graphMessageId)) || null,
    upsertEnrichment: async ({ tenantId, mailboxId, graphMessageId, enrichment }) => {
      enrichments.set(key(tenantId, mailboxId, graphMessageId), enrichment);
    },
    flush: async () => {},
    recordRun: async () => {},
  };
}

test('runEnrichment throws without tenantId', async () => {
  await assert.rejects(
    () =>
      runEnrichment({
        tenantId: '',
        ccoMailboxTruthStore: { listMessages: () => [] },
        messageIntelligenceStore: { upsertEnrichment: async () => {} },
      }),
    /tenantId/i,
  );
});

test('runEnrichment throws without listMessages', async () => {
  await assert.rejects(
    () =>
      runEnrichment({
        tenantId: 't1',
        ccoMailboxTruthStore: {},
        messageIntelligenceStore: { upsertEnrichment: async () => {} },
      }),
    /listMessages/i,
  );
});

test('runEnrichment throws when messageIntelligenceStore lacks upsertEnrichment', async () => {
  await assert.rejects(
    () =>
      runEnrichment({
        tenantId: 't1',
        ccoMailboxTruthStore: { listMessages: () => [] },
        messageIntelligenceStore: { getEnrichment: () => null },
      }),
    /messageIntelligenceStore/i,
  );
});

test('runEnrichment throws when messageIntelligenceStore is null', async () => {
  await assert.rejects(
    () =>
      runEnrichment({
        tenantId: 't1',
        ccoMailboxTruthStore: { listMessages: () => [] },
        messageIntelligenceStore: null,
      }),
    /messageIntelligenceStore/i,
  );
});

test('runEnrichment treats non-array listMessages result as empty', async () => {
  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore: { listMessages: () => null },
    messageIntelligenceStore: minimalIntelligenceStore(),
  });
  assert.equal(r.examined, 0);
  assert.equal(r.skipped, 0);
  assert.equal(r.enriched, 0);
});

test('runEnrichment skips messages missing mailbox or graph id', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ subject: 'x' }, { mailboxId: 'm1', graphMessageId: '', subject: 'y' }],
  };
  const messageIntelligenceStore = minimalIntelligenceStore();

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
    yieldEvery: 1,
  });

  assert.equal(r.examined, 0);
  assert.equal(r.skipped, 2);
  assert.equal(r.enriched, 0);
});

test('backfill skips when enrichment already matches engine version', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [
      { mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej och tack för hjälpen' },
    ],
  };
  const messageIntelligenceStore = minimalIntelligenceStore();
  messageIntelligenceStore.getEnrichment = () => ({ engineVersion: ENGINE_VERSION });

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
  });

  assert.equal(r.examined, 1);
  assert.equal(r.enriched, 0);
  assert.equal(r.skipped, 1);
});

test('force mode re-enriches up-to-date messages', async () => {
  let upserts = 0;
  const ccoMailboxTruthStore = {
    listMessages: () => [
      { mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Booking request for next week' },
    ],
  };
  const base = minimalIntelligenceStore();
  const messageIntelligenceStore = {
    ...base,
    getEnrichment: () => ({ engineVersion: ENGINE_VERSION }),
    upsertEnrichment: async (args) => {
      upserts += 1;
      return base.upsertEnrichment(args);
    },
  };

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'force',
    yieldEvery: 1,
  });

  assert.equal(upserts, 1);
  assert.equal(r.enriched, 1);
});

test('delta mode skips messages that already match engine version', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Test' }],
  };
  const messageIntelligenceStore = minimalIntelligenceStore();
  messageIntelligenceStore.getEnrichment = () => ({ engineVersion: ENGINE_VERSION });

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'delta',
  });

  assert.equal(r.enriched, 0);
  assert.equal(r.skipped, 1);
});

test('delta mode enriches when existing engineVersion is stale', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej jag vill boka tid' }],
  };
  const messageIntelligenceStore = minimalIntelligenceStore();
  messageIntelligenceStore.getEnrichment = () => ({ engineVersion: '0.0.0-stale' });

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'delta',
  });

  assert.equal(r.enriched, 1);
  assert.equal(r.skipped, 0);
});

test('runEnrichment records failure and sample error when upsert throws', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej' }],
  };
  const messageIntelligenceStore = {
    getEnrichment: () => null,
    upsertEnrichment: async () => {
      throw new Error('disk full');
    },
    flush: async () => {},
  };

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
    logger: { warn: () => {} },
  });

  assert.equal(r.failed, 1);
  assert.equal(r.sampleErrors.length, 1);
  assert.match(r.sampleErrors[0].error, /disk full/);
});

test('runEnrichment tracks perMailbox examined/skipped/enriched counters', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [
      { mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej' },
      { mailboxId: 'mb1', graphMessageId: 'gm2', subject: 'Hej igen' },
    ],
  };
  const base = minimalIntelligenceStore();
  const messageIntelligenceStore = {
    ...base,
    getEnrichment: ({ graphMessageId }) =>
      graphMessageId === 'gm1' ? { engineVersion: ENGINE_VERSION } : null,
  };

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
  });

  assert.equal(r.perMailbox.mb1.examined, 2);
  assert.equal(r.perMailbox.mb1.skipped, 1);
  assert.equal(r.perMailbox.mb1.enriched, 1);
});

test('runEnrichment records runType as delta only in delta mode', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej' }],
  };
  const calls = [];
  const messageIntelligenceStore = {
    ...minimalIntelligenceStore(),
    recordRun: async (payload) => calls.push(payload),
  };

  await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'delta',
  });
  await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'force',
  });

  assert.equal(calls[0].runType, 'delta');
  assert.equal(calls[1].runType, 'backfill');
});

test('runEnrichment tolerates flush/recordRun failures after processing', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Hej' }],
  };
  const messageIntelligenceStore = {
    ...minimalIntelligenceStore(),
    flush: async () => {
      throw new Error('flush failed');
    },
    recordRun: async () => {
      throw new Error('record failed');
    },
  };

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
  });

  assert.equal(r.enriched, 1);
  assert.equal(r.failed, 0);
});

test('runEnrichment trims tenantId in summary output', async () => {
  const ccoMailboxTruthStore = {
    listMessages: () => [{ mailboxId: 'mb1', graphMessageId: 'gm1', subject: 'Kort meddelande' }],
  };
  const r = await runEnrichment({
    tenantId: '  tenant-trim  ',
    ccoMailboxTruthStore,
    messageIntelligenceStore: minimalIntelligenceStore(),
    mode: 'backfill',
  });
  assert.equal(r.tenantId, 'tenant-trim');
});

test('runEnrichment passes empty mailboxIds to listMessages when mailboxIds is not an array', async () => {
  let received = null;
  const ccoMailboxTruthStore = {
    listMessages: (opts) => {
      received = opts;
      return [];
    },
  };
  await runEnrichment({
    tenantId: 't1',
    mailboxIds: 'not-an-array',
    ccoMailboxTruthStore,
    messageIntelligenceStore: minimalIntelligenceStore(),
  });
  assert.deepEqual(received.mailboxIds, []);
});

test('runEnrichment collects at most five sampleErrors when many upserts fail', async () => {
  const messages = Array.from({ length: 7 }, (_, i) => ({
    mailboxId: 'mb1',
    graphMessageId: `gm-${i}`,
    subject: 'Hej',
  }));
  const ccoMailboxTruthStore = { listMessages: () => messages };
  const messageIntelligenceStore = {
    getEnrichment: () => null,
    upsertEnrichment: async () => {
      throw new Error('persist failed');
    },
    flush: async () => {},
  };

  const r = await runEnrichment({
    tenantId: 't1',
    ccoMailboxTruthStore,
    messageIntelligenceStore,
    mode: 'backfill',
  });

  assert.equal(r.failed, 7);
  assert.equal(r.sampleErrors.length, 5);
  assert.match(r.sampleErrors[4].error, /persist failed/);
});
