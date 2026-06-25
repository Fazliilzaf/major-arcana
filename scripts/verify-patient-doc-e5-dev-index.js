#!/usr/bin/env node
/**
 * E5 — dev-index /major-arcana-preview/patient-doc/ listar alla 36 registryId.
 */
'use strict';

const http = require('node:http');
const https = require('node:https');
const { listLiveRegistryIds, OFFERT_SLUG } = require('../src/ops/patientDocumentLiveRegistry');

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
  const ids = listLiveRegistryIds();
  const paths = [
    '/major-arcana-preview/patient-doc/',
    '/major-arcana-preview/patient-doc/index.html',
  ];
  let ok = 0;
  let fail = 0;

  console.log(`\n=== verify:patient-doc-e5-dev-index · base=${BASE} ===\n`);

  for (const p of paths) {
    const res = await get(p);
    const pass =
      res.status === 200 &&
      res.body.includes('patient-doc-dev-index') &&
      res.body.includes('patient-document-shell.js');
    if (pass) {
      ok += 1;
      console.log(`PASS route ${p}`);
    } else {
      fail += 1;
      console.log(`FAIL route ${p} — status ${res.status}`);
    }
  }

  const indexRes = await get('/major-arcana-preview/patient-doc/');
  for (const id of ids) {
    const encoded = encodeURIComponent(id);
    if (!indexRes.body.includes(`patient-doc/${encoded}`)) {
      fail += 1;
      console.log(`FAIL missing link ${id}`);
      continue;
    }
    ok += 1;
    console.log(`PASS link ${id}`);
  }

  for (const id of Object.keys(OFFERT_SLUG)) {
    if (!indexRes.body.includes(`phase=5`) || !indexRes.body.includes(id)) {
      fail += 1;
      console.log(`FAIL offert phase links ${id}`);
    } else {
      ok += 1;
      console.log(`PASS offert phases ${id}`);
    }
  }

  console.log(`\nE5: ${fail === 0 ? 'ALL PASS' : `${ok} pass · ${fail} fail`}\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
