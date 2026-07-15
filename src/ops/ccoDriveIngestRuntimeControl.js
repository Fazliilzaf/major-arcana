'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CONTROL_FILE = 'cco-drive-ingest-control.json';
const LEASE_FILE = 'cco-drive-ingest-lease.json';

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function createDriveIngestRuntimeControl({ stateRoot, now = () => Date.now() } = {}) {
  if (!stateRoot) throw new Error('stateRoot krävs.');
  const controlPath = path.join(stateRoot, CONTROL_FILE);
  const leasePath = path.join(stateRoot, LEASE_FILE);

  function readControl() {
    return readJson(controlPath, {
      paused: false,
      reason: null,
      details: null,
      updatedAt: null,
    });
  }

  function pause({ reason, details = null } = {}) {
    const control = {
      paused: true,
      reason: reason || 'manual_pause',
      details,
      updatedAt: nowIso(now()),
    };
    writeJsonAtomic(controlPath, control);
    return control;
  }

  function resume() {
    const control = {
      paused: false,
      reason: null,
      details: null,
      updatedAt: nowIso(now()),
    };
    writeJsonAtomic(controlPath, control);
    return control;
  }

  function acquireLease({ ownerId, staleAfterMs = 10 * 60 * 1000 } = {}) {
    if (!ownerId) throw new Error('ownerId krävs.');
    const lease = { ownerId, acquiredAt: nowIso(now()), heartbeatAt: nowIso(now()) };
    fs.mkdirSync(path.dirname(leasePath), { recursive: true });
    try {
      const fd = fs.openSync(leasePath, 'wx');
      fs.writeFileSync(fd, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
      fs.closeSync(fd);
      return { acquired: true, lease };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const current = readJson(leasePath, null);
    if (current?.ownerId === ownerId) return { acquired: true, lease: current };
    const heartbeatAt = Date.parse(current?.heartbeatAt || '');
    const isFresh = Number.isFinite(heartbeatAt) && now() - heartbeatAt < staleAfterMs;
    if (current && isFresh) return { acquired: false, lease: current };

    try {
      fs.unlinkSync(leasePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return acquireLease({ ownerId, staleAfterMs });
  }

  function heartbeat({ ownerId } = {}) {
    const current = readJson(leasePath, null);
    if (!current || current.ownerId !== ownerId) return false;
    writeJsonAtomic(leasePath, { ...current, heartbeatAt: nowIso(now()) });
    return true;
  }

  function releaseLease({ ownerId } = {}) {
    const current = readJson(leasePath, null);
    if (!current || current.ownerId !== ownerId) return false;
    try {
      fs.unlinkSync(leasePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return true;
  }

  return { readControl, pause, resume, acquireLease, heartbeat, releaseLease };
}

function evaluateDriveIngestHardGate(stats = {}) {
  if ((Number(stats.failed) || 0) > 0) return { reason: 'failed_import', count: Number(stats.failed) };
  if ((Number(stats.needsReview) || 0) > 0) {
    return { reason: 'needs_review', count: Number(stats.needsReview) };
  }
  return null;
}

module.exports = { createDriveIngestRuntimeControl, evaluateDriveIngestHardGate };
