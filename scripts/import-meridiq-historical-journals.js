#!/usr/bin/env node
'use strict';

/**
 * import-meridiq-historical-journals.js
 * ======================================
 *
 * P0.7 — Meridiq historisk-bulk-import-SKELETON (DRY-RUN endast).
 *
 * Status: BLOCKED på Meridiq read-only API-access (eller XLSX-export per
 * patient). Detta script är ett stub/skeleton som visar EXAKT hur bulk-
 * importen kommer att fungera när access finns. Det:
 *
 *   1. Itererar över alla Cliento+Meridiq-matchade patienter i
 *      `data/cco-customers.json#tenants.hair_tp.customerState.directory`
 *      där `meridiqMeta.hasJournal === true`.
 *   2. Per patient — anropar `fetchMeridiqJournalsForPatient(meridiqId)`
 *      (en stub som returnerar mock-N entries). När API finns: byts
 *      stub:en mot riktiga HTTP-anrop.
 *   3. För varje historisk entry — POST till `ccoJournalStore.createEntry`
 *      med `journalType: 'historical_import'`, `importMeta.source:
 *      'meridiq'`, `importMeta.meridiqPatientId`, `importMeta.fetchedAt`,
 *      `signedAt: <Meridiq-signeringsdatum>`, `locked: true`.
 *   4. Audit-loggar `journal.historical_import` per patient + summa.
 *
 * Säkerhet (per .cursor/rules/cco-journal-cutover-first.mdc):
 *   - INGA patientnamn/pnr/email i scriptets stdout (counts only).
 *   - INGEN auto-merge — befintliga entries skrivs INTE över; vi appendar.
 *   - DRY-RUN är default — `--commit` kräver `--meridiq-api-token`-flagga
 *     som idag returnerar fel ("API not yet accessible") tills owner
 *     levererar token.
 *
 * Användning:
 *
 *   # Dry-run (default) — räknar bara hur många entries som SKULLE skapas
 *   node scripts/import-meridiq-historical-journals.js
 *
 *   # Dry-run med högre mock-N per patient
 *   node scripts/import-meridiq-historical-journals.js --mock-entries-per-patient=4
 *
 *   # Commit-läge (kräver token — kommer att fela tills API finns)
 *   node scripts/import-meridiq-historical-journals.js --commit --meridiq-api-token=XYZ
 *
 *   # Begränsa till N patienter (för smoke-test)
 *   node scripts/import-meridiq-historical-journals.js --limit=50
 *
 * Gap-dokumentation: se `docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md`.
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    dryRun: true,
    commit: false,
    meridiqApiToken: null,
    mockEntriesPerPatient: 2,
    limit: null,
    tenantId: 'hair_tp',
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (raw.startsWith('--meridiq-api-token=')) {
      args.meridiqApiToken = raw.split('=')[1] || null;
    } else if (raw.startsWith('--mock-entries-per-patient=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isInteger(n) && n > 0 && n <= 20) args.mockEntriesPerPatient = n;
    } else if (raw.startsWith('--limit=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isInteger(n) && n > 0) args.limit = n;
    } else if (raw.startsWith('--tenant=')) {
      args.tenantId = raw.split('=')[1] || 'hair_tp';
    }
  }
  return args;
}

// ─────────────────────────────────────────────────────────────────────────
// Data loaders — counts only, no PII in stdout
// ─────────────────────────────────────────────────────────────────────────
function loadCustomerDirectory(tenantId) {
  const filePath = path.join(__dirname, '..', 'data', 'cco-customers.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`data/cco-customers.json saknas: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const tenant = raw && raw.tenants && raw.tenants[tenantId];
  if (!tenant || !tenant.customerState || !tenant.customerState.directory) {
    throw new Error(`Tenant ${tenantId} saknar customerState.directory`);
  }
  return tenant.customerState.directory;
}

function listMeridiqEligiblePatients(directory) {
  // Eligible = har meridiqMeta.hasJournal=true (alltså 6 268 i hair_tp idag)
  const eligible = [];
  for (const key of Object.keys(directory)) {
    const entry = directory[key];
    const meta = entry && entry.meridiqMeta;
    if (meta && meta.hasJournal === true) {
      eligible.push({
        ccoPatientId: key,
        meridiqRef: meta.meridiqPatientId || meta.id || null,
        via: meta.via || null,
      });
    }
  }
  return eligible;
}

// ─────────────────────────────────────────────────────────────────────────
// STUB — Meridiq API (kommer att bytas mot riktig HTTP-klient när access finns)
// ─────────────────────────────────────────────────────────────────────────
async function fetchMeridiqJournalsForPatient({ meridiqRef, apiToken, mockN }) {
  // VID RIKTIG API-ACCESS:
  //   const res = await fetch(`${MERIDIQ_BASE}/api/v1/patients/${meridiqRef}/journals`, {
  //     headers: { Authorization: `Bearer ${apiToken}` }
  //   });
  //   if (!res.ok) throw new Error(`Meridiq API HTTP ${res.status}`);
  //   const json = await res.json();
  //   return json.journals.map(normalizeMeridiqJournal);
  //
  // För DRY-RUN: returnera mock-array (ingen patient-data, bara skelett).
  if (apiToken) {
    // Commit-läge — vi vägrar tills owner verifierar att API är live.
    throw new Error(
      'Meridiq API not yet accessible — token mottagen men endpoint inte verifierad. ' +
        'Se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md innan commit.'
    );
  }
  const out = [];
  for (let i = 0; i < mockN; i += 1) {
    out.push({
      meridiqEntryId: `MOCK-${meridiqRef || 'unknown'}-${i + 1}`,
      // INGA patient-namn/pnr/email — bara struktur-fält
      journalType: i === 0 ? 'consultation' : 'treatment',
      signedAt: null, // okänt utan API
      schemaId: 'mock-schema',
      fieldCount: 52, // matchar TP-paritet (P0.4)
      mock: true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Stub — what we WOULD do with each entry
// ─────────────────────────────────────────────────────────────────────────
function mockCreateEntry({ tenantId, ccoPatientId, meridiqEntry }) {
  // I commit-läge:
  //   await ccoJournalStore.createEntry({
  //     tenantId, patientId: ccoPatientId,
  //     journalType: 'historical_import',
  //     status: 'signed', locked: true,
  //     signedAt: meridiqEntry.signedAt,
  //     importMeta: {
  //       source: 'meridiq',
  //       meridiqEntryId: meridiqEntry.meridiqEntryId,
  //       fetchedAt: new Date().toISOString(),
  //       originalSchemaId: meridiqEntry.schemaId,
  //     },
  //     body: { /* normaliserad journal-text */ },
  //   });
  return {
    wouldCreate: true,
    tenantId,
    ccoPatientId,
    meridiqEntryId: meridiqEntry.meridiqEntryId,
    journalType: 'historical_import',
    locked: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);
  console.log('[meridiq-import] start');
  console.log(`[meridiq-import] mode: ${args.dryRun ? 'DRY-RUN' : 'COMMIT'}`);
  console.log(`[meridiq-import] tenant: ${args.tenantId}`);
  console.log(`[meridiq-import] mock entries/patient: ${args.mockEntriesPerPatient}`);
  if (args.limit) console.log(`[meridiq-import] limit: ${args.limit}`);

  if (args.commit && !args.meridiqApiToken) {
    console.error(
      '\n[ERROR] --commit kräver --meridiq-api-token=<token>. ' +
        'Token finns inte ännu — se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md.'
    );
    process.exit(2);
  }

  // 1) ladda directory
  const directory = loadCustomerDirectory(args.tenantId);
  const totalDirectory = Object.keys(directory).length;
  console.log(`[meridiq-import] directory loaded: ${totalDirectory} keys`);

  // 2) filtrera eligible
  const eligible = listMeridiqEligiblePatients(directory);
  console.log(`[meridiq-import] eligible (meridiqMeta.hasJournal=true): ${eligible.length}`);

  const work = args.limit ? eligible.slice(0, args.limit) : eligible;
  console.log(`[meridiq-import] processing: ${work.length} patienter`);

  // 3) iterera
  let patientsProcessed = 0;
  let entriesPlanned = 0;
  let patientsFailed = 0;
  const viaCounts = { email: 0, phone: 0, name: 0, new_from_meridiq: 0, other: 0 };

  for (const p of work) {
    if (p.via && viaCounts[p.via] !== undefined) viaCounts[p.via] += 1;
    else viaCounts.other += 1;

    try {
      const entries = await fetchMeridiqJournalsForPatient({
        meridiqRef: p.meridiqRef,
        apiToken: args.dryRun ? null : args.meridiqApiToken,
        mockN: args.mockEntriesPerPatient,
      });
      for (const e of entries) {
        mockCreateEntry({
          tenantId: args.tenantId,
          ccoPatientId: p.ccoPatientId,
          meridiqEntry: e,
        });
        entriesPlanned += 1;
      }
      patientsProcessed += 1;
    } catch (err) {
      patientsFailed += 1;
      // FÖRSTA felet i commit-läge ska stoppa — i dry-run ignorerar vi.
      if (!args.dryRun) {
        console.error(`[meridiq-import] FATAL: ${err.message}`);
        process.exit(3);
      }
    }
  }

  // 4) rapport — COUNTS ONLY (ingen patient-data)
  console.log('\n[meridiq-import] === SUMMARY ===');
  console.log(`  patients processed: ${patientsProcessed}`);
  console.log(`  patients failed: ${patientsFailed}`);
  console.log(`  entries planned (would-create): ${entriesPlanned}`);
  console.log(`  via.email: ${viaCounts.email}`);
  console.log(`  via.phone: ${viaCounts.phone}`);
  console.log(`  via.name: ${viaCounts.name}`);
  console.log(`  via.new_from_meridiq: ${viaCounts.new_from_meridiq}`);
  console.log(`  via.other: ${viaCounts.other}`);
  console.log(`  mode: ${args.dryRun ? 'DRY-RUN (inga skrivningar)' : 'COMMIT (skulle ha skrivit)'}`);
  console.log('\n[meridiq-import] gap: se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md');
  console.log('[meridiq-import] ETA till live: 5–6 dagar efter Meridiq API-access');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[meridiq-import] FATAL:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  loadCustomerDirectory,
  listMeridiqEligiblePatients,
  fetchMeridiqJournalsForPatient,
  mockCreateEntry,
};
