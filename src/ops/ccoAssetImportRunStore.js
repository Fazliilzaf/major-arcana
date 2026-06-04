'use strict';

/**
 * ccoAssetImportRunStore.js — P0.B av Document & Media Import Pipeline.
 *
 * Run-historik för import-batchar från Drive / Meridiq / old_cco till
 * CCO secure storage. Varje körning får ett unikt run-id som senare
 * `ccoPatientAssetStore` refererar via `importRunId` (foreign key).
 *
 * Schema (per cursor-regeln `cco-no-drive-links-import-only.mdc`):
 *   {
 *     id, sourceSystem, mode, startedAt, finishedAt,
 *     totalDiscovered, totalImported, totalVerified, totalNeedsReview,
 *     totalFailed, totalLinkOnlyBlockers, createdBy
 *   }
 *
 * Audit-events:
 *   - asset.import_run_started   (vid startRun)
 *   - asset.import_run_finished  (vid finishRun)
 *
 * Compliance:
 *   - Inga patientnamn / pnr / email / filinnehåll.
 *   - Counts only.
 *   - Atomic writes.
 *   - data/cco-asset-import-runs.json är gitignored.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';

const VALID_SOURCE_SYSTEMS = Object.freeze(['drive', 'drive_import', 'meridiq', 'old_cco']);

const VALID_MODES = Object.freeze(['full', 'incremental', 'review_resolve']);

const COUNTER_NAMES = Object.freeze([
  'totalDiscovered',
  'totalImported',
  'totalVerified',
  'totalNeedsReview',
  'totalFailed',
  'totalLinkOnlyBlockers',
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyState() {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: ts,
    updatedAt: ts,
    items: {},
    audit: [],
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function validateEnum(name, value, allowed) {
  if (!allowed.includes(value)) {
    const e = new Error(`invalid ${name} "${value}" — must be one of ${allowed.join('|')}`);
    e.statusCode = 400;
    throw e;
  }
}

function buildRun(input = {}) {
  const sourceSystem = normalizeText(input.sourceSystem);
  validateEnum('sourceSystem', sourceSystem, VALID_SOURCE_SYSTEMS);
  const mode = normalizeText(input.mode);
  validateEnum('mode', mode, VALID_MODES);
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    sourceSystem,
    mode,
    startedAt: normalizeText(input.startedAt) || nowIso(),
    finishedAt: null,
    totalDiscovered: 0,
    totalImported: 0,
    totalVerified: 0,
    totalNeedsReview: 0,
    totalFailed: 0,
    totalLinkOnlyBlockers: 0,
    createdBy: normalizeText(input.createdBy) || 'system',
  };
}

function logAudit(auditLog, action, run, actor, extra = {}) {
  if (!auditLog || typeof auditLog.append !== 'function') return;
  try {
    auditLog.append({
      action,
      actor: { role: actor?.role || 'system', userId: actor?.userId || null },
      target: { kind: 'asset_import_run', id: run?.id || null },
      result: 'ok',
      detail: {
        sourceSystem: run?.sourceSystem || null,
        mode: run?.mode || null,
        createdBy: run?.createdBy || null,
        ...extra,
      },
    });
  } catch {
    /* never break flow */
  }
}

async function createCcoAssetImportRunStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoAssetImportRunStore');
  const state = await readJson(filePath, emptyState());
  if (!state.items || typeof state.items !== 'object') state.items = {};
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  /**
   * Starta en ny import-körning. Returnerar run-id (UUID).
   *
   * @param {object} opts
   * @param {string} opts.sourceSystem  drive|meridiq|old_cco
   * @param {string} opts.mode          full|incremental|review_resolve
   * @param {string} [opts.createdBy]   user-id eller 'system'
   * @returns {Promise<string>} runId
   */
  async function startRun({ sourceSystem, mode, createdBy = 'system' } = {}, { actor = {} } = {}) {
    const run = buildRun({ sourceSystem, mode, createdBy });
    state.items[run.id] = run;
    await save();
    logAudit(auditLog, 'asset.import_run_started', run, actor);
    return run.id;
  }

  /**
   * Öka räknare i en aktiv körning. Validerar counter-namn.
   */
  async function incrementCounter(runId, counterName, delta = 1) {
    const id = normalizeText(runId);
    const run = state.items[id];
    if (!run) {
      const e = new Error(`run ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (!COUNTER_NAMES.includes(counterName)) {
      const e = new Error(
        `invalid counter "${counterName}" — must be one of ${COUNTER_NAMES.join('|')}`
      );
      e.statusCode = 400;
      throw e;
    }
    if (run.finishedAt) {
      const e = new Error(`run ${id} är redan stängd (finishedAt=${run.finishedAt}).`);
      e.statusCode = 409;
      throw e;
    }
    const d = Number(delta);
    if (!Number.isFinite(d)) {
      const e = new Error('delta måste vara numerisk.');
      e.statusCode = 400;
      throw e;
    }
    run[counterName] = Math.max(0, (run[counterName] || 0) + Math.round(d));
    await save();
    return run[counterName];
  }

  /**
   * Stäng en körning (sätter finishedAt). Idempotent — andra-anrop är no-op.
   * Emittar `asset.import_run_finished` audit.
   */
  async function finishRun(runId, { actor = {} } = {}) {
    const id = normalizeText(runId);
    const run = state.items[id];
    if (!run) {
      const e = new Error(`run ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    if (run.finishedAt) return { ...run };
    run.finishedAt = nowIso();
    await save();
    logAudit(auditLog, 'asset.import_run_finished', run, actor, {
      totalDiscovered: run.totalDiscovered,
      totalImported: run.totalImported,
      totalVerified: run.totalVerified,
      totalNeedsReview: run.totalNeedsReview,
      totalFailed: run.totalFailed,
      totalLinkOnlyBlockers: run.totalLinkOnlyBlockers,
    });
    return { ...run };
  }

  /**
   * Lista senaste körningar, nyast först (sorterat på startedAt desc).
   */
  function listRecentRuns(limit = 50) {
    const max = Math.max(1, Math.min(500, Number(limit) || 50));
    return Object.values(state.items)
      .slice()
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
      .slice(0, max)
      .map((r) => ({ ...r }));
  }

  function getRun(runId) {
    const run = state.items[normalizeText(runId)];
    return run ? { ...run } : null;
  }

  function stats() {
    const all = Object.values(state.items);
    const bySourceSystem = {};
    const byMode = {};
    let active = 0;
    let finished = 0;
    for (const r of all) {
      bySourceSystem[r.sourceSystem] = (bySourceSystem[r.sourceSystem] || 0) + 1;
      byMode[r.mode] = (byMode[r.mode] || 0) + 1;
      if (r.finishedAt) finished += 1;
      else active += 1;
    }
    return {
      schemaVersion: state.schemaVersion,
      total: all.length,
      active,
      finished,
      bySourceSystem,
      byMode,
    };
  }

  return {
    startRun,
    incrementCounter,
    finishRun,
    listRecentRuns,
    getRun,
    stats,
    _state: () => state,
  };
}

module.exports = {
  createCcoAssetImportRunStore,
  VALID_SOURCE_SYSTEMS,
  VALID_MODES,
  COUNTER_NAMES,
  SCHEMA_VERSION,
};
