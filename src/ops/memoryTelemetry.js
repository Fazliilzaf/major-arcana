'use strict';

const v8 = require('node:v8');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Memory telemetry + heap-snapshot tooling.
 *
 * Viktigt: initiera först EFTER runtimeState.ready (se server.js). SIGUSR2 +
 * v8.writeHeapSnapshot blockerar event loop — om det triggas under boot
 * svarar inte /readyz i tid och Render avbryter deploy (status 143).
 */

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function readBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim().toLowerCase() !== 'false';
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

function resolveHeapSnapshotDir(options = {}) {
  if (process.env.ARCANA_HEAP_SNAPSHOT_DIR) {
    return process.env.ARCANA_HEAP_SNAPSHOT_DIR;
  }
  if (options.dir) return options.dir;
  return path.join(os.tmpdir(), 'arcana-heap-snapshots');
}

function startMemoryTelemetry(options = {}) {
  const intervalMs = readInt('ARCANA_MEMORY_TELEMETRY_INTERVAL_MS', options.intervalMs ?? 60000);
  const enabled = readBool('ARCANA_MEMORY_TELEMETRY_ENABLED', true);
  const isReady = typeof options.isReady === 'function' ? options.isReady : () => true;
  if (!enabled || intervalMs <= 0) {
    return { stop() {} };
  }
  const logger = options.logger || console;
  let last = null;
  const timer = setInterval(() => {
    if (!isReady()) return;
    try {
      const sample = buildSample();
      logger.log(JSON.stringify(sample));
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
        // swallow
      }
    }
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

function installHeapSnapshotHandler(options = {}) {
  // Opt-in: synkron writeHeapSnapshot får aldrig köras under boot.
  const enabled = readBool('ARCANA_HEAP_SNAPSHOT_SIGUSR2_ENABLED', false);
  if (!enabled) return { uninstall() {} };
  const logger = options.logger || console;
  const isReady = typeof options.isReady === 'function' ? options.isReady : () => true;
  let snapshotInProgress = false;
  const handler = () => {
    if (!isReady()) {
      logger.warn(
        JSON.stringify({
          type: 'heap_snapshot_skipped',
          ts: new Date().toISOString(),
          reason: 'not_ready',
        })
      );
      return;
    }
    if (snapshotInProgress) {
      logger.warn(
        JSON.stringify({
          type: 'heap_snapshot_skipped',
          ts: new Date().toISOString(),
          reason: 'in_progress',
        })
      );
      return;
    }
    snapshotInProgress = true;
    setImmediate(() => {
      try {
        const dir = resolveHeapSnapshotDir(options);
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
      } finally {
        snapshotInProgress = false;
      }
    });
  };
  process.on('SIGUSR2', handler);
  return {
    uninstall() {
      process.removeListener('SIGUSR2', handler);
    },
  };
}

/**
 * Start memory telemetry + optional SIGUSR2 snapshot handler.
 * Call only after the app is ready to serve traffic.
 */
function startMemoryObservability(options = {}) {
  const telemetry = startMemoryTelemetry(options);
  const snapshot = installHeapSnapshotHandler(options);
  return {
    stop() {
      telemetry.stop();
      snapshot.uninstall();
    },
  };
}

module.exports = {
  buildSample,
  startMemoryTelemetry,
  installHeapSnapshotHandler,
  startMemoryObservability,
  resolveHeapSnapshotDir,
};
