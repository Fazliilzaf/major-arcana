const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createAuthStore,
  sanitizeAuditMetadata,
  summarizeAuditJobResult,
} = require('../../src/security/authStore');

function buildAuditEvent(index) {
  return {
    id: `event-${index}`,
    ts: new Date().toISOString(),
    tenantId: 'tenant-a',
    actorUserId: 'user-1',
    action: 'test.action',
    outcome: 'success',
    targetType: 'test',
    targetId: String(index),
    metadata: { index },
    chainVersion: 1,
    seq: index + 1,
    prevHash: null,
    hash: 'a'.repeat(64),
  };
}

test('authStore rotates overflow audit events to monthly archive without touching users', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-audit-rotate-'));
  const filePath = path.join(tempDir, 'auth.json');
  const auditEvents = Array.from({ length: 12 }, (_, index) => buildAuditEvent(index));

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        users: {
          'user-1': {
            id: 'user-1',
            email: 'owner@example.com',
            status: 'active',
          },
        },
        memberships: {
          'membership-1': {
            id: 'membership-1',
            userId: 'user-1',
            tenantId: 'tenant-a',
            role: 'OWNER',
            status: 'active',
          },
        },
        sessions: {},
        pendingLogins: {},
        pendingMfaChallenges: {},
        auditEvents,
      },
      null,
      2
    ),
    'utf8'
  );

  const store = await createAuthStore({
    filePath,
    sessionTtlMs: 60 * 60 * 1000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5,
  });

  const user = await store.getUserById('user-1');
  assert.equal(user?.email, 'owner@example.com');

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(raw.auditEvents.length, 5);
  assert.equal(Object.keys(raw.users).length, 1);

  const ym = new Date().toISOString().slice(0, 7).replace('-', '');
  const archivePath = `${filePath}.archive-${ym}.jsonl`;
  const archiveRaw = await fs.readFile(archivePath, 'utf8');
  const archiveLines = archiveRaw.trim().split('\n');
  assert.equal(archiveLines.length, 7);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('sanitizeAuditMetadata compacts scheduler result payloads', () => {
  const hugeResult = {
    ok: true,
    jobId: 'cco_truth_delta_sync',
    trigger: 'manual_api',
    durationMs: 42,
    details: {
      messages: new Array(200).fill({ id: 'x'.repeat(200), body: 'y'.repeat(500) }),
    },
  };

  const summarized = summarizeAuditJobResult(hugeResult);
  assert.equal(summarized.ok, true);
  assert.equal(summarized.jobId, 'cco_truth_delta_sync');
  assert.equal(summarized.details, undefined);

  const metadata = sanitizeAuditMetadata({ result: hugeResult, correlationId: 'corr-1' });
  const bytes = Buffer.byteLength(JSON.stringify(metadata), 'utf8');
  assert.ok(bytes <= 2048);
  assert.equal(metadata.correlationId, 'corr-1');
  assert.equal(metadata.result.ok, true);
});

test('addAuditEvent stores compact metadata for large scheduler results', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-audit-meta-'));
  const filePath = path.join(tempDir, 'auth.json');
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        users: {},
        memberships: {},
        sessions: {},
        pendingLogins: {},
        pendingMfaChallenges: {},
        auditEvents: [],
      },
      null,
      2
    ),
    'utf8'
  );

  const store = await createAuthStore({
    filePath,
    sessionTtlMs: 60 * 60 * 1000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 100,
  });

  await store.addAuditEvent({
    tenantId: 'tenant-a',
    actorUserId: null,
    action: 'ops.test.run_job',
    outcome: 'success',
    targetType: 'scheduler_job',
    targetId: 'test_job',
    metadata: {
      result: {
        ok: true,
        jobId: 'test_job',
        payload: new Array(100).fill({ blob: 'z'.repeat(400) }),
      },
    },
  });

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const event = raw.auditEvents[0];
  const metadataBytes = Buffer.byteLength(JSON.stringify(event.metadata), 'utf8');
  assert.ok(metadataBytes <= 2048);
  assert.equal(event.metadata.result.ok, true);

  await fs.rm(tempDir, { recursive: true, force: true });
});
