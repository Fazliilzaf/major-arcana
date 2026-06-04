#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'contact@hairtpclinic.com').toLowerCase();

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
  if (!res.ok) {
    throw new Error(payload.error || `${res.status}`);
  }
  return payload;
}

async function main() {
  const tokenScript = require('node:child_process').execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: `${__dirname}/..`,
    encoding: 'utf8',
  });
  const token = tokenScript.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');

  console.log(`== Mail ingestion (${mailboxEmail}) ==`);
  console.log('sync…');
  const sync = await fetchJson('/api/v1/cco/mail-ingestion/sync', {
    method: 'POST',
    token,
    body: { mailboxEmail, async: false, skipDelta: false },
  });
  console.log(JSON.stringify({ saved: sync.result?.ingestResult?.totalSaved, fetched: sync.result?.ingestResult?.totalFetched }, null, 2));

  console.log('process-all…');
  await fetchJson('/api/v1/cco/mail-ingestion/process-all', {
    method: 'POST',
    token,
    body: { mailboxEmail },
  });

  console.log('väntar 60s på drain…');
  await new Promise((resolve) => setTimeout(resolve, 60000));

  const status = await fetchJson(
    `/api/v1/cco/mail-ingestion/status?mailboxEmail=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  console.log(JSON.stringify(status.dashboard?.counts || {}, null, 2));

  if (Number(status.dashboard?.counts?.unmatched || 0) > 0) {
    console.log('resolve sweep…');
    require('node:child_process').execSync(`ARCANA_MAILBOX=${mailboxEmail} node scripts/resolve-mail-ingestion-unmatched-prod.js`, {
      cwd: `${__dirname}/..`,
      stdio: 'inherit',
    });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
