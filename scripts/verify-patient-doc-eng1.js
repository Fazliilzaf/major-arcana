#!/usr/bin/env node
/**
 * Verify ENG-1 — health_tp_eng demo matches Meridiq 14865 (29 questions).
 * Local: npm run verify:patient-doc-eng1
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const FACIT = path.join(ROOT, 'migration/meridiq/steg3-health-declaration-eng-facit.json');
const HTML = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-health-questionnaire-eng-final-demo.html'
);
const BASE = (process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '');
const client = BASE.startsWith('https') ? https : http;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    client
      .get(`${BASE}${urlPath}`, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

async function main() {
  const checks = [];
  const pass = (name, detail = '') => checks.push({ name, ok: true, detail });
  const fail = (name, detail = '') => checks.push({ name, ok: false, detail });

  const facit = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
  if (facit.meridiqApiId === 14865) pass('facit meridiqApiId', '14865');
  else fail('facit meridiqApiId', String(facit.meridiqApiId));
  if (facit.questionCount === 29 && facit.questions.length === 29) {
    pass('facit questionCount', '29');
  } else {
    fail('facit questionCount', String(facit.questions?.length));
  }
  if (String(facit.source || '').includes('14865')) pass('facit source tag');
  else fail('facit source tag', facit.source);

  const html = fs.readFileSync(HTML, 'utf8');
  const blocks = (html.match(/data-meridiq-id="/g) || []).length;
  if (blocks === 29) pass('demo meridiq blocks', '29');
  else fail('demo meridiq blocks', String(blocks));
  if (html.includes('29 questions')) pass('demo section title');
  else fail('demo section title');
  if (!html.includes('gdpr-lagring')) pass('demo utan 16414 GDPR-fält');
  else fail('demo utan 16414 GDPR-fält');

  for (const q of facit.questions.slice(0, 3)) {
    if (html.includes(String(q.id))) pass(`facit id ${q.id} i demo`);
    else fail(`facit id ${q.id} i demo`);
  }

  try {
    const live = await get('/major-arcana-preview/patient-doc/health_tp_eng');
    if (live.status === 200) pass('live route HTTP 200');
    else fail('live route HTTP 200', String(live.status));
    const liveBlocks = (live.body.match(/data-meridiq-id="/g) || []).length;
    if (liveBlocks === 29) pass('live meridiq blocks', '29');
    else fail('live meridiq blocks', String(liveBlocks));
    if (live.body.includes('__ARCANA_PATIENT_DOC_SIGN__')) pass('live E8 sign boot');
    else fail('live E8 sign boot');
  } catch (error) {
    fail('live route', error.message);
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n=== verify:patient-doc-eng1 (${BASE}) ===\n`);
  for (const check of checks) {
    console.log(
      `${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`
    );
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} kontroller passerade.\n`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
