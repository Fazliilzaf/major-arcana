const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractAndPersistWritingIdentityProfile,
  extractAndPersistWritingIdentityProfiles,
  extractWritingProfileFromSamples,
  listMailboxesWithSentSamples,
  listRecentSentSamplesForMailbox,
} = require('../../src/intelligence/writingProfileExtractor');
const {
  getWritingIdentityProfile,
} = require('../../src/intelligence/writingIdentityStore');

function createAnalysisStoreMock(seedEntries = []) {
  const entries = seedEntries.slice();
  return {
    entries,
    async append(entry) {
      entries.push({
        ...entry,
        ts: new Date().toISOString(),
      });
      return entry;
    },
    async list({ tenantId, capabilityName, limit = 500 }) {
      return entries
        .filter(
          (entry) =>
            String(entry?.tenantId || '') === String(tenantId || '') &&
            String(entry?.capability?.name || '') === String(capabilityName || '')
        )
        .slice(-Math.max(1, Number(limit) || 500))
        .reverse();
    },
  };
}

function buildSendEntry({
  tenantId,
  mailbox,
  body,
  ts,
}) {
  return {
    tenantId,
    capability: { name: 'CCO.SendReply' },
    input: {
      senderMailboxId: mailbox,
      body,
    },
    output: {
      senderMailboxId: mailbox,
      body,
    },
    ts: ts || new Date().toISOString(),
  };
}

test('Writing profile extractor auto-extracts from sent mail samples and persists source=auto', async () => {
  const tenantId = 'tenant-writing-extractor';
  const mailbox = 'egzona@hairtpclinic.com';
  const analysisStore = createAnalysisStoreMock([
    buildSendEntry({
      tenantId,
      mailbox,
      body: 'Hej,\n\nTack för ditt meddelande. Vänligen återkom med händelseförlopp.\n\nBästa hälsningar',
      ts: '2026-02-28T09:00:00.000Z',
    }),
    buildSendEntry({
      tenantId,
      mailbox,
      body: 'Hej,\n\nVi hjälper dig gärna vidare och återkommer med nästa steg.\n\nBästa hälsningar',
      ts: '2026-02-28T10:00:00.000Z',
    }),
  ]);

  const auditEvents = [];
  const authStore = {
    async addAuditEvent(event) {
      auditEvents.push(event);
      return event;
    },
  };

  const result = await extractAndPersistWritingIdentityProfile({
    analysisStore,
    authStore,
    tenantId,
    mailboxAddress: mailbox,
    actorUserId: 'owner-1',
    correlationId: 'corr-extract-1',
    sampleSize: 40,
  });

  assert.equal(result.updated, true);
  assert.equal(result.mailbox, mailbox);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.record?.source, 'auto');
  assert.equal(result.record?.version, 1);

  const stored = await getWritingIdentityProfile({
    analysisStore,
    tenantId,
    mailboxAddress: mailbox,
  });
  assert.equal(stored !== null, true);
  assert.equal(stored.source, 'auto');
  assert.equal(stored.version, 1);
  assert.equal(typeof stored.profile.greetingStyle, 'string');
  assert.equal(typeof stored.profile.closingStyle, 'string');
  assert.equal(auditEvents.some((item) => item.action === 'writing.profile.updated'), true);
});

test('Writing profile extractor returns no_samples when no sent mail exists', async () => {
  const analysisStore = createAnalysisStoreMock([]);
  const result = await extractAndPersistWritingIdentityProfile({
    analysisStore,
    authStore: null,
    tenantId: 'tenant-writing-extractor-empty',
    mailboxAddress: 'fazli@hairtpclinic.com',
    actorUserId: 'owner-1',
    sampleSize: 40,
  });

  assert.equal(result.updated, false);
  assert.equal(result.reason, 'no_samples');
  assert.equal(result.sampleCount, 0);
  assert.equal(result.record, null);
});

test('listRecentSentSamplesForMailbox clamps sampleSize and filters invalid samples', async () => {
  const tenantId = 'tenant-samples';
  const mailbox = 'ops@hairtpclinic.com';
  const entries = [];
  for (let i = 0; i < 60; i += 1) {
    entries.push(
      buildSendEntry({
        tenantId,
        mailbox,
        body: `Hej\n\nBody ${i}\n\nVänliga hälsningar`,
        ts: `2026-03-01T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
      })
    );
  }
  entries.push({
    tenantId,
    capability: { name: 'CCO.SendReply' },
    input: { senderMailboxId: mailbox, body: '   ' },
    output: { senderMailboxId: mailbox, body: '' },
    ts: '2026-03-02T00:00:00.000Z',
  });
  const analysisStore = createAnalysisStoreMock(entries);

  const samples = await listRecentSentSamplesForMailbox({
    analysisStore,
    tenantId,
    mailboxAddress: mailbox,
    sampleSize: 10, // clamps to 30
  });
  assert.equal(samples.length, 30);
  assert.equal(samples.every((item) => item.mailbox === mailbox), true);
});

test('listMailboxesWithSentSamples normalizes, dedupes and sorts addresses', async () => {
  const tenantId = 'tenant-mailboxes';
  const analysisStore = createAnalysisStoreMock([
    buildSendEntry({ tenantId, mailbox: 'Zeta@Example.com', body: 'Hej', ts: '2026-03-01T10:00:00.000Z' }),
    buildSendEntry({ tenantId, mailbox: 'alpha@example.com', body: 'Hej', ts: '2026-03-01T10:01:00.000Z' }),
    buildSendEntry({ tenantId, mailbox: 'zeta@example.com', body: 'Hej', ts: '2026-03-01T10:02:00.000Z' }),
  ]);

  const mailboxes = await listMailboxesWithSentSamples({ analysisStore, tenantId, maxMailboxes: 1 });
  assert.deepEqual(mailboxes, ['zeta@example.com']);

  const all = await listMailboxesWithSentSamples({ analysisStore, tenantId, maxMailboxes: 10 });
  assert.deepEqual(all, ['alpha@example.com', 'zeta@example.com']);
});

test('extractAndPersistWritingIdentityProfiles uses explicit mailboxes and reports skipped invalid', async () => {
  const tenantId = 'tenant-batch';
  const analysisStore = createAnalysisStoreMock([
    buildSendEntry({
      tenantId,
      mailbox: 'valid@hairtpclinic.com',
      body: 'Hej\n\nTack för ditt meddelande.\n\nVänliga hälsningar',
      ts: '2026-03-01T11:00:00.000Z',
    }),
  ]);
  const authStore = { async addAuditEvent() {} };

  const result = await extractAndPersistWritingIdentityProfiles({
    analysisStore,
    authStore,
    tenantId,
    mailboxes: ['valid@hairtpclinic.com', 'not-an-email'],
    actorUserId: 'owner-2',
    sampleSize: 100, // clamps to 50 in return payload
  });

  assert.deepEqual(result.requestedMailboxes, ['valid@hairtpclinic.com']);
  assert.equal(result.updatedProfiles.length, 1);
  assert.equal(result.updatedProfiles[0].updated, true);
  assert.equal(result.sampleSize, 50);
  assert.equal(result.skipped.length, 0);
});

test('extractWritingProfileFromSamples uses fallback profile when samples empty', () => {
  const p = extractWritingProfileFromSamples([], {
    fallbackProfile: { greetingStyle: 'Hallå,' },
  });
  assert.equal(p.greetingStyle, 'Hallå,');
});

test('extractWritingProfileFromSamples detects Hello greeting on first line', () => {
  const p = extractWritingProfileFromSamples([
    { body: 'Hello\n\nThanks for your message.\n\nBest' },
  ]);
  assert.match(p.greetingStyle, /^Hello/i);
});

test('extractWritingProfileFromSamples aggregates closing from repeated samples', () => {
  const p = extractWritingProfileFromSamples([
    { body: 'Hej\n\nText one.\n\nVänliga hälsningar' },
    { body: 'Hej\n\nText two.\n\nVänliga hälsningar' },
  ]);
  assert.ok(/hälsningar/i.test(p.closingStyle));
});

test('extractWritingProfileFromSamples sets emojiUsage when body contains emoji', () => {
  const p = extractWritingProfileFromSamples([
    { body: 'Hej! 😊\n\nKlart.\n\nVänliga hälsningar' },
  ]);
  assert.equal(p.emojiUsage, true);
});

test('extractWritingProfileFromSamples ignores null entries in sample list', () => {
  const p = extractWritingProfileFromSamples([
    null,
    { body: 'Hej\n\nKort svar.\n\nVänliga hälsningar' },
  ]);
  assert.ok(/hej/i.test(p.greetingStyle));
});
