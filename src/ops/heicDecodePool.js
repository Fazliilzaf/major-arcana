'use strict';

// Pool av worker-trådar för HEIC→JPEG-avkodning. Offloadar CPU-tung WASM-decode
// från huvud-event-loopen → servern förblir responsiv (hälsokoll svarar) och
// ingesten kan köra med concurrency utan att krascha workern.
//
// Lazy-init. Round-robin. Per-request timeout. Self-healing: en worker som
// kraschar återskapas och dess väntande requests rejectas (ingesten är
// idempotent/återupptagbar så ett enstaka fel är ofarligt).

const { Worker } = require('node:worker_threads');
const path = require('node:path');

const POOL_SIZE = Math.max(1, Math.min(8, Number(process.env.ARCANA_HEIC_WORKERS) || 3));
const TIMEOUT_MS = Math.max(10000, Number(process.env.ARCANA_HEIC_TIMEOUT_MS) || 120000);
const WORKER_PATH = path.join(__dirname, 'heicDecodeWorker.js');

let workers = null;
let rr = 0;
let seq = 0;
const pending = new Map(); // id -> { resolve, reject, timer, workerIdx }

function spawnWorker(idx) {
  const w = new Worker(WORKER_PATH);
  w.on('message', (msg) => {
    const p = pending.get(msg && msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(Buffer.from(msg.buffer));
    else p.reject(new Error(msg.error || 'heic_decode_failed'));
  });
  const failWorker = (reason) => {
    if (!workers) return;
    // Rejecta alla väntande på denna worker + återskapa den.
    for (const [id, p] of pending) {
      if (p.workerIdx === idx) {
        pending.delete(id);
        clearTimeout(p.timer);
        p.reject(new Error('heic_worker_' + reason));
      }
    }
    try {
      w.terminate();
    } catch {
      /* ignore */
    }
    if (workers) workers[idx] = spawnWorker(idx);
  };
  w.on('error', () => failWorker('error'));
  w.on('exit', (code) => {
    if (code !== 0 && workers) failWorker('exit_' + code);
  });
  return w;
}

function ensurePool() {
  if (workers) return;
  workers = [];
  for (let i = 0; i < POOL_SIZE; i += 1) workers[i] = spawnWorker(i);
}

function decodeHeicToJpeg(buffer) {
  ensurePool();
  const idx = rr % workers.length;
  rr += 1;
  const id = (seq += 1);
  const w = workers[idx];
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('heic_decode_timeout'));
      }
    }, TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer, workerIdx: idx });
    try {
      w.postMessage({ id, buffer: ab }, [ab]);
    } catch (e) {
      pending.delete(id);
      clearTimeout(timer);
      reject(e);
    }
  });
}

async function shutdownHeicDecodePool() {
  if (!workers) return;
  const active = workers;
  workers = null;
  rr = 0;
  for (const [id, p] of pending) {
    pending.delete(id);
    clearTimeout(p.timer);
    p.reject(new Error('heic_worker_shutdown'));
  }
  await Promise.all(
    active.map((w) =>
      w.terminate().catch(() => {
        /* ignore */
      })
    )
  );
}

module.exports = { decodeHeicToJpeg, POOL_SIZE, shutdownHeicDecodePool };
