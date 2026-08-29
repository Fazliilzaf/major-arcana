#!/usr/bin/env node
'use strict';

/**
 * repairDanglingStorageKeys — rätta kvitton vars storageKey pekar på en fil
 * som aldrig skrevs till disk.
 *
 * Rotorsak: cfoReceiptStore.uploadReceipt ignorerade returvärdet från
 * secureStorage.putObject. När samma checksum redan fanns lagrat
 * returnerade putObject den befintliga nyckeln, men kvittot sparades med
 * en ny, påhittad nyckel. Det gav kvitton som pekar på icke-existerande filer.
 *
 * Denna rättning letar upp motsvarande fil i checksum-indexet (samma checksum)
 * och uppdaterar kvittot att peka på den befintliga filen. Om ingen fil finns
 * markeras kvittot för manuell granskning.
 *
 * Torrkörning som standard — sätt DRY_RUN=false för att skriva.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const scanFiles = ['true', '1', 'yes'].includes(
  String(process.env.SCAN_FILES || 'false').toLowerCase()
);
const stateRoot = process.env.ARCANA_STATE_ROOT || '/var/data';
const receiptStorePath =
  process.env.RECEIPT_STORE_PATH || path.join(stateRoot, 'cco', 'receipts.json');
const secureStorageRoot =
  process.env.ARCANA_CCO_SECURE_STORAGE_ROOT || path.join(stateRoot, 'cco-secure-storage');
const indexPath = path.join(secureStorageRoot, '.index.json');

function nowIso() {
  return new Date().toISOString();
}

function fileExists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function main() {
  console.log(
    `[dangling-repair] start — dryRun=${dryRun}, receiptStore=${receiptStorePath}, secureStorageRoot=${secureStorageRoot}`
  );

  if (!fileExists(receiptStorePath)) {
    console.error(`[dangling-repair] receipt store not found: ${receiptStorePath}`);
    process.exit(1);
  }
  if (!fileExists(indexPath)) {
    console.error(`[dangling-repair] checksum index not found: ${indexPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(receiptStorePath, 'utf8'));
  if (!Array.isArray(data.receipts)) {
    console.error('[dangling-repair] receipts array missing');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const report = {
    runAt: nowIso(),
    dryRun,
    inspected: 0,
    alreadyOk: 0,
    fixedByIndex: 0,
    fixedByFileScan: 0,
    markedNeedsReview: 0,
    failed: 0,
  };

  // För snabb uppslagning av filer per checksum: bygg en karta från filsystemet.
  // Detta hanterar fall där index saknas eller är inaktuellt. Default av —
  // full diskscan av stor secure storage tar för lång tid.
  const checksumToFile = new Map();
  if (scanFiles) {
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
        } else if (e.isFile() && !e.name.startsWith('.')) {
          const sum = sha256File(full);
          const rel = path.relative(secureStorageRoot, full);
          const list = checksumToFile.get(sum) || [];
          list.push(rel);
          checksumToFile.set(sum, list);
        }
      }
    };
    walk(secureStorageRoot);
    console.log(`[dangling-repair] scanned ${checksumToFile.size} unique checksums on disk`);
  }

  for (const r of data.receipts) {
    report.inspected += 1;
    const abs = path.join(secureStorageRoot, r.storageKey || '');

    // Om filen redan finns är allt OK.
    if (fileExists(abs)) {
      report.alreadyOk += 1;
      continue;
    }

    // Hitta en fil med samma checksum antingen via indexet eller via filscan.
    const checksum = r.checksum;
    let candidate = null;

    const indexEntry = index[checksum];
    if (indexEntry?.key) {
      const indexAbs = path.join(secureStorageRoot, indexEntry.key);
      if (fileExists(indexAbs)) {
        candidate = indexEntry.key;
        report.fixedByIndex += 1;
      }
    }

    if (!candidate && scanFiles && checksumToFile.has(checksum)) {
      const candidates = checksumToFile.get(checksum);
      if (candidates.length > 0) {
        candidate = candidates[0];
        report.fixedByFileScan += 1;
      }
    }

    if (candidate) {
      const oldKey = r.storageKey;
      if (!dryRun) {
        r.storageKey = candidate;
        r.updatedAt = nowIso();
        if (!Array.isArray(r.history)) r.history = [];
        r.history.push({
          status: 'repaired_storage_key',
          at: nowIso(),
          by: { userId: 'system', role: 'system' },
          reason: `dangling key ${oldKey} → ${candidate} (checksum match)`,
        });
      }
      console.log(
        `[dangling-repair] ${r.id} ${r.supplier || '(no supplier)'}: ${oldKey} → ${candidate}`
      );
    } else {
      report.markedNeedsReview += 1;
      if (!dryRun) {
        r.status = 'needs_review';
        r.updatedAt = nowIso();
        if (!Array.isArray(r.history)) r.history = [];
        r.history.push({
          status: 'needs_review',
          at: nowIso(),
          by: { userId: 'system', role: 'system' },
          reason: `dangling storageKey ${r.storageKey} and no file found for checksum ${checksum}`,
        });
        r.notes = r.notes
          ? `${r.notes}\n[AUDIT] dangling storageKey, file missing for checksum ${checksum}`
          : `[AUDIT] dangling storageKey, file missing for checksum ${checksum}`;
      }
      console.log(
        `[dangling-repair] ${r.id} ${r.supplier || '(no supplier)'}: FILE STILL MISSING — marked needs_review`
      );
    }
  }

  if (!dryRun) {
    data.updatedAt = nowIso();
    fs.writeFileSync(receiptStorePath, JSON.stringify(data, null, 2));
    console.log(`[dangling-repair] wrote updated receipts.json`);
  }

  const reportPath = path.join(
    stateRoot,
    `dangling-storage-key-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[dangling-repair] report written to: ${reportPath}`);
  console.log(
    `[dangling-repair] inspected=${report.inspected}, alreadyOk=${report.alreadyOk}, fixedByIndex=${report.fixedByIndex}, fixedByFileScan=${report.fixedByFileScan}, markedNeedsReview=${report.markedNeedsReview}, failed=${report.failed}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[dangling-repair] fatal:', err);
  process.exit(1);
});
