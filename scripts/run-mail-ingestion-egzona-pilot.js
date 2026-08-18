#!/usr/bin/env node
'use strict';

/**
 * Pilotkörning för egzona@-backlogen.
 *
 * Backlog: ~8 785 RAW_SAVED meddelanden i egzona@ som aldrig processats.
 * Detta skript kör en liten, säker batch (read_only) för att se hur många
 * som matchas, blir unmatched, eller faller i review-kön — innan en full
 * körning görs.
 *
 * Kräver:
 *   ARCANA_OWNER_EMAIL
 *   ARCANA_OWNER_PASSWORD
 *   ARCANA_OWNER_MFA_SECRET (om MFA är påslagen)
 *   ARCANA_PROD_URL (default: https://arcana.hairtpclinic.com)
 *
 * Användning:
 *   ARCANA_MAILBOX=egzona@hairtpclinic.com node scripts/run-mail-ingestion-egzona-pilot.js
 */

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'egzona@hairtpclinic.com').toLowerCase();
const MAX_BATCHES = Number(process.env.ARCANA_EGZONA_PILOT_BATCHES || 1);

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
  const tokenScript = require('node:child_process').execSync(
    'node scripts/get-prod-auth-token.js --owner',
    {
      cwd: `${__dirname}/..`,
      encoding: 'utf8',
    }
  );
  const token = tokenScript.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');

  console.log(`== Pilot: ${mailboxEmail} ==`);

  const before = await fetchJson(
    `/api/v1/cco/mail-ingestion/status?mailboxEmail=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  console.log('Före:', JSON.stringify(before.dashboard?.counts || {}, null, 2));

  console.log(`process-all (read_only, maxBatches=${MAX_BATCHES})…`);
  const processAll = await fetchJson('/api/v1/cco/mail-ingestion/process-all', {
    method: 'POST',
    token,
    body: { mailboxEmail, mode: 'read_only', maxBatches: MAX_BATCHES },
  });
  console.log('Accept:', JSON.stringify(processAll, null, 2));

  console.log('väntar 30s på drain…');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  const after = await fetchJson(
    `/api/v1/cco/mail-ingestion/status?mailboxEmail=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  console.log('Efter:', JSON.stringify(after.dashboard?.counts || {}, null, 2));

  const diff = {};
  const beforeCounts = before.dashboard?.counts || {};
  const afterCounts = after.dashboard?.counts || {};
  for (const key of new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)])) {
    const d = Number(afterCounts[key] || 0) - Number(beforeCounts[key] || 0);
    if (d !== 0) diff[key] = d;
  }
  console.log('Diff:', JSON.stringify(diff, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
