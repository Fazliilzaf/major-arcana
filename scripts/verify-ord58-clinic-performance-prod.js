#!/usr/bin/env node
/**
 * ORD-58b — prod verify clinic-performance (intäkt/AOV + latens).
 * Run: npm run verify:ord58-clinic-performance-prod
 */
'use strict';

const https = require('node:https');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const MAX_MS = Number.parseInt(process.env.ORD58_CP_MAX_MS || '8000', 10);

const checks = [];

function pass(name, detail = '') {
  checks.push({ name, ok: true, detail });
}

function fail(name, detail = '') {
  checks.push({ name, ok: false, detail });
}

function request(path, { token, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = https.request(
      `${BASE}${path}`,
      {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, body, elapsedMs: Date.now() - started })
        );
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function getOwnerToken() {
  if (process.env.ARCANA_OWNER_TOKEN) return process.env.ARCANA_OWNER_TOKEN.trim();
  const { spawnSync } = require('node:child_process');
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Kunde inte hämta owner-token');
  }
  return String(result.stdout || '').trim();
}

(async () => {
  console.log(`ORD-58b clinic-performance prod verify @ ${BASE}\n`);
  let failed = 0;

  try {
    const readyz = await request('/readyz');
    if (readyz.status === 200 && /"ready"\s*:\s*true/.test(readyz.body)) {
      pass('readyz', 'ready');
    } else {
      fail('readyz', String(readyz.status));
    }

    const token = await getOwnerToken();
    if (!token) throw new Error('Tom owner-token');

    const cp = await request('/api/v1/monitor/clinic-performance', { token });
    if (cp.status !== 200) {
      fail('clinic-performance status', String(cp.status));
    } else {
      pass('clinic-performance status', '200');
    }

    if (cp.elapsedMs <= 3000) {
      pass('clinic-performance latency warm', `${cp.elapsedMs}ms`);
    } else if (cp.elapsedMs <= MAX_MS) {
      pass('clinic-performance latency acceptable', `${cp.elapsedMs}ms (<=${MAX_MS}ms)`);
    } else {
      fail('clinic-performance latency', `${cp.elapsedMs}ms (>${MAX_MS}ms)`);
    }

    let payload = {};
    try {
      payload = JSON.parse(cp.body || '{}');
    } catch {
      fail('clinic-performance json', 'invalid JSON');
    }

    if (payload.source === 'live') {
      pass('source', 'live');
    } else {
      fail('source', String(payload.source || 'missing'));
    }

    const revenue = payload.revenueSek?.current;
    if (typeof revenue === 'number' && Number.isFinite(revenue)) {
      pass('revenueSek.current', String(revenue));
    } else {
      fail('revenueSek.current', String(revenue));
    }

    const aov = payload.avgOrderValueSek?.current;
    if (typeof aov === 'number' && Number.isFinite(aov)) {
      pass('avgOrderValueSek.current', String(aov));
    } else {
      fail('avgOrderValueSek.current', String(aov));
    }

    const notLive = Array.isArray(payload.notLiveYet) ? payload.notLiveYet : [];
    const blocksRevenue = notLive.some((item) => /revenue|intäkt|aov/i.test(String(item)));
    if (!blocksRevenue) {
      pass('notLiveYet revenue', 'ingen blocker');
    } else {
      fail('notLiveYet revenue', notLive.join(', '));
    }
  } catch (error) {
    fail('verify runner', error.message || String(error));
  }

  for (const check of checks) {
    const mark = check.ok ? 'PASS' : 'FAIL';
    console.log(`${mark} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
    if (!check.ok) failed += 1;
  }

  console.log(`\nverify-ord58-clinic-performance-prod: ${checks.length - failed}/${checks.length}`);
  process.exit(failed ? 1 : 0);
})();
