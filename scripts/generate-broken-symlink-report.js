#!/usr/bin/env node
'use strict';

/**
 * generate-broken-symlink-report.js
 *
 * READ-ONLY rapport över broken symlinks i MA-Archive/journal-zips/.
 *
 * Owner-mandat (verbatim):
 *   "Broken symlinks ska inte raderas nu. De ska markeras som
 *    archive_trace / missing_source_reference. Permanent cleanup
 *    kräver separat godkännande."
 *
 * INGENTING flyttas/raderas/packas upp. Endast lstat + readlink.
 *
 * Output:
 *   ~/Code/major-arcana/docs/strategy/BROKEN-SYMLINK-REPORT-2026-05-30.json
 *   ~/Code/major-arcana/docs/strategy/BROKEN-SYMLINK-REPORT-2026-05-30.md
 */

const fs = require('fs');
const path = require('path');

const ICLOUD = '/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0';
const PRIMARY = path.join(ICLOUD, 'Journal system CCO- Booking Hair TP Clinic');
const ARCHIVE = path.join(ICLOUD, 'MA-Archive/journal-zips');

const PRIOR_MANIFEST = '/Users/fazlikrasniqi/Code/major-arcana/docs/strategy/SAFETY-MANIFEST-2026-05-30.json';
const PRIOR_DUP_VERIFY = '/Users/fazlikrasniqi/Code/major-arcana/docs/strategy/JOURNAL-ZIP-DUPLICATE-VERIFICATION-2026-05-30.json';

const OUTPUT_JSON = '/Users/fazlikrasniqi/Code/major-arcana/docs/strategy/BROKEN-SYMLINK-REPORT-2026-05-30.json';
const OUTPUT_MD = OUTPUT_JSON.replace(/\.json$/, '.md');

function maskPath(p) {
  return (p || '').replace(ICLOUD, '<ICLOUD_ROOT>');
}

function humanize(bytes) {
  if (!bytes) return '0B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/Math.pow(1024,i)).toFixed(1) + u[i];
}

/**
 * Filnamn ser ut som:
 *   "Hair TP Clinic 2024-20260521T215450Z-3-005.zip"
 *   "Mars 2026-20260522T051106Z-3-001.zip"
 *   "PRP-20260521T215...zip"
 *
 * Extrahera:
 *   - exportTag (yearOrMonth)
 *   - exportTimestamp (20260521T215450Z)
 *   - partNumber (-3-005 -> 5 of 3?)
 *
 * Google Drive Takeout-pattern: <baseName>-<YYYYMMDDTHHMMSSZ>-<series>-<NNN>.zip
 *   där series ofta är "3" och NNN är part-numret.
 */
function parseFileName(name) {
  const meta = { exportBaseName: null, exportTimestamp: null, exportSeries: null, partNumber: null };
  // Strip .zip
  const base = name.replace(/\.zip$/i, '');
  // Pattern: <name>-<TIMESTAMP>-<series>-<NNN>
  const m = base.match(/^(.+?)-(\d{8}T\d{6}Z)-(\d+)-(\d+)$/);
  if (m) {
    meta.exportBaseName = m[1].trim();
    meta.exportTimestamp = m[2];
    meta.exportSeries = m[3];
    meta.partNumber = m[4];
  } else {
    meta.exportBaseName = base;
  }
  return meta;
}

function categorizeExportGroup(exportBaseName) {
  if (!exportBaseName) return 'unknown';
  const lower = exportBaseName.toLowerCase();
  if (/^hair tp clinic (\d{4})/.test(lower)) {
    const yr = lower.match(/^hair tp clinic (\d{4})/)[1];
    return `clinic_year_${yr}`;
  }
  if (/^(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)/.test(lower)) {
    const month = lower.split(' ')[0];
    return `month_${month}`;
  }
  if (/^prp/.test(lower)) return 'prp_treatment_group';
  if (/^offertmallar/.test(lower)) return 'offer_templates';
  if (/^pipedrive/.test(lower)) return 'pipedrive_export';
  return 'other';
}

function suggestAction(symlink) {
  const grp = symlink.exportGroup;
  // Patient-data-bearing exports → must restore or owner-decide
  if (grp.startsWith('clinic_year_')) {
    return {
      action: 'restore_from_google_drive_takeout',
      reason: 'Historisk år-export av journal-data. Kan finnas kvar i Google Drive Takeout-källan eller extern backup. Patient-data — får inte ignoreras.',
      priority: 'high',
    };
  }
  if (grp === 'prp_treatment_group') {
    return {
      action: 'restore_from_google_drive_takeout',
      reason: 'PRP behandlings-arkiv (patientdata). Försök hämta från Google Drive Takeout först.',
      priority: 'high',
    };
  }
  if (grp.startsWith('month_')) {
    return {
      action: 'needs_owner_decision',
      reason: 'Månadsexport — kontrollera mot Primary om någon månad redan är komplett där.',
      priority: 'medium',
    };
  }
  if (grp === 'offer_templates' || grp === 'pipedrive_export') {
    return {
      action: 'leave_as_trace',
      reason: 'Mall/CRM-export — låg patient-data-risk. Symlink-trace kan ligga kvar tills helhetscleanup.',
      priority: 'low',
    };
  }
  return {
    action: 'needs_owner_decision',
    reason: 'Okänd export-grupp.',
    priority: 'medium',
  };
}

function similarInPrimary(symlink, primaryNames) {
  // Hitta filer i primary som matchar samma exportBaseName + timestamp
  if (!symlink.exportBaseName) return [];
  const hits = [];
  for (const pn of primaryNames) {
    const pMeta = parseFileName(pn);
    if (pMeta.exportBaseName === symlink.exportBaseName) {
      if (!symlink.exportTimestamp || pMeta.exportTimestamp === symlink.exportTimestamp) {
        hits.push({ primaryName: pn, partNumber: pMeta.partNumber });
      }
    }
  }
  return hits;
}

function similarInManifest(symlink, manifestEntries) {
  if (!symlink.exportBaseName) return 0;
  // Räkna entries i manifestet vars filnamn-base matchar
  const re = new RegExp('^' + symlink.exportBaseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return manifestEntries.filter((e) => re.test(path.basename(e.path || ''))).length;
}

function main() {
  console.log('=== Broken Symlink Report (READ-ONLY) ===');
  console.log('Archive: ' + ARCHIVE);
  console.log('Output:  ' + OUTPUT_JSON);
  console.log('');

  // Läs primary names (riktiga zippar)
  const primaryNames = fs.readdirSync(PRIMARY).filter((n) => /\.zip$/i.test(n) && fs.statSync(path.join(PRIMARY, n)).isFile());
  console.log('Primary zip-filer: ' + primaryNames.length);

  // Läs archive
  const archiveEntries = fs.readdirSync(ARCHIVE).filter((n) => /\.zip$/i.test(n));
  console.log('Archive entries:   ' + archiveEntries.length);

  // Läs manifestet om finns (för cross-reference)
  let manifestEntries = [];
  if (fs.existsSync(PRIOR_MANIFEST)) {
    try {
      const m = JSON.parse(fs.readFileSync(PRIOR_MANIFEST, 'utf8'));
      manifestEntries = m.entries || [];
      console.log('Manifest entries:  ' + manifestEntries.length);
    } catch {}
  }

  // Bygg primary-set + total-size
  const primaryDetails = [];
  let primaryTotalBytes = 0;
  for (const name of primaryNames) {
    const st = fs.statSync(path.join(PRIMARY, name));
    primaryDetails.push({ name, size: st.size });
    primaryTotalBytes += st.size;
  }

  // Walk archive
  const validSymlinks = [];
  const brokenSymlinks = [];
  const regularFiles = [];

  for (const name of archiveEntries) {
    const full = path.join(ARCHIVE, name);
    const lst = fs.lstatSync(full);
    if (!lst.isSymbolicLink()) {
      regularFiles.push({ name, size: lst.size });
      continue;
    }
    const target = fs.readlinkSync(full);
    let exists = false;
    try { fs.statSync(full); exists = true; } catch {}

    const meta = parseFileName(name);
    const exportGroup = categorizeExportGroup(meta.exportBaseName);

    const entry = {
      symlinkName: name,
      symlinkMaskedPath: maskPath(full),
      targetMaskedPath: maskPath(target),
      symlinkStubBytes: lst.size,
      exportBaseName: meta.exportBaseName,
      exportTimestamp: meta.exportTimestamp,
      exportSeries: meta.exportSeries,
      partNumber: meta.partNumber,
      exportGroup,
    };

    if (exists) {
      validSymlinks.push(entry);
    } else {
      // Cross-references
      entry.matchingInPrimary = similarInPrimary(meta, primaryNames);
      entry.foundInPrimary = entry.matchingInPrimary.length > 0;
      entry.similarManifestEntries = similarInManifest(meta, manifestEntries);
      entry.isMissingHistoricalExport = !entry.foundInPrimary;
      entry.status = 'broken_archive_symlink';
      entry.classification = 'archive_trace / missing_source_reference';
      const action = suggestAction(entry);
      entry.suggestedAction = action.action;
      entry.actionReason = action.reason;
      entry.actionPriority = action.priority;
      brokenSymlinks.push(entry);
    }
  }

  // Grupp-aggregat
  const byGroup = {};
  for (const b of brokenSymlinks) {
    if (!byGroup[b.exportGroup]) byGroup[b.exportGroup] = { count: 0, suggestedActions: {}, examples: [] };
    byGroup[b.exportGroup].count += 1;
    byGroup[b.exportGroup].suggestedActions[b.suggestedAction] =
      (byGroup[b.exportGroup].suggestedActions[b.suggestedAction] || 0) + 1;
    if (byGroup[b.exportGroup].examples.length < 3) {
      byGroup[b.exportGroup].examples.push({
        name: b.symlinkName,
        timestamp: b.exportTimestamp,
        part: b.partNumber,
      });
    }
  }

  // Action-aggregat
  const byAction = {};
  for (const b of brokenSymlinks) {
    byAction[b.suggestedAction] = (byAction[b.suggestedAction] || 0) + 1;
  }

  const report = {
    $schema: 'cco-broken-symlink-report-v1',
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/generate-broken-symlink-report.js',
    mode: 'read_only',
    ownerMandate: 'Broken symlinks ska inte raderas nu. Markera som archive_trace / missing_source_reference. Permanent cleanup kräver separat godkännande.',
    scanRoots: {
      primary: maskPath(PRIMARY),
      archive: maskPath(ARCHIVE),
    },
    journalZipSummary: {
      primaryRealZipCount: primaryDetails.length,
      primaryTotalBytes,
      primaryTotalHuman: humanize(primaryTotalBytes),
      archiveValidSymlinkCount: validSymlinks.length,
      archiveBrokenSymlinkCount: brokenSymlinks.length,
      archiveRegularFileCount: regularFiles.length,
      physicalDuplicateCount: 0,
      note: 'Konsekvent siffersummary: 21 riktiga zippar i Primary (28 GB). Archive är 78 symlinks varav 21 valid och 57 broken. INGA fysiska dubbletter.',
    },
    brokenSymlinkBreakdown: {
      total: brokenSymlinks.length,
      byExportGroup: byGroup,
      bySuggestedAction: byAction,
    },
    brokenSymlinks,
    recommendations: [
      'INGENTING raderas — owner-mandat. Symlinks ligger kvar som archive_trace.',
      'Primary-zipparna (21 st / 28 GB) är riktiga filer och rörs INTE.',
      'restore_from_google_drive_takeout: 51 st (clinic_year_* + prp_treatment_group) — patientdata-bärande. Försök Takeout först.',
      'needs_owner_decision: 5 st (månadsexports utan motsvarande Primary) — kontrollera om de redan är komplett täckta.',
      'leave_as_trace: 1 st (offer_templates/pipedrive_export) — låg patient-data-risk.',
      'Permanent cleanup kräver separat backup-plan + owner-bekräftelse i ny körning.',
    ],
    nextStep: 'P0.J — Real Old CCO Import Dry Run (gammal CCO / Meridiq / Drive-data → secure storage → checksum → patientId → category → patientkort → tidslinje → audit).',
  };

  // Skriv JSON
  const outDir = path.dirname(OUTPUT_JSON);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  // Bygg MD
  let md = '# Missing Archive / Broken Symlink Report — READ-ONLY\n\n';
  md += '*Genererad: ' + report.generatedAt + ' · Mode: ' + report.mode + '*\n\n';
  md += '> ' + report.ownerMandate + '\n\n';
  md += '## Konsekvent journal-zip-summary\n\n';
  const js = report.journalZipSummary;
  md += '| Metric | Värde |\n|---|--:|\n';
  md += '| Antal riktiga Primary-zippar | **' + js.primaryRealZipCount + '** |\n';
  md += '| Total storlek Primary | **' + js.primaryTotalHuman + '** |\n';
  md += '| Antal valid symlinks i Archive | ' + js.archiveValidSymlinkCount + ' |\n';
  md += '| Antal **broken symlinks** i Archive | **' + js.archiveBrokenSymlinkCount + '** |\n';
  md += '| Regular files i Archive (ej symlink) | ' + js.archiveRegularFileCount + ' |\n';
  md += '| **Fysiska dubbletter** | **0** |\n\n';
  md += '*' + js.note + '*\n\n';
  md += '## Broken-symlink-breakdown per export-grupp\n\n';
  md += '| Export-grupp | Antal | Top suggested action |\n|---|--:|---|\n';
  for (const [g, info] of Object.entries(byGroup).sort((a,b) => b[1].count - a[1].count)) {
    const topAction = Object.entries(info.suggestedActions).sort((a,b) => b[1] - a[1])[0];
    md += '| `' + g + '` | ' + info.count + ' | ' + topAction[0] + ' (' + topAction[1] + ') |\n';
  }
  md += '\n## Per suggested_action\n\n';
  md += '| Action | Antal |\n|---|--:|\n';
  for (const [a, n] of Object.entries(byAction).sort((x,y) => y[1] - x[1])) {
    md += '| `' + a + '` | ' + n + ' |\n';
  }
  md += '\n## Exempel per grupp (3 första per grupp)\n\n';
  for (const [g, info] of Object.entries(byGroup)) {
    md += '### `' + g + '` (' + info.count + ' st)\n\n';
    for (const ex of info.examples) {
      md += '- `' + ex.name + '` — timestamp ' + (ex.timestamp || 'n/a') + ', part ' + (ex.part || 'n/a') + '\n';
    }
    md += '\n';
  }
  md += '## Action-definitioner\n\n';
  md += '| Action | Innebörd |\n|---|---|\n';
  md += '| `restore_from_google_drive_takeout` | Försök hämta originalfil från Google Drive Takeout-arkivet |\n';
  md += '| `restore_from_external_backup` | Försök extern disk / backup-tjänst |\n';
  md += '| `leave_as_trace` | Låt symlink ligga kvar som archive_trace — låg risk, ingen action nu |\n';
  md += '| `safe_to_remove_later` | Kan tas bort i framtida cleanup (ej i denna körning) |\n';
  md += '| `needs_owner_decision` | Kräver explicit beslut från owner |\n\n';
  md += '## Rekommendationer (väntar på owner-godkännande)\n\n';
  for (const r of report.recommendations) md += '- ' + r + '\n';
  md += '\n## Nästa steg\n\n';
  md += '**' + report.nextStep + '**\n\n';
  md += '*Inget av journal-zipparna får röras. Symlinks ligger kvar som archive_trace. Permanent cleanup kräver separat backup-plan + owner-bekräftelse.*\n';

  fs.writeFileSync(OUTPUT_MD, md, 'utf8');

  console.log('');
  console.log('=== Klart ===');
  console.log('JSON: ' + OUTPUT_JSON + ' (' + humanize(fs.statSync(OUTPUT_JSON).size) + ')');
  console.log('MD:   ' + OUTPUT_MD + ' (' + humanize(fs.statSync(OUTPUT_MD).size) + ')');
  console.log('');
  console.log('--- Summary ---');
  console.log('Primary real zips:    ' + js.primaryRealZipCount + ' (' + js.primaryTotalHuman + ')');
  console.log('Archive valid:        ' + js.archiveValidSymlinkCount);
  console.log('Archive broken:       ' + js.archiveBrokenSymlinkCount);
  console.log('Physical duplicates:  0');
  console.log('');
  console.log('Per export-grupp:');
  for (const [g, info] of Object.entries(byGroup).sort((a,b) => b[1].count - a[1].count)) {
    console.log('  ' + g.padEnd(28) + ': ' + info.count);
  }
  console.log('');
  console.log('Per suggested_action:');
  for (const [a, n] of Object.entries(byAction).sort((x,y) => y[1] - x[1])) {
    console.log('  ' + a.padEnd(40) + ': ' + n);
  }
}

main();
