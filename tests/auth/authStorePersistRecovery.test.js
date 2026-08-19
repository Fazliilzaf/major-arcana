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

test('auth store serializes concurrent save() calls to at most two writes', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-auth-save-serialize-'));
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

  // Slow down writes to this store only so the concurrent createSession calls
  // are guaranteed to overlap. Without serialization they would all write in
  // parallel; with it at most two writes overlap (current + one follow-up).
  const originalWriteFile = fs.writeFile;
  let activeWrites = 0;
  let maxConcurrentWrites = 0;
  let writesToAuth = 0;
  fs.writeFile = async (...args) => {
    const targetPath = args[0];
    if (typeof targetPath === 'string' && targetPath.startsWith(tempDir)) {
      writesToAuth += 1;
      activeWrites += 1;
      maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 40));
      try {
        return await originalWriteFile(...args);
      } finally {
        activeWrites -= 1;
      }
    }
    return originalWriteFile(...args);
  };

  try {
    const sessions = await Promise.all(
      Array.from({ length: 5 }, () =>
        authStore.createSession({
          userId: bootstrapped.user.id,
          membershipId: bootstrapped.membership.id,
        })
      )
    );

    assert.equal(sessions.length, 5);
    assert.ok(
      sessions.every((s) => s?.token),
      'every session got a token'
    );
    assert.ok(
      maxConcurrentWrites <= 2,
      `max concurrent writes was ${maxConcurrentWrites}, expected <= 2`
    );
    assert.ok(writesToAuth >= 2, `expected at least 2 writes, got ${writesToAuth}`);
  } finally {
    fs.writeFile = originalWriteFile;
  }

  const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(Object.keys(persisted.sessions).length, 5);

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
