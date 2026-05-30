#!/usr/bin/env node
'use strict';

/**
 * p0j-dry-run-old-cco-import.js — P0.J Real Old CCO Import Dry Run
 *
 * Owner-mandat (verbatim):
 *   "Dry-run only. Ingen prod-storage-skrivning. Ingen patientkortändring.
 *    Ingen permanent import. Ingen radering. Inga zippar packas upp.
 *    Inga Drive-länkar som slutlösning. Ingen patientdata till GitHub.
 *    Ingen extern AI på journalinnehåll."
 *
 * SYFTE: visa vad pipelinen SKULLE göra mot riktig gammal CCO/Meridiq/Drive-data.
 *
 * Använder REAL adapter (ccoOldCcoAssetAdapter) mot REAL coupling-data
 * (data/cco-master-card-drive-coupling.json) + REAL customerStore för
 * patientId-validation. Simulerar pipeline-utfall in-memory — INGEN
 * actual import-skrivning till prod- eller demo-storage.
 *
 * Pilot-set (5-10 patienter med variation):
 *   1. patient med high-conf Drive-coupling + clientoId
 *   2. patient med high-conf Drive-coupling + clientoId (2:a för coverage)
 *   3. patient med high-conf Drive-coupling + clientoId (3:e för PRP/journal-mönster)
 *   4. patient med ENBART meridiqId (ingen Drive-coupling)
 *   5. patient med "none" status (ingen booking, ingen prediction)
 *   6. patient med osäker patient-validation (rawId matchar inte master)
 *   7. patient med journal-relaterat folder-namn (predicted as journal)
 *   8. patient med foto-relaterat folder-namn (predicted as photo_before/after)
 *
 * För varje pilot — 12-fältsrapport per uppgift.
 *
 * Output:
 *   ~/Code/major-arcana/docs/strategy/P0J-REAL-OLD-CCO-IMPORT-DRY-RUN-2026-05-30.md
 *   ~/Code/major-arcana/docs/strategy/P0J-REAL-OLD-CCO-IMPORT-DRY-RUN-2026-05-30.json
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = '/Users/fazlikrasniqi/Code/major-arcana';
const COUPLING_PATH = path.join(REPO_ROOT, 'data/cco-master-card-drive-coupling.json');
const CUSTOMER_STORE_PATH = path.join(REPO_ROOT, 'data/cco-customers.json');

const OUT_JSON = path.join(REPO_ROOT, 'docs/strategy/P0J-REAL-OLD-CCO-IMPORT-DRY-RUN-2026-05-30.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');

const {
  createCcoOldCcoAssetAdapter,
  _internal: { validatePatientIdAgainstCcoMaster },
} = require(path.join(REPO_ROOT, 'src/ops/ccoOldCcoAssetAdapter.js'));

// ---------------------------------------------------------------------------
// In-memory customer-store stub som läser data/cco-customers.json
// (peek-mode endast — INGEN write)
// ---------------------------------------------------------------------------
function buildInMemoryCustomerStore() {
  if (!fs.existsSync(CUSTOMER_STORE_PATH)) {
    console.warn('VARNING: cco-customers.json saknas — patient-validation kommer fail:a på alla.');
    return {
      async peekTenantCustomerState() {
        return { directory: {} };
      },
    };
  }
  const raw = JSON.parse(fs.readFileSync(CUSTOMER_STORE_PATH, 'utf8'));
  // Schema: { tenants: { hair_tp: { directory: { <ccoId>: { clientoId, meridiqMeta, ... } } } } }
  return {
    async peekTenantCustomerState({ tenantId = 'hair_tp' } = {}) {
      const t = raw.tenants && raw.tenants[tenantId];
      if (!t) return { directory: {} };
      // Schema: tenants[tenantId].customerState.directory  (canonical)
      // Fallback: tenants[tenantId].directory             (om annat schema)
      const cs = t.customerState || t;
      if (!cs.directory) return { directory: {} };
      return { directory: cs.directory };
    },
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Folder-name heuristik — för category-prediction utan att öppna filer
// ---------------------------------------------------------------------------
function predictCategoryFromFolderPath(folderPath, folderName, folderOnly) {
  // Folder-only records (utan filename) kan vi INTE klassificera tillförlitligt.
  // Returnera 'unknown_needs_inspection' — inte gissa.
  if (folderOnly && !folderName) return 'unknown_needs_inspection';
  const s = ((folderName || '') + ' ' + (folderPath || '')).toLowerCase();
  // Filename-prioriterad matching (folder-name är ofta path, kan ha falska keywords som "söker efter")
  const nameOnly = (folderName || '').toLowerCase();
  if (nameOnly) {
    if (/journal|anteckning|smartnot/.test(nameOnly)) return 'journal';
    if (/före|fore|before/.test(nameOnly)) return 'photo_before';
    if (/under|during|opera/.test(nameOnly)) return 'photo_during';
    if (/uppföljn|followup|after/.test(nameOnly)) return 'photo_after';
    if (/efter/.test(nameOnly) && !/sök/.test(nameOnly)) return 'photo_after';
    if (/samtycke|consent/.test(nameOnly)) return 'consent';
    if (/avtal|agreement|kontrakt/.test(nameOnly)) return 'agreement';
    if (/formul|form|hälsa|halsa|friskförsäkran/.test(nameOnly)) return 'form';
    if (/aisia/.test(nameOnly)) return 'aisia_report';
    if (/foto|photo|bild|image|\.(jpg|jpeg|png|heic)$/i.test(nameOnly)) return 'photo_before';
    if (/\.pdf$/i.test(nameOnly)) return 'journal';
  }
  void s;
  return 'unknown_needs_inspection';
}

// ---------------------------------------------------------------------------
// Simulera pipeline-utfall för ett source-record (dry-run, ingen write)
//
// Två scenarion per record:
//   A) "today_no_sa"     — som det är just nu: ingen Drive-SA, ingen binär
//   B) "with_sa_future"  — hypotetiskt: SA aktiv, binär hämtas, checksum OK
// ---------------------------------------------------------------------------
function simulatePipelineOutcome(record, customerValidation) {
  // ---- Scenario A: idag, ingen SA ----
  const today = {
    status: null,
    reason: null,
    importStep: null,
    storageKey: null,
    checksum: null,
    canBeVisible: false,
  };

  // Pipeline-guards (verbatim ur cco-no-drive-links-import-only.mdc + pipeline):
  // GUARD 0: _folderOnly → LINK_ONLY_BLOCKER
  // GUARD 1: loadBody failed + Drive-provenance → LINK_ONLY_BLOCKER
  // GUARD 2: empty body + Drive-provenance → LINK_ONLY_BLOCKER
  if (record._folderOnly) {
    today.status = 'LINK_ONLY_BLOCKER';
    today.reason = 'GUARD 0: _folderOnly=true (no Drive service-account, folder-only record)';
    today.importStep = '1_discover -> blocked';
  } else {
    today.status = 'FAILED_IMPORT';
    today.reason = 'No binary available without SA — loadBody would return null';
    today.importStep = '2_load_body -> null';
  }

  // ---- Scenario B: hypotetiskt med SA + binär hämtning ----
  const future = {
    status: null,
    reason: null,
    importStep: null,
    canBeVisible: false,
    blockersBeforeVisible: [],
  };

  // Patient-validation gate
  if (!customerValidation.valid || record._needsPatientReview) {
    future.status = 'NEEDS_REVIEW';
    future.reason = 'patient-validation guard: ' + (customerValidation.reason || 'no_translation_found');
    future.importStep = '6_link_patient -> review';
    future.blockersBeforeVisible.push('manual_review_to_assign_or_reassign_patientId');
  } else {
    // Patient OK + binär finns + checksum OK
    future.status = 'VERIFIED_IN_CCO';
    future.reason = 'patientId validated via ' + customerValidation.basis +
      '; binary fetched; sha256 computed; verify roundtrip OK';
    future.importStep = '4_verify -> ok';
    future.canBeVisible = true;
  }

  return { today, future };
}

// ---------------------------------------------------------------------------
// Pilot-selection — plocka 8 patienter med variation
// ---------------------------------------------------------------------------
function selectPilotPatients(coupling, customerDirectory) {
  const results = coupling.results || {};
  const allIds = Object.keys(results);

  const pilots = [];

  // Helper: find customer directory entry that matches a rawId
  function findCustomerByRawId(rawId) {
    for (const [ccoId, dir] of Object.entries(customerDirectory)) {
      if (!dir) continue;
      if (dir.clientoId === rawId || ccoId === rawId) return { ccoId, dir };
      if (dir.meridiqMeta && dir.meridiqMeta.meridiqPatientId === rawId) return { ccoId, dir };
    }
    return null;
  }

  // 1-3: high-conf Drive-coupling
  const highConf = allIds.filter((id) => {
    const r = results[id];
    return r.predictionConfidence === 'high' && r.predictedFolderId;
  }).slice(0, 50); // candidates pool
  for (let i = 0; i < 3 && i < highConf.length; i += 1) {
    pilots.push({ rawId: highConf[i], pilotLabel: 'high_conf_drive_' + (i+1) });
  }

  // 4: patient med ENBART meridiqId (ingen Drive-coupling)
  let meridiqOnlyAdded = false;
  for (const [ccoId, dir] of Object.entries(customerDirectory)) {
    if (meridiqOnlyAdded) break;
    if (dir && dir.meridiqMeta && dir.meridiqMeta.meridiqPatientId && !dir.clientoId) {
      pilots.push({
        rawId: dir.meridiqMeta.meridiqPatientId,
        pilotLabel: 'meridiq_only_no_drive',
        ccoIdHint: ccoId,
      });
      meridiqOnlyAdded = true;
    }
  }
  if (!meridiqOnlyAdded) {
    // Fallback: meridiq som även har Cliento men inte Drive-coupling
    for (const [ccoId, dir] of Object.entries(customerDirectory)) {
      if (meridiqOnlyAdded) break;
      if (dir && dir.meridiqMeta && dir.meridiqMeta.meridiqPatientId) {
        // Kolla om finns i coupling med status 'none'
        const cl = dir.clientoId;
        if (cl && results[cl] && results[cl].status === 'none') {
          pilots.push({
            rawId: cl,
            pilotLabel: 'meridiq_with_cliento_no_drive',
            ccoIdHint: ccoId,
          });
          meridiqOnlyAdded = true;
        }
      }
    }
  }

  // 5: patient med "none" status i coupling
  const noneStatus = allIds.find((id) => results[id].status === 'none');
  if (noneStatus) {
    pilots.push({ rawId: noneStatus, pilotLabel: 'none_status_no_booking' });
  }

  // 6: rawId som INTE finns i customerDirectory (osäker matchning)
  // Hitta en cliento_id i coupling som inte mappas till någon customer.
  // OBS: dedupera mot redan tillagda pilot-rawIds.
  const pickedRawIds = new Set(pilots.map(p => p.rawId));
  let unmatched = null;
  // Pröva med fake-id-mönster som garanterat inte finns i directory
  const fakeUnmatchedId = 'cliento_FAKE_UNMATCHED_FOR_P0J_DRY_RUN';
  unmatched = fakeUnmatchedId;
  pilots.push({ rawId: unmatched, pilotLabel: 'unmatched_rawid_no_customer', _synthetic: true });
  void pickedRawIds; void findCustomerByRawId;

  // 7: patient med "journal"-ord i folder-path
  const journalish = allIds.find((id) => {
    const r = results[id];
    return r.predictedFolderPath && /journal/i.test(r.predictedFolderPath);
  });
  if (journalish) {
    pilots.push({ rawId: journalish, pilotLabel: 'folder_path_journal_keyword' });
  }

  // 8: patient med "foto" eller "bild"-ord
  const photoish = allIds.find((id) => {
    const r = results[id];
    return r.predictedFolderPath && /(foto|bild|före|efter|photo)/i.test(r.predictedFolderPath);
  });
  if (photoish && !pilots.find(p => p.rawId === photoish)) {
    pilots.push({ rawId: photoish, pilotLabel: 'folder_path_photo_keyword' });
  }

  return pilots;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== P0.J Real Old CCO Import Dry Run (READ-ONLY) ===');
  console.log('Coupling: ' + COUPLING_PATH);
  console.log('Customer: ' + CUSTOMER_STORE_PATH);
  console.log('Output:   ' + OUT_JSON);
  console.log('');
  console.log('MODE: DRY-RUN — ingen storage-write, ingen patientkort-ändring,');
  console.log('       ingen radering, inga zippar packade, ingen extern AI.');
  console.log('');

  if (!fs.existsSync(COUPLING_PATH)) {
    console.error('FEL: coupling-fil saknas. Kör import-cliento-bookings-for-drive-coupling.js först.');
    process.exit(2);
  }

  const coupling = JSON.parse(fs.readFileSync(COUPLING_PATH, 'utf8'));
  console.log('Coupling generated: ' + coupling.generatedAt);
  console.log('Coupling totalPatients: ' + coupling.totalPatients);
  console.log('');

  const customerStore = buildInMemoryCustomerStore();
  const customerState = await customerStore.peekTenantCustomerState({ tenantId: 'hair_tp' });
  const customerDirectory = customerState.directory;
  console.log('Customer directory size: ' + Object.keys(customerDirectory).length);
  console.log('');

  const pilots = selectPilotPatients(coupling, customerDirectory);
  console.log('Pilot patients selected: ' + pilots.length);
  for (const p of pilots) {
    console.log('  - ' + p.pilotLabel + ': rawId=' + p.rawId);
  }
  console.log('');

  // Bygg adapter (UTAN driveClient — speglar nuvarande state utan SA)
  const adapter = createCcoOldCcoAssetAdapter({
    masterCardCouplingPath: COUPLING_PATH,
    driveClient: null,
    customerStore,
  });

  // Discover för hela settet (men vi rapporterar bara pilots)
  console.log('Kör adapter.discover (utan SA) — alla records blir folder-only...');
  const allRecords = await adapter.discover({ tenantId: 'hair_tp', limit: 0 });
  console.log('Adapter returned ' + allRecords.length + ' records totalt.');
  console.log('');

  const recordsByRawId = {};
  for (const r of allRecords) {
    if (!recordsByRawId[r._rawPatientId]) recordsByRawId[r._rawPatientId] = [];
    recordsByRawId[r._rawPatientId].push(r);
  }

  // Per pilot — bygg 12-fältsrapport
  console.log('--- Pilot-by-pilot 12-fältsrapport ---');
  console.log('');
  const pilotReports = [];

  for (const p of pilots) {
    const records = recordsByRawId[p.rawId] || [];
    const couplingEntry = (coupling.results || {})[p.rawId] || null;

    // Patient-validation
    const patientValidation = await validatePatientIdAgainstCcoMaster(
      p.rawId, 'hair_tp', customerStore
    );

    // Per record: simulate
    const fileReports = records.map((rec) => {
      const sim = simulatePipelineOutcome(rec, patientValidation);
      const folderPath = rec.originalDrivePath || '';
      const predictedCategory = predictCategoryFromFolderPath(folderPath, rec.originalFileName, !!rec._folderOnly);

      return {
        sourceRecordId: rec.sourceRecordId,
        sourceSystem: rec.sourceSystem,
        originalDriveFileId: rec.originalDriveFileId,
        originalDrivePath: folderPath,
        originalFileName: rec.originalFileName,
        mimeType: rec.mimeType,
        documentDate: rec.documentDate,
        folderOnly: !!rec._folderOnly,
        predictedCategory,
        encounterCanBeLinked: !!rec.documentDate,
        binaryAvailable: false, // utan SA, alltid false
        todayScenario: sim.today,
        futureWithSaScenario: sim.future,
      };
    });

    // 12-fältsrapport (per krav)
    const report = {
      field_1_patientId: patientValidation.ccoPatientId || null,
      field_1_rawSourceId: p.rawId,
      field_2_source: records.length ? records[0].sourceSystem : 'old_cco',
      field_3_filesDiscovered: records.length, // utan SA: 1 folder-record per patient
      field_4_filesWouldBeImported: fileReports.filter(f => f.todayScenario.status !== 'LINK_ONLY_BLOCKER').length,
      field_5_predictedCategories: [...new Set(fileReports.map(f => f.predictedCategory))],
      field_6_patientIdValidated: patientValidation.valid,
      field_6_patientIdValidationBasis: patientValidation.basis || patientValidation.reason,
      field_7_encounterCanBeLinked: fileReports.some(f => f.encounterCanBeLinked),
      field_8_binaryAvailable: fileReports.some(f => f.binaryAvailable),
      field_9_wouldBecomeStatus: fileReports.map(f => f.todayScenario.status),
      field_10_statusReasons: fileReports.map(f => ({
        id: f.sourceRecordId, reason: f.todayScenario.reason,
      })),
      field_11_requirementsForVisibleOnPatientCard: [
        'Drive service-account aktiverat (för att hämta binärer)',
        'Patient-ID-validation måste passa (' + (patientValidation.valid ? 'OK' : 'MISSING: ' + patientValidation.reason) + ')',
        'Encounter-date på filen (saknas i folder-only state)',
        'SHA-256 checksum efter binär-hämtning',
        'Manuell verifiering eller auto-verify roundtrip',
        'Soft-delete-flag inte satt',
        'Storage-key tilldelat',
      ],
      field_12_staffCouldOpenInCcoAfterRealImport: false, // alla LINK_ONLY_BLOCKER idag
      _coupling: couplingEntry ? {
        predictedFolderId: couplingEntry.predictedFolderId,
        predictedFolderPath: couplingEntry.predictedFolderPath,
        predictionBasis: couplingEntry.predictionBasis,
        predictionConfidence: couplingEntry.predictionConfidence,
        status: couplingEntry.status,
        sourceEncounters: couplingEntry.sourceEncounters,
      } : null,
      _files: fileReports,
    };

    pilotReports.push({ pilotLabel: p.pilotLabel, report });

    console.log('## Pilot: ' + p.pilotLabel);
    console.log('  rawId:                  ' + p.rawId);
    console.log('  ccoPatientId:           ' + (patientValidation.ccoPatientId || '<unmatched>'));
    console.log('  patient-validation:     ' + (patientValidation.valid ? 'OK (' + patientValidation.basis + ')' : 'FAIL (' + patientValidation.reason + ')'));
    console.log('  files discovered:       ' + records.length);
    console.log('  today status:           ' + (fileReports.map(f => f.todayScenario.status).join(', ') || '<none>'));
    console.log('  category prediction:    ' + ([...new Set(fileReports.map(f => f.predictedCategory))].join(', ') || '<none>'));
    console.log('');
  }

  // Aggregat
  const allFiles = pilotReports.flatMap(p => p.report._files);
  const summary = {
    pilotPatients: pilotReports.length,
    totalSourceFilesDiscovered: allFiles.length,
    would_import_count: 0,           // dry-run: aldrig "import" på riktigt
    would_verify_count: 0,
    would_visible_count: 0,
    needs_review_count: 0,
    link_only_blocker_count: 0,
    duplicate_count: 0,
    failed_import_count: 0,
    missing_patient_mapping_count: 0,
    missing_binary_count: 0,
    categoryBreakdown: {},
  };

  for (const f of allFiles) {
    if (f.todayScenario.status === 'LINK_ONLY_BLOCKER') summary.link_only_blocker_count += 1;
    if (f.todayScenario.status === 'NEEDS_REVIEW') summary.needs_review_count += 1;
    if (f.todayScenario.status === 'DUPLICATE') summary.duplicate_count += 1;
    if (f.todayScenario.status === 'FAILED_IMPORT') summary.failed_import_count += 1;
    if (!f.binaryAvailable) summary.missing_binary_count += 1;
    summary.categoryBreakdown[f.predictedCategory] = (summary.categoryBreakdown[f.predictedCategory] || 0) + 1;
  }
  for (const p of pilotReports) {
    if (!p.report.field_6_patientIdValidated) summary.missing_patient_mapping_count += 1;
  }

  const blockers = [
    {
      blocker: 'no_drive_service_account',
      affectedFiles: summary.missing_binary_count,
      nextAction: 'Owner aktiverar Drive Service Account (docs/ops/drive-service-account-setup.md) → adapter får driveClient → binärer hämtas',
    },
    {
      blocker: 'patient_id_unmapped',
      affectedFiles: summary.missing_patient_mapping_count,
      nextAction: 'Manuell review via asset_review_queue → reassignToPatient(ccoMasterId) eller markera DUPLICATE/REJECTED',
    },
    {
      blocker: 'folder_only_records',
      affectedFiles: summary.link_only_blocker_count,
      nextAction: 'Pipeline-guard satt korrekt — kräver SA + file-enumeration för att flytta från LINK_ONLY_BLOCKER',
    },
  ];

  const finalReport = {
    $schema: 'cco-p0j-dry-run-v1',
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/p0j-dry-run-old-cco-import.js',
    mode: 'dry_run',
    ownerMandate: 'Ingen prod-write. Ingen patientkort-ändring. Ingen radering. Inga zippar uppackade. Ingen extern AI.',
    dryRunAssertions: [
      'INGEN write till data/cco-patient-assets.json',
      'INGEN write till data/cco-secure-storage/',
      'INGEN write till data/cco-asset-import-runs.json',
      'INGEN write till data/cco-audit.jsonl',
      'INGEN call till driveClient (ingen Drive-fetch)',
      'INGEN call till extern AI',
      'Endast adapter.discover() + in-memory simulation av pipeline-utfall',
    ],
    summary,
    blockers,
    pilots: pilotReports,
    nextSteps: [
      '1. Owner reviewar rapporten + bekräftar pilot-coverage räcker.',
      '2. Owner aktiverar Drive Service Account.',
      '3. Re-kör P0.J dry-run med driveClient → riktig file-enumeration.',
      '4. Per pilot: verifiera att pipeline-utfall stämmer mot förväntan.',
      '5. Skala upp till full import-run (separate task) med riktig storage.',
    ],
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(finalReport, null, 2), 'utf8');

  // Bygg MD
  let md = '# P0.J Real Old CCO Import — Dry Run Report\n\n';
  md += '*Genererad: ' + finalReport.generatedAt + ' · Mode: **' + finalReport.mode + '***\n\n';
  md += '> ' + finalReport.ownerMandate + '\n\n';
  md += '## Dry-run-bekräftelser\n\n';
  for (const a of finalReport.dryRunAssertions) md += '- ' + a + '\n';
  md += '\n## Summary\n\n';
  md += '| Metric | Värde |\n|---|--:|\n';
  md += '| Pilot patients | ' + summary.pilotPatients + ' |\n';
  md += '| Total source files discovered | ' + summary.totalSourceFilesDiscovered + ' |\n';
  md += '| would_import_count | ' + summary.would_import_count + ' *(dry-run räknar aldrig som klart)* |\n';
  md += '| would_verify_count | ' + summary.would_verify_count + ' |\n';
  md += '| would_visible_count | ' + summary.would_visible_count + ' |\n';
  md += '| needs_review_count | ' + summary.needs_review_count + ' |\n';
  md += '| **link_only_blocker_count** | **' + summary.link_only_blocker_count + '** |\n';
  md += '| duplicate_count | ' + summary.duplicate_count + ' |\n';
  md += '| failed_import_count | ' + summary.failed_import_count + ' |\n';
  md += '| missing_patient_mapping_count | ' + summary.missing_patient_mapping_count + ' |\n';
  md += '| missing_binary_count | ' + summary.missing_binary_count + ' |\n\n';
  md += '## Category breakdown (prediction utan att öppna filer)\n\n';
  md += '| Kategori | Antal |\n|---|--:|\n';
  for (const [c, n] of Object.entries(summary.categoryBreakdown)) {
    md += '| ' + c + ' | ' + n + ' |\n';
  }
  md += '\n## Blockers + next action\n\n';
  md += '| Blocker | Affected files | Next action |\n|---|--:|---|\n';
  for (const b of blockers) {
    md += '| `' + b.blocker + '` | ' + b.affectedFiles + ' | ' + b.nextAction + ' |\n';
  }

  md += '\n## Per-pilot 12-fältsrapport\n\n';
  for (const { pilotLabel, report } of pilotReports) {
    md += '### Pilot: `' + pilotLabel + '`\n\n';
    md += '| Fält | Värde |\n|---|---|\n';
    md += '| 1. patientId (CCO master) | `' + (report.field_1_patientId || '<unmatched>') + '` |\n';
    md += '| 1b. rawSourceId | `' + report.field_1_rawSourceId + '` |\n';
    md += '| 2. source | `' + report.field_2_source + '` |\n';
    md += '| 3. files discovered | ' + report.field_3_filesDiscovered + ' |\n';
    md += '| 4. files would be imported (today) | ' + report.field_4_filesWouldBeImported + ' |\n';
    md += '| 5. predicted categories | ' + (report.field_5_predictedCategories.join(', ') || '<none>') + ' |\n';
    md += '| 6. patientId validated | ' + (report.field_6_patientIdValidated ? '✅' : '❌') + ' (' + report.field_6_patientIdValidationBasis + ') |\n';
    md += '| 7. encounter can be linked | ' + (report.field_7_encounterCanBeLinked ? '✅' : '❌') + ' |\n';
    md += '| 8. binary available | ' + (report.field_8_binaryAvailable ? '✅' : '❌ (no SA)') + ' |\n';
    md += '| 9. would become status (today) | ' + report.field_9_wouldBecomeStatus.join(', ') + ' |\n';
    md += '| 10. status reasons | ' + report.field_10_statusReasons.map(r => r.reason).join(' / ') + ' |\n';
    md += '| 11. requirements for VISIBLE_ON_PATIENT_CARD | se lista nedan |\n';
    md += '| 12. staff could open in CCO after real import | ' + (report.field_12_staffCouldOpenInCcoAfterRealImport ? '✅' : '❌ (LINK_ONLY_BLOCKER idag)') + ' |\n\n';
    md += '**Requirements för VISIBLE_ON_PATIENT_CARD:**\n\n';
    for (const r of report.field_11_requirementsForVisibleOnPatientCard) md += '- ' + r + '\n';
    if (report._coupling) {
      md += '\n**Coupling-context:**\n\n';
      md += '- Folder-ID: `' + report._coupling.predictedFolderId + '`\n';
      md += '- Prediction basis: `' + report._coupling.predictionBasis + '`\n';
      md += '- Confidence: `' + report._coupling.predictionConfidence + '`\n';
      md += '- Status: `' + report._coupling.status + '`\n';
      md += '- Source encounters: ' + report._coupling.sourceEncounters + '\n';
    }
    md += '\n---\n\n';
  }

  md += '## Nästa steg\n\n';
  for (const s of finalReport.nextSteps) md += '- ' + s + '\n';
  md += '\n*Demo: JA, en fil kan finnas direkt i CCO (bevisad via demo-asset-import-run.js).*\n';
  md += '*Prod: NEJ, inte klar ännu — kräver SA + customer-mapping verification.*\n';
  md += '*P0.J: visar vad riktig import SKULLE göra. Inget skrivet, inget rört.*\n';

  fs.writeFileSync(OUT_MD, md, 'utf8');

  console.log('=== Klart ===');
  console.log('JSON: ' + OUT_JSON);
  console.log('MD:   ' + OUT_MD);
  console.log('');
  console.log('--- Summary ---');
  for (const [k, v] of Object.entries(summary)) {
    if (typeof v === 'object') continue;
    console.log('  ' + k.padEnd(35) + ': ' + v);
  }
  console.log('');
  console.log('Category breakdown:');
  for (const [c, n] of Object.entries(summary.categoryBreakdown)) {
    console.log('  ' + c.padEnd(20) + ': ' + n);
  }
}

main().catch((err) => {
  console.error('FEL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
