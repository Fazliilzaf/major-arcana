#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

async function fetchJson(path, { method = 'GET', token = '', body = null } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `${res.status} ${path}`);
  return payload;
}

async function main() {
  const phase = process.argv.includes('--full')
    ? 'full'
    : process.argv.includes('--canary')
      ? 'canary'
      : 'dry-run';
  const go = process.argv.includes('--go');
  const snapshot = process.argv.includes('--snapshot') || go;

  const tokenScript = require('node:child_process').execSync(
    'node scripts/get-prod-auth-token.js --owner',
    {
      cwd: `${__dirname}/..`,
      encoding: 'utf8',
      env: { ...process.env, ARCANA_PROD_URL: base },
    }
  );
  const token = tokenScript.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');

  if (snapshot) {
    const snap = await fetchJson('/api/v1/ops/mail/truth-hydration/run', {
      method: 'POST',
      token,
      body: { phase: 'snapshot', go: false },
    });
    console.log(JSON.stringify(snap, null, 2));
    if (phase === 'snapshot') return;
  }

  const result = await fetchJson('/api/v1/ops/mail/truth-hydration/run', {
    method: 'POST',
    token,
    body: {
      phase,
      go,
      canaryLimit: Number(process.env.MAIL_TRUTH_HYDRATION_CANARY_LIMIT || 200),
      autoContinue: go && phase === 'canary',
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
