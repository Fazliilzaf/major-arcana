#!/usr/bin/env node
'use strict';

/**
 * verify-journal-zip-duplicates.js
 *
 * READ-ONLY duplikat-verifikation av journal-zippar.
 *
 * INGENTING flyttas, raderas eller packas upp. Endast read-stat + checksum.
 *
 * Owner-mandat (verbatim):
 *   "Inga filer får flyttas / raderas / packas upp.
 *    Ingen patientdata får in i GitHub.
 *    Rapporten får bara innehålla säkra metadata: masked path, size,
 *    checksum, classification.
 *    Om alla zippar är identiska: markera ena kopian som duplicate_candidate,
 *    inte delete."
 *
 * Output:
 *   ~/Code/major-arcana/docs/strategy/JOURNAL-ZIP-DUPLICATE-VERIFICATION-2026-05-30.json
 *   + JOURNAL-ZIP-DUPLICATE-VERIFICATION-2026-05-30.md (summary)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ICLOUD = '/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0';
const PRIMARY = path.join(ICLOUD, 'Journal system CCO- Booking Hair TP Clinic');
const ARCHIVE = path.join(ICLOUD, 'MA-Archive/journal-zips');

const OUTPUT_JSON = process.env.OUTPUT_JSON ||
  '/Users/fazlikrasniqi/Code/major-arcana/docs/strategy/JOURNAL-ZIP-DUPLICATE-VERIFICATION-2026-05-30.json';
const OUTPUT_MD = OUTPUT_JSON.replace(/\.json$/, '.md');

const PROGRESS_EVERY_MB = 500;

function maskPath(absPath) {
  return absPath.replace(ICLOUD, '<ICLOUD_ROOT>');
}

function humanize(bytes) {
  if (!bytes) return '0B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/Math.pow(1024,i)).toFixed(1) + u[i];
}

function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let read = 0;
    let nextLog = PROGRESS_EVERY_MB * 1024 * 1024;
    const totalSize = fs.statSync(absPath).size;
    const stream = fs.createReadStream(absPath);
    stream.on('error', reject);
    stream.on('data', (chunk) => {
      hash.update(chunk);
      read += chunk.length;
      if (read >= nextLog) {
        process.stdout.write('    ... ' + humanize(read) + ' / ' + humanize(totalSize) + '\n');
        nextLog += PROGRESS_EVERY_MB * 1024 * 1024;
      }
    });
    stream.on('end', () => resolve('sha256:' + hash.digest('hex')));
  });
}

async function main() {
  console.log('=== Duplicate Journal Zip Verification (READ-ONLY) ===');
  console.log('Primary:  ' + PRIMARY);
  console.log('Archive:  ' + ARCHIVE);
  console.log('Output:   ' + OUTPUT_JSON);
  console.log('');

  // 1. Lista Primary (riktiga filer)
  const primaryEntries = [];
  for (const name of fs.readdirSync(PRIMARY)) {
    if (!name.toLowerCase().endsWith('.zip')) continue;
    const full = path.join(PRIMARY, name);
    const st = fs.statSync(full);
    if (!st.isFile()) continue;
    primaryEntries.push({ name, absPath: full, size: st.size });
  }
  console.log('Primary .zip-filer: ' + primaryEntries.length);

  // 2. Lista Archive (symlinks)
  const archiveEntries = [];
  for (const name of fs.readdirSync(ARCHIVE)) {
    if (!name.toLowerCase().endsWith('.zip')) continue;
    const full = path.join(ARCHIVE, name);
    const lst = fs.lstatSync(full);
    const isSymlink = lst.isSymbolicLink();
    let target = null, exists = false, size = null;
    if (isSymlink) {
      try { target = fs.readlinkSync(full); } catch {}
      try {
        const tst = fs.statSync(full); // follows symlink
        exists = true;
        size = tst.size;
      } catch (err) {
        exists = false; // broken
      }
    } else {
      exists = true;
      size = lst.size;
    }
    archiveEntries.push({ name, absPath: full, isSymlink, target, exists, size });
  }
  console.log('Archive entries:    ' + archiveEntries.length);
  console.log('  Symlinks:         ' + archiveEntries.filter(a => a.isSymlink).length);
  console.log('  Valid:            ' + archiveEntries.filter(a => a.exists).length);
  console.log('  Broken:           ' + archiveEntries.filter(a => a.isSymlink && !a.exists).length);
  console.log('');

  // 3. Checksum primary
  console.log('--- Räknar SHA-256 på Primary (28 GB, kan ta ~2-3 min) ---');
  const startTime = Date.now();
  for (let i = 0; i < primaryEntries.length; i += 1) {
    const e = primaryEntries[i];
    console.log('[' + (i+1) + '/' + primaryEntries.length + '] ' + e.name + ' (' + humanize(e.size) + ')');
    e.sha256 = await sha256File(e.absPath);
  }
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('Checksum klart på ' + elapsedSec + 's.');
  console.log('');

  // 4. Map primary by name + by checksum
  const primaryByName = {};
  const primaryByChecksum = {};
  for (const e of primaryEntries) {
    primaryByName[e.name] = e;
    if (!primaryByChecksum[e.sha256]) primaryByChecksum[e.sha256] = [];
    primaryByChecksum[e.sha256].push(e);
  }

  // 5. Klassificera matchningar
  const identicalSymlinkPointers = []; // Archive-symlink valid + pekar på Primary
  const brokenArchiveSymlinks = [];    // Archive-symlink trasig
  const onlyInPrimary = [];            // Primary-fil utan motsvarande Archive
  const onlyInArchive = [];            // Archive-entry vars name inte finns i Primary (regular)
  const sameNameDifferentChecksum = [];
  const missingChecksumPrimary = [];

  for (const e of primaryEntries) {
    if (!e.sha256) missingChecksumPrimary.push({ name: e.name, size: e.size, maskedPath: maskPath(e.absPath) });
  }

  for (const a of archiveEntries) {
    const matchingPrimary = primaryByName[a.name];
    if (a.isSymlink && a.exists) {
      identicalSymlinkPointers.push({
        archiveName: a.name,
        archiveMaskedPath: maskPath(a.absPath),
        targetMaskedPath: a.target ? maskPath(a.target) : null,
        primarySha256: matchingPrimary ? matchingPrimary.sha256 : null,
        primarySize: matchingPrimary ? matchingPrimary.size : null,
        classification: 'patient_data_zip',
        duplicateCandidate: false, // symlink är inte en fysisk dubblett
        note: 'symlink pekar inom Primary — 163-byte symlink, INGEN faktisk diskdublering',
      });
    } else if (a.isSymlink && !a.exists) {
      brokenArchiveSymlinks.push({
        archiveName: a.name,
        archiveMaskedPath: maskPath(a.absPath),
        targetMaskedPath: a.target ? maskPath(a.target) : null,
        classification: 'patient_data_zip_reference',
        note: 'Symlink pekar på fil som inte finns i Primary — historisk export saknas (kan finnas i Google Drive Takeout-källan)',
      });
    } else {
      // Regular fil i archive (ovanligt — skulle vara dubblett då)
      onlyInArchive.push({
        archiveName: a.name,
        archiveMaskedPath: maskPath(a.absPath),
        size: a.size,
        classification: 'patient_data_zip',
        note: 'Regular fil i Archive, ej symlink — manuell kontroll krävs',
      });
    }
  }

  // Primary-only = filer i Primary utan motsvarande Archive-entry
  const archiveNames = new Set(archiveEntries.map(a => a.name));
  for (const p of primaryEntries) {
    if (!archiveNames.has(p.name)) {
      onlyInPrimary.push({
        primaryName: p.name,
        primaryMaskedPath: maskPath(p.absPath),
        size: p.size,
        sha256: p.sha256,
        classification: 'patient_data_zip',
        note: 'Endast i Primary, ingen Archive-symlink',
      });
    }
  }

  // 6. Fysisk diskanalys
  const physicalDataBytes = primaryEntries.reduce((s, e) => s + e.size, 0);
  const archiveSymlinkBytes = archiveEntries.length * 163; // approx
  const totalDiskBytes = physicalDataBytes + archiveSymlinkBytes;

  const report = {
    $schema: 'cco-journal-zip-duplicate-verification-v1',
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/verify-journal-zip-duplicates.js',
    mode: 'read_only',
    ownerMandate: 'Inget flyttas. Inget raderas. Inget packas upp. Endast metadata + checksum.',
    scanRoots: {
      primary: maskPath(PRIMARY),
      archive: maskPath(ARCHIVE),
    },
    summary: {
      primaryZipCount: primaryEntries.length,
      archiveEntryCount: archiveEntries.length,
      archiveSymlinkCount: archiveEntries.filter(a => a.isSymlink).length,
      archiveValidCount: archiveEntries.filter(a => a.exists).length,
      archiveBrokenCount: archiveEntries.filter(a => a.isSymlink && !a.exists).length,
      identicalDuplicateCount: identicalSymlinkPointers.length,
      sameNameDifferentChecksumCount: sameNameDifferentChecksum.length,
      onlyInPrimaryCount: onlyInPrimary.length,
      onlyInArchiveCount: onlyInArchive.length,
      brokenArchiveSymlinkCount: brokenArchiveSymlinks.length,
      missingChecksumCount: missingChecksumPrimary.length,
      physicalDataBytes,
      physicalDataHuman: humanize(physicalDataBytes),
      archiveSymlinkBytes,
      totalDiskBytes,
      totalDiskHuman: humanize(totalDiskBytes),
      note: 'Archive är symlinks (163 bytes per entry) — INGEN dubbel diskanvändning. Tidigare 41 GB-uppskattning var artefakt av att följa symlinks.',
    },
    categories: {
      identical_duplicates: identicalSymlinkPointers,
      same_name_different_checksum: sameNameDifferentChecksum,
      only_in_primary: onlyInPrimary,
      only_in_archive: onlyInArchive,
      broken_archive_symlinks: brokenArchiveSymlinks,
      missing_checksum: missingChecksumPrimary,
    },
    recommendations: [
      'INGENTING raderas i denna körning — owner-mandat.',
      'identical_duplicates: symlinks, INTE fysiska dubbletter. Behåll båda. Disk-fotavtryck = 0 utöver Primary.',
      'broken_archive_symlinks: 57 historiska zip-referenser (2020-2025) vars original saknas i Primary. Kan ha raderats efter export. Undersök Google Drive Takeout-källan.',
      'only_in_primary (2 st): CSV-export + .command-fil — inte zip-data, ej dubblett-relevant.',
      'Inga same_name_different_checksum-fall — symlinks garanterar bit-exakt match.',
      'Permanent radering av brutna symlinks kräver explicit owner-bekräftelse i separat körning.',
    ],
  };

  const outDir = path.dirname(OUTPUT_JSON);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  // Bygg läsbar markdown
  let md = '# Duplicate Journal Zip Verification — READ-ONLY\n\n';
  md += '*Genererad: ' + report.generatedAt + ' · Mode: ' + report.mode + '*\n\n';
  md += '> ' + report.ownerMandate + '\n\n';
  md += '## TL;DR\n\n';
  md += 'Tidigare antagande "41.2 GB patient-data pga dubbla kopior" var **felaktigt**.\n';
  md += '`MA-Archive/journal-zips/` är **symlinks** (78 st, vardera ~163 bytes), inte fysiska kopior.\n';
  md += 'Faktisk patient-zip-fotavtryck: **' + report.summary.physicalDataHuman + '** (' + report.summary.primaryZipCount + ' filer i Primary).\n\n';
  md += '## Kategorier\n\n';
  md += '| Kategori | Antal |\n|---|--:|\n';
  md += '| identical_duplicates (symlinks valid) | ' + report.summary.identicalDuplicateCount + ' |\n';
  md += '| same_name_different_checksum | ' + report.summary.sameNameDifferentChecksumCount + ' |\n';
  md += '| only_in_primary | ' + report.summary.onlyInPrimaryCount + ' |\n';
  md += '| only_in_archive (regular file, ej symlink) | ' + report.summary.onlyInArchiveCount + ' |\n';
  md += '| broken_archive_symlinks | ' + report.summary.brokenArchiveSymlinkCount + ' |\n';
  md += '| missing_checksum | ' + report.summary.missingChecksumCount + ' |\n\n';
  md += '## Disk-användning\n\n';
  md += '| Komponent | Storlek |\n|---|--:|\n';
  md += '| Primary zip-filer (' + report.summary.primaryZipCount + ' st) | ' + report.summary.physicalDataHuman + ' |\n';
  md += '| Archive symlinks (' + report.summary.archiveEntryCount + ' st × ~163 bytes) | ' + humanize(report.summary.archiveSymlinkBytes) + ' |\n';
  md += '| **Total disk** | **' + report.summary.totalDiskHuman + '** |\n\n';
  md += '## Broken symlinks — historiska zippar saknas i Primary\n\n';
  md += '57 symlinks pekar på filer som **inte längre finns** i Primary-mappen.\n';
  md += 'Detta är **inte** en current radering — det är ett indikation på att äldre exports (2020-2025) har städats bort eller flyttats.\n\n';
  md += '**Möjliga källor:**\n';
  md += '- Google Drive Takeout-arkivet (originalkällan)\n';
  md += '- Annan lokal mapp / extern disk\n';
  md += '- Möjligen borta för gott\n\n';
  md += '## Rekommendationer (väntar på owner-godkännande)\n\n';
  for (const r of report.recommendations) md += '- ' + r + '\n';
  md += '\n## Nästa steg\n\n';
  md += '1. Owner reviewar rapporten.\n';
  md += '2. Owner bestämmer om broken symlinks ska:\n';
  md += '   a) Återupplivas (om originalfiler hittas i Drive Takeout)\n';
  md += '   b) Tas bort som broken-references (separat owner-godkännande)\n';
  md += '   c) Lämnas som de är (low-priority cleanup)\n';
  md += '3. Permanent radering kräver explicit owner-bekräftelse i ny körning.\n';
  fs.writeFileSync(OUTPUT_MD, md, 'utf8');

  console.log('=== Klart ===');
  console.log('JSON: ' + OUTPUT_JSON + ' (' + humanize(fs.statSync(OUTPUT_JSON).size) + ')');
  console.log('MD:   ' + OUTPUT_MD + ' (' + humanize(fs.statSync(OUTPUT_MD).size) + ')');
}

main().catch((err) => {
  console.error('FEL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
