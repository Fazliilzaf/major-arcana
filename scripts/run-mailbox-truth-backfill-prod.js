#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'contact@hairtpclinic.com').toLowerCase();
const maxRounds = Number(process.env.ARCANA_BACKFILL_MAX_ROUNDS || 300);
const maxPagesPerFolder = Number(process.env.ARCANA_BACKFILL_MAX_PAGES || 3);
const folderSequence = ['inbox', 'sent', 'drafts', 'deleted'];
const pageSize = Number(process.env.ARCANA_BACKFILL_PAGE_SIZE || 150);
const retryDelayMs = Number(process.env.ARCANA_BACKFILL_RETRY_MS || 20000);
const folderOnly = normalizeFolderOnly(process.env.ARCANA_BACKFILL_FOLDER || '');

function normalizeFolderOnly(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return folderSequence.includes(normalized) ? normalized : '';
}

function folderIsVerified(coverage, folderType) {
  const row = (coverage.mailboxes?.[0]?.folderCounts || []).find(
    (item) => item.folderType === folderType
  );
  if (!row) return false;
  return (
    Number(row.materializedMessageCount || 0) >= Number(row.totalItemCount || 0) &&
    row.totalItemCount > 0
  );
}

function nextFolderToBackfill(coverage) {
  if (folderOnly) return folderOnly;
  for (const folderType of folderSequence) {
    if (!folderIsVerified(coverage, folderType)) return folderType;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(path, { method = 'GET', token = '', body = null, retries = 5 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
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
        throw new Error(text.slice(0, 120) || `${res.status}`);
      }
      if (!res.ok) {
        throw new Error(payload.error || `${res.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`retry ${attempt}/${retries}: ${error.message || error}`);
        await sleep(retryDelayMs);
      }
    }
  }
  throw lastError;
}

async function getCoverage(token) {
  return fetchJson(
    `/api/v1/cco/runtime/history/status?mailboxId=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
}

function summarizeCoverage(payload) {
  return {
    complete: payload.coverage?.complete,
    missing: payload.coverage?.missingWindowCount,
    folders: payload.mailboxes?.[0]?.folderCounts?.map((f) => ({
      folderType: f.folderType,
      materialized: f.materializedMessageCount,
      total: f.totalItemCount,
    })),
  };
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

  console.log(
    `== Truth backfill (${mailboxEmail}) maxPages=${maxPagesPerFolder} pageSize=${pageSize} ==`
  );
  const before = await getCoverage(token);
  console.log(JSON.stringify(summarizeCoverage(before), null, 2));
  if (before.coverage?.complete === true) {
    console.log('Redan komplett.');
    return;
  }

  for (let round = 1; round <= maxRounds; round += 1) {
    const coverageBefore = await getCoverage(token);
    const folderType = nextFolderToBackfill(coverageBefore);
    if (!folderType) {
      console.log('Klart.');
      return;
    }
    console.log(`-- round ${round} (${folderType}) --`);
    try {
      const result = await fetchJson('/api/v1/cco/runtime/history/backfill', {
        method: 'POST',
        token,
        body: {
          mailboxId: mailboxEmail,
          mailboxIds: [mailboxEmail],
          lookbackDays: 365,
          maxPagesPerFolder,
          pageSize,
          folderTypes: [folderType],
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
    } catch (error) {
      console.warn(`round ${round} backfill failed: ${error.message || error}`);
    }

    try {
      const after = await getCoverage(token);
      console.log(JSON.stringify(summarizeCoverage(after), null, 2));
      if (after.coverage?.complete === true) {
        console.log('Klart.');
        return;
      }
    } catch (error) {
      console.warn(`round ${round} coverage failed: ${error.message || error}`);
    }

    await sleep(5000);
  }
  throw new Error('Backfill nådde max rundor utan complete=true');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
