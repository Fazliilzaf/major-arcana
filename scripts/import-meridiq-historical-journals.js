#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

/**
 * import-meridiq-historical-journals.js
 * ======================================
 *
 * P0.7 — Meridiq historisk bulk-import via live API.
 *
 * Kräver:
 *   - ARCANA_MERIDIQ_COOKIE eller ARCANA_MERIDIQ_API_TOKEN i .env
 *   - meridiqPatientId på meridiqMeta (kör sync-meridiq-client-ids.js först)
 *
 * Användning:
 *   npm run migration:preflight-meridiq
 *   node scripts/migration/sync-meridiq-client-ids.js --commit
 *   node scripts/import-meridiq-historical-journals.js --limit=5
 *   node scripts/import-meridiq-historical-journals.js --commit --limit=50
 */

const fs = require('fs');
const path = require('path');

const {
  resolveMeridiqCredentials,
  listClientQuestionaries,
  normalizeMeridiqQuestionaryEntry,
} = require('./migration/lib/meridiqApi');
const { createCcoJournalStore } = require('../src/ops/ccoJournalStore');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONARY_CATALOG = path.join(ROOT, 'migration/meridiq/questionary-catalog.json');

const JOURNAL_TYPES = new Set([
  'tp_treatment',
  'prp_treatment',
  'follow_up',
  'bleph_treatment',
  'consultation',
  'treatment',
]);

const NON_JOURNAL_TYPES = new Set(['health_declaration', 'fitness_certificate']);

function parseArgs(argv) {
  const args = {
    dryRun: true,
    commit: false,
    mockEntriesPerPatient: 0,
    limit: null,
    tenantId: 'hair_tp',
    cookieFile: null,
    meridiqApiToken: null,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run') args.dryRun = true;
    else if (raw === '--commit') {
      args.commit = true;
      args.dryRun = false;
    } else if (raw.startsWith('--meridiq-api-token='))
      args.meridiqApiToken = raw.split('=')[1] || null;
    else if (raw.startsWith('--cookie-file=')) args.cookieFile = raw.split('=')[1] || null;
    else if (raw.startsWith('--mock-entries-per-patient=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isInteger(n) && n > 0 && n <= 20) args.mockEntriesPerPatient = n;
    } else if (raw.startsWith('--limit=')) {
      const n = Number(raw.split('=')[1]);
      if (Number.isInteger(n) && n > 0) args.limit = n;
    } else if (raw.startsWith('--tenant=')) args.tenantId = raw.split('=')[1] || 'hair_tp';
  }
  return args;
}

function loadQuestionaryJournalMap() {
  if (!fs.existsSync(QUESTIONARY_CATALOG)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(QUESTIONARY_CATALOG, 'utf8'));
  const map = new Map();
  for (const form of catalog.forms || []) {
    map.set(String(form.apiId), {
      journalType: form.arcanaJournalType || 'historical_import',
      title: form.title || '',
      migrate: form.migrate !== false,
    });
  }
  return map;
}

function loadCustomerDirectory(tenantId) {
  const filePath = path.join(ROOT, 'data', 'cco-customers.json');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const tenant = raw?.tenants?.[tenantId];
  if (!tenant?.customerState?.directory) {
    throw new Error(`Tenant ${tenantId} saknar customerState.directory`);
  }
  return tenant.customerState.directory;
}

function listMeridiqEligiblePatients(directory) {
  const eligible = [];
  for (const key of Object.keys(directory)) {
    const entry = directory[key];
    const meta = entry?.meridiqMeta;
    if (meta?.hasJournal === true) {
      eligible.push({
        ccoPatientId: key,
        meridiqRef: meta.meridiqPatientId || meta.id || null,
        via: meta.via || null,
      });
    }
  }
  return eligible;
}

function isJournalQuestionary(meta, questionaryMap) {
  if (!meta?.questionaryId) return false;
  const mapped = questionaryMap.get(String(meta.questionaryId));
  if (!mapped || mapped.migrate === false) return false;
  const journalType = mapped.journalType;
  if (!journalType || NON_JOURNAL_TYPES.has(journalType)) return false;
  return JOURNAL_TYPES.has(journalType);
}

function buildImportKey(meridiqClientId, entry) {
  return `meridiq::${meridiqClientId}::${entry.meridiqEntryId || entry.questionaryId}`;
}

function buildJournalEntryFromMeridiq({
  tenantId,
  ccoPatientId,
  meridiqClientId,
  entry,
  questionaryMap,
}) {
  const mapped = questionaryMap.get(String(entry.questionaryId)) || {};
  return {
    tenantId,
    patientId: ccoPatientId,
    journalType: mapped.journalType || 'historical_import',
    title: entry.title || mapped.title || 'Meridiq journal',
    source: 'meridiq_import',
    status: 'signed',
    locked: true,
    signedAt: entry.signedAt || new Date().toISOString(),
    signedByName: entry.authorName || 'Meridiq-import',
    sourceQuestionaryId: entry.questionaryId,
    importMeta: {
      source: 'meridiq',
      importKey: buildImportKey(meridiqClientId, entry),
      meridiqEntryId: entry.meridiqEntryId,
      meridiqPatientId: meridiqClientId,
      questionaryId: entry.questionaryId,
      pdfUrl: entry.pdfUrl || null,
      fetchedAt: new Date().toISOString(),
      readOnly: true,
    },
    journalTypeMeta: { historical_import: true },
  };
}

async function fetchMeridiqJournalsForPatient({ meridiqRef, credentials, mockN, questionaryMap }) {
  if (!credentials?.ok) {
    if (mockN > 0) {
      const out = [];
      for (let i = 0; i < mockN; i += 1) {
        out.push({
          meridiqEntryId: `MOCK-${meridiqRef || 'unknown'}-${i + 1}`,
          questionaryId: '16411',
          journalType: 'tp_treatment',
          signedAt: null,
          mock: true,
        });
      }
      return out;
    }
    throw new Error('Meridiq credentials saknas — kör migration:preflight-meridiq');
  }
  if (!meridiqRef) return [];

  const rows = (await listClientQuestionaries(meridiqRef, credentials)).map(
    normalizeMeridiqQuestionaryEntry
  );
  return rows.filter((entry) => isJournalQuestionary(entry, questionaryMap));
}

async function main() {
  const args = parseArgs(process.argv);
  const questionaryMap = loadQuestionaryJournalMap();
  const credentials = resolveMeridiqCredentials({
    apiToken: args.meridiqApiToken,
    cookieFile: args.cookieFile,
  });

  console.log('[meridiq-import] start');
  console.log(`[meridiq-import] mode: ${args.dryRun ? 'DRY-RUN' : 'COMMIT'}`);
  console.log(`[meridiq-import] tenant: ${args.tenantId}`);
  if (args.limit) console.log(`[meridiq-import] limit: ${args.limit}`);

  if (args.commit && !credentials.ok) {
    console.error('\n[ERROR] --commit kräver Meridiq API-credentials.');
    console.error(
      'Sätt ARCANA_MERIDIQ_COOKIE i .env eller kör npm run migration:preflight-meridiq'
    );
    process.exit(2);
  }

  if (credentials.ok) {
    console.log(`[meridiq-import] auth: ${credentials.authMode}`);
  } else if (args.mockEntriesPerPatient > 0) {
    console.log('[meridiq-import] auth: MOCK (ingen cookie/token)');
  } else {
    console.log('[meridiq-import] auth: MISSING — endast patients med mockN>0 skulle fungera');
  }

  const directory = loadCustomerDirectory(args.tenantId);
  console.log(`[meridiq-import] directory loaded: ${Object.keys(directory).length} keys`);

  const eligible = listMeridiqEligiblePatients(directory);
  const withId = eligible.filter((p) => p.meridiqRef).length;
  console.log(`[meridiq-import] eligible (hasJournal): ${eligible.length}`);
  console.log(`[meridiq-import] with meridiqPatientId: ${withId}`);
  if (withId === 0 && credentials.ok) {
    console.error(
      '[meridiq-import] BLOCKER: ingen meridiqPatientId — kör sync-meridiq-client-ids.js --commit först'
    );
    process.exit(4);
  }

  const work = args.limit ? eligible.slice(0, args.limit) : eligible;
  console.log(`[meridiq-import] processing: ${work.length} patienter`);

  let journalStore = null;
  if (args.commit) {
    journalStore = await createCcoJournalStore({
      filePath: path.join(ROOT, 'data', 'cco-journal.json'),
    });
  }

  let patientsProcessed = 0;
  let entriesPlanned = 0;
  let entriesCreated = 0;
  let entriesSkipped = 0;
  let patientsFailed = 0;
  let patientsSkippedNoId = 0;
  const viaCounts = { email: 0, phone: 0, name: 0, new_from_meridiq: 0, other: 0 };

  for (const p of work) {
    if (p.via && viaCounts[p.via] !== undefined) viaCounts[p.via] += 1;
    else viaCounts.other += 1;

    if (!p.meridiqRef && !args.mockEntriesPerPatient) {
      patientsSkippedNoId += 1;
      continue;
    }

    try {
      const entries = await fetchMeridiqJournalsForPatient({
        meridiqRef: p.meridiqRef,
        credentials,
        mockN: args.mockEntriesPerPatient,
        questionaryMap,
      });

      for (const entry of entries) {
        entriesPlanned += 1;
        if (!args.commit || !journalStore) continue;

        const payload = buildJournalEntryFromMeridiq({
          tenantId: args.tenantId,
          ccoPatientId: p.ccoPatientId,
          meridiqClientId: p.meridiqRef,
          entry,
          questionaryMap,
        });

        const importKey = payload.importMeta.importKey;
        const existing = (
          await journalStore.listEntries({
            tenantId: args.tenantId,
            patientId: p.ccoPatientId,
          })
        ).find((row) => row.importMeta?.importKey === importKey);

        if (existing) {
          entriesSkipped += 1;
          continue;
        }

        await journalStore.upsertEntry(payload, {
          actor: { userId: 'meridiq-import', displayName: 'Meridiq-import', role: 'system' },
        });
        entriesCreated += 1;
      }
      patientsProcessed += 1;
    } catch (err) {
      patientsFailed += 1;
      if (!args.dryRun) {
        console.error(`[meridiq-import] FATAL: ${err.message}`);
        process.exit(3);
      }
    }
  }

  console.log('\n[meridiq-import] === SUMMARY ===');
  console.log(`  patients processed: ${patientsProcessed}`);
  console.log(`  patients failed: ${patientsFailed}`);
  console.log(`  patients skipped (no meridiq id): ${patientsSkippedNoId}`);
  console.log(`  entries planned: ${entriesPlanned}`);
  console.log(`  entries created: ${entriesCreated}`);
  console.log(`  entries skipped (dup): ${entriesSkipped}`);
  console.log(`  via.email: ${viaCounts.email}`);
  console.log(`  via.phone: ${viaCounts.phone}`);
  console.log(`  via.name: ${viaCounts.name}`);
  console.log(`  via.new_from_meridiq: ${viaCounts.new_from_meridiq}`);
  console.log(`  mode: ${args.dryRun ? 'DRY-RUN' : 'COMMIT'}`);
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
  buildJournalEntryFromMeridiq,
  isJournalQuestionary,
};
