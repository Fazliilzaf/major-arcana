'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { setTimeout } = require('node:timers/promises');

const { startHeartbeat, installSignalHandlers } = require('../../src/ops/processDiagnostics');

function makeLogger() {
  const lines = [];
  return {
    lines,
    log(...args) {
      lines.push(args.join(' '));
    },
    warn(...args) {
      lines.push(args.join(' '));
    },
    error(...args) {
      lines.push(args.join(' '));
    },
  };
}

test('startHeartbeat är no-op utan ARCANA_DIAG_HEARTBEAT=true', () => {
  const previous = process.env.ARCANA_DIAG_HEARTBEAT;
  delete process.env.ARCANA_DIAG_HEARTBEAT;
  try {
    const result = startHeartbeat({ logger: makeLogger() });
    assert.equal(typeof result.stop, 'function');
    result.stop();
  } finally {
      if (previous === undefined) delete process.env.ARCANA_DIAG_HEARTBEAT;
      else process.env.ARCANA_DIAG_HEARTBEAT = previous;
  }
});

test('startHeartbeat loggar heartbeat när env-flaggan är satt', async () => {
  const previous = process.env.ARCANA_DIAG_HEARTBEAT;
  process.env.ARCANA_DIAG_HEARTBEAT = 'true';
  const logger = makeLogger();
  let result;
  try {
    result = startHeartbeat({ logger, intervalMs: 50 });
    await setTimeout(120);
    result.stop();
    assert.ok(logger.lines.length >= 1);
    const heartbeats = logger.lines.filter((line) => line.includes('"type":"diag_heartbeat"'));
    assert.ok(heartbeats.length >= 1, 'expected at least one heartbeat log line');
    const sample = JSON.parse(heartbeats[0]);
    assert.equal(sample.type, 'diag_heartbeat');
    assert.equal(sample.pid, process.pid);
    assert.ok(sample.event_loop_delay_ms);
    assert.ok(Number.isFinite(sample.event_loop_delay_ms.max));
  } finally {
    if (result) result.stop();
    if (previous === undefined) delete process.env.ARCANA_DIAG_HEARTBEAT;
    else process.env.ARCANA_DIAG_HEARTBEAT = previous;
  }
});

test('startHeartbeat skriver heartbeat till disk', async () => {
  const previous = process.env.ARCANA_DIAG_HEARTBEAT;
  process.env.ARCANA_DIAG_HEARTBEAT = 'true';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-heartbeat-'));
  const heartbeatPath = path.join(tmpDir, 'heartbeat.log');
  let result;
  try {
    result = startHeartbeat({ logger: makeLogger(), intervalMs: 50, heartbeatPath });
    await setTimeout(120);
    result.stop();
    assert.ok(fs.existsSync(heartbeatPath), 'heartbeat file should exist');
    const content = fs.readFileSync(heartbeatPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1, 'expected at least one line on disk');
    const sample = JSON.parse(lines[0]);
    assert.equal(sample.type, 'diag_heartbeat');
  } finally {
    if (result) result.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
    if (previous === undefined) delete process.env.ARCANA_DIAG_HEARTBEAT;
    else process.env.ARCANA_DIAG_HEARTBEAT = previous;
  }
});

test('installSignalHandlers installerar och avinstallerar handlers', () => {
  const logger = makeLogger();
  const sigintCountBefore = process.listenerCount('SIGINT');
  const sigtermCountBefore = process.listenerCount('SIGTERM');
  const monitorCountBefore = process.listenerCount('uncaughtExceptionMonitor');
  const handlers = installSignalHandlers(logger);
  try {
    assert.equal(process.listenerCount('SIGINT'), sigintCountBefore + 1);
    assert.equal(process.listenerCount('SIGTERM'), sigtermCountBefore + 1);
    assert.equal(
      process.listenerCount('uncaughtExceptionMonitor'),
      monitorCountBefore + 1,
      'expected uncaughtExceptionMonitor handler'
    );
  } finally {
    handlers.uninstall();
    assert.equal(process.listenerCount('SIGINT'), sigintCountBefore);
    assert.equal(process.listenerCount('SIGTERM'), sigtermCountBefore);
    assert.equal(process.listenerCount('uncaughtExceptionMonitor'), monitorCountBefore);
  }
});

test('installSignalHandlers skriver signal-event till disk', () => {
  const logger = makeLogger();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-signal-'));
  const heartbeatPath = path.join(tmpDir, 'signal.log');
  const handlers = installSignalHandlers(logger, heartbeatPath);
  try {
    process.emit('SIGTERM');
    assert.ok(fs.existsSync(heartbeatPath), 'signal log file should exist');
    const content = fs.readFileSync(heartbeatPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1, 'expected at least one signal line on disk');
    const sample = JSON.parse(lines[lines.length - 1]);
    assert.equal(sample.type, 'diag_signal');
    assert.equal(sample.signal, 'SIGTERM');
  } finally {
    handlers.uninstall();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  }
});
