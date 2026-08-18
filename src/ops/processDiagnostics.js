'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance, monitorEventLoopDelay, PerformanceObserver } = require('node:perf_hooks');

/**
 * Process-diagnostics: heartbeat, event-loop-delay och GC-pauses.
 *
 * Bakgrund: 2026-08-18 upprepade frysningar av Arcana-produktion där
 * instanser blev helt tysta i minuter och sedan tvångsomstartades av Render.
 * Vanlig 60-sekunders minnestelemetri räcker inte för att skilja
 * "event-loopen är blockerad" från "loggar tappas bort av Render".
 *
 * Den här modulen skriver en tick per sekund både till stdout och till disk.
 * Om disken har ticks som stdout saknar tappas loggar av Render. Om båda
 * har samma glapp stod processen still.
 *
 * Opt-in via ARCANA_DIAG_HEARTBEAT=true.
 */

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function readString(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).trim();
}

function toMb(bytes) {
  if (!Number.isFinite(bytes)) return 0;
  return Math.round(bytes / 1024 / 1024);
}

function resolveHeartbeatPath(options = {}) {
  return (
    options.heartbeatPath ||
    readString('ARCANA_DIAG_HEARTBEAT_PATH') ||
    (fs.existsSync('/var/data') ? '/var/data/diag/heartbeat.log' : null)
  );
}

function appendToDisk(filePath, line, logger) {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, `${line}\n`, 'utf8');
  } catch (err) {
    try {
      logger.error('[diag-heartbeat] disk append failed:', err && err.message);
    } catch (_) {
      // swallow
    }
  }
}

function buildHeartbeatSample(histogram) {
  const mu = process.memoryUsage();
  const now = performance.now();
  return {
    type: 'diag_heartbeat',
    ts: new Date().toISOString(),
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    rss_mb: toMb(mu.rss),
    heap_used_mb: toMb(mu.heapUsed),
    heap_total_mb: toMb(mu.heapTotal),
    event_loop_delay_ms: {
      min: Math.round(histogram.min / 1e6),
      max: Math.round(histogram.max / 1e6),
      mean: Math.round(histogram.mean / 1e6),
      p50: Math.round(histogram.percentile(50) / 1e6),
      p99: Math.round(histogram.percentile(99) / 1e6),
    },
  };
}

function installSignalHandlers(logger) {
  const logSync = (signal, extra = '') => {
    const line = JSON.stringify({
      type: 'diag_signal',
      ts: new Date().toISOString(),
      pid: process.pid,
      signal,
      uptime_s: Math.round(process.uptime()),
      extra,
    });
    // Synkron skrivning: stdout kan vara en pipe och asynkrona flöden hinner
    // inte flushas vid exit.
    try {
      process.stdout.write(`${line}\n`);
    } catch (_) {
      // swallow
    }
  };

  const handlers = {
    SIGINT: () => logSync('SIGINT'),
    SIGTERM: () => logSync('SIGTERM'),
    SIGHUP: () => logSync('SIGHUP'),
    beforeExit: (code) => logSync('beforeExit', `code=${code}`),
    exit: (code) => logSync('exit', `code=${code}`),
    uncaughtException: (err) => logSync('uncaughtException', err && err.message),
    unhandledRejection: (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      logSync('unhandledRejection', message);
    },
  };

  for (const [event, handler] of Object.entries(handlers)) {
    process.on(event, handler);
  }

  return {
    uninstall() {
      for (const [event, handler] of Object.entries(handlers)) {
        process.removeListener(event, handler);
      }
    },
  };
}

function startHeartbeat(options = {}) {
  const enabled =
    String(process.env.ARCANA_DIAG_HEARTBEAT ?? 'false').trim().toLowerCase() === 'true';
  if (!enabled) {
    return { stop() {}, signalHandlers: { uninstall() {} } };
  }

  const logger = options.logger || console;
  const intervalMs = readInt('ARCANA_DIAG_HEARTBEAT_INTERVAL_MS', options.intervalMs ?? 1000);
  const heartbeatPath = resolveHeartbeatPath(options);
  const gcThresholdMs = readInt('ARCANA_DIAG_GC_THRESHOLD_MS', options.gcThresholdMs ?? 100);

  if (heartbeatPath) {
    logger.log(`[diag-heartbeat] enabled; writing to ${heartbeatPath}`);
  } else {
    logger.log('[diag-heartbeat] enabled; no disk path configured');
  }

  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();

  let gcObs = null;
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      gcObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const durationMs = entry.duration;
          if (durationMs < gcThresholdMs) continue;
          const line = JSON.stringify({
            type: 'diag_gc_pause',
            ts: new Date().toISOString(),
            pid: process.pid,
            kind: entry.detail?.kind || entry.kind || 'unknown',
            duration_ms: Math.round(durationMs * 100) / 100,
            threshold_ms: gcThresholdMs,
          });
          logger.warn(line);
          appendToDisk(heartbeatPath, line, logger);
        }
      });
      gcObs.observe({ entryTypes: ['gc'] });
    } catch (err) {
      logger.error('[diag-heartbeat] GC observer init failed:', err && err.message);
    }
  }

  const signalHandlers = installSignalHandlers(logger);

  const timer = setInterval(() => {
    try {
      const sample = buildHeartbeatSample(histogram);
      const line = JSON.stringify(sample);
      logger.log(line);
      appendToDisk(heartbeatPath, line, logger);
      histogram.reset();
    } catch (err) {
      try {
        logger.error('[diag-heartbeat] tick error:', err && err.message);
      } catch (_) {
        // swallow
      }
    }
  }, intervalMs > 0 ? intervalMs : 1000);

  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
      if (gcObs && typeof gcObs.disconnect === 'function') {
        try {
          gcObs.disconnect();
        } catch (_) {
          // swallow
        }
      }
      signalHandlers.uninstall();
    },
  };
}

module.exports = {
  startHeartbeat,
  installSignalHandlers,
};
