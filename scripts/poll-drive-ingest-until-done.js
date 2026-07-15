#!/usr/bin/env node
'use strict';

/**
 * Poll prod Drive ingest until dry-run remaining=0.
 * Auto-resumes run-ingest when multi-instance drops in-memory state.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  canCompleteDriveIngest,
  shouldStopForFailedImports,
} = require('./lib/driveIngestCompletionGate');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const LOG = process.env.POLL_LOG || '/tmp/drive-ingest-poll.log';
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 90000);
const DRY_EVERY_TICKS = Number(process.env.POLL_DRY_EVERY || 6);
const MAX_502_STREAK = 4;
const STALL_TICKS = 8;

function ts() {
  return new Date().toISOString();
}

function log(entry) {
  const line = JSON.stringify({ at: ts(), ...entry });
  fs.appendFileSync(LOG, line + '\n');
  console.log(line);
}

function token(attempt = 1) {
  const r = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180000,
  });
  if (r.status !== 0) {
    if (attempt < 10) {
      spawnSync('sleep', [String(Math.min(attempt * 10, 90))]);
      return token(attempt + 1);
    }
    throw new Error(`token_failed:${(r.stderr || r.stdout || '').trim()}`);
  }
  const t = String(r.stdout || '').trim();
  if (!t) throw new Error('empty_token');
  return t;
}

async function api(method, route, tok, { timeoutMs = 180000, body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${route}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
        'X-CCO-Role': 'owner',
        'X-CCO-Tenant': 'hair-tp-clinic',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text && text.startsWith('{') ? JSON.parse(text) : { raw: text.slice(0, 300) };
    } catch {
      parsed = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body: parsed, incomplete: !text };
  } finally {
    clearTimeout(timer);
  }
}

async function dryRemaining(tok) {
  const dry = await api('POST', '/api/v1/cco/asset-qa/internalize-drive?limit=1', tok, {
    timeoutMs: 300000,
  });
  const stats = dry.body?.report?.stats || dry.body?.stats || {};
  return {
    dry,
    remaining: stats.remaining ?? null,
    alreadyInternal: stats.alreadyInternal ?? null,
    scanned: stats.scanned ?? null,
    failed: stats.failed ?? 0,
  };
}

async function ensureIngestRunning(tok) {
  return api('POST', '/api/v1/cco/asset-qa/run-ingest?action=start&chunk=40&concurrency=4', tok, {
    timeoutMs: 60000,
  });
}

async function main() {
  fs.writeFileSync(LOG, '');
  log({ event: 'start', base: BASE, intervalMs: INTERVAL_MS });

  let tok = token();
  let tokAt = Date.now();
  let streak502 = 0;
  let stallTicks = 0;
  let lastRemaining = null;
  let lastAlreadyInternal = null;
  let tickCount = 0;

  while (true) {
    if (Date.now() - tokAt > 40 * 60 * 1000) {
      tok = token();
      tokAt = Date.now();
    }

    tickCount += 1;
    let status;
    let snapshot;
    let dry = null;
    try {
      status = await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=status', tok);
      snapshot = await api('GET', '/api/v1/cco/asset-qa/snapshot?tenantId=hair_tp', tok, {
        timeoutMs: 240000,
      });
      if (tickCount === 1 || tickCount % DRY_EVERY_TICKS === 0) {
        dry = await dryRemaining(tok);
      }
    } catch (err) {
      log({ event: 'poll_error', error: String(err.message || err) });
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    if (status.status === 502) {
      streak502 += 1;
      log({ event: '502', streak: streak502, where: 'status' });
      if (streak502 >= MAX_502_STREAK) {
        await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
        log({ event: 'STOPPED', reason: 'recurring_502', streak502 });
        process.exit(2);
      }
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }
    streak502 = 0;

    if (snapshot.status === 502) {
      log({ event: '502_snapshot_only', code: snapshot.status });
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    if (status.incomplete) {
      log({ event: 'WARN', reason: 'incomplete_status_response' });
    }

    if (status.status !== 200) {
      log({ event: 'status_http_error', code: status.status, body: status.body });
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    if (snapshot.status !== 200) {
      log({ event: 'WARN', reason: 'snapshot_unavailable', code: snapshot.status });
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
      continue;
    }

    const st = status.body?.state || {};
    const snap = snapshot.body || {};
    const metrics = snap.metrics || {};
    const rem = dry ? dry.remaining : lastRemaining;
    const alreadyInternal = dry ? dry.alreadyInternal : lastAlreadyInternal;
    const recentRuns = snap.recentRuns || [];
    const recentImported = recentRuns
      .filter((r) => r.finishedAt && Date.now() - Date.parse(r.finishedAt) < 15 * 60 * 1000)
      .reduce((n, r) => n + (r.totalImported || 0), 0);

    if (st.lastError) {
      await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
      log({ event: 'STOPPED', reason: 'lastError', lastError: st.lastError });
      process.exit(2);
    }

    if (shouldStopForFailedImports(st, metrics)) {
      await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
      log({
        event: 'STOPPED',
        reason: 'failed_imports',
        runFailed: st.failed,
        snapshotFailed: metrics.totalFilesFailedImport,
      });
      process.exit(2);
    }

    if ((metrics.totalOrphanFiles || 0) > 0) {
      await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
      log({ event: 'STOPPED', reason: 'orphan_files', orphans: metrics.totalOrphanFiles });
      process.exit(2);
    }

    if ((snap.ghostBlobBlockers || 0) > 0) {
      await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
      log({ event: 'STOPPED', reason: 'ghost_blob_blockers', count: snap.ghostBlobBlockers });
      process.exit(2);
    }

    const importedToCco = metrics.totalFilesImportedToCco ?? null;
    if (
      alreadyInternal !== null &&
      lastAlreadyInternal !== null &&
      alreadyInternal > lastAlreadyInternal
    ) {
      stallTicks = 0;
    } else if (recentImported > 0) {
      stallTicks = 0;
    } else if (rem > 0) {
      stallTicks += 1;
    }
    if (dry) {
      lastRemaining = rem;
      lastAlreadyInternal = alreadyInternal;
    }

    log({
      event: 'tick',
      running: st.running,
      stateRemaining: st.remaining,
      dryRemaining: rem,
      alreadyInternal,
      recentImported15m: recentImported,
      processedChunks: st.processedChunks,
      stateImported: st.imported,
      importedToCco,
      linkOnly: snap.linkOnlyBlockers,
      orphans: metrics.totalOrphanFiles,
      ghostBlobBlockers: snap.ghostBlobBlockers,
      cutoverReady: snap.cutoverReady,
      stallTicks,
    });

    if (rem === 0 && dry) {
      const completion = canCompleteDriveIngest({
        dryRemaining: rem,
        snapshot: snap,
        metrics,
      });
      if (!completion.ok) {
        await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
        log({
          event: 'STOPPED',
          reason: 'completion_gate_blocked',
          gate: completion,
          dryRemaining: rem,
          snapshot: snap,
          state: st,
        });
        process.exit(2);
      }
      log({ event: 'COMPLETE', dryRemaining: 0, snapshot: snap, state: st });
      fs.writeFileSync(
        '/tmp/drive-ingest-complete.json',
        JSON.stringify({ rem, snap, st, at: ts() }, null, 2)
      );
      process.exit(0);
    }

    if (!st.running && rem > 0) {
      const start = await ensureIngestRunning(tok);
      log({
        event: 'watchdog_restart',
        dryRemaining: rem,
        startStatus: start.status,
        started: start.body?.started,
        already: start.body?.already,
      });
    }

    if (stallTicks >= STALL_TICKS) {
      await api('POST', '/api/v1/cco/asset-qa/run-ingest?action=stop', tok);
      log({
        event: 'STOPPED',
        reason: 'progress_stall',
        dryRemaining: rem,
        importedToCco,
        stallTicks,
      });
      process.exit(2);
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  log({ event: 'fatal', error: String(err.stack || err) });
  process.exit(1);
});
