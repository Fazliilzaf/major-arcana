const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getWritingIdentityProfile,
  listWritingIdentityProfiles,
  toProfilesByMailboxMap,
  toStoredProfileRecordFromEntry,
  upsertWritingIdentityProfile,
} = require('../../src/intelligence/writingIdentityStore');

function createAnalysisStoreMock() {
  const entries = [];
  return {
    entries,
    async append(entry) {
      entries.push({
        ...entry,
        ts: new Date().toISOString(),
        output: entry.output,
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

test('Writing identity store upsert bumps version and writes audit event', async () => {
  const analysisStore = createAnalysisStoreMock();
  const auditEvents = [];
  const authStore = {
    async addAuditEvent(event) {
      auditEvents.push(event);
      return event;
    },
  };

  const tenantId = 'tenant-writing-store';
  const mailboxAddress = 'contact@hairtpclinic.com';

  const first = await upsertWritingIdentityProfile({
    analysisStore,
    authStore,
    tenantId,
    actorUserId: 'owner-1',
    mailboxAddress,
    source: 'manual',
    profile: {
      greetingStyle: 'Hej,',
      closingStyle: 'Vänliga hälsningar',
      formalityLevel: 7,
      warmthIndex: 6,
      ctaStyle: 'structured',
      sentenceLength: 'medium',
      emojiUsage: false,
    },
    correlationId: 'corr-writing-1',
  });

  const second = await upsertWritingIdentityProfile({
    analysisStore,
    authStore,
    tenantId,
    actorUserId: 'owner-1',
    mailboxAddress,
    source: 'manual',
    profile: {
      greetingStyle: 'Hej {{name}},',
      closingStyle: 'Bästa hälsningar',
      formalityLevel: 8,
      warmthIndex: 5,
      ctaStyle: 'direct',
      sentenceLength: 'short',
      emojiUsage: false,
    },
    correlationId: 'corr-writing-2',
  });

  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.equal(second.source, 'manual');
  assert.equal(second.profile.greetingStyle, 'Hej {{name}},');

  const current = await getWritingIdentityProfile({
    analysisStore,
    tenantId,
    mailboxAddress,
  });
  assert.equal(current !== null, true);
  assert.equal(current.version, 2);
  assert.equal(current.profile.ctaStyle, 'direct');

  const listed = await listWritingIdentityProfiles({ analysisStore, tenantId });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].mailbox, mailboxAddress);
  assert.equal(listed[0].version, 2);

  assert.equal(auditEvents.length, 2);
  assert.equal(auditEvents[0].action, 'writing.profile.updated');
  assert.equal(auditEvents[1].action, 'writing.profile.updated');
  assert.equal(auditEvents[1].metadata.mailbox, mailboxAddress);
  assert.equal(auditEvents[1].metadata.version, 2);
});

test('toStoredProfileRecordFromEntry ignores non-profile output and normalizes source/version', () => {
  const ignored = toStoredProfileRecordFromEntry({
    ts: '2026-04-01T10:00:00.000Z',
    output: { type: 'OtherType' },
  });
  assert.equal(ignored, null);

  const rec = toStoredProfileRecordFromEntry({
    ts: '2026-04-01T10:00:00.000Z',
    output: {
      type: 'WritingIdentityProfile',
      mailboxAddress: 'Agent@Clinic.se',
      version: 2.4,
      source: 'MANUAL',
      profile: { sentenceLength: 'long' },
    },
  });
  assert.equal(rec.mailbox, 'agent@clinic.se');
  assert.equal(rec.version, 2);
  assert.equal(rec.source, 'manual');
  assert.equal(rec.profile.sentenceLength, 'long');
});

test('toProfilesByMailboxMap keeps highest version and newest updatedAt on ties', () => {
  const map = toProfilesByMailboxMap([
    {
      mailbox: 'a@clinic.se',
      version: 2,
      updatedAt: '2026-04-01T10:00:00.000Z',
      createdAt: '2026-04-01T09:00:00.000Z',
      profile: {},
    },
    {
      mailbox: 'a@clinic.se',
      version: 3,
      updatedAt: '2026-04-01T08:00:00.000Z',
      createdAt: '2026-04-01T08:00:00.000Z',
      profile: {},
    },
    {
      mailbox: 'b@clinic.se',
      version: 1,
      updatedAt: '2026-04-01T11:00:00.000Z',
      createdAt: '2026-04-01T11:00:00.000Z',
      profile: {},
    },
    {
      mailbox: 'b@clinic.se',
      version: 1,
      updatedAt: '2026-04-01T12:00:00.000Z',
      createdAt: '2026-04-01T12:00:00.000Z',
      profile: {},
    },
  ]);
  assert.equal(map['a@clinic.se'].version, 3);
  assert.equal(map['b@clinic.se'].updatedAt, '2026-04-01T12:00:00.000Z');
});

test('upsertWritingIdentityProfile validates required dependencies and fields', async () => {
  await assert.rejects(
    () => upsertWritingIdentityProfile({ analysisStore: null, tenantId: 't', mailboxAddress: 'a@b.se' }),
    /analysisStore saknas/
  );

  const analysisStore = createAnalysisStoreMock();
  await assert.rejects(
    () => upsertWritingIdentityProfile({ analysisStore, tenantId: '', mailboxAddress: 'a@b.se' }),
    /tenantId krävs/
  );
  await assert.rejects(
    () => upsertWritingIdentityProfile({ analysisStore, tenantId: 't', mailboxAddress: 'not-email' }),
    /Ogiltig mailbox-adress/
  );
});

test('getWritingIdentityProfile returns null for invalid mailbox', async () => {
  const analysisStore = createAnalysisStoreMock();
  const result = await getWritingIdentityProfile({
    analysisStore,
    tenantId: 'tenant-writing-store',
    mailboxAddress: 'not-an-email',
  });
  assert.equal(result, null);
});

test('listWritingIdentityProfiles returns empty for missing store or blank tenant', async () => {
  assert.deepEqual(await listWritingIdentityProfiles({ analysisStore: null, tenantId: 't' }), []);
  const analysisStore = createAnalysisStoreMock();
  assert.deepEqual(await listWritingIdentityProfiles({ analysisStore, tenantId: '' }), []);
  assert.deepEqual(await listWritingIdentityProfiles({ analysisStore, tenantId: '   ' }), []);
});

test('upsertWritingIdentityProfile succeeds when authStore is omitted', async () => {
  const analysisStore = createAnalysisStoreMock();
  const record = await upsertWritingIdentityProfile({
    analysisStore,
    authStore: null,
    tenantId: 'tenant-no-audit',
    actorUserId: 'owner-1',
    mailboxAddress: 'writer@clinic.se',
    source: 'manual',
    profile: {
      greetingStyle: 'Hej,',
      closingStyle: 'Hälsningar',
      formalityLevel: 5,
      warmthIndex: 5,
      ctaStyle: 'direct',
      sentenceLength: 'medium',
      emojiUsage: false,
    },
  });
  assert.equal(record.version, 1);
  assert.equal(record.mailbox, 'writer@clinic.se');
  assert.equal(analysisStore.entries.length, 1);
});

test('toStoredProfileRecordFromEntry returns null when mailbox in output is invalid', () => {
  assert.equal(
    toStoredProfileRecordFromEntry({
      ts: '2026-01-01T00:00:00.000Z',
      output: {
        type: 'WritingIdentityProfile',
        mailboxAddress: 'not-email',
        version: 1,
        source: 'manual',
        profile: {},
      },
    }),
    null
  );
});

test('toProfilesByMailboxMap returns empty object for non-array records', () => {
  assert.deepEqual(toProfilesByMailboxMap(null), {});
  assert.deepEqual(toProfilesByMailboxMap(undefined), {});
  assert.deepEqual(toProfilesByMailboxMap('not-array'), {});
});

test('toStoredProfileRecordFromEntry accepts mailboxId when mailboxAddress missing', () => {
  const rec = toStoredProfileRecordFromEntry({
    ts: '2026-04-01T10:00:00.000Z',
    output: {
      type: 'WritingIdentityProfile',
      mailboxId: 'IdUser@Clinic.SE',
      version: 1,
      source: 'auto',
      profile: { greetingStyle: 'Hej,' },
    },
  });
  assert.equal(rec.mailbox, 'iduser@clinic.se');
  assert.equal(rec.source, 'auto');
});

test('toStoredProfileRecordFromEntry defaults invalid version to 1', () => {
  const rec = toStoredProfileRecordFromEntry({
    ts: '2026-04-01T10:00:00.000Z',
    output: {
      type: 'WritingIdentityProfile',
      mailboxAddress: 'v@clinic.se',
      version: Number.NaN,
      source: 'manual',
      profile: {},
    },
  });
  assert.equal(rec.version, 1);
});

test('toStoredProfileRecordFromEntry maps unknown source string to auto', () => {
  const rec = toStoredProfileRecordFromEntry({
    ts: '2026-04-01T10:00:00.000Z',
    output: {
      type: 'WritingIdentityProfile',
      mailboxAddress: 's@clinic.se',
      version: 1,
      source: 'imported',
      profile: {},
    },
  });
  assert.equal(rec.source, 'auto');
});

test('listWritingIdentityProfiles clamps list limit between 1 and 5000', async () => {
  let lastLimit;
  const store = {
    entries: [],
    async append() {},
    async list(opts) {
      lastLimit = opts.limit;
      return [];
    },
  };
  await listWritingIdentityProfiles({ analysisStore: store, tenantId: 't-1', limit: 99999 });
  assert.equal(lastLimit, 5000);
  await listWritingIdentityProfiles({ analysisStore: store, tenantId: 't-1', limit: 1 });
  assert.equal(lastLimit, 1);
});
