#!/usr/bin/env node
'use strict';

/**
 * Push lokalt migration state till prod.
 *
 * 1. migration-index / patient-master / journal via OWNER push-state-file (gzip-base64)
 * 2. Alternativt: upsert patient + journal entry via PUT (långsammare men utan deploy)
 *
 * Usage:
 *   node scripts/push-migration-state-prod.js
 *   node scripts/push-migration-state-prod.js --api-only
 *   node scripts/push-migration-state-prod.js --files-only
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const zlib = require('node:zlib');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.se'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const CONCURRENCY = Math.max(1, Math.min(30, Number(process.env.ARCANA_PUSH_CONCURRENCY) || 12));

const args = new Set(process.argv.slice(2));
const filesOnly = args.has('--files-only');
const apiOnly = args.has('--api-only');
const indexOnly = args.has('--index-only');

function getToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
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

async function pushStateFile(token, fileName, filePath) {
  const raw = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(raw);
  const data = gz.toString('base64');
  console.log(
    `→ push-state-file ${fileName} (${(raw.length / 1e6).toFixed(2)} MB raw, ${(data.length / 1e6).toFixed(2)} MB b64)`
  );
  return requestJson('POST', '/api/v1/cco-migration/push-state-file', token, {
    fileName,
    encoding: 'gzip-base64',
    data,
    confirmText: `PUSH ${fileName}`,
  });
}

async function mapPool(items, worker, concurrency) {
  let index = 0;
  let done = 0;
  const errors = [];

  async function runOne() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        await worker(items[current], current);
      } catch (error) {
        errors.push(error);
        if (errors.length >= 20) break;
      }
      done += 1;
      if (done % 250 === 0 || done === items.length) {
        process.stdout.write(`  ${done}/${items.length}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runOne()));
  if (errors.length) {
    throw errors[0];
  }
}

async function pushPatientsViaApi(token) {
  const master = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/cco-patient-master.json'), 'utf8')
  );
  const patients = master.tenants?.[TENANT_ID]?.patients || [];
  if (!patients.length) throw new Error('Inga patienter i lokal cco-patient-master.json');

  console.log(`→ PUT ${patients.length} patienter (concurrency ${CONCURRENCY})`);
  await mapPool(
    patients,
    async (patient) => {
      await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, {
        ...patient,
        patientId: patient.id,
      });
    },
    CONCURRENCY
  );
}

async function pushJournalsViaApi(token) {
  const journal = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cco-journal.json'), 'utf8'));
  const entries = journal.entries || [];
  if (!entries.length) throw new Error('Inga journalposter i lokal cco-journal.json');

  console.log(`→ PUT ${entries.length} journalposter (concurrency ${CONCURRENCY})`);
  await mapPool(
    entries,
    async (entry) => {
      await requestJson('PUT', '/api/v1/cco-journal/entry', token, {
        ...entry,
        patientId: entry.patientId,
        entryId: entry.entryId || entry.id,
      });
    },
    CONCURRENCY
  );
}

async function pushStateFiles(token) {
  const files = indexOnly
    ? [['migration-index.json', path.join(ROOT, 'data/migration-index.json')]]
    : [
        ['migration-index.json', path.join(ROOT, 'data/migration-index.json')],
        ['cco-patient-master.json', path.join(ROOT, 'data/cco-patient-master.json')],
        ['cco-journal.json', path.join(ROOT, 'data/cco-journal.json')],
      ];
  for (const [fileName, filePath] of files) {
    if (!fs.existsSync(filePath)) throw new Error(`Saknar ${filePath}`);
    await pushStateFile(token, fileName, filePath);
    console.log(`✅ ${fileName} pushad`);
  }
}

async function printStatus(token) {
  const status = await requestJson('GET', '/api/v1/cco-migration/status', token);
  console.log(
    JSON.stringify(
      {
        indexStats: status.indexStats,
        patientStats: status.patientStats,
        journalImportStats: status.journalImportStats,
      },
      null,
      2
    )
  );
}

async function main() {
  const token = getToken();
  if (!token) throw new Error('Saknar OWNER-token');

  console.log(`Push migration state → ${BASE}\n`);

  let usedFilePush = false;
  if (!apiOnly) {
    try {
      await pushStateFiles(token);
      usedFilePush = true;
      console.log('\n⚠ push-state-file kräver Render restart för att index ska laddas om.');
      console.log('  Kör: render restart srv-d8b3i3tckfvc73clgeng --confirm');
    } catch (error) {
      if (error.status === 404) {
        console.warn('push-state-file saknas på prod — kör --api-only eller deploya senaste main.');
      } else {
        throw error;
      }
    }
  }

  if (!filesOnly && !usedFilePush) {
    await pushPatientsViaApi(token);
    console.log('✅ patient-master upserts klara');
    await pushJournalsViaApi(token);
    console.log('✅ journal upserts klara');
  }

  console.log('\nProd status:');
  await printStatus(token);
}

main().catch((error) => {
  console.error(`❌ ${error.message || error}`);
  process.exit(1);
});
