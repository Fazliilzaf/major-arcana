const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createCcoMailboxTruthStore } = require('../../src/ops/ccoMailboxTruthStore');

test('mailbox truth store self-heals a corrupt JSON state file at startup', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-mailbox-truth-store-'));
  const filePath = path.join(tempDir, 'cco-mailbox-truth.json');
  await fs.writeFile(filePath, '{"version":1,"accounts":', 'utf8');

  const store = await createCcoMailboxTruthStore({ filePath });

  assert.equal(typeof store.getCompletenessReport, 'function');

  const repairedRaw = await fs.readFile(filePath, 'utf8');
  const repaired = JSON.parse(repairedRaw);
  assert.equal(repaired.version, 1);
  assert.deepEqual(repaired.accounts, {});
  assert.deepEqual(repaired.folders, {});
  assert.deepEqual(repaired.messages, {});
  assert.deepEqual(repaired.conversations, {});
  assert.deepEqual(repaired.syncCheckpoints, {});
  assert.deepEqual(repaired.syncRuns, []);

  const entries = await fs.readdir(tempDir);
  const backupName =
    entries.find((entry) => entry === 'cco-mailbox-truth.json.corrupt.bak') ||
    entries.find((entry) => entry.startsWith('cco-mailbox-truth.json.') && entry.endsWith('.corrupt.bak'));
  assert.equal(Boolean(backupName), true);

  const backupRaw = await fs.readFile(path.join(tempDir, backupName), 'utf8');
  assert.equal(backupRaw, '{"version":1,"accounts":');

  await fs.rm(tempDir, { recursive: true, force: true });
});
