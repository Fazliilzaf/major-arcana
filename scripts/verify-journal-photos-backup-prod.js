#!/usr/bin/env node
'use strict';

/**
 * U2.6 — Verify journal-photos backup wiring on prod.
 *
 * Checks:
 *   JP-01 readyz
 *   JP-02 /api/v1/health/journal-photos
 *   JP-03 scheduler job journal_photos_backup registered + enabled
 *
 * Usage:
 *   npm run verify:journal-photos-backup-prod
 */

require('dotenv').config({ quiet: true });
const path = require('node:path');
const { execSync } = require('node:child_process');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.se').replace(
  /\/+$/,
  ''
);

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function getOwnerToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  let hardFail = false;
  const fail = (name, detail) => {
    record(name, false, detail);
    hardFail = true;
  };

  console.log(`Journal photos backup verify @ ${BASE}\n`);

  const ready = await fetch(`${BASE}/readyz`).then((r) => r.json()).catch(() => ({}));
  if (!record('JP-01 readyz', ready.ready === true)) hardFail = true;

  const health = await getJson(`${BASE}/api/v1/health/journal-photos`);
  if (health.status === 503) {
    fail('JP-02 journal-photos health', health.body?.error || 'journalPhotosDir saknas');
  } else if (!record('JP-02 journal-photos health', health.status === 200 && health.body?.ok === true)) {
    hardFail = true;
  } else {
    record(
      'JP-02b journal-photos path',
      Boolean(health.body?.path),
      `${health.body?.fileCount || 0} filer, ${health.body?.totalBytes || 0} bytes`
    );
  }

  let token = '';
  try {
    token = getOwnerToken();
  } catch (error) {
    fail('JP-03 owner token', error.message?.slice(0, 80) || 'saknas');
  }

  if (token) {
    const scheduler = await getJson(`${BASE}/api/v1/ops/scheduler/status`, {
      Authorization: `Bearer ${token}`,
    });
    if (scheduler.status === 503) {
      fail('JP-03 scheduler status', scheduler.body?.error || 'scheduler inaktiv');
    } else if (!record('JP-03 scheduler status HTTP', scheduler.status === 200)) {
      hardFail = true;
    } else {
      const jobs = scheduler.body?.scheduler?.jobs || [];
      const backupJob = jobs.find((job) => job.id === 'journal_photos_backup');
      if (!backupJob) {
        fail('JP-04 journal_photos_backup job', 'saknas i scheduler-status');
      } else {
        record('JP-04 journal_photos_backup job', true, backupJob.name || backupJob.id);
        if (!record('JP-05 job enabled', backupJob.enabled === true)) hardFail = true;
        if (backupJob.lastRunAt) {
          record('JP-06 last run', true, backupJob.lastRunAt);
        } else {
          record('JP-06 last run', true, 'ej kört än (ny deploy eller väntar på intervall)');
        }
        if (backupJob.lastResult?.skipped) {
          record(
            'JP-07 last result',
            false,
            backupJob.lastResult?.reason || 'skipped'
          );
          hardFail = true;
        } else if (backupJob.lastResult) {
          record(
            'JP-07 last result',
            true,
            backupJob.lastResult?.archivePath
              ? path.basename(String(backupJob.lastResult.archivePath))
              : 'ok'
          );
        }
      }
      record(
        'JP-08 scheduler enabled',
        scheduler.body?.scheduler?.enabled === true,
        scheduler.body?.scheduler?.enabled ? 'ARCANA_SCHEDULER_ENABLED=true' : 'scheduler av'
      );
    }
  }

  if (hardFail) {
    console.error('\n❌ Journal photos backup verify FAIL');
    process.exit(1);
  }
  console.log('\n✅ Journal photos backup verify PASS');
}

main().catch((error) => {
  console.error('❌ Journal photos backup verify:', error.message || error);
  process.exit(1);
});
