const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createPersistentExecutiveDecisionFeed } = require('../../src/ops/executiveDecisionFeed');
const { loadExecutiveFeedEntries } = require('../../src/ops/executiveDecisionFeedStore');

// ORD: polla tills disk-tillståndet hunnit skrivas i stället för en fast 30ms-sömn,
// som slår fel under full last (flaky test).
async function waitUntil(fn, predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() >= deadline) return value;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

test('persistent executive feed survives reload from disk', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-feed-persist-'));
  const filePath = path.join(tempDir, 'executive-decision-feed.json');

  const feed = await createPersistentExecutiveDecisionFeed({ filePath });
  const entry = feed.add({
    agent: 'CAO',
    severity: 'high',
    recommendation: 'Test persistence',
    requiredOwnerAction: true,
    actionType: 'assign_owner',
  });
  assert.ok(entry.id);

  const onDisk = await waitUntil(
    () => loadExecutiveFeedEntries(filePath),
    (v) => v.length >= 1
  );
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].id, entry.id);

  const reloaded = await createPersistentExecutiveDecisionFeed({ filePath });
  assert.equal(reloaded.list().length, 1);

  const resolved = reloaded.resolve({ entryId: entry.id, resolvedBy: 'owner-test' });
  assert.equal(resolved.status, 'acknowledged');

  const afterResolve = await waitUntil(
    () => loadExecutiveFeedEntries(filePath),
    (v) => v.length >= 1 && v[0].status === 'acknowledged'
  );
  assert.equal(afterResolve[0].status, 'acknowledged');
});

test('createPersistentExecutiveDecisionFeed exposes persistPath', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cao-feed-path-'));
  const filePath = path.join(tempDir, 'feed.json');
  const feed = await createPersistentExecutiveDecisionFeed({ filePath });
  assert.equal(feed.persistPath, filePath);
});
