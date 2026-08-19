/**
 * Retention för engångsbackuper bredvid statefilerna.
 *
 * Bakgrund: pruneBackups() städar backupDir. Men migreringar och restore-
 * körningar skriver sina backuper BREDVID källfilen — i shard-katalogen under
 * stateRoot — och har därför aldrig städats av något. Mätt på prod 2026-08-19:
 * 2,38 GB fördelat på .bak, .pre-*.json och .archived-*.json, varav en
 * .migrated.-fil från shardningen tre månader tidigare.
 *
 * Den egenskap som måste hålla är INTE att gamla filer försvinner — det är att
 * levande statefiler aldrig kan träffas. Därför testas det först och hårdast.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  pruneRetainableBackupsInDirectory,
  isRetainableBackupFileName,
} = require('../../src/ops/startupDiskGuard');

const DAY_MS = 24 * 60 * 60 * 1000;

async function skrivFil(filePath, { innehall = 'x', alderDagar = 0 } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, innehall, 'utf8');
  if (alderDagar > 0) {
    const tid = new Date(Date.now() - alderDagar * DAY_MS);
    await fs.utimes(filePath, tid, tid);
  }
}

async function finns(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

// ── Säkerhet: levande state får aldrig matcha ────────────────────────────────

test('levande statefiler matchar inget mönster, oavsett ålder', () => {
  const levande = [
    'cco-mailbox-truth.json',
    'cco-patient-assets.json',
    'auth-store.json',
    'cco-customers.json',
    'tenant-config.json',
    // Shardfiler och sidofiler från body-externaliseringen.
    'cco-mailbox-truth.shard-00.json',
    'a3f9c1d2e4b5.json',
    'mail-ingestion.json',
    // Snarlika men inte backuper: ordet "pre" i ett annat sammanhang.
    'cco-prescriptions.json',
    'preflight-report.json',
    'cco-premium-tier.json',
  ];
  for (const fileName of levande) {
    assert.equal(
      isRetainableBackupFileName(fileName),
      false,
      `${fileName} klassades som backup — den hade raderats i produktion`
    );
  }
});

test('faktiska backupnamn från kodvägarna känns igen', () => {
  const backuper = [
    // src/ops/ccoMailboxTruthBodyMigration.js
    'cco-mailbox-truth.json.1787144075419.pre-body-migration.bak',
    // src/ops/ccoMailboxTruthRestore.js
    'shard-07.json.pre-restore.1787145125861.bak',
    // src/ops/ccoMailboxTruthShardedStore.js
    'cco-mailbox-truth.json.migrated.1779923516172.bak',
    // scripts/backfill-cliento-source-id-from-bookings.js
    'cco-patients.json.pre-sourceid-backfill-2026-08-19T17-12-00-000Z.json',
    // scripts/backfill-journal-pdfs.js
    'cco-journals.json.pre-pdf-backfill-20260819T171200.bak',
    // Manuellt skapat arkiv (låg på prod, saknar kodväg i repot).
    'cco-customers.json.archived-2026-05-01.json',
  ];
  for (const fileName of backuper) {
    assert.equal(isRetainableBackupFileName(fileName), true, `${fileName} känns inte igen`);
  }
});

test('en .bak utan markör lämnas i fred (ORD-71-principen)', () => {
  assert.equal(isRetainableBackupFileName('cco-mailbox-truth.json.oversize.bak'), false);
  assert.equal(isRetainableBackupFileName('nagot.bak'), false);
});

// ── Beteende ─────────────────────────────────────────────────────────────────

test('raderar backuper äldre än gränsen, behåller yngre', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-'));
  const gammal = path.join(dir, 'cco-mailbox-truth.json.migrated.1779923516172.bak');
  const ung = path.join(dir, 'cco-mailbox-truth.json.1787144075419.pre-body-migration.bak');
  const levande = path.join(dir, 'cco-mailbox-truth.json');

  await skrivFil(gammal, { alderDagar: 90 });
  await skrivFil(ung, { alderDagar: 1 });
  await skrivFil(levande, { alderDagar: 365 });

  const { deleted, kept } = await pruneRetainableBackupsInDirectory({
    directoryPath: dir,
    olderThanMs: 30 * DAY_MS,
  });

  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].fileName, path.basename(gammal));
  assert.equal(await finns(gammal), false);
  assert.equal(await finns(ung), true, 'en dag gammal backup ska överleva');
  assert.equal(await finns(levande), true, 'den levande statefilen får aldrig röras');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].reason, 'too_young');
});

test('hittar backuper i underkataloger — shard-backuperna ligger inte platt', async () => {
  // Detta är hela poängen med rekursionen. pruneOversizeBackupsInDirectory
  // gör en platt readdir() och hade missat exakt de filer som väger mest.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-'));
  const djup = path.join(dir, 'shards', 'mail-ingestion', 'a3.json.pre-restore.1779923516172.bak');
  await skrivFil(djup, { alderDagar: 60 });

  const { deleted } = await pruneRetainableBackupsInDirectory({
    directoryPath: dir,
    olderThanMs: 30 * DAY_MS,
  });

  assert.equal(deleted.length, 1);
  assert.equal(await finns(djup), false);
});

test('torrkörning raderar ingenting men rapporterar kandidaterna', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-'));
  const gammal = path.join(dir, 'cco-mailbox-truth.json.migrated.1779923516172.bak');
  await skrivFil(gammal, { innehall: 'x'.repeat(1024), alderDagar: 90 });

  const { deleted } = await pruneRetainableBackupsInDirectory({
    directoryPath: dir,
    olderThanMs: 30 * DAY_MS,
    dryRun: true,
  });

  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].dryRun, true);
  assert.equal(deleted[0].sizeBytes, 1024);
  assert.equal(await finns(gammal), true, 'torrkörning får inte radera');
});

test('åldern räknas från mtime, inte från tidsstämpeln i filnamnet', async () => {
  // Namnet påstår 1779923516172 (maj 2026) men filen rördes nyss. mtime vinner,
  // annars hade en nyss återskapad backup raderats direkt.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-'));
  const fil = path.join(dir, 'cco-mailbox-truth.json.migrated.1779923516172.bak');
  await skrivFil(fil, { alderDagar: 0 });

  const { deleted, kept } = await pruneRetainableBackupsInDirectory({
    directoryPath: dir,
    olderThanMs: 30 * DAY_MS,
  });

  assert.equal(deleted.length, 0);
  assert.equal(kept.length, 1);
  assert.equal(await finns(fil), true);
});

test('respekterar maxDepth och kraschar inte på tom katalog', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-'));
  const forDjupt = path.join(dir, 'a', 'b', 'c', 'd', 'e', 'x.json.migrated.1779923516172.bak');
  await skrivFil(forDjupt, { alderDagar: 90 });

  const { deleted } = await pruneRetainableBackupsInDirectory({
    directoryPath: dir,
    olderThanMs: 30 * DAY_MS,
    maxDepth: 2,
  });

  assert.equal(deleted.length, 0);
  assert.equal(await finns(forDjupt), true);

  const tom = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-retention-tom-'));
  const resultat = await pruneRetainableBackupsInDirectory({ directoryPath: tom });
  assert.deepEqual(resultat, { deleted: [], kept: [] });
});
