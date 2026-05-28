const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  inspectMailboxTruthLayout,
  restoreMailboxTruthShards,
} = require('../../src/ops/ccoMailboxTruthRestore');

test('restoreMailboxTruthShards restores empty shard from migrated backup', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'truth-restore-'));
  const stateRoot = path.join(tempDir, 'data');
  const shardDir = path.join(stateRoot, 'cco-mailbox-truth');
  const mailboxesDir = path.join(shardDir, 'mailboxes');
  await fs.mkdir(mailboxesDir, { recursive: true });

  const monolith = {
    version: 1,
    accounts: {
      'contact@hairtpclinic.com': { mailboxId: 'contact@hairtpclinic.com' },
      'fazli@hairtpclinic.com': { mailboxId: 'fazli@hairtpclinic.com' },
    },
    folders: {},
    messages: {
      m1: { id: 'm1', mailboxId: 'contact@hairtpclinic.com', subject: 'A' },
      m2: { id: 'm2', mailboxId: 'contact@hairtpclinic.com', subject: 'B' },
      m3: { id: 'm3', mailboxId: 'fazli@hairtpclinic.com', subject: 'C' },
    },
    conversations: {},
    syncCheckpoints: {},
  };

  const backupPath = path.join(stateRoot, 'cco-mailbox-truth.json.migrated.123.bak');
  await fs.writeFile(backupPath, JSON.stringify(monolith), 'utf8');

  const fazliShardPath = path.join(mailboxesDir, 'fazli_hairtpclinic_com.json');
  await fs.writeFile(
    fazliShardPath,
    JSON.stringify({
      version: 1,
      accounts: { 'fazli@hairtpclinic.com': { mailboxId: 'fazli@hairtpclinic.com' } },
      messages: {
        live1: { id: 'live1', mailboxId: 'fazli@hairtpclinic.com' },
        live2: { id: 'live2', mailboxId: 'fazli@hairtpclinic.com' },
      },
      folders: {},
      conversations: {},
      syncCheckpoints: {},
    }),
    'utf8'
  );

  const config = {
    stateRoot,
    ccoMailboxTruthStorePath: path.join(stateRoot, 'cco-mailbox-truth.json'),
    ccoMailboxTruthShardDir: shardDir,
  };

  const preview = await restoreMailboxTruthShards({
    config,
    mailboxIds: ['contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
    apply: false,
  });
  assert.equal(
    preview.actions.find((row) => row.mailboxId.includes('contact')).shouldRestore,
    true
  );
  assert.equal(preview.actions.find((row) => row.mailboxId.includes('fazli')).shouldRestore, false);

  const applied = await restoreMailboxTruthShards({
    config,
    mailboxIds: ['contact@hairtpclinic.com', 'fazli@hairtpclinic.com'],
    apply: true,
  });
  assert.equal(applied.actions.filter((row) => row.restored).length, 1);

  const layout = await inspectMailboxTruthLayout(config);
  const contactShard = layout.shards.find((row) => row.fileName.includes('contact'));
  assert.equal(contactShard.messageCount, 2);

  await fs.rm(tempDir, { recursive: true, force: true });
});
