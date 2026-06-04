#!/usr/bin/env node
'use strict';

/**
 * backfill-master-card-drive-coupling.js
 * =======================================
 *
 * Iterar alla patienter i ccoCustomerStore (default: tenant=hair_tp, ~7257
 * directory-keys) och bygger en cachad map av predicted Drive-folder-coupling
 * per patient.
 *
 * Datakällor (i fallande prio per patient):
 *   1. data/cco-journal.json   — entries med treatmentDate
 *   2. data/cliento-booking-store.json (om finns) — bookings.startsAt
 *   3. data/cco-customers.json — meridiqMeta.importedAt som proxy
 *      (om patient har Meridiq-journal antar vi att de har varit på minst 1 besök)
 *
 * Output:
 *   - data/cco-master-card-drive-coupling.json   (gitignored via data/)
 *   - stdout: COUNTS ONLY (predicted / verified / none + confidence-fördelning)
 *
 * Compliance:
 *   - INGA patientnamn, INGA pnr, INGA emails, INGA telefonnummer i logg.
 *   - Folder-IDs är publika utan auth — OK att logga aggregat.
 *
 * Usage:
 *   node scripts/backfill-master-card-drive-coupling.js
 *   node scripts/backfill-master-card-drive-coupling.js --tenant=hair_tp
 *   node scripts/backfill-master-card-drive-coupling.js --dry-run
 *
 * Refs:
 *   - src/ops/ccoDriveFolderCoupler.js
 *   - docs/strategy/CUTOVER-READINESS-REPORT-2026-05-30.md (krit #1)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const {
  predictDriveFoldersForPatients,
} = require(path.join(ROOT, 'src/ops/ccoDriveFolderCoupler'));

// ─────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    tenantId: 'hair_tp',
    dryRun: false,
    outputPath: path.join(ROOT, 'data', 'cco-master-card-drive-coupling.json'),
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--tenant=')) args.tenantId = raw.split('=')[1];
    else if (raw.startsWith('--out=')) args.outputPath = path.resolve(ROOT, raw.split('=')[1]);
  }
  return args;
}

// ─────────────────────────────────────────────────────────────────────────
// Data-loading
// ─────────────────────────────────────────────────────────────────────────
function readJsonSafe(rel) {
  const fp = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (err) {
    console.error('[backfill] kunde inte parsa', rel, err.message);
    return null;
  }
}

function loadDirectoryForTenant(tenantId) {
  const customers = readJsonSafe('data/cco-customers.json');
  if (!customers || !customers.tenants) return {};
  const tenant = customers.tenants[tenantId];
  return (tenant && tenant.customerState && tenant.customerState.directory) || {};
}

function loadJournalEncountersByPatient() {
  const j = readJsonSafe('data/cco-journal.json');
  if (!j) return {};
  const out = {};
  const pushEntry = (e) => {
    if (!e || !e.patientId) return;
    const date = e.treatmentDate || e.encounterDate || e.signedAt || e.createdAt;
    if (!date) return;
    const key = String(e.patientId).toLowerCase();
    if (!out[key]) out[key] = [];
    out[key].push({ treatmentDate: date });
  };
  if (Array.isArray(j.entries)) j.entries.forEach(pushEntry);
  if (j.entriesByTenant && typeof j.entriesByTenant === 'object') {
    for (const t of Object.values(j.entriesByTenant)) {
      const arr = Array.isArray(t?.entries) ? t.entries : Array.isArray(t) ? t : [];
      arr.forEach(pushEntry);
    }
  }
  return out;
}

function loadClientoBookingEncountersByPatient(tenantId) {
  // Optional — endast om filen finns.
  const cb = readJsonSafe('data/cliento-booking-store.json');
  if (!cb || !cb.bookings) return {};
  const out = {};
  for (const [bucketKey, list] of Object.entries(cb.bookings)) {
    // bucketKey: `${tenantId}::${customerEmail}`
    if (!bucketKey.startsWith(tenantId + '::')) continue;
    const email = bucketKey.split('::')[1];
    if (!email) continue;
    const arr = Array.isArray(list) ? list : [];
    for (const b of arr) {
      if (!b || !b.startsAt) continue;
      if (!out[email]) out[email] = [];
      out[email].push({ treatmentDate: b.startsAt });
    }
  }
  return out;
}

/**
 * Bygger encounters-listan per patient genom att kombinera:
 *   - journal-entries (treatmentDate)
 *   - cliento-bookings (startsAt, om finns)
 *   - meridiqMeta.importedAt (proxy: 1 syntetisk encounter)
 */
function buildEncountersByPatient({ directory, journalByPatient, clientoByEmail }) {
  const out = {};
  for (const [key, entry] of Object.entries(directory)) {
    const encs = [];

    // Källa 1: journal-entries med patientId-match
    if (journalByPatient[key]) {
      for (const e of journalByPatient[key]) encs.push(e);
    }

    // Källa 2: cliento-bookings via email-match
    if (clientoByEmail[key]) {
      for (const e of clientoByEmail[key]) encs.push(e);
    }

    // Källa 3: meridiqMeta.importedAt som proxy (om hasJournal=true)
    const mer = entry && entry.meridiqMeta;
    if (mer && mer.hasJournal === true && mer.importedAt) {
      encs.push({ treatmentDate: mer.importedAt, _source: 'meridiq_proxy' });
    }

    if (encs.length > 0) out[key] = encs;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Atomic write
// ─────────────────────────────────────────────────────────────────────────
function writeJsonAtomic(filePath, data) {
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  console.log('[backfill] tenant=' + args.tenantId + ' dryRun=' + args.dryRun);

  const directory = loadDirectoryForTenant(args.tenantId);
  const dirKeys = Object.keys(directory);
  if (dirKeys.length === 0) {
    console.error('[backfill] inga directory-keys för tenant', args.tenantId);
    process.exit(2);
  }
  console.log('[backfill] directory-keys=' + dirKeys.length);

  const journalByPatient = loadJournalEncountersByPatient();
  const clientoByEmail = loadClientoBookingEncountersByPatient(args.tenantId);
  console.log(
    '[backfill] encounter-källor: journal=' +
      Object.keys(journalByPatient).length +
      ' cliento=' +
      Object.keys(clientoByEmail).length
  );

  const encountersByPatient = buildEncountersByPatient({
    directory,
    journalByPatient,
    clientoByEmail,
  });

  // Bygg patient-list för coupler (counts only — INGEN PII här)
  const patients = dirKeys.map((k) => ({ key: k, brand: 'hair_tp' }));

  const { results, stats } = predictDriveFoldersForPatients({
    patients,
    encountersByPatient,
  });

  // Source-breakdown — counts only
  const sourceBreakdown = { journal_only: 0, journal_and_proxy: 0, proxy_only: 0, cliento: 0 };
  for (const k of dirKeys) {
    const encs = encountersByPatient[k] || [];
    if (encs.length === 0) continue;
    const hasJournal = encs.some((e) => !e._source || e._source !== 'meridiq_proxy');
    const hasProxy = encs.some((e) => e._source === 'meridiq_proxy');
    const hasCliento = clientoByEmail[k] && clientoByEmail[k].length > 0;
    if (hasCliento) sourceBreakdown.cliento += 1;
    if (hasJournal && hasProxy) sourceBreakdown.journal_and_proxy += 1;
    else if (hasJournal) sourceBreakdown.journal_only += 1;
    else if (hasProxy) sourceBreakdown.proxy_only += 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    tenantId: args.tenantId,
    totalPatients: dirKeys.length,
    stats,
    sourceBreakdown,
  };

  // ───────────── COUNTS ONLY LOG ─────────────
  console.log('[backfill] ─── COUNTS ───');
  console.log('[backfill] totalPatients     : ' + summary.totalPatients);
  console.log('[backfill] predicted         : ' + stats.predicted);
  console.log('[backfill] none              : ' + stats.none);
  console.log('[backfill] confidence.high   : ' + stats.byConfidence.high);
  console.log('[backfill] confidence.medium : ' + stats.byConfidence.medium);
  console.log('[backfill] confidence.low    : ' + stats.byConfidence.low);
  console.log('[backfill] confidence.none   : ' + stats.byConfidence.none);
  console.log('[backfill] source.journal_only      : ' + sourceBreakdown.journal_only);
  console.log('[backfill] source.proxy_only        : ' + sourceBreakdown.proxy_only);
  console.log('[backfill] source.journal_and_proxy : ' + sourceBreakdown.journal_and_proxy);
  console.log('[backfill] source.cliento           : ' + sourceBreakdown.cliento);

  // Computed thresholds
  const predictedPct = Math.round((stats.predicted / Math.max(1, dirKeys.length)) * 1000) / 10;
  const mediumOrHigh = stats.byConfidence.high + stats.byConfidence.medium;
  const mediumOrHighPct = Math.round((mediumOrHigh / Math.max(1, dirKeys.length)) * 1000) / 10;
  console.log('[backfill] predicted-pct           : ' + predictedPct + '%');
  console.log('[backfill] medium-or-high-pct      : ' + mediumOrHighPct + '%');

  if (args.dryRun) {
    console.log('[backfill] --dry-run: skipping write');
    return;
  }

  writeJsonAtomic(args.outputPath, {
    ...summary,
    results,
  });
  console.log('[backfill] wrote ' + path.relative(ROOT, args.outputPath));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[backfill] FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  loadDirectoryForTenant,
  loadJournalEncountersByPatient,
  loadClientoBookingEncountersByPatient,
  buildEncountersByPatient,
};
