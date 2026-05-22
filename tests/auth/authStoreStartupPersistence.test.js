const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuthStore } = require('../../src/security/authStore');

function buildState(overrides = {}) {
  return {
    users: {},
    memberships: {},
    sessions: {},
    pendingLogins: {},
    pendingMfaChallenges: {},
    auditEvents: [],
    ...overrides,
  };
}

test('createAuthStore does not rewrite auth file on startup when state is clean', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-startup-clean-'));
  const filePath = path.join(tempDir, 'auth.json');
  await fs.writeFile(filePath, JSON.stringify(buildState(), null, 2), 'utf8');
  const before = await fs.stat(filePath);
  await new Promise((resolve) => setTimeout(resolve, 20));

  await createAuthStore({
    filePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  const after = await fs.stat(filePath);
  assert.equal(after.mtimeMs, before.mtimeMs);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('createAuthStore persists pruned auth state on startup when expired entries exist', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-startup-prune-'));
  const filePath = path.join(tempDir, 'auth.json');
  const expiredAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  await fs.writeFile(
    filePath,
    JSON.stringify(
      buildState({
        sessions: {
          'session-1': {
            id: 'session-1',
            userId: 'user-1',
            membershipId: 'membership-1',
            tenantId: 'tenant-a',
            role: 'OWNER',
            tokenHash: 'token-hash',
            createdAt: nowIso,
            lastSeenAt: nowIso,
            expiresAt: expiredAt,
          },
        },
        pendingLogins: {
          ticket: {
            id: 'ticket-id',
            userId: 'user-1',
            membershipIds: ['membership-1'],
            createdAt: nowIso,
            expiresAt: expiredAt,
          },
        },
      }),
      null,
      2
    ),
    'utf8'
  );
  const before = await fs.stat(filePath);
  await new Promise((resolve) => setTimeout(resolve, 20));

  await createAuthStore({
    filePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  const after = await fs.stat(filePath);
  assert.ok(after.mtimeMs > before.mtimeMs);
  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(Object.keys(persisted.sessions || {}).length, 0);
  assert.equal(Object.keys(persisted.pendingLogins || {}).length, 0);
  await fs.rm(tempDir, { recursive: true, force: true });
});
