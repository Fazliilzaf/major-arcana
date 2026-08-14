'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createCcoPatientAssetStore } = require('../../src/ops/ccoPatientAssetStore');
const { parseArgs, CONFIDENCE_ORDER } = require('../../scripts/apply-proposed-document-dates');

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'arcana-apply-document-dates-'));
}

test('parseArgs requires --patient-assets-store och --proposals', () => {
  assert.throws(() => parseArgs(['node', 'script']), /--patient-assets-store/);
  assert.throws(() => parseArgs(['node', 'script', '--patient-assets-store', 'x']), /--proposals/);
  const args = parseArgs(['node', 'script', '--patient-assets-store', 'x', '--proposals', 'y']);
  assert.equal(args.commit, false);
  assert.equal(args.minConfidence, 'high');
});

test('CONFIDENCE_ORDER rankar high > medium > low', () => {
  assert.ok(CONFIDENCE_ORDER.high > CONFIDENCE_ORDER.medium);
  assert.ok(CONFIDENCE_ORDER.medium > CONFIDENCE_ORDER.low);
});

// Bugbot-fynd (2026-08-14, PR #1381, Medium): skrivningar mot patientdata
// gick utan audit-logg. auditPath skickas via ARCANA_CCO_AUDIT_PATH,
// samma mönster som backfill-asset-display-names.js.
test('--commit skriver en audit-loggpost via ARCANA_CCO_AUDIT_PATH (Bugbot Medium-fynd)', async () => {
  const dir = await makeDir();
  const assetsPath = path.join(dir, 'cco-patient-assets.json');
  const auditPath = path.join(dir, 'cco-audit.jsonl');
  const proposalsPath = path.join(dir, 'proposals.json');

  const assetStore = await createCcoPatientAssetStore({ filePath: assetsPath });
  const asset = await assetStore.addAsset({
    patientId: 'p1',
    sourceSystem: 'drive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    originalFileName: 'journal-tp-note.pdf',
  });

  await fs.writeFile(
    proposalsPath,
    JSON.stringify({
      patients: [
        {
          proposals: [
            {
              assetId: asset.id,
              proposedDocumentDate: '2026-03-05',
              confidence: 'high',
            },
          ],
        },
      ],
    })
  );

  assert.equal(fsSync.existsSync(auditPath), false, 'ingen audit-logg innan körning');

  const scriptPath = path.join(__dirname, '../../scripts/apply-proposed-document-dates.js');
  const out = execFileSync(
    'node',
    [
      scriptPath,
      '--patient-assets-store',
      assetsPath,
      '--proposals',
      proposalsPath,
      '--min-confidence',
      'high',
      '--commit',
    ],
    { encoding: 'utf8', env: { ...process.env, ARCANA_CCO_AUDIT_PATH: auditPath } }
  );
  const result = JSON.parse(out);
  assert.equal(result.mode, 'commit');
  assert.equal(result.changed, 1);

  assert.equal(
    fsSync.existsSync(auditPath),
    true,
    'audit-loggfil ska ha skapats av --commit-körningen'
  );
  const auditLines = fsSync.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.ok(auditLines.length >= 1, 'minst en audit-post ska ha skrivits');
  const lastEntry = JSON.parse(auditLines[auditLines.length - 1]);
  assert.equal(lastEntry.action, 'asset.naming_metadata_updated');

  // Läs om storen från disk — assetStore-objektet ovan skapades i den här
  // (förälder-)processen INNAN execFileSync-barnprocessen skrev; den ser
  // aldrig barnets skrivning i sitt eget minne.
  const reloadedStore = await createCcoPatientAssetStore({ filePath: assetsPath });
  const updated = await reloadedStore.getAsset(asset.id);
  assert.equal(updated.documentDate, '2026-03-05');
  assert.equal(updated.documentDateSource, 'journal_date_extracted');

  await fs.rm(dir, { recursive: true, force: true });
});

test('utan --commit (dry-run) skrivs ingen audit-logg', async () => {
  const dir = await makeDir();
  const assetsPath = path.join(dir, 'cco-patient-assets.json');
  const auditPath = path.join(dir, 'cco-audit.jsonl');
  const proposalsPath = path.join(dir, 'proposals.json');

  const assetStore = await createCcoPatientAssetStore({ filePath: assetsPath });
  const asset = await assetStore.addAsset({
    patientId: 'p1',
    sourceSystem: 'drive_import',
    status: 'VISIBLE_ON_PATIENT_CARD',
    mimeType: 'application/pdf',
    category: 'journal',
    originalFileName: 'journal-tp-note.pdf',
  });

  await fs.writeFile(
    proposalsPath,
    JSON.stringify({
      patients: [
        {
          proposals: [
            { assetId: asset.id, proposedDocumentDate: '2026-03-05', confidence: 'high' },
          ],
        },
      ],
    })
  );

  const scriptPath = path.join(__dirname, '../../scripts/apply-proposed-document-dates.js');
  const out = execFileSync(
    'node',
    [scriptPath, '--patient-assets-store', assetsPath, '--proposals', proposalsPath],
    { encoding: 'utf8', env: { ...process.env, ARCANA_CCO_AUDIT_PATH: auditPath } }
  );
  const result = JSON.parse(out);
  assert.equal(result.mode, 'dry-run');
  // createCcoAuditLog rör vid filen (skapar den tom) redan vid
  // konstruktion, oavsett läge — rätt kontroll är att INGEN post
  // skrevs, inte att filen saknas.
  const auditLines = fsSync.existsSync(auditPath)
    ? fsSync.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean)
    : [];
  assert.equal(auditLines.length, 0, 'dry-run ska inte skriva någon audit-post');

  const reloadedStore = await createCcoPatientAssetStore({ filePath: assetsPath });
  const stillUnchanged = await reloadedStore.getAsset(asset.id);
  assert.equal(stillUnchanged.documentDate, null, 'dry-run ska inte skriva documentDate');

  await fs.rm(dir, { recursive: true, force: true });
});
