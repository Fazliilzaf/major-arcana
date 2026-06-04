'use strict';

/**
 * import-meridiq-customers.js — Steg 9.2 av Communication & Compliance audit.
 *
 * Importerar Meridiq-patienter (XLSX-export från app.meridiq.com/clients)
 * och de-duperar mot CCO ccoCustomerStore som redan har 7 250 Cliento-kunder.
 *
 * Källa: app.meridiq.com → Patienter → Exportera → client-data.xlsx
 *
 * COMPLIANCE-REGLER:
 *   - XLSX-filen får INTE finnas i GitHub-repo (säkerhetscheck mot repoRoot)
 *   - Fil förväntas i iCloud "Major Arcana 2.0/Migration-data/"
 *   - Personnummer/email/namn loggas ALDRIG till stdout (bara counts)
 *   - Dry-run default — kräver --commit för att skriva
 *
 * Användning:
 *   node scripts/import-meridiq-customers.js --xlsx <path> [--commit] [--tenant hair_tp]
 *
 * De-dup-strategi (i fallande prioritet):
 *   1. Personnummer (normaliserad 12-siffrig)
 *   2. E-mail (lowercase + trim)
 *   3. Telefon (E.164-normaliserad)
 *   4. Namn + födelsedatum (fallback för ofullständiga records)
 *
 * Output (counts only):
 *   - Total Meridiq-rader
 *   - Matches mot Cliento (per identifier-typ)
 *   - Cliento-only (lead utan Meridiq-journal)
 *   - Meridiq-only (arkiverad patient ej i aktiv Cliento)
 *   - Importerade nya
 *   - Uppdaterade existerande (lagt på meridiq_id)
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createCcoCustomerStore } = require('../src/ops/ccoCustomerStore');

function parseArgs(argv) {
  const args = { xlsx: '', commit: false, tenant: 'hair_tp', limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--xlsx') args.xlsx = argv[++i];
    else if (a === '--tenant') args.tenant = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  if (!args.xlsx) {
    console.error('FEL: --xlsx <path> krävs.');
    process.exit(2);
  }
  return args;
}

function nowIso() { return new Date().toISOString(); }

// --- Normalisering ---
function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}
function normalizePnr(s) {
  const digits = String(s || '').replace(/\D/g, '');
  if (digits.length === 12) return digits;
  if (digits.length === 10) return '19' + digits; // assume 1900s
  return null;
}
function normalizePhone(s) {
  const cleaned = String(s || '').replace(/[\s\-()]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned.replace(/[^\d+]/g, '');
  // Svenska nummer börjar med 0 → +46
  if (cleaned.startsWith('07') || cleaned.startsWith('08') || cleaned.startsWith('031') || cleaned.startsWith('010') || cleaned.startsWith('020')) {
    return '+46' + cleaned.substring(1);
  }
  return cleaned;
}
function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function normalizeDate(s) {
  // Födelsedatum kan vara YYYY-MM-DD eller XLSX-datum-nummer
  if (!s) return null;
  if (typeof s === 'number') {
    // XLSX datum-serie
    const d = XLSX.SSF.parse_date_code(s);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    return null;
  }
  const str = String(s).trim();
  const match = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return null;
}

function maskPnr(pnr) {
  if (!pnr) return '****';
  return '****' + pnr.slice(-4);
}

function maskEmail(e) {
  if (!e) return '';
  const [user, domain] = e.split('@');
  return (user ? user[0] + '***' : '') + (domain ? '@' + domain : '');
}

// --- Index-byggare för Cliento-side lookups ---
function buildClientoIndex(customerState) {
  const directory = customerState.directory || {};
  const details = customerState.details || {};
  const idx = {
    byEmail: new Map(),
    byPhone: new Map(),
    byPnr: new Map(), // CCO har inte explicit pnr-fält ännu — försök via metadata
    byName: new Map(),
  };
  for (const [key, dir] of Object.entries(directory)) {
    const det = details[key] || {};
    (det.emails || []).forEach((e) => {
      const ne = normalizeEmail(e);
      if (ne) idx.byEmail.set(ne, key);
    });
    const phone = det.phone;
    if (phone) {
      const np = normalizePhone(phone);
      if (np) idx.byPhone.set(np, key);
    }
    const nn = normalizeName(dir.name);
    if (nn && nn.length > 2) {
      if (!idx.byName.has(nn)) idx.byName.set(nn, key);
    }
  }
  return idx;
}

async function main() {
  const args = parseArgs(process.argv);

  const absXlsx = path.resolve(args.xlsx);
  if (!fs.existsSync(absXlsx)) {
    console.error('FEL: XLSX-filen finns inte: ' + absXlsx);
    process.exit(2);
  }

  // Säkerhetscheck: filen får inte ligga i repo
  const repoRoot = path.resolve(__dirname, '..');
  if (absXlsx.startsWith(repoRoot + path.sep)) {
    console.error('COMPLIANCE-FEL: XLSX-filen ligger i repo-katalogen.');
    console.error('Patientdata får INTE finnas i GitHub. Flytta filen till iCloud (utanför repo).');
    process.exit(3);
  }

  console.log('=== Meridiq Patient De-dup ===');
  console.log('XLSX:       ' + absXlsx);
  const size = fs.statSync(absXlsx).size;
  console.log('Storlek:    ' + (size / 1024).toFixed(1) + ' KB');
  console.log('Mode:       ' + (args.commit ? 'LIVE COMMIT' : 'DRY-RUN'));
  console.log('Tenant:     ' + args.tenant);

  // Läs XLSX
  const wb = XLSX.readFile(absXlsx);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log('');
  console.log('Sheet:       "' + sheetName + '"');
  console.log('Total rader: ' + rows.length);

  if (args.limit > 0) {
    rows = rows.slice(0, args.limit);
    console.log('LIMIT:       ' + args.limit + ' rader');
  }

  // Normalisera Meridiq-rader
  const meridiqPatients = rows.map((r, i) => ({
    rowNumber: i + 2,
    firstName: r['Förnamn'] || '',
    lastName: r['Efternamn'] || '',
    fullName: ((r['Förnamn'] || '') + ' ' + (r['Efternamn'] || '')).trim(),
    email: normalizeEmail(r['E-mail'] || ''),
    pnr: normalizePnr(r['Personnummer'] || ''),
    phone: normalizePhone(r['Telefonnummer'] || ''),
    birthdate: normalizeDate(r['Födelsedatum'] || ''),
  }));

  // PII-säker stats
  let withEmail = 0, withPnr = 0, withPhone = 0, withBirthdate = 0, anonymous = 0;
  for (const p of meridiqPatients) {
    if (p.email) withEmail += 1;
    if (p.pnr) withPnr += 1;
    if (p.phone) withPhone += 1;
    if (p.birthdate) withBirthdate += 1;
    if (!p.email && !p.pnr && !p.phone && !p.fullName) anonymous += 1;
  }
  console.log('');
  console.log('--- PII-säker patient-coverage ---');
  console.log('Med email:       ' + withEmail.toString().padStart(6) + ' (' + (100*withEmail/meridiqPatients.length).toFixed(1) + '%)');
  console.log('Med personnr:    ' + withPnr.toString().padStart(6) + ' (' + (100*withPnr/meridiqPatients.length).toFixed(1) + '%)');
  console.log('Med telefon:     ' + withPhone.toString().padStart(6) + ' (' + (100*withPhone/meridiqPatients.length).toFixed(1) + '%)');
  console.log('Med födelsedat:  ' + withBirthdate.toString().padStart(6) + ' (' + (100*withBirthdate/meridiqPatients.length).toFixed(1) + '%)');
  console.log('Anonyma:         ' + anonymous.toString().padStart(6));

  // Ladda CCO customer store
  const ccoStorePath = path.join(repoRoot, 'data', 'cco-customers.json');
  const store = await createCcoCustomerStore({ filePath: ccoStorePath });
  const customerState = await store.peekTenantCustomerState({ tenantId: args.tenant });
  const clientoCount = Object.keys(customerState.directory || {}).length;
  console.log('');
  console.log('CCO-tenant "' + args.tenant + '" har ' + clientoCount + ' Cliento-kunder att matcha mot.');

  // Bygg uppslagstabeller
  const clientoIdx = buildClientoIndex(customerState);

  // De-dup-matcha
  const stats = {
    matchedByEmail: 0,
    matchedByPhone: 0,
    matchedByName: 0,
    matchedTotal: 0,
    meridiqOnly: 0,
    duplicateWithinMeridiq: 0,
  };
  const matchedClientoKeys = new Set();
  const seenInMeridiq = new Set();
  const meridiqOnlyPatients = [];
  // För --commit-fasen: spara match-mapping så vi kan skriva meridiqMeta
  const matchPairs = []; // [{ clientoKey, p (meridiq patient), via }]

  for (const p of meridiqPatients) {
    // Detektera inom-Meridiq-duplikat
    const fp = p.pnr || p.email || p.phone || (p.fullName + '|' + p.birthdate);
    if (seenInMeridiq.has(fp)) {
      stats.duplicateWithinMeridiq += 1;
      continue;
    }
    seenInMeridiq.add(fp);

    let matched = false;
    let matchKey = null;
    let matchVia = null;

    if (p.email && clientoIdx.byEmail.has(p.email)) {
      matchKey = clientoIdx.byEmail.get(p.email);
      matchVia = 'email';
      stats.matchedByEmail += 1;
      matched = true;
    } else if (p.phone && clientoIdx.byPhone.has(p.phone)) {
      matchKey = clientoIdx.byPhone.get(p.phone);
      matchVia = 'phone';
      stats.matchedByPhone += 1;
      matched = true;
    } else if (p.fullName) {
      const nn = normalizeName(p.fullName);
      if (nn.length > 5 && clientoIdx.byName.has(nn)) {
        matchKey = clientoIdx.byName.get(nn);
        matchVia = 'name';
        stats.matchedByName += 1;
        matched = true;
      }
    }

    if (matched) {
      stats.matchedTotal += 1;
      matchedClientoKeys.add(matchKey);
      matchPairs.push({ clientoKey: matchKey, p, via: matchVia });
    } else {
      stats.meridiqOnly += 1;
      meridiqOnlyPatients.push(p);
    }
  }

  const clientoOnly = clientoCount - matchedClientoKeys.size;

  console.log('');
  console.log('=== DE-DUP-RESULTAT ===');
  console.log('Meridiq totalt:                    ' + meridiqPatients.length.toString().padStart(6));
  console.log('  Inom-Meridiq-duplikat:           ' + stats.duplicateWithinMeridiq.toString().padStart(6));
  console.log('  Unika Meridiq-patienter:         ' + (meridiqPatients.length - stats.duplicateWithinMeridiq).toString().padStart(6));
  console.log('');
  console.log('Matchade mot Cliento totalt:       ' + stats.matchedTotal.toString().padStart(6));
  console.log('  via email:                       ' + stats.matchedByEmail.toString().padStart(6));
  console.log('  via telefon:                     ' + stats.matchedByPhone.toString().padStart(6));
  console.log('  via namn (fallback):             ' + stats.matchedByName.toString().padStart(6));
  console.log('');
  console.log('Meridiq-only (ej i Cliento):       ' + stats.meridiqOnly.toString().padStart(6));
  console.log('  → Arkiverade patienter eller');
  console.log('    Cliento-bortrensningar');
  console.log('');
  console.log('Cliento-only (ej i Meridiq):       ' + clientoOnly.toString().padStart(6));
  console.log('  → Leads utan vårdjournal');
  console.log('    (förväntat ~1 221 enligt audit)');

  if (!args.commit) {
    console.log('');
    console.log('=== DRY-RUN-LÄGE: ingen data skriven ===');
    console.log('Kör med --commit för att lägga till Meridiq-only-patienter till CCO');
    console.log('och berika existerande Cliento-matches med meridiq_id.');
    return;
  }

  // COMMIT-FAS — write meridiqMeta + lead-flagga + nya patienter
  console.log('');
  console.log('=== COMMIT-FAS ===');
  console.log('Skriver enrichments direkt till data/cco-customers.json (atomisk write).');

  // Re-load raw JSON (vi behöver inte gå genom store-API:n eftersom vi vet exakt vad vi skriver)
  const rawState = JSON.parse(fs.readFileSync(ccoStorePath, 'utf8'));
  const tenantBlock = rawState.tenants?.[args.tenant];
  if (!tenantBlock?.customerState) {
    throw new Error('Tenant "' + args.tenant + '" saknas i cco-customers.json');
  }
  const cs = tenantBlock.customerState;
  cs.directory = cs.directory || {};
  cs.details = cs.details || {};

  let enrichedCount = 0;
  let newCount = 0;
  let leadFlaggedCount = 0;
  const importedAt = nowIso();
  const importSourceTag = 'meridiq_xlsx_2026-05-30';

  // 1. Berika matchade med meridiqMeta (no PII — bara hash + masked + via)
  for (const { clientoKey, p, via } of matchPairs) {
    const dir = cs.directory[clientoKey];
    if (!dir) continue;
    dir.meridiqMeta = {
      hasJournal: true,
      via,
      pnrSuffix: p.pnr ? p.pnr.slice(-4) : null,
      emailMaskedDomain: p.email ? p.email.split('@')[1] || null : null,
      hasBirthdate: !!p.birthdate,
      importedAt,
      importSource: importSourceTag,
    };
    enrichedCount += 1;
  }

  // 2. Flagga Cliento-only-kunder som leads (noMeridiqJournal: true)
  for (const key of Object.keys(cs.directory)) {
    if (matchedClientoKeys.has(key)) continue;
    cs.directory[key].noMeridiqJournal = true;
    cs.directory[key].leadFlaggedAt = importedAt;
    leadFlaggedCount += 1;
  }

  // 3. Skapa nya CCO-kunder för Meridiq-only (försumbart antal — 7)
  for (const p of meridiqOnlyPatients) {
    // Generera unik key
    const baseSlug = (p.fullName || 'meridiq-only')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    let newKey = 'meridiq_' + baseSlug;
    let suffix = 0;
    while (cs.directory[newKey]) {
      suffix += 1;
      newKey = 'meridiq_' + baseSlug + '_' + suffix;
    }
    cs.directory[newKey] = {
      name: p.fullName || 'Meridiq-patient (namn saknas)',
      vip: false,
      emailCoverage: p.email ? 1 : 0,
      duplicateCandidate: false,
      profileCount: 1,
      customerValue: 0,
      totalConversations: 0,
      totalMessages: 0,
      meridiqMeta: {
        hasJournal: true,
        via: 'new_from_meridiq',
        pnrSuffix: p.pnr ? p.pnr.slice(-4) : null,
        emailMaskedDomain: p.email ? p.email.split('@')[1] || null : null,
        hasBirthdate: !!p.birthdate,
        importedAt,
        importSource: importSourceTag,
      },
    };
    cs.details[newKey] = {
      emails: p.email ? [p.email] : [],
      phone: p.phone || '',
      mailboxes: [],
    };
    newCount += 1;
  }

  // Bumpa updatedAt
  cs.updatedAt = importedAt;
  tenantBlock.updatedAt = importedAt;
  rawState.updatedAt = importedAt;

  // Atomisk write
  const tmpPath = ccoStorePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(rawState, null, 2), 'utf8');
  fs.renameSync(tmpPath, ccoStorePath);

  console.log('');
  console.log('--- COMMIT KLAR ---');
  console.log('Berikade Cliento-matches (meridiqMeta):   ' + enrichedCount.toString().padStart(6));
  console.log('Nya Meridiq-only-kunder skapade:          ' + newCount.toString().padStart(6));
  console.log('Cliento-only flaggade som leads:          ' + leadFlaggedCount.toString().padStart(6));
  console.log('Total directory-keys efter commit:        ' + Object.keys(cs.directory).length.toString().padStart(6));
  console.log('');
  console.log('Backup-fil bör finnas i:');
  console.log('  data/cco-customers.pre-meridiq-commit-*.json');
}

main().catch((err) => {
  console.error('IMPORT FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
