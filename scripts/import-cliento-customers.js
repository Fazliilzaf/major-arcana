'use strict';

/**
 * import-cliento-customers.js — Steg 9 av Communication & Compliance audit.
 *
 * Importerar kundregister från Cliento CSV-export till ccoCustomerStore.
 *
 * Källa:
 *   - CSV-export från Cliento UI: "Kunder → ⋯ → Ladda ner kundregister → Samtliga kunder"
 *   - Endpoint bakom knappen: GET /api/locations/<location>/<sublocation>/export/customers.csv
 *
 * COMPLIANCE-REGLER:
 *   - CSV-filen får INTE finnas i GitHub-repo (.gitignore-mönster: migration/cliento-csv/*)
 *   - CSV-fil förväntas i iCloud "Hairtpclinic webb/Migration-data/" eller liknande
 *   - Personnummer maskeras i dry-run-output (****1234)
 *   - Namn/email/telefon loggas ALDRIG till stdout (bara counts)
 *
 * Användning:
 *   node scripts/import-cliento-customers.js --csv <path> [--dry-run] [--tenant hair_tp]
 *
 * Default tenant: 'hair_tp' (Hair TP Clinic delar kundbas med Curatiio i Cliento).
 *
 * Output (dry-run):
 *   - Total rader läst
 *   - Valid (kan importeras)
 *   - Invalid (saknar bootstrap-fält)
 *   - Create vs Update vs Review-required
 *   - Distribution: med pnr / med email / med telefon / anonyma
 *   - INGA personuppgifter i loggen
 */

const fs = require('fs');
const path = require('path');
const { createCcoCustomerStore } = require('../src/ops/ccoCustomerStore');

function parseArgs(argv) {
  const args = { csv: '', dryRun: false, tenant: 'hair_tp', limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--csv') args.csv = argv[++i];
    else if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  if (!args.csv) {
    console.error('FEL: --csv <path> krävs.');
    console.error(
      'Användning: node scripts/import-cliento-customers.js --csv /path/to/customers.csv [--dry-run]'
    );
    process.exit(2);
  }
  return args;
}

/**
 * Mycket enkel CSV-parser som hanterar:
 *   - Kommaseparerat (kan ändras till semikolon via auto-detect)
 *   - Quoted fields (med ev. dubbel-quote-escape)
 *   - \r\n och \n radbrytningar
 *   - BOM-stripping
 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sample = text.split('\n').slice(0, 3).join('\n');
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  const rows = [];
  let field = '';
  let row = [];
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === delimiter) {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        /* skip */
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Strippa tomma sista rader
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();

  if (!rows.length) return { headers: [], rows: [], delimiter };
  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] !== undefined ? r[idx] : '').trim();
    });
    return obj;
  });
  return { headers, rows: dataRows, delimiter };
}

/**
 * Mappa Cliento CSV-rad → ccoCustomerStore-rad-shape förväntad av
 * applyClientoImportedRowToCustomerState.
 *
 * Cliento-headers (vi gissar från UI; auto-detekterar via lowercase + substring):
 *   "Namn" → name
 *   "Mobiltelefon" / "Mobil" / "Telefon" → phone
 *   "Annat telefonnummer" → additional phone
 *   "E-post" / "E-mail" / "Email" → email
 *   "Personnummer" → personnummer
 *   "Adressrad 1/2/3", "Postnummer", "Postort", "Land" → address (lagras inte i ccoCustomerStore än)
 *   "Kund-ID" / "ID" / "#" → cliento_id (lagras som metadata)
 */
function buildHeaderMap(headers) {
  const map = {};
  for (const h of headers) {
    const low = h.toLowerCase().trim();
    if (!map.name && /(^|\b)namn\b/.test(low)) map.name = h;
    if (!map.email && /(e-post|email|e-mail|epost)/.test(low)) map.email = h;
    // Cliento: "Telefon (mobil)" + "Telefon (annat)"
    if (!map.phone && /(mobiltel|mobil\b|telefon\s*\(mobil\)|^telefon$|^tel$|phone)/.test(low))
      map.phone = h;
    if (
      !map.altPhone &&
      /(annat tel|annan tel|telefon\s*\(annat\)|alternativ|sekund|other phone)/.test(low)
    )
      map.altPhone = h;
    if (!map.personnummer && /(personnummer|pnr|personal\s*number|ssn)/.test(low))
      map.personnummer = h;
    if (!map.id && /(kund.?id|customer.?id|^id$|^#$)/.test(low)) map.id = h;
    // Cliento: "Gatuadress 1" / "Gatuadress 2"
    if (!map.address1 && /(gatuadress\s*1|adressrad 1|adress 1|address.?1|street)/.test(low))
      map.address1 = h;
    if (!map.address2 && /(gatuadress\s*2|adressrad 2|adress 2|address.?2)/.test(low))
      map.address2 = h;
    if (!map.postal && /(postnummer|postnr|postal|zip)/.test(low)) map.postal = h;
    if (!map.city && /(postort|^ort$|stad|city)/.test(low)) map.city = h;
    if (!map.country && /(^|\b)land\b|country/.test(low)) map.country = h;
    // Nya Cliento-fält
    if (!map.birthdate && /(födelsedatum|birthdate|birth.?date|dob)/.test(low)) map.birthdate = h;
    if (!map.gender && /(^kön$|gender|sex)/.test(low)) map.gender = h;
    if (!map.allowMarketing && /(tillåt\s*reklam|reklamutskick|marketing|nyhetsbrev)/.test(low))
      map.allowMarketing = h;
    if (!map.allowSmsReminder && /(tillåt\s*påminnelser|sms.?påminnelse|sms.?reminder)/.test(low))
      map.allowSmsReminder = h;
    if (!map.internalLog && /(kundlogg|customer.?log|aktivitet)/.test(low)) map.internalLog = h;
  }
  return map;
}

function mapClientoRow(rawRow, headerMap, rowNumber) {
  const get = (key) => (headerMap[key] ? String(rawRow[headerMap[key]] || '').trim() : '');
  const name = get('name');
  const email = get('email');
  const phone = get('phone');
  const altPhone = get('altPhone');
  const personnummer = get('personnummer');
  const clientoId = get('id');
  return {
    rowNumber,
    name,
    emails: email ? [email] : [],
    phone,
    phones: [phone, altPhone].filter(Boolean),
    personnummer,
    mailboxes: [],
    vip: false,
    customerValue: 0,
    totalConversations: 0,
    totalMessages: 0,
    sourceSystem: 'cliento',
    sourceRowId: clientoId,
    // Address sparas inte i ccoCustomerStore än — flaggas för Steg 9.5
    _addressLine1: get('address1'),
    _addressLine2: get('address2'),
    _postalCode: get('postal'),
    _city: get('city'),
    _country: get('country'),
  };
}

function maskPnr(pnr) {
  const digits = String(pnr || '').replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return '****' + digits.slice(-4);
}

function summarize(mappedRows) {
  let withName = 0,
    withEmail = 0,
    withPhone = 0,
    withPnr = 0,
    anonymous = 0,
    withAddress = 0;
  for (const r of mappedRows) {
    if (r.name) withName += 1;
    if (r.emails.length) withEmail += 1;
    if (r.phones.length) withPhone += 1;
    if (r.personnummer) withPnr += 1;
    if (r._addressLine1) withAddress += 1;
    if (!r.name && !r.emails.length && !r.phones.length && !r.personnummer) anonymous += 1;
  }
  return { withName, withEmail, withPhone, withPnr, anonymous, withAddress };
}

async function main() {
  const args = parseArgs(process.argv);

  const absCsv = path.resolve(args.csv);
  if (!fs.existsSync(absCsv)) {
    console.error('FEL: CSV-filen finns inte: ' + absCsv);
    process.exit(2);
  }

  // Säkerhetscheck: filen får inte ligga i repo-mappen
  const repoRoot = path.resolve(__dirname, '..');
  if (absCsv.startsWith(repoRoot + path.sep)) {
    console.error('COMPLIANCE-FEL: CSV-filen ligger i repo-katalogen (' + repoRoot + ').');
    console.error('Patientdata får INTE finnas i GitHub. Flytta filen till iCloud (utanför repo).');
    process.exit(3);
  }

  const csvText = fs.readFileSync(absCsv, 'utf8');
  const { headers, rows, delimiter } = parseCsv(csvText);

  console.log('=== Cliento Customer Import ===');
  console.log('CSV:        ' + absCsv);
  console.log('Storlek:    ' + (csvText.length / 1024).toFixed(1) + ' KB');
  console.log('Delimiter:  "' + delimiter + '"');
  console.log('Headers (' + headers.length + '):');
  headers.forEach((h, i) => console.log('  [' + i + '] ' + h));
  console.log('');
  console.log('Total rader: ' + rows.length);

  const headerMap = buildHeaderMap(headers);
  console.log('');
  console.log('Header-mappning (Cliento → CCO):');
  for (const [cccoField, clientoHeader] of Object.entries(headerMap)) {
    console.log('  ' + cccoField.padEnd(15) + ' ← "' + clientoHeader + '"');
  }
  const unmapped = headers.filter((h) => !Object.values(headerMap).includes(h));
  if (unmapped.length) {
    console.log('');
    console.log('Omappade headers (' + unmapped.length + '): ' + unmapped.join(', '));
  }

  let working = rows;
  if (args.limit > 0) {
    working = rows.slice(0, args.limit);
    console.log('');
    console.log('LIMIT aktivt: använder första ' + args.limit + ' rader.');
  }

  const mapped = working.map((r, i) => mapClientoRow(r, headerMap, i + 2)); // +2 (header = row 1, data startar row 2)
  const stats = summarize(mapped);
  console.log('');
  console.log('--- PII-säker statistik ---');
  console.log('Med namn:        ' + stats.withName.toString().padStart(6));
  console.log('Med email:       ' + stats.withEmail.toString().padStart(6));
  console.log('Med telefon:     ' + stats.withPhone.toString().padStart(6));
  console.log('Med personnr:    ' + stats.withPnr.toString().padStart(6));
  console.log('Med adress:      ' + stats.withAddress.toString().padStart(6));
  console.log('Anonyma:         ' + stats.anonymous.toString().padStart(6));

  if (args.dryRun) {
    console.log('');
    console.log('=== DRY-RUN: kör ccoCustomerStore.previewTenantCustomerImport ===');
    const store = await createCcoCustomerStore({
      filePath: path.join(repoRoot, 'data', 'cco-customers.json'),
    });
    const preview = await store.previewTenantCustomerImport({
      tenantId: args.tenant,
      rows: mapped,
      sourceSystem: 'cliento',
      fileName: path.basename(absCsv),
    });
    console.log('');
    console.log('Import-summary (preview):');
    console.log('  totalRows:    ' + preview.totalRows);
    console.log('  validRows:    ' + preview.validRows);
    console.log('  created:      ' + (preview.created || 0));
    console.log('  updated:      ' + (preview.updated || 0));
    console.log('  merged:       ' + (preview.merged || 0));
    console.log('  review:       ' + (preview.review || 0));
    console.log('  invalid:      ' + (preview.invalid || 0));
    if (preview.coverageReadout) {
      console.log('');
      console.log('Coverage efter import:');
      console.log('  customerCount:      ' + preview.coverageReadout.customerCount);
      console.log('  identityCount:      ' + preview.coverageReadout.identityCount);
      console.log('  reviewRequired:     ' + preview.coverageReadout.reviewRequiredCount);
      console.log('  primaryEmailCount:  ' + preview.coverageReadout.primaryEmailCount);
    }
    console.log('');
    console.log('INGEN data sparad (--dry-run). Kör utan flagga för att commita.');
    return;
  }

  console.log('');
  console.log('=== LIVE-IMPORT: commitTenantCustomerImport ===');
  const store = await createCcoCustomerStore({
    filePath: path.join(repoRoot, 'data', 'cco-customers.json'),
  });
  const result = await store.commitTenantCustomerImport({
    tenantId: args.tenant,
    rows: mapped,
    sourceSystem: 'cliento',
    fileName: path.basename(absCsv),
  });
  console.log('');
  console.log('Import KLAR:');
  console.log('  totalRows:    ' + result.importSummary.totalRows);
  console.log('  validRows:    ' + result.importSummary.validRows);
  console.log('  created:      ' + (result.importSummary.created || 0));
  console.log('  updated:      ' + (result.importSummary.updated || 0));
  console.log('  merged:       ' + (result.importSummary.merged || 0));
  console.log('  review:       ' + (result.importSummary.review || 0));
  console.log('  invalid:      ' + (result.importSummary.invalid || 0));
  console.log('');
  console.log(
    'Tenant "' +
      args.tenant +
      '" har nu ' +
      Object.keys(result.customerState.directory || {}).length +
      ' aktiva kund-keys.'
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('IMPORT FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = {
  buildHeaderMap,
  mapClientoRow,
  parseCsv,
};
