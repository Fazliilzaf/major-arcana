#!/usr/bin/env node
'use strict';

/**
 * Push Cliento CSV-delta till prod (halso@-modellen).
 *
 * UPSERT endast patienter markerade cliento.importSource === 'cliento_csv'
 * via PUT /api/v1/cco-patient-master/patient — aldrig full migration-state-push.
 *
 * Usage:
 *   npm run push:cliento-delta-prod
 *   npm run push:cliento-delta-prod -- --dry-run
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE = (
  process.env.BASE ||
  process.env.ARCANA_PROD_URL ||
  'https://arcana.hairtpclinic.com'
).replace(/\/+$/, '');
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const MASTER_PATH =
  process.env.CCO_PATIENT_MASTER_PATH || path.join(ROOT, 'data/cco-patient-master.json');
const CONCURRENCY = Math.max(1, Math.min(20, Number(process.env.ARCANA_PUSH_CONCURRENCY) || 12));
const MIN_EXPECTED = Number(process.env.ARCANA_CLIENTO_DELTA_MIN || 76);

const dryRun = process.argv.includes('--dry-run');

function getToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function loadClientoCsvPatients() {
  if (!fs.existsSync(MASTER_PATH)) {
    throw new Error(`Saknar ${MASTER_PATH}`);
  }
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const patients = master.tenants?.[TENANT_ID]?.patients || [];
  const delta = patients.filter((patient) => patient?.cliento?.importSource === 'cliento_csv');
  if (!delta.length) {
    throw new Error('Inga patienter med cliento.importSource === "cliento_csv" i lokal master');
  }
  return delta;
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
        if (errors.length >= 10) break;
      }
      done += 1;
      if (done % 25 === 0 || done === items.length) {
        process.stdout.write(`  ${done}/${items.length}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runOne()));
  if (errors.length) {
    throw errors[0];
  }
}

async function fetchProdStats(token) {
  const stats = await requestJson('GET', '/api/v1/cco-patient-master/stats', token);
  return stats.stats || stats;
}

async function fetchProdListTotal(token) {
  const list = await requestJson(
    'GET',
    '/api/v1/cco-patient-master/patients?limit=1&offset=0',
    token
  );
  return Number(list.total || 0);
}

async function fetchProdPatientTotal(token) {
  const [statsTotal, listTotal] = await Promise.all([
    fetchProdStats(token).then((stats) => Number(stats.totalPatients) || 0),
    fetchProdListTotal(token),
  ]);
  return Math.max(statsTotal, listTotal);
}

async function main() {
  const patients = loadClientoCsvPatients();
  console.log(`Cliento CSV-delta → ${BASE}`);
  console.log(`Filter: cliento.importSource === "cliento_csv"`);
  console.log(`Lokal master: ${MASTER_PATH}`);
  console.log(`Delta-rader: ${patients.length}`);
  console.log(`Läge: ${dryRun ? 'dry-run' : 'commit'}\n`);

  if (patients.length < MIN_EXPECTED) {
    console.warn(
      `⚠ Färre än förväntat (${MIN_EXPECTED}). Fortsätter med ${patients.length} rader.`
    );
  }

  const token = dryRun ? '' : getToken();
  if (!dryRun && !token) throw new Error('Saknar OWNER-token');

  let beforeTotal = null;
  if (!dryRun) {
    beforeTotal = await fetchProdPatientTotal(token);
    console.log(`Prod före: ${beforeTotal} patienter\n`);
  }

  if (dryRun) {
    console.log(`Dry-run: skulle PUT:a ${patients.length} patienter (concurrency ${CONCURRENCY})`);
    return;
  }

  console.log(`→ PUT ${patients.length} patienter (concurrency ${CONCURRENCY})`);
  let pushed = 0;
  await mapPool(
    patients,
    async (patient) => {
      await requestJson('PUT', '/api/v1/cco-patient-master/patient', token, {
        ...patient,
        patientId: patient.id,
      });
      pushed += 1;
    },
    CONCURRENCY
  );

  const afterTotal = await fetchProdPatientTotal(token);
  const delta = afterTotal - beforeTotal;

  console.log('\n=== RESULTAT ===');
  console.log(`PUT:ade: ${pushed}`);
  console.log(`Prod före: ${beforeTotal}`);
  console.log(`Prod efter: ${afterTotal}`);
  console.log(`Netto +/-: ${delta >= 0 ? '+' : ''}${delta}`);

  if (afterTotal < 7283) {
    console.error(`\n❌ totalPatients ${afterTotal} < 7283`);
    process.exit(1);
  }

  console.log('\n✅ Cliento delta push klar');
}

main().catch((error) => {
  console.error(`❌ ${error.message || error}`);
  process.exit(1);
});
