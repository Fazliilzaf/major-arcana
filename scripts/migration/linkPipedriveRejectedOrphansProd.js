#!/usr/bin/env node
'use strict';

/**
 * Koppla REJECTED pipedrive_import-orphans till patientkort på prod.
 * Högkonfidens: unikt personId från people-CSV + exakt en Cliento-match (email/tel/pnr).
 *
 *   node scripts/migration/linkPipedriveRejectedOrphansProd.js --dry-run
 *   node scripts/migration/linkPipedriveRejectedOrphansProd.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { getProdToken } = require('../lib/halsoHdProdClient');
const {
  normalizePipedrivePersonRecord,
  buildPipedrivePatientLookup,
  findPatientsForPipedrivePerson,
} = require('../../src/ops/ccoPatientMasterStore');
const {
  resolvePersonIdFromFileName,
  buildPipedrivePeopleNameIndex,
  extractPersonNameFromFileName,
  nameKey,
} = require('./lib/pipedriveSmartdocsImport');

const ROOT = path.join(__dirname, '../..');
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const DEFAULT_ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data'
);

function parseArgs(argv) {
  const args = {
    dryRun: true,
    rejectPatchPath: path.join(ROOT, 'data/reports/pipedrive-needs-review-reject-patch.json'),
    peopleCsv: path.join(DEFAULT_ICLOUD_ROOT, 'pipedrive-2026-05-24/personer-2026-05-24.csv'),
    reportPath: path.join(ROOT, 'data/reports/pipedrive-rejected-link-plan.json'),
    minConfidence: 0.7,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--reject-patch') args.rejectPatchPath = argv[++i];
    else if (token === '--people-csv') args.peopleCsv = argv[++i];
    else if (token === '--report') args.reportPath = argv[++i];
  }
  return args;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadPeopleCsv(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) {
    throw new Error(`People-CSV saknas: ${csvPath}`);
  }
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

async function requestJson(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const error = new Error(
      `${method} ${route} -> ${res.status}: ${parsed.error || text.slice(0, 160)}`
    );
    error.status = res.status;
    throw error;
  }
  return parsed;
}

async function fetchAllProdPatients(token) {
  const patients = [];
  const limit = 500;
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await requestJson(
      'GET',
      `/api/v1/cco-patient-master/patients?limit=${limit}&offset=${offset}`,
      token
    );
    total = Number(page.total) || 0;
    patients.push(...(page.patients || []));
    offset += limit;
    if (!(page.patients || []).length) break;
  }
  return patients;
}

function resolvePersonIdForAsset(fileName, peopleIndex, lookup, peopleById, minConfidence) {
  const fromCsv = resolvePersonIdFromFileName(fileName, peopleIndex);
  if (fromCsv.personId) {
    return { personId: fromCsv.personId, method: fromCsv.method };
  }
  if (fromCsv.method !== 'pipedrive_people_ambiguous') return null;
  const ids = [
    ...new Set(
      (peopleIndex.byName.get(nameKey(extractPersonNameFromFileName(fileName))) || []).map(String)
    ),
  ];
  for (const personId of ids) {
    const person = peopleById.get(String(personId));
    if (!person) continue;
    const candidates = findPatientsForPipedrivePerson(lookup, person, {
      enableNameFallback: false,
    }).filter((item) => item.confidence >= minConfidence);
    if (candidates.length === 1) {
      return { personId, method: 'disambiguated_single_cliento_match' };
    }
  }
  return null;
}

function buildPatientPayloadFromPerson(person, deals = []) {
  return {
    tenantId: TENANT_ID,
    displayName: person.name,
    firstName: person.firstName,
    lastName: person.lastName,
    primaryEmail: person.primaryEmail || person.emails?.[0] || '',
    primaryPhone: person.primaryPhone || person.phones?.[0] || '',
    emails: person.emails || [],
    phones: person.phones || [],
    personnummer: person.personnummer || '',
    matchStatus: 'needs_review',
    pipedrive: {
      source: 'pipedrive',
      personId: person.personId,
      name: person.name,
      firstName: person.firstName,
      lastName: person.lastName,
      emails: person.emails || [],
      phones: person.phones || [],
      organization: person.organization,
      owner: person.owner,
      matchMethod: 'pipedrive_rejected_orphan_import',
      matchConfidence: 0.85,
      deals,
      importedAt: new Date().toISOString(),
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrationLinkAsset(token, assetId, patientId, { attempts = 6 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestJson(
        'POST',
        `/api/v1/cco/assets/${encodeURIComponent(assetId)}/migration-link-patient`,
        token,
        { patientId, reason: 'pipedrive_rejected_orphan_link' }
      );
    } catch (error) {
      if (error.status === 502 || error.status >= 500) {
        await sleep(1500 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`migration-link misslyckades efter ${attempts} försök för ${assetId}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.rejectPatchPath)) {
    throw new Error(`Reject-patch saknas: ${args.rejectPatchPath}`);
  }

  const rejectPatch = JSON.parse(fs.readFileSync(args.rejectPatchPath, 'utf8'));
  const rejectedAssets = Object.values(rejectPatch.items || {}).filter(
    (asset) => asset?.sourceSystem === 'pipedrive_import' && asset?.status === 'REJECTED'
  );

  const peopleRows = loadPeopleCsv(args.peopleCsv);
  const peopleIndex = buildPipedrivePeopleNameIndex(peopleRows);
  const peopleById = new Map();
  for (const row of peopleRows) {
    const person = normalizePipedrivePersonRecord(row);
    if (person.personId) peopleById.set(String(person.personId), person);
  }

  const token = args.dryRun ? null : getProdToken();
  let prodPatients = [];
  if (args.dryRun) {
    const masterPath = path.join(ROOT, 'data/cco-patient-master.json');
    if (fs.existsSync(masterPath)) {
      const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
      prodPatients = master.tenants?.[TENANT_ID]?.patients || [];
    }
  } else {
    prodPatients = await fetchAllProdPatients(token);
  }
  const lookup = buildPipedrivePatientLookup(prodPatients);

  const plan = [];
  const unresolved = [];
  const patientsToCreate = new Map();

  for (const asset of rejectedAssets) {
    const fileName = asset.originalFileName || asset.displayName || '';
    const personRef = resolvePersonIdForAsset(
      fileName,
      peopleIndex,
      lookup,
      peopleById,
      args.minConfidence
    );
    if (!personRef?.personId) {
      unresolved.push({ assetId: asset.id, fileName, reason: 'no_person_id' });
      continue;
    }
    const person = peopleById.get(String(personRef.personId));
    if (!person) {
      unresolved.push({ assetId: asset.id, fileName, reason: 'person_missing_in_csv' });
      continue;
    }

    const candidates = findPatientsForPipedrivePerson(lookup, person, {
      enableNameFallback: false,
    }).filter((item) => item.confidence >= args.minConfidence);

    if (candidates.length === 1) {
      plan.push({
        assetId: asset.id,
        fileName,
        personId: person.personId,
        patientId: candidates[0].patient.id,
        method: `${personRef.method}:${candidates[0].method}`,
        action: 'link_existing',
      });
      continue;
    }

    if (candidates.length === 0) {
      if (!patientsToCreate.has(String(person.personId))) {
        patientsToCreate.set(String(person.personId), {
          person,
          assets: [],
        });
      }
      patientsToCreate.get(String(person.personId)).assets.push({
        assetId: asset.id,
        fileName,
        method: personRef.method,
      });
      continue;
    }

    unresolved.push({
      assetId: asset.id,
      fileName,
      reason: 'ambiguous_patient_match',
      candidateCount: candidates.length,
    });
  }

  const createdPatients = new Map();
  if (!args.dryRun) {
    for (const [personId, entry] of patientsToCreate.entries()) {
      const payload = buildPatientPayloadFromPerson(entry.person);
      const result = await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, payload);
      const prodId = result?.patient?.id || result?.id;
      if (!prodId) {
        throw new Error(`Ingen prod UUID efter PUT för pipedrive person ${personId}`);
      }
      createdPatients.set(personId, prodId);
      for (const row of entry.assets) {
        plan.push({
          assetId: row.assetId,
          fileName: row.fileName,
          personId,
          patientId: prodId,
          method: `${row.method}:create_pipedrive_patient`,
          action: 'link_new_patient',
        });
      }
    }
  } else {
    for (const [personId, entry] of patientsToCreate.entries()) {
      const dryPatientId = `(dry-run-patient-${personId})`;
      createdPatients.set(personId, dryPatientId);
      for (const row of entry.assets) {
        plan.push({
          assetId: row.assetId,
          fileName: row.fileName,
          personId,
          patientId: dryPatientId,
          method: `${row.method}:create_pipedrive_patient`,
          action: 'link_new_patient',
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    rejectedTotal: rejectedAssets.length,
    linkPlanCount: plan.length,
    unresolvedCount: unresolved.length,
    newPatientsCount: patientsToCreate.size,
    plan,
    unresolvedSample: unresolved.slice(0, 40),
  };
  fs.mkdirSync(path.dirname(args.reportPath), { recursive: true });
  fs.writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`\n=== PIPEDRIVE REJECTED LINK ${args.dryRun ? '(DRY-RUN)' : '(WRITE)'} ===`);
  console.log(
    JSON.stringify(
      {
        rejectedTotal: report.rejectedTotal,
        linkPlanCount: report.linkPlanCount,
        newPatientsCount: report.newPatientsCount,
        unresolvedCount: report.unresolvedCount,
        reportPath: args.reportPath,
      },
      null,
      2
    )
  );

  if (args.dryRun) return;

  let linked = 0;
  let failed = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const row = plan[i];
    try {
      await migrationLinkAsset(token, row.assetId, row.patientId);
      linked += 1;
    } catch (error) {
      failed += 1;
      if (failed <= 5) console.error(`FAIL ${row.assetId}: ${error.message}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`progress ${i + 1}/${plan.length} linked=${linked} failed=${failed}`);
    }
    await sleep(400);
  }

  console.log(JSON.stringify({ linked, failed, total: plan.length }, null, 2));
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
