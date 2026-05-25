const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuthStore } = require('../../src/security/authStore');

test('createSession returns token even when auth store persist is blocked', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-persist-block-'));
  const filePath = path.join(tempDir, 'auth.json');

  const authStore = await createAuthStore({
    filePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 1500,
  });

  const bootstrapped = await authStore.bootstrapOwner({
    tenantId: 'hair-tp-clinic',
    email: 'staff@example.com',
    password: 'secret12345',
    forcePasswordReset: true,
    forceMfaReset: true,
  });

  await fs.chmod(tempDir, 0o500);

  const created = await authStore.createSession({
    userId: bootstrapped.user.id,
    membershipId: bootstrapped.membership.id,
  });

  assert.ok(created?.token);
  assert.ok(created?.session?.id);

  await fs.chmod(tempDir, 0o700);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('auth store save recovery trims audit tail after persist pressure', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-persist-trim-'));
  const filePath = path.join(tempDir, 'auth.json');
  const nowIso = new Date().toISOString();

  await fs.writeFile(
    filePath,
    JSON.stringify({
      users: {
        'user-1': {
          id: 'user-1',
          email: 'owner@example.com',
          passwordHash: 'hash',
          passwordSalt: 'salt',
          mfaRequired: false,
          mustChangePassword: false,
          mfaSecret: '',
          mfaRecoveryCodeHashes: [],
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      },
      memberships: {
        'membership-1': {
          id: 'membership-1',
          userId: 'user-1',
          tenantId: 'tenant-a',
          role: 'OWNER',
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      },
      sessions: {},
      pendingLogins: {},
      pendingMfaChallenges: {},
      auditEvents: new Array(3000).fill(null).map((_, index) => ({
        id: `event-${index}`,
        ts: nowIso,
        tenantId: 'tenant-a',
        actorUserId: 'user-1',
        action: 'auth.login',
        outcome: 'success',
        targetType: 'session',
        targetId: `session-${index}`,
        metadata: {},
        chainVersion: 1,
        seq: index + 1,
        prevHash: index === 0 ? null : 'a'.repeat(64),
        hash: 'b'.repeat(64),
      })),
    }),
    'utf8'
  );

  const authStore = await createAuthStore({
    filePath,
    sessionTtlMs: 12 * 60 * 60 * 1000,
    sessionIdleTtlMs: 3 * 60 * 60 * 1000,
    loginTicketTtlMs: 10 * 60 * 1000,
    auditAppendOnly: true,
    auditMaxEntries: 1500,
  });

  const created = await authStore.createSession({
    userId: 'user-1',
    membershipId: 'membership-1',
  });
  assert.ok(created?.token);

  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.ok(Array.isArray(persisted.auditEvents));
  assert.ok(persisted.auditEvents.length <= 1500);

  await fs.rm(tempDir, { recursive: true, force: true });
});
