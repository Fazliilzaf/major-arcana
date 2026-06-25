#!/usr/bin/env node
/**
 * Verify BOOKOFF L-kolumn — live routes for all 36 registryIds.
 * Local: ARCANA_PROD_URL=http://127.0.0.1:3100 npm run verify:patient-doc-live-routes
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const {
  listLiveRegistryIds,
  buildLiveDocumentPath,
  OFFERT_SLUG,
} = require('../src/ops/patientDocumentLiveRegistry');

const BASE = (process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const client = BASE.startsWith('https') ? https : http;

function get(path) {
  return new Promise((resolve, reject) => {
    client
      .get(`${BASE}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          })
        );
      })
      .on('error', reject);
  });
}

async function main() {
  const checks = [];
  const pass = (name, detail = '') => checks.push({ name, ok: true, detail });
  const fail = (name, detail = '') => checks.push({ name, ok: false, detail });

  try {
    const manifest = await get('/api/v1/cco/patient-documents/live/manifest');
    if (manifest.status === 200) pass('manifest', '200');
    else fail('manifest', String(manifest.status));
  } catch (error) {
    fail('manifest', error.message);
  }

  const ids = listLiveRegistryIds();
  for (const registryId of ids) {
    const phases = OFFERT_SLUG[registryId] ? [5, 7] : [null];
    for (const phase of phases) {
      const path = buildLiveDocumentPath(registryId, { phase: phase || 7 });
      try {
        const res = await get(path);
        const label = phase ? `${registryId}?phase=${phase}` : registryId;
        if (res.status !== 200) {
          fail(label, String(res.status));
          continue;
        }
        if (!String(res.headers['x-arcana-patient-doc-registry'] || '').includes(registryId)) {
          fail(label, 'saknar X-Arcana-Patient-Doc-Registry');
          continue;
        }
        if (
          !res.body.includes('data-registry-id') &&
          !res.body.includes('__ARCANA_PATIENT_DOC_LIVE__')
        ) {
          fail(label, 'saknar live shell markör');
          continue;
        }
        if (/<a\s[^>]*href=/i.test(res.body)) {
          fail(label, 'innehåller navigationslänk');
          continue;
        }
        pass(label, res.headers['x-arcana-patient-doc-file'] || '200');
      } catch (error) {
        fail(registryId, error.message);
      }
    }
  }

  const failed = checks.filter((c) => !c.ok);
  for (const check of checks) {
    console.log(
      `${check.ok ? 'PASS' : 'FAIL'} · ${check.name}${check.detail ? ` · ${check.detail}` : ''}`
    );
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} PASS · base=${BASE}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
