'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  startMemoryTelemetry,
  installHeapSnapshotHandler,
  startMemoryObservability,
  resolveHeapSnapshotDir,
} = require('../../src/ops/memoryTelemetry');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('resolveHeapSnapshotDir prefers env then options then tmpdir', () => {
  process.env.ARCANA_HEAP_SNAPSHOT_DIR = '/tmp/custom';
  assert.equal(resolveHeapSnapshotDir({ dir: '/ignored' }), '/tmp/custom');
  delete process.env.ARCANA_HEAP_SNAPSHOT_DIR;
  assert.equal(resolveHeapSnapshotDir({ dir: '/opt/snapshots' }), '/opt/snapshots');
});

test('installHeapSnapshotHandler is no-op when disabled (default)', () => {
  delete process.env.ARCANA_HEAP_SNAPSHOT_SIGUSR2_ENABLED;
  const before = process.listenerCount('SIGUSR2');
  const handle = installHeapSnapshotHandler({ isReady: () => true });
  assert.equal(process.listenerCount('SIGUSR2'), before);
  handle.uninstall();
});

test('installHeapSnapshotHandler registers when explicitly enabled', () => {
  process.env.ARCANA_HEAP_SNAPSHOT_SIGUSR2_ENABLED = 'true';
  const before = process.listenerCount('SIGUSR2');
  const handle = installHeapSnapshotHandler({
    isReady: () => true,
    logger: { warn() {}, error() {} },
  });
  assert.equal(process.listenerCount('SIGUSR2'), before + 1);
  handle.uninstall();
  assert.equal(process.listenerCount('SIGUSR2'), before);
});

test('startMemoryObservability wires telemetry stop + snapshot uninstall', () => {
  process.env.ARCANA_MEMORY_TELEMETRY_ENABLED = 'false';
  process.env.ARCANA_HEAP_SNAPSHOT_SIGUSR2_ENABLED = 'false';
  const obs = startMemoryObservability({ isReady: () => true });
  assert.doesNotThrow(() => obs.stop());
});
