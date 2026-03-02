const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractAndPersistWritingIdentityProfile,
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
