#!/usr/bin/env node
'use strict';

/**
 * Sista pass: koppla kvarvarande patient-PDF:er + rensa icke-patient REJECTED.
 *
 *   node scripts/migration/resolvePipedriveRejectedFinal91.js --dry-run
 *   node scripts/migration/resolvePipedriveRejectedFinal91.js --write
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const pdfParse = require('pdf-parse');

const { getProdToken } = require('../lib/halsoHdProdClient');
const {
  buildPipedrivePatientLookup,
  findPatientsForPipedrivePerson,
  normalizePipedrivePersonRecord,
} = require('../../src/ops/ccoPatientMasterStore');
const {
  extractPersonNameFromFileName,
  extractEmailFromFileName,
  buildPipedrivePatientIndex,
  foldName,
  singleNameKey,
  sanitizeExtractedPersonName,
} = require('./lib/pipedriveSmartdocsImport');

const ROOT = path.join(__dirname, '../..');
const BASE = (
  process.env.ARCANA_PROD_URL ||
  process.env.BASE ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const ICLOUD_PDF_DIR = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/Migration-data/pipedrive-smartdocs-2026-07-12/pdfs/other'
);
const REPORT_PATH = path.join(ROOT, 'data/reports/pipedrive-final91-plan.json');

function parseArgs(argv) {
  const args = { dryRun: true };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--write') args.dryRun = false;
    if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFileNameForMatch(fileName = '') {
  return String(fileName || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

function isNonPatientDocument(fileName = '') {
  const fn = normalizeFileNameForMatch(fileName);
  return (
    /guide|eftervard|mall|template|adobe.transaction|adobe_transaction/.test(fn) ||
    /anteckningar fran besoket/.test(fn) ||
    /anstallningsavtal|anstallningsavatl/.test(fn) ||
    /\bavi[\s_]/.test(fn) ||
    /bestridande_faktura/.test(fn) ||
    /bokningsbekraftelse_hotel/.test(fn) ||
    /^invoice\s/.test(fn) ||
    /^faktura/.test(fn) ||
    /^doc\d/.test(fn) ||
    /formal_complaint/.test(fn) ||
    /sj-receipt-booking/.test(fn) ||
    /^receipt_/.test(fn) ||
    /mediakit/.test(fn) ||
    /militum samarbete/.test(fn) ||
    /^kund_\d/.test(fn) ||
    /^file-\d+\.pdf$/.test(fn) ||
    /^presentkort-/.test(fn) ||
    /^cf7-/.test(fn) ||
    /^fazli\.pdf$/.test(fn) ||
    /47698665\.pdf$/.test(fn) ||
    /^20250110091631903\.pdf$/.test(fn)
  );
}

function extractExtraNameFromFileName(fileName = '') {
  const fn = String(fileName || '').replace(/\s+\.pdf$/i, '.pdf');
  let match = fn.match(/\s-\s*([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö'’\- ]+?)\.pdf$/i);
  if (match) return sanitizeExtractedPersonName(match[1]);
  match = fn.match(/^([A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö'’\- ]{1,40})\.pdf$/i);
  if (match && !/^(invoice|doc|formal|cf7|faktura|file|fazli)$/i.test(match[1].trim())) {
    return sanitizeExtractedPersonName(match[1]);
  }
  return '';
}

function findLocalPdf(sourceRecordId) {
  const id = String(sourceRecordId || '').trim();
  if (!id || !fs.existsSync(ICLOUD_PDF_DIR)) return null;
  const hit = fs.readdirSync(ICLOUD_PDF_DIR).find((name) => name.startsWith(`${id}-`));
  return hit ? path.join(ICLOUD_PDF_DIR, hit) : null;
}

async function extractNameFromPdf(sourceRecordId, cache) {
  const key = String(sourceRecordId || '');
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const pdfPath = findLocalPdf(key);
  if (!pdfPath) {
    cache.set(key, null);
    return null;
  }
  try {
    const data = await pdfParse(fs.readFileSync(pdfPath));
    const text = data.text || '';
    if (/notifiering om f[oö]rfallen faktura|fortnox ab|ocr-nummer/i.test(text)) {
      const dealMatch = text.match(/faktura nr\s+(\d{1,5})\b/i);
      cache.set(key, {
        nonPatient: !dealMatch,
        dealId: dealMatch?.[1] || null,
        extractedName: null,
      });
      return cache.get(key);
    }
    let extractedName = null;
    const toMatch = text.match(/\bTo:\s*([^\n]{2,60})/);
    if (toMatch) extractedName = sanitizeExtractedPersonName(toMatch[1]);
    if (!extractedName) {
      const avtalMatch = text.match(/Behandlingsavtal[^-\n-]*-\s*([A-Za-zÅÄÖåäö][^\n]{2,40})/i);
      if (avtalMatch) extractedName = sanitizeExtractedPersonName(avtalMatch[1]);
    }
    cache.set(key, { nonPatient: false, dealId: null, extractedName });
    return cache.get(key);
  } catch {
    cache.set(key, null);
    return null;
  }
}

function createPipedriveApiClient() {
  const companyDomain = String(process.env.PIPEDRIVE_COMPANY_DOMAIN || '').trim();
  const apiToken = String(process.env.PIPEDRIVE_API_TOKEN || '').trim();
  if (!companyDomain || !apiToken) return null;

  async function pipedriveGet(pathname, searchParams = {}, { attempts = 5 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const url = new URL(`https://${companyDomain}.pipedrive.com/api/v1${pathname}`);
      for (const [key, value] of Object.entries(searchParams)) {
        if (value != null && value !== '') url.searchParams.set(key, String(value));
      }
      url.searchParams.set('api_token', apiToken);
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 429 || res.status === 402) {
        await sleep(Math.max(Number(res.headers.get('retry-after') || 0) * 1000, 2000 * attempt));
        continue;
      }
      if (!res.ok || payload.success === false) {
        throw new Error(`Pipedrive ${pathname} → ${res.status}`);
      }
      return payload;
    }
    throw new Error(`Pipedrive rate limited: ${pathname}`);
  }

  return {
    async searchPersons(term, fields = 'name,email,phone') {
      const payload = await pipedriveGet('/persons/search', {
        term,
        fields,
        limit: 10,
        exact_match: 0,
      });
      return (payload.data?.items || []).map((entry) => entry?.item).filter(Boolean);
    },
    async getPerson(personId) {
      const payload = await pipedriveGet(`/persons/${personId}`);
      const p = payload.data || {};
      const emails = (Array.isArray(p.email) ? p.email : [])
        .map((e) => e?.value || e)
        .filter(Boolean);
      const phones = (Array.isArray(p.phone) ? p.phone : [])
        .map((e) => e?.value || e)
        .filter(Boolean);
      return {
        personId: String(p.id || ''),
        name: p.name || '',
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        emails,
        phones,
        primaryEmail: emails[0] || '',
        primaryPhone: phones[0] || '',
      };
    },
    async getDeal(dealId) {
      const payload = await pipedriveGet(`/deals/${dealId}`);
      return payload.data || {};
    },
  };
}

function normalizePipedriveApiPerson(apiPerson = {}) {
  return {
    personId: String(apiPerson.id || apiPerson.personId || ''),
    name: apiPerson.name || '',
    firstName: apiPerson.first_name || apiPerson.firstName || '',
    lastName: apiPerson.last_name || apiPerson.lastName || '',
    emails: apiPerson.emails || [],
    phones: apiPerson.phones || [],
    primaryEmail: apiPerson.primaryEmail || '',
    primaryPhone: apiPerson.primaryPhone || '',
  };
}

function filterNameHits(hits, extractedName) {
  const target = foldName(extractedName);
  return hits.filter((person) => {
    const candidate = foldName(person?.name || '');
    return (
      candidate === target ||
      candidate.startsWith(`${target} `) ||
      target.startsWith(`${candidate} `)
    );
  });
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
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    let page = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        page = await requestJson(
          'GET',
          `/api/v1/cco-patient-master/patients?limit=500&offset=${offset}`,
          token
        );
        break;
      } catch (error) {
        if (error.status >= 500 && attempt < 6) {
          await sleep(1500 * attempt);
          continue;
        }
        throw error;
      }
    }
    total = Number(page.total) || 0;
    patients.push(
      ...(page.patients || []).map((patient) => ({
        ...patient,
        id: patient.id || patient.patientId || null,
      }))
    );
    offset += 500;
    if (!(page.patients || []).length) break;
  }
  return patients;
}

function fetchProdRejectedItems() {
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const sshHost =
    process.env.RENDER_SSH_HOST ||
    `${process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng'}@ssh.frankfurt.render.com`;
  const script = `
const fs=require('fs');
const store=JSON.parse(fs.readFileSync('/var/data/cco-patient-assets.json','utf8'));
const out=[];
for (const [id, asset] of Object.entries(store.items||{})) {
  if (asset?.sourceSystem==='pipedrive_import' && asset?.status==='REJECTED') {
    out.push({ id, fileName: asset.originalFileName||asset.displayName||'', sourceRecordId: asset.sourceRecordId||'' });
  }
}
process.stdout.write(JSON.stringify(out));
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

async function purgeViaApi(token, assetIds) {
  let purged = 0;
  let failed = 0;
  for (const assetId of assetIds) {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        const res = await fetch(
          `${BASE}/api/v1/cco/assets/${encodeURIComponent(assetId)}/migration-purge-non-patient`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'x-arcana-client': 'major_arcana_admin',
            },
            body: JSON.stringify({ reason: 'pipedrive_non_patient_orphan_final91' }),
          }
        );
        const text = await res.text();
        if (res.status === 404 && text.includes('Cannot POST')) {
          return { purged, failed, needsDeploy: true };
        }
        if (res.ok) {
          purged += 1;
          break;
        }
        if (res.status === 409) break;
        if (res.status >= 500 && attempt < 6) {
          await sleep(1500 * attempt);
          continue;
        }
        failed += 1;
        break;
      } catch (error) {
        if (attempt === 6) failed += 1;
        await sleep(1500 * attempt);
      }
    }
    await sleep(300);
  }
  return { purged, failed, needsDeploy: false };
}

async function purgeNonPatientOnProd(assetIds, token, { dryRun }) {
  if (!assetIds.length) return { purged: 0 };
  if (dryRun) return { purged: assetIds.length, dryRun: true };

  const apiResult = await purgeViaApi(token, assetIds);
  if (!apiResult.needsDeploy) return apiResult;

  console.warn(
    'WARN: migration-purge-non-patient ej deployad — SSH fallback (kan skrivas över av live-server)'
  );
  const sshKey = process.env.RENDER_SSH_KEY || path.join(os.homedir(), '.ssh/id_render');
  const sshHost =
    process.env.RENDER_SSH_HOST ||
    `${process.env.RENDER_SERVICE_ID || 'srv-d8b3i3tckfvc73clgeng'}@ssh.frankfurt.render.com`;
  const script = `
const fs=require('fs');
const ids=new Set(${JSON.stringify(assetIds)});
const storePath='/var/data/cco-patient-assets.json';
const store=JSON.parse(fs.readFileSync(storePath,'utf8'));
let purged=0;
for (const id of ids) {
  const asset=store.items?.[id];
  if (!asset) continue;
  if (asset.sourceSystem!=='pipedrive_import' || asset.status!=='REJECTED') continue;
  if (asset.isJournalRelevant===true) continue;
  delete store.items[id];
  purged+=1;
}
fs.writeFileSync(storePath, JSON.stringify(store,null,2)+'\\n');
process.stdout.write(JSON.stringify({ purged }));
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

function buildPatientPayloadFromPerson(person) {
  return {
    tenantId: TENANT_ID,
    displayName: person.name,
    firstName: person.firstName,
    lastName: person.lastName,
    primaryEmail: person.primaryEmail || '',
    primaryPhone: person.primaryPhone || '',
    emails: person.emails || [],
    phones: person.phones || [],
    matchStatus: 'needs_review',
    pipedrive: {
      source: 'pipedrive',
      personId: person.personId,
      name: person.name,
      matchMethod: 'pipedrive_final91_import',
      matchConfidence: 0.75,
      importedAt: new Date().toISOString(),
    },
  };
}

function buildPatientPayloadFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    tenantId: TENANT_ID,
    displayName: name,
    firstName: parts[0] || name,
    lastName: parts.slice(1).join(' '),
    matchStatus: 'needs_review',
    pipedrive: {
      source: 'pipedrive',
      name,
      matchMethod: 'pipedrive_final91_filename',
      matchConfidence: 0.6,
      importedAt: new Date().toISOString(),
    },
  };
}

async function migrationLinkAsset(token, assetId, patientId) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await requestJson(
        'POST',
        `/api/v1/cco/assets/${encodeURIComponent(assetId)}/migration-link-patient`,
        token,
        { patientId, reason: 'pipedrive_final91_resolve' }
      );
    } catch (error) {
      if (error.status === 409) return { ok: true, skipped: true };
      if (error.status >= 500) {
        await sleep(1500 * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`migration-link failed for ${assetId}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const items = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/reports/pipedrive-rejected-remaining.json'), 'utf8')
  ).items;
  if (!items.length) {
    try {
      const live = fetchProdRejectedItems();
      if (live.length) throw new Error('remaining.json tom — kör om rapport från prod');
    } catch {
      throw new Error('Inga REJECTED att lösa');
    }
  }

  const token = args.dryRun ? getProdToken() : getProdToken();
  const patients = await fetchAllProdPatients(token);
  const lookup = buildPipedrivePatientLookup(patients);
  const patientIndex = buildPipedrivePatientIndex(patients, { tenantId: TENANT_ID });
  const pipedriveApi = createPipedriveApiClient();
  const pdfCache = new Map();
  const patientsToCreate = new Map();

  const plan = { link: [], purge: [], stuck: [] };

  for (const item of items) {
    const fileName = item.fileName || '';
    if (isNonPatientDocument(fileName)) {
      plan.purge.push({ ...item, reason: 'non_patient_document' });
      continue;
    }

    const pdfHints = await extractNameFromPdf(item.sourceRecordId, pdfCache);
    if (pdfHints?.nonPatient) {
      plan.purge.push({ ...item, reason: 'non_patient_pdf_invoice' });
      continue;
    }

    let extracted =
      sanitizeExtractedPersonName(extractPersonNameFromFileName(fileName)) ||
      extractExtraNameFromFileName(fileName) ||
      pdfHints?.extractedName ||
      '';
    const email = extractEmailFromFileName(fileName);

    if (pdfHints?.dealId && pipedriveApi) {
      const deal = await pipedriveApi.getDeal(pdfHints.dealId);
      const personId =
        deal?.person_id && typeof deal.person_id === 'object'
          ? deal.person_id.value
          : deal?.person_id;
      if (personId) {
        const person = await pipedriveApi.getPerson(personId);
        extracted = person.name || extracted;
      }
      await sleep(200);
    }

    if (!extracted && email && pipedriveApi) {
      const hits = await pipedriveApi.searchPersons(email, 'email');
      if (hits.length === 1) {
        const person = normalizePipedriveApiPerson(await pipedriveApi.getPerson(hits[0].id));
        extracted = person.name;
      }
      await sleep(200);
    }

    if (!extracted) {
      plan.stuck.push({ ...item, reason: 'no_name' });
      continue;
    }

    const sk = singleNameKey(extracted);
    if (sk) {
      const matches = patientIndex.bySingleName?.get(sk) || [];
      if (matches.length === 1) {
        plan.link.push({
          ...item,
          patientId: matches[0].id,
          method: 'prod_single_name',
          extractedName: extracted,
        });
        continue;
      }
    }

    const fk = foldName(extracted);
    const nameMatches = patientIndex.byName?.get(fk) || [];
    if (nameMatches.length === 1) {
      plan.link.push({
        ...item,
        patientId: nameMatches[0].id,
        method: 'prod_full_name',
        extractedName: extracted,
      });
      continue;
    }

    if (pipedriveApi) {
      const hits = filterNameHits(await pipedriveApi.searchPersons(extracted), extracted);
      if (hits.length >= 1) {
        const person = normalizePipedriveApiPerson(await pipedriveApi.getPerson(hits[0].id));
        const candidates = findPatientsForPipedrivePerson(lookup, person, {
          enableNameFallback: true,
        }).filter((row) => row.confidence >= 0.55);
        if (candidates.length === 1) {
          plan.link.push({
            ...item,
            patientId: candidates[0].patient.id,
            method: 'pipedrive_cliento_match',
            extractedName: extracted,
          });
          await sleep(200);
          continue;
        }
        const key = person.personId || `pipedrive:${fk}`;
        if (!patientsToCreate.has(key)) patientsToCreate.set(key, { person, assets: [] });
        patientsToCreate
          .get(key)
          .assets.push({ ...item, method: 'pipedrive_create_patient', extractedName: extracted });
        await sleep(200);
        continue;
      }
    }

    if (foldName(extracted).split(' ').length >= 2) {
      const key = `filename:${fk}`;
      if (!patientsToCreate.has(key)) {
        patientsToCreate.set(key, {
          person: {
            personId: key,
            name: extracted,
            firstName: extracted.split(/\s+/)[0],
            lastName: extracted.split(/\s+/).slice(1).join(' '),
          },
          assets: [],
          fromFilename: true,
        });
      }
      patientsToCreate
        .get(key)
        .assets.push({ ...item, method: 'filename_create_patient', extractedName: extracted });
      continue;
    }

    if (sk && pipedriveApi) {
      const hits = filterNameHits(await pipedriveApi.searchPersons(extracted), extracted);
      if (hits.length >= 1) {
        const person = normalizePipedriveApiPerson(await pipedriveApi.getPerson(hits[0].id));
        const key = person.personId;
        if (!patientsToCreate.has(key)) patientsToCreate.set(key, { person, assets: [] });
        patientsToCreate
          .get(key)
          .assets.push({ ...item, method: 'pipedrive_single_ambiguous', extractedName: extracted });
        await sleep(200);
        continue;
      }
    }

    plan.stuck.push({ ...item, reason: 'unresolved_name', extractedName: extracted });
  }

  for (const [key, entry] of patientsToCreate.entries()) {
    let patientId = null;
    if (!args.dryRun) {
      const payload = entry.fromFilename
        ? buildPatientPayloadFromName(entry.person.name)
        : buildPatientPayloadFromPerson(entry.person);
      const result = await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, payload);
      patientId = result?.patient?.id || result?.id;
      if (!patientId) throw new Error(`PUT patient misslyckades för ${key}`);
    } else {
      patientId = `(dry-run-${key})`;
    }
    for (const asset of entry.assets) {
      plan.link.push({ ...asset, patientId, method: asset.method });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    inputCount: items.length,
    linkCount: plan.link.length,
    purgeCount: plan.purge.length,
    stuckCount: plan.stuck.length,
    plan,
  };
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        inputCount: items.length,
        linkCount: plan.link.length,
        purgeCount: plan.purge.length,
        stuckCount: plan.stuck.length,
        dryRun: args.dryRun,
        reportPath: REPORT_PATH,
      },
      null,
      2
    )
  );

  if (args.dryRun) return;

  let linked = 0;
  let linkFailed = 0;
  for (let i = 0; i < plan.link.length; i += 1) {
    const row = plan.link[i];
    try {
      const result = await migrationLinkAsset(token, row.id || row.assetId, row.patientId);
      if (!result?.skipped) linked += 1;
    } catch (error) {
      linkFailed += 1;
      if (linkFailed <= 3) console.error(`LINK FAIL ${row.id}: ${error.message}`);
    }
    await sleep(350);
  }

  let purgeResult = { purged: 0 };
  try {
    purgeResult = await purgeNonPatientOnProd(
      plan.purge.map((row) => row.id),
      token,
      { dryRun: false }
    );
  } catch (error) {
    console.error(`PURGE FAIL: ${error.message}`);
  }

  console.log(
    JSON.stringify(
      { linked, linkFailed, purged: purgeResult.purged, stuck: plan.stuck.length },
      null,
      2
    )
  );
  if (linkFailed) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
