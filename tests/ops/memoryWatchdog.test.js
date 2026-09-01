'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { startMemoryWatchdog } = require('../../src/ops/memoryWatchdog');

function silentLogger() {
  const lines = [];
  const push = (...args) => lines.push(args.join(' '));
  return { lines, log: push, warn: push, error: push };
}

const MB = 1024 * 1024;

test('watchdog triggar onTrip efter N tröskelbrott i rad', async () => {
  const logger = silentLogger();
  let tripped = 0;
  const rss = 7000; // över softLimit
  const wd = startMemoryWatchdog({
    enabled: true,
    intervalMs: 5, // snabbt i test
    softLimitMb: 6656,
    requireConsecutive: 3,
    minUptimeMs: 0,
    logger,
    isReady: () => true,
    readMemory: () => ({
      rss: rss * MB,
      heapUsed: 1 * MB,
      heapTotal: 2 * MB,
      external: 0,
      arrayBuffers: 0,
    }),
    onTrip: () => {
      tripped += 1;
    },
  });

  await new Promise((r) => setTimeout(r, 60));
  wd.stop();

  assert.strictEqual(tripped, 1, 'ska trippa exakt en gång');
  const inspect = wd.inspect();
  assert.ok(inspect.tripped, 'state ska markeras tripped');
});

test('watchdog triggar INTE under tröskel', async () => {
  const logger = silentLogger();
  let tripped = 0;
  const wd = startMemoryWatchdog({
    enabled: true,
    intervalMs: 5,
    softLimitMb: 6656,
    requireConsecutive: 3,
    minUptimeMs: 0,
    heapPctLimit: 0.85,
    logger,
    isReady: () => true,
    readMemory: () => ({
      rss: 2000 * MB,
      heapUsed: 1 * MB,
      heapTotal: 2 * MB,
      external: 0,
      arrayBuffers: 0,
    }),
    onTrip: () => {
      tripped += 1;
    },
  });

  await new Promise((r) => setTimeout(r, 50));
  wd.stop();
  assert.strictEqual(tripped, 0, 'ska aldrig trippa under tröskel');
});

test('en enstaka spik (under N i rad) trippar inte', async () => {
  const logger = silentLogger();
  let tripped = 0;
  const seq = [7000, 2000, 2000, 2000, 2000]; // en spik, sen lugnt
  let i = 0;
  const wd = startMemoryWatchdog({
    enabled: true,
    intervalMs: 5,
    softLimitMb: 6656,
    requireConsecutive: 3,
    minUptimeMs: 0,
    logger,
    isReady: () => true,
    readMemory: () => {
      const rss = seq[Math.min(i, seq.length - 1)];
      i += 1;
      return { rss: rss * MB, heapUsed: 1 * MB, heapTotal: 2 * MB, external: 0, arrayBuffers: 0 };
    },
    onTrip: () => {
      tripped += 1;
    },
  });

  await new Promise((r) => setTimeout(r, 60));
  wd.stop();
  assert.strictEqual(tripped, 0, 'en spik som inte upprepas ska inte trippa');
});

test('disabled watchdog gör ingenting', async () => {
  const logger = silentLogger();
  let tripped = 0;
  const wd = startMemoryWatchdog({
    enabled: false,
    intervalMs: 5,
    minUptimeMs: 0,
    logger,
    readMemory: () => ({
      rss: 7000 * MB,
      heapUsed: 1 * MB,
      heapTotal: 2 * MB,
      external: 0,
      arrayBuffers: 0,
    }),
    onTrip: () => {
      tripped += 1;
    },
  });
  await new Promise((r) => setTimeout(r, 30));
  wd.stop();
  assert.strictEqual(tripped, 0);
  assert.strictEqual(wd.inspect().enabled, false);
});

test('respekterar minUptimeMs (ingen omstart direkt efter boot)', async () => {
  const logger = silentLogger();
  let tripped = 0;
  const wd = startMemoryWatchdog({
    enabled: true,
    intervalMs: 5,
    softLimitMb: 6656,
    requireConsecutive: 1,
    minUptimeMs: 10 * 60 * 1000, // 10 min → process.uptime() i test är långt under
    logger,
    isReady: () => true,
    readMemory: () => ({
      rss: 7000 * MB,
      heapUsed: 1 * MB,
      heapTotal: 2 * MB,
      external: 0,
      arrayBuffers: 0,
    }),
    onTrip: () => {
      tripped += 1;
    },
  });
  await new Promise((r) => setTimeout(r, 40));
  wd.stop();
  assert.strictEqual(tripped, 0, 'minUptimeMs ska blockera tidig omstart');
});
