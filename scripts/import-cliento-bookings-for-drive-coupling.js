'use strict';

/**
 * import-cliento-bookings-for-drive-coupling.js
 *
 * Läser Cliento booking-export CSV (8 års bokningshistorik) och predikerar
 * Drive-folder per patient via `ccoDriveFolderCoupler`.
 *
 * Detta löser Cutover Readiness Krit #1 ("Master-kort med Drive-folder")
 * från 🟡 PARTIAL till mostly-🟢 GREEN utan att kräva service-account.
 *
 * COMPLIANCE:
 *   - CSV-filen får INTE finnas i GitHub-repo
 *   - Folder-IDs är publika (ej-sensitive) — får lagras
 *   - Inga patientnamn / pnr / email i stdout
 *   - Counts only i rapporter
 *   - Dry-run default; --commit för att skriva tillbaka till ccoCustomerStore
 */

const fs = require('fs');
const path = require('path');
const {
  predictDriveFoldersForPatients,
} = require('../src/ops/ccoDriveFolderCoupler');

function parseArgs(argv) {
  const args = { csv: '', commit: false, tenant: 'hair_tp', limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--csv') args.csv = argv[++i];
    else if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  if (!args.csv) {
    console.error('FEL: --csv <path> krävs.');
    process.exit(2);
  }
  return args;
}

// Curatiio-resurser baserat på Drive-inventory + Meridiq-brand-overrides
const CURATIIO_RESOURCE_NAMES = new Set([
  'Arya Emami',
  'Egzona [Curatiio]',
  'Jessicka Bakhtiari',
  'Sabina Nordvall',
]);

function detectBrandFromResource(resourceName) {
  if (!resourceName) return 'hair_tp'; // default
  if (CURATIIO_RESOURCE_NAMES.has(resourceName.trim())) return 'curatiio';
  return 'hair_tp';
}

// Minimal CSV-parser som hanterar quoted fields + escaped quotes
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let field = '';
  let row = [];
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { inQuote = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? r[idx] : '').trim(); });
    return obj;
  });
  return { headers, rows: dataRows };
}

function extractTreatmentDate(s) {
  if (!s) return null;
  // Cliento ger ISO-format: '2026-05-13 14:30' eller '2026-05-13T14:30'
  const match = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const absCsv = path.resolve(args.csv);
  if (!fs.existsSync(absCsv)) {
    console.error('FEL: CSV-filen finns inte: ' + absCsv);
    process.exit(2);
  }
  const repoRoot = path.resolve(__dirname, '..');
  if (absCsv.startsWith(repoRoot + path.sep)) {
    console.error('COMPLIANCE-FEL: CSV ligger i repo. Flytta utanför.');
    process.exit(3);
  }

  console.log('=== Cliento Bookings → Drive-coupling ===');
  console.log('CSV:        ' + absCsv);
  const size = fs.statSync(absCsv).size;
  console.log('Storlek:    ' + (size / 1024 / 1024).toFixed(1) + ' MB');
  console.log('Mode:       ' + (args.commit ? 'LIVE COMMIT' : 'DRY-RUN'));
  console.log('Tenant:     ' + args.tenant);

  console.log('');
  console.log('Läser CSV...');
  const csvText = fs.readFileSync(absCsv, 'utf8');
  const { headers, rows } = parseCsv(csvText);
  console.log('Total bookings: ' + rows.length);
  console.log('Kolumner: ' + headers.length);

  let working = rows;
  if (args.limit > 0) {
    working = rows.slice(0, args.limit);
    console.log('LIMIT: ' + args.limit);
  }

  // Aggregera per kund-id
  const encountersByPatient = {};
  let withCustomerId = 0;
  let withStartTime = 0;
  let cancelledCount = 0;
  const STATUS_INCLUDE = new Set(['', 'Show', 'Klar', 'Bokad', 'No show']);

  for (const r of working) {
    const cliId = (r['Kund-id'] || '').trim();
    if (!cliId) continue;
    withCustomerId += 1;
    const dateStr = extractTreatmentDate(r['Starttid']);
    if (!dateStr) continue;
    withStartTime += 1;
    const status = (r['Status'] || '').trim();
    if (status === 'Avbokad') { cancelledCount += 1; continue; }
    if (status && !STATUS_INCLUDE.has(status)) continue;
    const brand = detectBrandFromResource(r['Resursnamn']);
    if (!encountersByPatient[cliId]) encountersByPatient[cliId] = [];
    encountersByPatient[cliId].push({
      treatmentDate: dateStr,
      treatmentType: 'tp',
      brand,
      bookingId: r['Boknings-id'] || null,
      resourceName: r['Resursnamn'] || null,
      serviceName: r['Tjänstens namn'] || null,
      status: status || 'unknown',
    });
  }

  const patientIds = Object.keys(encountersByPatient);
  console.log('');
  console.log('--- Aggregat per kund ---');
  console.log('Med kund-id:           ' + withCustomerId.toString().padStart(7));
  console.log('Med start-tid:         ' + withStartTime.toString().padStart(7));
  console.log('Avbokade (exkluderade):' + cancelledCount.toString().padStart(7));
  console.log('Unika patienter:       ' + patientIds.length.toString().padStart(7));

  // Brand-fördelning
  const brandCount = { hair_tp: 0, curatiio: 0, mixed: 0 };
  for (const pid of patientIds) {
    const brands = new Set(encountersByPatient[pid].map((e) => e.brand));
    if (brands.size === 1) {
      const b = [...brands][0];
      brandCount[b] = (brandCount[b] || 0) + 1;
    } else {
      brandCount.mixed += 1;
    }
  }
  console.log('');
  console.log('Brand-fördelning per patient:');
  Object.entries(brandCount).forEach(([b, c]) => console.log('  ' + b.padEnd(12) + ': ' + c));

  // Bygg patient-lista för coupler
  const patients = patientIds.map((pid) => {
    const encs = encountersByPatient[pid];
    // Pick brand = majority
    const brandCounts = {};
    for (const e of encs) brandCounts[e.brand] = (brandCounts[e.brand] || 0) + 1;
    const dominantBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0][0];
    return { key: pid, brand: dominantBrand };
  });

  console.log('');
  console.log('--- Drive-coupling-prediction ---');
  const result = predictDriveFoldersForPatients({ patients, encountersByPatient });
  const stats = result.stats || {};
  const { totalPatients, byConfidence, ...statusCounts } = stats;
  console.log('Total patienter: ' + (totalPatients || 0));
  console.log('Status-distribution:');
  Object.entries(statusCounts).forEach(([k, v]) => console.log('  ' + k.padEnd(22) + ': ' + v));
  console.log('Confidence-distribution:');
  Object.entries(byConfidence || {}).forEach(([k, v]) => console.log('  ' + k.padEnd(10) + ': ' + v));

  if (!args.commit) {
    console.log('');
    console.log('=== DRY-RUN — ingen data skriven ===');
    console.log('Kör med --commit för att skriva coupling till data/drive-coupling-by-cliento-id.json.');
    return;
  }

  // COMMIT: skriv coupling som separat lookup-fil
  // (cleantare än att muta ccoCustomerStore — master-card-store läser via lookup)
  console.log('');
  console.log('=== COMMIT — skriver coupling-lookup ===');
  const couplingPath = path.join(repoRoot, 'data', 'drive-coupling-by-cliento-id.json');
  const importedAt = new Date().toISOString();

  const output = {
    schemaVersion: '1.0.0',
    importedAt,
    source: path.basename(absCsv),
    sourceRowCount: working.length,
    uniquePatients: patientIds.length,
    stats: result.stats,
    couplings: {},
  };

  for (const [cliId, coupling] of Object.entries(result.results)) {
    if (coupling.status === 'none') continue; // skip patienter utan booking
    output.couplings[cliId] = {
      cliId,
      driveFolderId: coupling.predictedFolderId,
      drivePath: coupling.predictedFolderPath,
      driveUrl: coupling.predictedFolderUrl,
      driveStatus: coupling.status,
      driveConfidence: coupling.predictionConfidence,
      sourceEncounters: coupling.sourceEncounters,
      predictionBasis: coupling.predictionBasis,
      latestEncounter: coupling.latestEncounter || null,
      importedAt,
    };
  }

  const writtenCount = Object.keys(output.couplings).length;
  const tmpPath = couplingPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(output, null, 2), 'utf8');
  fs.renameSync(tmpPath, couplingPath);

  console.log('Skrivna couplings:        ' + writtenCount);
  console.log('Fil:                      data/drive-coupling-by-cliento-id.json');
  console.log('');
  console.log('Storlek: ' + (fs.statSync(couplingPath).size / 1024).toFixed(1) + ' KB');
  console.log('');
  console.log('NÄSTA STEG:');
  console.log('  - ccoMasterPatientCardStore kan läsa filen via optional lookup');
  console.log('  - data/-mappen är gitignored så filen committas inte');
  console.log('  - När SA aktiveras: status "predicted" → "verified" via job');
}

main().catch((err) => {
  console.error('FEL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
