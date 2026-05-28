'use strict';

const v8 = require('node:v8');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Memory telemetry + heap-snapshot tooling.
 *
 * Bakgrund: 2026-05-27/28 hade Frankfurt-Arcana en OOM-loop som löstes via
 * "lazy sharded mailbox truth reads" (commit d448ea1). För att fånga nästa
 * läcka tidigt loggar vi process-minne periodiskt så vi ser en växande heap
 * timmar innan kerneln kill:ar processen. SIGUSR2-handlern låter oss
 * dumpa en heap-snapshot från en levande pod via Render-shell.
 *
 * Allt är opt-in via env och no-op om inaktiverat.
 */

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function toMb(bytes) {
  if (!Number.isFinite(bytes)) return 0;
  return Math.round(bytes / 1024 / 1024);
}

function buildSample() {
  const mu = process.memoryUsage();
  const hs = v8.getHeapStatistics();
  return {
    type: 'memory_telemetry',
    ts: new Date().toISOString(),
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    rss_mb: toMb(mu.rss),
    heap_used_mb: toMb(mu.heapUsed),
    heap_total_mb: toMb(mu.heapTotal),
    external_mb: toMb(mu.external),
    array_buffers_mb: toMb(mu.arrayBuffers),
    heap_size_limit_mb: toMb(hs.heap_size_limit),
    malloced_mb: toMb(hs.malloced_memory),
    peak_malloced_mb: toMb(hs.peak_malloced_memory),
  };
}

function startMemoryTelemetry(options = {}) {
  const intervalMs = readInt(
    'ARCANA_MEMORY_TELEMETRY_INTERVAL_MS',
    options.intervalMs ?? 60000
  );
  const enabled = String(process.env.ARCANA_MEMORY_TELEMETRY_ENABLED ?? 'true')
    .trim()
    .toLowerCase() !== 'false';
  if (!enabled || intervalMs <= 0) {
    return { stop() {} };
  }
  const logger = options.logger || console;
  let last = null;
  const timer = setInterval(() => {
    try {
      const sample = buildSample();
      // Compact one-line JSON så det är lätt att grep:a i Render-loggar.
      logger.log(JSON.stringify(sample));
      // Larm-tröskel: heap > 75 % av limit ELLER rss > 6 GB.
      const limit = sample.heap_size_limit_mb || 0;
      const heapPctOfLimit = limit ? sample.heap_used_mb / limit : 0;
      if (heapPctOfLimit > 0.75 || sample.rss_mb > 6144) {
        logger.warn(
          JSON.stringify({
            type: 'memory_alarm',
            ts: sample.ts,
            reason: heapPctOfLimit > 0.75 ? 'heap_pct_over_75' : 'rss_over_6gb',
            heap_pct_of_limit: Number(heapPctOfLimit.toFixed(3)),
            sample,
          })
        );
      }
      if (last) {
        const deltaRssMb = sample.rss_mb - last.rss_mb;
        // Stor abrupt ökning kan vara en läck-trigger; flagga i loggen.
        if (deltaRssMb >= 512) {
          logger.warn(
            JSON.stringify({
              type: 'memory_jump',
              ts: sample.ts,
              delta_rss_mb: deltaRssMb,
              prev_rss_mb: last.rss_mb,
              curr_rss_mb: sample.rss_mb,
            })
          );
        }
      }
      last = sample;
    } catch (err) {
      try {
        logger.error('[memory-telemetry] sample error', err && err.message);
      } catch (_) {
        // swallow — loggning får aldrig krascha appen
      }
    }
  }, intervalMs);
  // Tillåt processen att avslutas även om timern är aktiv.
  if (typeof timer.unref === 'function') timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

function installHeapSnapshotHandler(options = {}) {
  const enabled = String(
    process.env.ARCANA_HEAP_SNAPSHOT_SIGUSR2_ENABLED ?? 'true'
  )
    .trim()
    .toLowerCase() !== 'false';
  if (!enabled) return { uninstall() {} };
  const logger = options.logger || console;
  const dir =
    process.env.ARCANA_HEAP_SNAPSHOT_DIR ||
    options.dir ||
    (fs.existsSync('/var/data') ? '/var/data/heap-snapshots' : path.join(require('node:os').tmpdir(), 'arcana-heap-snapshots'));
  const handler = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const filename = `heap-${new Date().toISOString().replace(/[:.]/g, '-')}-pid${process.pid}.heapsnapshot`;
      const target = path.join(dir, filename);
      const written = v8.writeHeapSnapshot(target);
      logger.warn(
        JSON.stringify({
          type: 'heap_snapshot_written',
          ts: new Date().toISOString(),
          path: written,
        })
      );
    } catch (err) {
      logger.error(
        JSON.stringify({
          type: 'heap_snapshot_error',
          ts: new Date().toISOString(),
          error: err && err.message,
        })
      );
    }
  };
  process.on('SIGUSR2', handler);
  return {
    uninstall() {
      process.removeListener('SIGUSR2', handler);
    },
  };
}

module.exports = {
  startMemoryTelemetry,
  installHeapSnapshotHandler,
};
