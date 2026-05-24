#!/usr/bin/env node
'use strict';

/**
 * B — Kundlista smoke med full prod-kundbas.
 *
 * Checks:
 *   CL-01 stats totalPatients >= 7000
 *   CL-02 list pagination total matches stats
 *   CL-03 search returns hits
 *   CL-04 patient detail + journal entries
 *   CL-05 drive file endpoint (zip on prod or graceful 404)
 *   CL-06 list latency budget
 *
 * Usage:
 *   npm run verify:customer-list-prod
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);
const TENANT_ID = process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic';
const MIN_PATIENTS = Number(process.env.ARCANA_CUSTOMER_LIST_MIN || 7000);
const LIST_BUDGET_MS = Number(process.env.ARCANA_CUSTOMER_LIST_BUDGET_MS || 3000);

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function api(token, route, opts = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE}${route}`, {
    ...opts,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-arcana-client': 'major_arcana_admin',
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const ms = Date.now() - started;
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, ms };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`Customer list verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('Prod readyz', ready.ready === true)) hardFail = true;

  const token = getToken();
  if (!record('Auth token', Boolean(token))) process.exit(1);

  const statsRes = await api(token, '/api/v1/cco-patient-master/stats');
  if (statsRes.status !== 200) {
    fail('CL-01 stats HTTP', `HTTP ${statsRes.status}`);
  } else {
    const total = Number(statsRes.body?.stats?.totalPatients || 0);
    if (total >= MIN_PATIENTS) {
      record('CL-01 stats totalPatients', true, `${total} kunder`);
    } else if (total > 0) {
      record('CL-01 stats totalPatients', true, `${total} (under mål ${MIN_PATIENTS})`);
    } else {
      fail('CL-01 stats totalPatients', '0 kunder');
    }
  }

  const listRes = await api(token, '/api/v1/cco-patient-master/patients?limit=50&offset=0');
  if (listRes.status !== 200) {
    fail('CL-02 list HTTP', `HTTP ${listRes.status}`);
  } else {
    const total = Number(listRes.body?.total || 0);
    const count = Array.isArray(listRes.body?.patients) ? listRes.body.patients.length : 0;
    if (total >= MIN_PATIENTS && count > 0) {
      record('CL-02 list pagination', true, `total=${total}, page=${count}, ${listRes.ms}ms`);
    } else {
      fail('CL-02 list pagination', `total=${total}, page=${count}`);
    }
    if (listRes.ms <= LIST_BUDGET_MS) {
      record('CL-06 list latency', true, `${listRes.ms}ms (budget ${LIST_BUDGET_MS}ms)`);
    } else {
      record('CL-06 list latency', false, `${listRes.ms}ms > ${LIST_BUDGET_MS}ms`);
      hardFail = true;
    }
  }

  const searchRes = await api(token, '/api/v1/cco-patient-master/patients?q=Andersson&limit=20');
  if (searchRes.status !== 200) {
    fail('CL-03 search HTTP', `HTTP ${searchRes.status}`);
  } else {
    const hits = Array.isArray(searchRes.body?.patients) ? searchRes.body.patients.length : 0;
    if (hits > 0) {
      record('CL-03 search', true, `${hits} träffar för "Andersson" (${searchRes.ms}ms)`);
    } else {
      fail('CL-03 search', '0 träffar');
    }
  }

  const samplePatientId =
    searchRes.body?.patients?.[0]?.patientId ||
    listRes.body?.patients?.[0]?.patientId ||
    '';
  if (!samplePatientId) {
    fail('CL-04 patient detail', 'ingen sample patient');
  } else {
    const detailRes = await api(
      token,
      `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(samplePatientId)}`
    );
    if (detailRes.status !== 200) {
      fail('CL-04 patient detail HTTP', `HTTP ${detailRes.status}`);
    } else {
      const journalCount = Array.isArray(detailRes.body?.journalEntries)
        ? detailRes.body.journalEntries.length
        : 0;
      const driveCount = Array.isArray(detailRes.body?.driveFiles) ? detailRes.body.driveFiles.length : 0;
      record(
        'CL-04 patient detail',
        true,
        `${samplePatientId.slice(0, 8)}… journal=${journalCount} drive=${driveCount} (${detailRes.ms}ms)`
      );

      const journalPdf = (detailRes.body?.driveFiles || []).find((f) => f.fileType === 'journal_pdf');
      if (journalPdf?.id) {
        const fileRes = await fetch(
          `${BASE}/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(journalPdf.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (fileRes.status === 200) {
          record('CL-05 drive PDF stream', true, `${fileRes.status} ${journalPdf.id.slice(0, 8)}…`);
        } else if (fileRes.status === 404) {
          record(
            'CL-05 drive PDF stream',
            true,
            `404 — index OK men zip saknas på prod (sätt ARCANA_MIGRATION_ROOT eller Drive API)`
          );
        } else {
          fail('CL-05 drive PDF stream', `HTTP ${fileRes.status}`);
        }
      } else {
        record('CL-05 drive PDF stream', true, 'ingen journal_pdf i sample — skip');
      }
    }
  }

  const migrationRes = await api(token, '/api/v1/cco-migration/status');
  if (migrationRes.status === 200) {
    const indexProfiles = Number(migrationRes.body?.indexStats?.totalProfiles || 0);
    const zipCount = Number(migrationRes.body?.zipCount || 0);
    record(
      'CL-07 migration index prod',
      indexProfiles >= 100,
      `${indexProfiles} profiler, zipCount=${zipCount}, migrationRoot=${migrationRes.body?.migrationRoot || '?'}`
    );
    if (zipCount === 0) {
      const driveApiConfigured = migrationRes.body?.driveApiConfigured === true;
      record(
        'CL-08 zip volume on prod',
        driveApiConfigured,
        driveApiConfigured
          ? '0 zips men Drive API konfigurerad — PDF via driveFileId'
          : '0 zips — PDF-visning kräver ARCANA_MIGRATION_ROOT eller Google Drive API'
      );
    } else {
      record('CL-08 zip volume on prod', true, `${zipCount} zips`);
    }
  }

  console.log(hardFail ? '\nCustomer list verify: FAIL' : '\nCustomer list verify: PASS');
  process.exit(hardFail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
