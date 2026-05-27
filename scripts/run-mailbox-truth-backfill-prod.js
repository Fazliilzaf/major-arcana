#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'contact@hairtpclinic.com').toLowerCase();
const maxRounds = Number(process.env.ARCANA_BACKFILL_MAX_ROUNDS || 200);
const maxPagesPerFolder = Number(process.env.ARCANA_BACKFILL_MAX_PAGES || 2);
const pageSize = Number(process.env.ARCANA_BACKFILL_PAGE_SIZE || 200);

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
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 200) || `${res.status}`);
  }
  if (!res.ok) {
    throw new Error(payload.error || `${res.status}`);
  }
  return payload;
}

async function getCoverage(token) {
  return fetchJson(
    `/api/v1/cco/runtime/history/status?mailboxId=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
}

async function main() {
  const tokenScript = require('node:child_process').execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: `${__dirname}/..`,
    encoding: 'utf8',
  });
  const token = tokenScript.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');

  console.log(`== Truth backfill (${mailboxEmail}) maxPages=${maxPagesPerFolder} pageSize=${pageSize} ==`);
  let before = await getCoverage(token);
  console.log(
    JSON.stringify(
      {
        complete: before.coverage?.complete,
        missing: before.coverage?.missingWindowCount,
        folders: before.mailboxes?.[0]?.folderCounts,
      },
      null,
      2
    )
  );
  if (before.coverage?.complete === true) {
    console.log('Redan komplett.');
    return;
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    console.log(`-- round ${round} --`);
    const result = await fetchJson('/api/v1/cco/runtime/history/backfill', {
      method: 'POST',
      token,
      body: {
        mailboxId: mailboxEmail,
        mailboxIds: [mailboxEmail],
        lookbackDays: 365,
        maxPagesPerFolder,
        pageSize,
      },
    });
    console.log(
      JSON.stringify(
        {
          missingWindowCount: result.missingWindowCount,
          backfilledFolderCount: result.backfilledFolderCount,
        },
        null,
        2
      )
    );
    const after = await getCoverage(token);
    console.log(
      JSON.stringify(
        {
          complete: after.coverage?.complete,
          missing: after.coverage?.missingWindowCount,
          folders: after.mailboxes?.[0]?.folderCounts?.map((f) => ({
            folderType: f.folderType,
            materialized: f.materializedMessageCount,
            total: f.totalItemCount,
          })),
        },
        null,
        2
      )
    );
    if (after.coverage?.complete === true) {
      console.log('Klart.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Backfill nådde max rundor utan complete=true');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
