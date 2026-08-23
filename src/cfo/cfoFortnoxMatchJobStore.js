'use strict';

/**
 * ORD-102 steg 3 · bakgrundskörning för Fortnox-kortmatch.
 *
 * Eftersom Fortnox API:et begränsas till ~100 anrop/minut kan en full
 * avstämning ta flera minuter. Denna store kör jobbet asynkront och
 * låter UI poll:a status.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createFortnoxMatchJobStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för cfoFortnoxMatchJobStore.');
  }

  const jobs = new Map();

  async function loadPersisted() {
    const data = await readJson(filePath, { jobs: {} });
    if (data && typeof data === 'object' && data.jobs && typeof data.jobs === 'object') {
      for (const [id, job] of Object.entries(data.jobs)) {
        if (job.status === 'running') {
          job.status = 'failed';
          job.error = 'Server restart avbröt jobbet.';
          job.finishedAt = nowIso();
        }
        jobs.set(id, job);
      }
    }
  }

  async function persist() {
    const data = { updatedAt: nowIso(), jobs: Object.fromEntries(jobs) };
    await writeJsonAtomic(filePath, data);
  }

  function createJob({ tenantId, actor, dryRun, params }) {
    const id = `cf_fm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const job = {
      id,
      tenantId: normalizeText(tenantId),
      actor: actor || null,
      dryRun: Boolean(dryRun),
      params: params || {},
      status: 'pending',
      progress: { vouchersRead: 0, vouchersTotal: 0, matched: 0, suggestions: 0 },
      result: null,
      error: null,
      createdAt: nowIso(),
      startedAt: null,
      finishedAt: null,
    };
    jobs.set(id, job);
    return job;
  }

  async function start({ tenantId, actor, dryRun = true, params = {}, run }) {
    const job = createJob({ tenantId, actor, dryRun, params });
    await persist();

    setImmediate(() => {
      (async () => {
        const j = jobs.get(job.id);
        if (!j) return;
        j.status = 'running';
        j.startedAt = nowIso();
        await persist();
        try {
          const onProgress = (progress) => {
            j.progress = { ...j.progress, ...progress };
          };
          const result = await run({ ...params, dryRun, actor, onProgress });
          j.result = result;
          j.status = result?.ok === false ? 'failed' : 'completed';
          if (result?.ok === false && result?.error) {
            j.error = result.error;
          }
        } catch (error) {
          j.status = 'failed';
          j.error = error?.message || String(error);
        } finally {
          j.finishedAt = nowIso();
          await persist();
        }
      })();
    });

    return job;
  }

  function get(id) {
    return jobs.get(id) || null;
  }

  function list({ tenantId, limit = 20 } = {}) {
    const tid = normalizeText(tenantId);
    const all = Array.from(jobs.values())
      .filter((j) => !tid || j.tenantId === tid)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return all.slice(0, limit);
  }

  return {
    loadPersisted,
    start,
    get,
    list,
  };
}

module.exports = { createFortnoxMatchJobStore };
