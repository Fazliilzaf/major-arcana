const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getWritingIdentityProfile,
  listWritingIdentityProfiles,
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
