#!/usr/bin/env node
'use strict';

/**
 * Pilotkörning för egzona@-backlogen.
 *
 * Backlog: ~8 785 RAW_SAVED meddelanden i egzona@ som aldrig processats.
 * Detta skript kör en liten batch (default 50 meddelanden / 1 batch) genom
 * mail-ingestion-pipelinen för att mäta matchningsgraden innan en full drain.
 *
 * VIKTIGT OM LÄGEN
 * ================
 * Endpointen /process-all kräver explicit ägarbekräftelse (ownerAck:true).
 *
 * `read_only` (default) — ger full matchningsdata (MATCHED/UNMATCHED/NEEDS_REVIEW)
 *   men har verkliga side-effects:
 *   - ledger-status uppdateras (meddelandena räknas som processade)
 *   - persistent trådidentitet skrivs vid matchning
 *   - portal-nudge kan skapa needs_approval-utkast för matchade kunder
 *     (utkast skickas INTE automatiskt, men syns i godkännandekön)
 *
 * `dry_run` — säkrare, inga utkast, ledger förblir oförändrad,
 *   MEN pipelinen tar ändå bort meddelandena ur processningskön.
 *   De läggs tillbaka nästa gång `ensureQueueIntegrity` körs (t.ex. vid
 *   nästa process-all-anrop), men detta är inte en garanterad återställning.
 *   Dessutom får man ingen matchningsfördelning, bara antal processerade.
 *
 * Kräver:
 *   ARCANA_OWNER_EMAIL
 *   ARCANA_OWNER_PASSWORD
 *   ARCANA_OWNER_MFA_SECRET (om MFA är påslagen)
 *   ARCANA_PROD_URL (default: https://arcana.hairtpclinic.com)
 *
 * Användning:
 *   ARCANA_MAILBOX=egzona@hairtpclinic.com node scripts/run-mail-ingestion-egzona-pilot.js
 *
 *   Torrkörning (begränsad data, säkrare):
 *   ARCANA_MAILBOX=egzona@hairtpclinic.com ARCANA_PILOT_MODE=dry_run node scripts/run-mail-ingestion-egzona-pilot.js
 */

require('dotenv').config({ quiet: true });

const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const mailboxEmail = (process.env.ARCANA_MAILBOX || 'egzona@hairtpclinic.com').toLowerCase();
const MAX_BATCHES = Math.max(1, Number(process.env.ARCANA_EGZONA_PILOT_BATCHES || 1));
const MODE = process.env.ARCANA_PILOT_MODE || 'read_only';
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.ARCANA_PILOT_POLL_MS || 3000));
const POLL_TIMEOUT_MS = Math.max(10000, Number(process.env.ARCANA_PILOT_TIMEOUT_MS || 300000));

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

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
    const message = payload.error || payload.message || `${res.status}`;
    const error = new Error(message);
    error.statusCode = res.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function getOwnerToken() {
  const tokenScript = require('node:child_process').execSync(
    'node scripts/get-prod-auth-token.js --owner',
    {
      cwd: `${__dirname}/..`,
      encoding: 'utf8',
    }
  );
  const token = tokenScript.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');
  return token;
}

async function getStatus(token) {
  return fetchJson(
    `/api/v1/cco/mail-ingestion/status?mailboxEmail=${encodeURIComponent(mailboxEmail)}`,
    { token }
  );
}

function findJob(statusResponse, jobId) {
  const jobs = statusResponse?.jobs || [];
  return jobs.find((job) => job.id === jobId) || null;
}

async function waitForJob(token, jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const status = await getStatus(token);
    const job = findJob(status, jobId);
    if (!job) {
      log(`jobb ${jobId} hittades inte (kan ha rensats), avbryter polling`);
      return null;
    }
    log(
      `jobb ${jobId}: status=${job.status}, batches=${job.batches || 0}, processed=${job.totalProcessed || 0}, failed=${job.totalFailed || 0}`
    );
    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`timeout efter ${POLL_TIMEOUT_MS} ms väntan på jobb ${jobId}`);
}

function summarizeDashboard(dashboard) {
  const counts = dashboard?.counts || {};
  return {
    queueLength: dashboard?.queueLength || 0,
    counts,
  };
}

function diffCounts(before, after) {
  const diff = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const d = Number(after[key] || 0) - Number(before[key] || 0);
    if (d !== 0) diff[key] = d;
  }
  return diff;
}

async function main() {
  if (MODE !== 'read_only' && MODE !== 'dry_run') {
    throw new Error(`ARCANA_PILOT_MODE måste vara 'read_only' eller 'dry_run', fick '${MODE}'`);
  }

  const token = await getOwnerToken();

  log('== Pilot: ' + mailboxEmail + ' ==');
  log('Läge: ' + MODE);
  log('Max batcher: ' + MAX_BATCHES);

  if (MODE === 'read_only') {
    log(
      'VARNING: read_only uppdaterar ledger, skriver trådidentitet och kan skapa needs_approval-utkast för matchade kunder.'
    );
  } else {
    log(
      'VARNING: dry_run lämnar ledger oförändrad men tar bort meddelanden ur processningskön. Matchningsfördelning saknas.'
    );
  }

  const beforeStatus = await getStatus(token);
  const before = summarizeDashboard(beforeStatus.dashboard);
  log('Före — queueLength=' + before.queueLength + ', counts=' + JSON.stringify(before.counts));

  log('Startar /process-all (ownerAck:true, mode:' + MODE + ', maxBatches:' + MAX_BATCHES + ')...');
  const processAll = await fetchJson('/api/v1/cco/mail-ingestion/process-all', {
    method: 'POST',
    token,
    body: {
      mailboxEmail,
      mode: MODE,
      maxBatches: MAX_BATCHES,
      ownerAck: true,
    },
  });
  const jobId = processAll?.jobId;
  log('Accepterat. jobId=' + jobId + ', queueLength=' + (processAll?.queueLength || 'okänd'));

  if (!jobId) {
    throw new Error('process-all svarade utan jobId');
  }

  const job = await waitForJob(token, jobId);

  log('Väntar 3 s för att state ska landa...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const afterStatus = await getStatus(token);
  const after = summarizeDashboard(afterStatus.dashboard);
  log('Efter — queueLength=' + after.queueLength + ', counts=' + JSON.stringify(after.counts));

  const diff = diffCounts(before.counts, after.counts);
  log('Diff counts=' + JSON.stringify(diff));

  if (job) {
    log('Jobbsammanfattning:');
    log('  status:     ' + job.status);
    log('  batches:    ' + (job.batches || 0));
    log('  processed:  ' + (job.totalProcessed || 0));
    log('  failed:     ' + (job.totalFailed || 0));
    if (job.error) {
      log('  error:      ' + job.error);
    }
  }

  if (MODE === 'dry_run') {
    log(
      'OBS: dry_run tog bort upp till ' +
        (job?.totalProcessed || 0) +
        ' meddelanden ur processningskön.'
    );
    log(
      'De återställs normalt av ensureQueueIntegrity vid nästa process-all, men detta är inte garanterat.'
    );
  }

  if (job?.status === 'failed') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
