const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuthStore } = require('../../src/security/authStore');

test('verifyAuditIntegrity ok on empty audit log', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-empty-'));
  const filePath = path.join(tempDir, 'auth.json');
  await fs.writeFile(filePath, JSON.stringify({ users: {}, memberships: {}, sessions: {}, pendingLogins: {}, pendingMfaChallenges: {}, auditEvents: [] }, null, 2), 'utf8');

  const store = await createAuthStore({
    filePath,
    sessionTtlMs: 3600000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 600000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  const report = await store.verifyAuditIntegrity({ maxIssues: 50 });
  assert.equal(report.ok, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.checkedEvents, 0);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('verifyAuditIntegrity ok after sequential addAuditEvent', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-chain-'));
  const filePath = path.join(tempDir, 'auth.json');

  const store = await createAuthStore({
    filePath,
    sessionTtlMs: 3600000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 600000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });

  await store.addAuditEvent({ action: 'test.one', outcome: 'success' });
  await store.addAuditEvent({ action: 'test.two', outcome: 'success' });
  await store.addAuditEvent({ action: 'test.three', outcome: 'success' });

  const report = await store.verifyAuditIntegrity({ maxIssues: 50 });
  assert.equal(report.ok, true);
  assert.equal(report.issues.length, 0);
  assert.equal(report.checkedEvents, 3);
  assert.equal(report.totalEvents, 3);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('verifyAuditIntegrity detects hash tampering on disk', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-audit-tamper-'));
  const filePath = path.join(tempDir, 'auth.json');

  const store = await createAuthStore({
    filePath,
    sessionTtlMs: 3600000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 600000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  await store.addAuditEvent({ action: 'test.before', outcome: 'success' });
  await store.addAuditEvent({ action: 'test.tamper_target', outcome: 'success' });

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const last = raw.auditEvents[raw.auditEvents.length - 1];
  last.hash = `${'a'.repeat(63)}b`;
  await fs.writeFile(filePath, JSON.stringify(raw, null, 2), 'utf8');

  const store2 = await createAuthStore({
    filePath,
    sessionTtlMs: 3600000,
    sessionIdleTtlMs: 0,
    loginTicketTtlMs: 600000,
    auditAppendOnly: true,
    auditMaxEntries: 5000,
  });
  const report = await store2.verifyAuditIntegrity({ maxIssues: 50 });
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.type === 'hash_mismatch'));

  await fs.rm(tempDir, { recursive: true, force: true });
});
