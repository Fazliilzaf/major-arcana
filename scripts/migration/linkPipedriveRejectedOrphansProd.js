#!/usr/bin/env node
'use strict';

/**
 * Koppla REJECTED pipedrive_import-orphans till patientkort på prod.
 * Källor: people-CSV, Pipedrive persons/search API, direkt namn-match i patient-master.
 *
 *   node scripts/migration/linkPipedriveRejectedOrphansProd.js --dry-run
 *   node scripts/migration/linkPipedriveRejectedOrphansProd.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { getProdToken } = require('../lib/halsoHdProdClient');
const {
  normalizePipedrivePersonRecord,
  buildPipedrivePatientLookup,
  findPatientsForPipedrivePerson,
} = require('../../src/ops/ccoPatientMasterStore');
const {
  resolvePersonIdFromFileName,
  buildPipedrivePeopleNameIndex,
  buildPipedrivePatientIndex,
  extractPersonNameFromFileName,
  resolvePatientByFileName,
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
    usePipedriveApi: true,
    pipedriveDelayMs: 150,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') args.dryRun = false;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--no-pipedrive-api') args.usePipedriveApi = false;
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

function isNonPatientTemplate(fileName = '') {
  return /^(guide|efterv[aå]rdsguide|mall|template)[-_\s]/i.test(fileName);
}

function normalizePipedriveApiPerson(apiPerson = {}) {
  const emails = (Array.isArray(apiPerson.email) ? apiPerson.email : [])
    .map((entry) => entry?.value || entry?.email || entry)
    .filter(Boolean);
  const phones = (Array.isArray(apiPerson.phone) ? apiPerson.phone : [])
    .map((entry) => entry?.value || entry?.phone || entry)
    .filter(Boolean);
  return {
    personId: String(apiPerson.id || ''),
    name: apiPerson.name || '',
    firstName: apiPerson.first_name || '',
    lastName: apiPerson.last_name || '',
    emails,
    primaryEmail: emails[0] || '',
    phones,
    primaryPhone: phones[0] || '',
    personnummer: '',
    organization: '',
    owner: '',
  };
}

function createPipedriveApiClient() {
  const companyDomain = String(process.env.PIPEDRIVE_COMPANY_DOMAIN || '').trim();
  const apiToken = String(process.env.PIPEDRIVE_API_TOKEN || '').trim();
  if (!companyDomain || !apiToken) return null;

  async function pipedriveGet(pathname, searchParams = {}) {
    const url = new URL(`https://${companyDomain}.pipedrive.com/api/v1${pathname}`);
    for (const [key, value] of Object.entries(searchParams)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value));
    }
    url.searchParams.set('api_token', apiToken);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload.success === false) {
      const message = payload.error || payload.error_info || payload.message || res.statusText;
      throw new Error(`Pipedrive ${pathname} → ${res.status}: ${message}`);
    }
    return payload;
  }

  return {
    async searchPersonByName(name) {
      const payload = await pipedriveGet('/persons/search', {
        term: name,
        fields: 'name,email,phone',
        limit: 10,
        exact_match: 1,
      });
      const items = Array.isArray(payload.data?.items) ? payload.data.items : [];
      return items
        .map((entry) => entry?.item)
        .filter(Boolean)
        .filter((person) => nameKey(person.name) === nameKey(name));
    },
    async getPerson(personId) {
      const payload = await pipedriveGet(`/persons/${personId}`);
      return normalizePipedriveApiPerson(payload.data || {});
    },
  };
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
    patients.push(
      ...(page.patients || []).map((patient) => ({
        ...patient,
        id: patient.id || patient.patientId || null,
      }))
    );
    offset += limit;
    if (!(page.patients || []).length) break;
  }
  return patients;
}

function fetchProdRejectedPipedriveAssetIds() {
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const sshHost =
    process.env.RENDER_SSH_HOST ||
    `${process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng'}@ssh.frankfurt.render.com`;
  const script = `
const fs=require('fs');
const store=JSON.parse(fs.readFileSync('/var/data/cco-patient-assets.json','utf8'));
const ids=[];
for (const [id, asset] of Object.entries(store.items||{})) {
  if (asset?.sourceSystem==='pipedrive_import' && asset?.status==='REJECTED') ids.push(id);
}
process.stdout.write(JSON.stringify(ids));
`;
  const out = execFileSync(
    'ssh',
    [
      '-i',
      sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=120',
      sshHost,
      `node -e ${JSON.stringify(script)}`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(out.trim());
}

function resolvePersonIdFromCsv(fileName, peopleIndex, lookup, peopleById, minConfidence) {
  const fromCsv = resolvePersonIdFromFileName(fileName, peopleIndex);
  if (fromCsv.personId) {
    return {
      personId: fromCsv.personId,
      method: fromCsv.method,
      person: peopleById.get(String(fromCsv.personId)),
    };
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
      return { personId, method: 'disambiguated_single_cliento_match', person };
    }
  }
  return null;
}

async function resolvePersonForAsset(fileName, ctx) {
  const extracted = extractPersonNameFromFileName(fileName);
  if (!extracted) return { reason: 'no_extracted_name' };
  if (isNonPatientTemplate(fileName)) return { reason: 'non_patient_template' };

  const fromCsv = resolvePersonIdFromCsv(
    fileName,
    ctx.peopleIndex,
    ctx.lookup,
    ctx.peopleById,
    ctx.minConfidence
  );
  if (fromCsv?.person) {
    return { person: fromCsv.person, method: fromCsv.method };
  }

  if (ctx.pipedriveApi) {
    const cacheKey = nameKey(extracted) || extracted.toLowerCase();
    if (!ctx.apiPersonCache.has(cacheKey)) {
      const hits = await ctx.pipedriveApi.searchPersonByName(extracted);
      if (hits.length === 1) {
        const person = await ctx.pipedriveApi.getPerson(hits[0].id);
        ctx.apiPersonCache.set(cacheKey, person);
      } else {
        ctx.apiPersonCache.set(cacheKey, hits.length > 1 ? { ambiguous: hits.length } : null);
      }
      if (ctx.pipedriveDelayMs > 0) await sleep(ctx.pipedriveDelayMs);
    }
    const cached = ctx.apiPersonCache.get(cacheKey);
    if (cached && !cached.ambiguous && cached.personId) {
      return { person: cached, method: 'pipedrive_api_search' };
    }
    if (cached?.ambiguous) return { reason: 'pipedrive_api_ambiguous', extractedName: extracted };
  }

  const direct = resolvePatientByFileName(fileName, ctx.patientIndex);
  if (direct.patientId && direct.confidence === 'high') {
    return {
      patientId: direct.patientId,
      method: direct.method,
      extractedName: direct.extractedName,
    };
  }

  return { reason: 'no_high_confidence_match', extractedName: extracted };
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
      if (error.status === 409) {
        return { ok: true, skipped: true, reason: 'already_linked_or_invalid_state' };
      }
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
  let rejectedAssets = Object.values(rejectPatch.items || {}).filter(
    (asset) => asset?.sourceSystem === 'pipedrive_import' && asset?.status === 'REJECTED'
  );

  if (!args.dryRun) {
    try {
      const prodRejectedIds = new Set(fetchProdRejectedPipedriveAssetIds());
      rejectedAssets = rejectedAssets.filter((asset) => prodRejectedIds.has(asset.id));
    } catch (error) {
      console.warn(`WARN: kunde inte läsa prod REJECTED-lista: ${error.message}`);
    }
  }

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
  const patientIndex = buildPipedrivePatientIndex(prodPatients, { tenantId: TENANT_ID });
  const pipedriveApi = args.usePipedriveApi ? createPipedriveApiClient() : null;
  const ctx = {
    peopleIndex,
    peopleById,
    lookup,
    patientIndex,
    minConfidence: args.minConfidence,
    pipedriveApi,
    pipedriveDelayMs: args.pipedriveDelayMs,
    apiPersonCache: new Map(),
  };

  const plan = [];
  const unresolved = [];
  const patientsToCreate = new Map();

  for (const asset of rejectedAssets) {
    const fileName = asset.originalFileName || asset.displayName || '';
    const resolved = await resolvePersonForAsset(fileName, ctx);

    if (resolved.patientId) {
      plan.push({
        assetId: asset.id,
        fileName,
        patientId: resolved.patientId,
        method: resolved.method,
        action: 'link_existing_direct_name',
      });
      continue;
    }

    if (!resolved.person) {
      unresolved.push({
        assetId: asset.id,
        fileName,
        reason: resolved.reason || 'no_person',
        extractedName: resolved.extractedName || null,
      });
      continue;
    }

    const { person, method } = resolved;
    const candidates = findPatientsForPipedrivePerson(lookup, person, {
      enableNameFallback: false,
    }).filter((item) => item.confidence >= args.minConfidence);

    if (candidates.length === 1) {
      plan.push({
        assetId: asset.id,
        fileName,
        personId: person.personId,
        patientId: candidates[0].patient.id,
        method: `${method}:${candidates[0].method}`,
        action: 'link_existing',
      });
      continue;
    }

    if (candidates.length === 0) {
      if (!patientsToCreate.has(String(person.personId))) {
        patientsToCreate.set(String(person.personId), { person, assets: [] });
      }
      patientsToCreate.get(String(person.personId)).assets.push({
        assetId: asset.id,
        fileName,
        method,
      });
      continue;
    }

    unresolved.push({
      assetId: asset.id,
      fileName,
      reason: 'ambiguous_patient_match',
      candidateCount: candidates.length,
      extractedName: person.name,
    });
  }

  if (!args.dryRun) {
    for (const [personId, entry] of patientsToCreate.entries()) {
      const payload = buildPatientPayloadFromPerson(entry.person);
      const result = await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, payload);
      const prodId = result?.patient?.id || result?.id;
      if (!prodId) {
        throw new Error(`Ingen prod UUID efter PUT för pipedrive person ${personId}`);
      }
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
        pipedriveApi: Boolean(pipedriveApi),
        reportPath: args.reportPath,
      },
      null,
      2
    )
  );

  if (args.dryRun) return;

  let linked = 0;
  let skipped = 0;
  let failed = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const row = plan[i];
    try {
      const result = await migrationLinkAsset(token, row.assetId, row.patientId);
      if (result?.skipped) skipped += 1;
      else linked += 1;
    } catch (error) {
      failed += 1;
      if (failed <= 5) console.error(`FAIL ${row.assetId}: ${error.message}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(
        `progress ${i + 1}/${plan.length} linked=${linked} skipped=${skipped} failed=${failed}`
      );
    }
    await sleep(400);
  }

  console.log(JSON.stringify({ linked, skipped, failed, total: plan.length }, null, 2));
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
