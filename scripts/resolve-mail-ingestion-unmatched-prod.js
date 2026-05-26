#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const mailboxEmail = process.env.ARCANA_MAILBOX || 'contact@hairtpclinic.com';

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

  console.log(`== Summary före (${mailboxEmail}) ==`);
  const summary = await fetchJson(
    `/api/v1/cco/mail-ingestion/review-queue/summary?mailboxEmail=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
  console.log(
    JSON.stringify(
      {
        totalUnmatched: summary.totalUnmatched,
        uniqueCounterparties: summary.uniqueCounterparties,
        nonPatientCount: summary.nonPatientCount,
        patientLikeCount: summary.patientLikeCount,
        topGroups: summary.groups?.slice(0, 10),
      },
      null,
      2
    )
  );

  console.log('== Dry run ==');
  const dryRun = await fetchJson('/api/v1/cco/mail-ingestion/resolve-unmatched-sweep', {
    method: 'POST',
    token,
    body: { mailboxEmail, dryRun: true },
  });
  console.log(JSON.stringify(dryRun.result, null, 2));

  console.log('== Live sweep ==');
  const live = await fetchJson('/api/v1/cco/mail-ingestion/resolve-unmatched-sweep', {
    method: 'POST',
    token,
        body: { mailboxEmail, dryRun: false, autoEnrichPatientEmails: true, closeRemainingAsNoPatientRecord: true },
  });
  console.log(JSON.stringify(live.result, null, 2));
  console.log('== Dashboard ==');
  console.log(JSON.stringify(live.dashboard?.counts || {}, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
