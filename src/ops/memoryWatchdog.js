'use strict';

/**
 * Memory Watchdog — pre-emptiv, mjuk omstart innan hård OOM.
 *
 * Bakgrund (post-mortem 2026-05-29):
 *   Arcana kör i en enda instans på Render Pro Plus (8 GB). En långsam
 *   minnesväxt driver RSS uppåt tills kärnan OOM-dödar processen med SIGKILL.
 *   SIGKILL ger ingen graceful drain → in-flight requests tappas, och Render
 *   hamnar i en flapp-loop (29 maj: 8 omstarter på 23 min, 502-storm hela tiden).
 *
 * Lösning:
 *   Vakten samplar RSS (och heap-andel av V8-gränsen) med jämna mellanrum. När
 *   RSS passerar en mjuk tröskel UNDER container-taket, N gånger i rad, loggar
 *   den ett strukturerat event och anropar en injicerad gracefulShutdown().
 *   Då hinner servern dränera och stänga rent, och Render startar om EN gång,
 *   snabbt och förutsägbart, i stället för en hård kill mitt i trafik.
 *
 * Designval:
 *   - Tröskeln ligger med marginal under taket (default 6,5 GB av 8 GB) så att
 *     omstarten sker innan kärnan hinner döda processen.
 *   - requireConsecutive sätter krav på flera mätningar i rad → undviker
 *     omstart vid en kortvarig spik (t.ex. en tung scheduler-batch).
 *   - minUptimeMs hindrar omstart direkt efter boot (annars risk för loop om
 *     baslinjen redan ligger högt).
 *   - Allt styrs via env, och vakten kan stängas av helt (ARCANA_MEMORY_WATCHDOG_ENABLED=false).
 *   - Vakten kompletterar src/ops/memoryTelemetry.js (observation), den ersätter
 *     den inte. Telemetri = se trenden, watchdog = agera på den.
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

/**
 * Starta minnesvakten.
 *
 * @param {object} options
 * @param {() => Promise<void>|void} options.onTrip  Anropas vid tröskelbrott (oftast gracefulShutdown).
 * @param {object} [options.logger=console]
 * @param {() => boolean} [options.isReady]          Vakten agerar bara när true.
 * @param {() => NodeJS.MemoryUsage} [options.readMemory]  Injicerbar för test.
 * @returns {{ stop: () => void, inspect: () => object }}
 */
function startMemoryWatchdog(options = {}) {
  const enabled = readBool('ARCANA_MEMORY_WATCHDOG_ENABLED', options.enabled ?? true);
  const intervalMs = readInt('ARCANA_MEMORY_WATCHDOG_INTERVAL_MS', options.intervalMs ?? 30000);
  // Mjuk tröskel i MB. Default 6656 MB = 6,5 GB (marginal under 8 GB-taket).
  const softLimitMb = readInt('ARCANA_MEMORY_WATCHDOG_RSS_MB', options.softLimitMb ?? 6656);
  // Andel av V8 heap-gränsen som också triggar (heap-leak fångas innan RSS hinner svälla).
  const heapPctLimit = Number(
    process.env.ARCANA_MEMORY_WATCHDOG_HEAP_PCT || options.heapPctLimit || 0.85
  );
  const requireConsecutive = readInt(
    'ARCANA_MEMORY_WATCHDOG_CONSECUTIVE',
    options.requireConsecutive ?? 3
  );
  // Starta inte omstart förrän processen levt en stund (undvik boot-loop).
  const minUptimeMs = readInt(
    'ARCANA_MEMORY_WATCHDOG_MIN_UPTIME_MS',
    options.minUptimeMs ?? 120000
  );

  const logger = options.logger || console;
  const isReady = typeof options.isReady === 'function' ? options.isReady : () => true;
  const readMemory =
    typeof options.readMemory === 'function' ? options.readMemory : () => process.memoryUsage();
  const onTrip =
    typeof options.onTrip === 'function'
      ? options.onTrip
      : () => {
          // Defaultbeteende om ingen graceful shutdown injicerats: exit(0) → Render startar om.
          process.exit(0);
        };

  const state = {
    breaches: 0,
    tripped: false,
    lastSample: null,
  };

  if (!enabled || intervalMs <= 0) {
    logger.log(
      JSON.stringify({ type: 'memory_watchdog', status: 'disabled', enabled, intervalMs })
    );
    return { stop() {}, inspect: () => ({ ...state, enabled: false }) };
  }

  logger.log(
    JSON.stringify({
      type: 'memory_watchdog',
      status: 'started',
      softLimitMb,
      heapPctLimit,
      requireConsecutive,
      intervalMs,
      minUptimeMs,
    })
  );

  function sample() {
    if (state.tripped) return;
    if (!isReady()) return;
    if (process.uptime() * 1000 < minUptimeMs) return;

    let mu;
    try {
      mu = readMemory();
    } catch (err) {
      logger.error('[memory-watchdog] memoryUsage failed', err && err.message);
      return;
    }

    const rssMb = toMb(mu.rss);
    let heapPct = 0;
    try {
      const v8 = require('node:v8');
      const limit = v8.getHeapStatistics().heap_size_limit;
      if (limit > 0) heapPct = mu.heapUsed / limit;
    } catch (_e) {
      // ignore — RSS-tröskeln räcker
    }
    state.lastSample = { rssMb, heapPct: Number(heapPct.toFixed(3)), at: new Date().toISOString() };

    const rssBreach = rssMb >= softLimitMb;
    const heapBreach = heapPct >= heapPctLimit;

    if (!rssBreach && !heapBreach) {
      if (state.breaches > 0) {
        logger.log(
          JSON.stringify({ type: 'memory_watchdog', status: 'recovered', ...state.lastSample })
        );
      }
      state.breaches = 0;
      return;
    }

    state.breaches += 1;
    logger.warn(
      JSON.stringify({
        type: 'memory_watchdog',
        status: 'breach',
        reason: rssBreach ? 'rss_over_soft_limit' : 'heap_pct_over_limit',
        rss_mb: rssMb,
        soft_limit_mb: softLimitMb,
        heap_pct: Number(heapPct.toFixed(3)),
        heap_pct_limit: heapPctLimit,
        consecutive: state.breaches,
        required: requireConsecutive,
      })
    );

    if (state.breaches >= requireConsecutive) {
      state.tripped = true;
      logger.warn(
        JSON.stringify({
          type: 'memory_watchdog',
          status: 'tripped',
          action: 'graceful_restart',
          rss_mb: rssMb,
          heap_pct: Number(heapPct.toFixed(3)),
          note: 'preemptiv mjuk omstart innan OOM-kill',
        })
      );
      try {
        Promise.resolve(onTrip('memory_watchdog')).catch((err) => {
          logger.error('[memory-watchdog] onTrip failed, hård exit', err && err.message);
          process.exit(0);
        });
      } catch (err) {
        logger.error('[memory-watchdog] onTrip threw, hård exit', err && err.message);
        process.exit(0);
      }
    }
  }

  const timer = setInterval(sample, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    inspect: () => ({ ...state, enabled: true, softLimitMb, requireConsecutive }),
  };
}

module.exports = { startMemoryWatchdog };
