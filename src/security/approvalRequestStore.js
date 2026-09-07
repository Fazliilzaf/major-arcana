'use strict';

/**
 * approvalRequestStore.js — Approval Request backend (WP-010, DEL A).
 *
 * Fullständig approval-state-machine för CMO-tool WRITE-candidate. Statusar:
 *   PENDING → APPROVED → EXECUTED
 *   PENDING → REJECTED
 *   PENDING → EXPIRED   (TTL)
 * Historik raderas ALDRIG vid reject — posten står kvar med rejectedBy/rejectedAt.
 *
 * Store: JSON + atomisk write (samma idiomatiska mönster som övriga stores).
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATUSES = Object.freeze(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED']);

function nowIso() { return new Date().toISOString(); }
function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function normalizeStatus(v) {
  const s = normalizeText(v).toUpperCase();
  return STATUSES.includes(s) ? s : 'PENDING';
}
function emptyState() {
  return { version: 2, createdAt: nowIso(), updatedAt: nowIso(), requests: [] };
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch (e) { if (e && e.code === 'ENOENT') return fallback; throw e; }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

async function createApprovalRequestStore({ filePath, ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!normalizeText(filePath)) throw new Error('filePath krävs för approvalRequestStore.');
  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    requests: Array.isArray(state?.requests) ? state.requests : [],
  };

  async function save() { state.updatedAt = nowIso(); await writeJsonAtomic(filePath, state); }

  function isExpired(rec, now = Date.now()) {
    const at = Date.parse(rec?.requestedAt || '');
    return Number.isFinite(at) && at + (Number(ttlMs) || 0) <= now;
  }

  function get(id) {
    const rec = state.requests.find((r) => r.id === normalizeText(id));
    return rec ? { ...rec } : null;
  }

  /**
   * Skapar en PENDING approval-request med full kontext + snapshot (base SHA,
   * worktree/task id, changed files, diffstat, tests/build, preview, summary).
   * action/resource binds approval till exakt den ändringen.
   */
  async function create(input = {}) {
    const rec = {
      id: crypto.randomUUID(),
      taskId: normalizeText(input.taskId) || null,
      actor: normalizeText(input.actor) || null,
      tenant: normalizeText(input.tenant),
      agent: normalizeText(input.agent),
      action: normalizeText(input.action),
      actionLevel: normalizeText(input.actionLevel) || 'WRITE',
      repoId: normalizeText(input.repoId) || null,
      resource: normalizeText(input.resource) || null,
      baseSha: normalizeText(input.baseSha) || null,
      worktreeTaskId: normalizeText(input.worktreeTaskId) || null,
      summary: normalizeText(input.summary) || null,
      changedFiles: Array.isArray(input.changedFiles) ? input.changedFiles.map(normalizeText).filter(Boolean) : [],
      diffstat: normalizeText(input.diffstat) || '',
      testsBuildStatus: normalizeText(input.testsBuildStatus) || '',
      previewRef: normalizeText(input.previewRef) || null,
      approvalClass: normalizeText(input.approvalClass) || 'OWNER_APPROVAL',
      snapshotHash: normalizeText(input.snapshotHash) || null,
      requestedAt: nowIso(),
      status: 'PENDING',
      approvedBy: null,
      rejectedBy: null,
      approvedAt: null,
      rejectedAt: null,
      executedAt: null,
    };
    state.requests.push(rec);
    await save();
    return { ...rec };
  }

  function listAll() { return state.requests.map((r) => ({ ...r })); }

  /** Pending, ej utgångna, filterbara på tenant + approvalClass. */
  function listPending({ tenant = '', approvalClass = '' } = {}) {
    const now = Date.now();
    return state.requests
      .filter((r) => {
        if (r.status !== 'PENDING') return false;
        if (isExpired(r, now)) return false;
        if (tenant && normalizeText(r.tenant) !== normalizeText(tenant)) return false;
        if (approvalClass && normalizeText(r.approvalClass) !== normalizeText(approvalClass)) return false;
        return true;
      })
      .map((r) => ({ ...r }));
  }

  function listForTenant(tenant) {
    const t = normalizeText(tenant);
    return state.requests.filter((r) => normalizeText(r.tenant) === t).map((r) => ({ ...r }));
  }

  /** Övergång: PENDING → godkänt. Returnerar null vid ogiltig/utgången status. */
  async function approve(id, { approver } = {}) {
    const rec = state.requests.find((r) => r.id === normalizeText(id));
    if (!rec || rec.status !== 'PENDING') return null;
    if (isExpired(rec)) { rec.status = 'EXPIRED'; await save(); return null; }
    rec.status = 'APPROVED';
    rec.approvedBy = normalizeText(approver) || null;
    rec.approvedAt = nowIso();
    await save();
    return { ...rec };
  }

  /** Övergång: PENDING → REJECTED. Historik behålls. */
  async function reject(id, { approver, reason } = {}) {
    const rec = state.requests.find((r) => r.id === normalizeText(id));
    if (!rec || rec.status !== 'PENDING') return null;
    rec.status = 'REJECTED';
    rec.rejectedBy = normalizeText(approver) || null;
    rec.rejectedAt = nowIso();
    rec.rejectReason = normalizeText(reason) || null;
    await save();
    return { ...rec };
  }

  /** Övergång: APPROVED → EXECUTED. Endast giltig om snapshot redan verifierats. */
  async function execute(id) {
    const rec = state.requests.find((r) => r.id === normalizeText(id));
    if (!rec || rec.status !== 'APPROVED') return null;
    rec.status = 'EXECUTED';
    rec.executedAt = nowIso();
    await save();
    return { ...rec };
  }

  /** Markera utgångna PENDING → EXPIRED (sweep; returnerar antal). */
  async function expirePending() {
    const now = Date.now();
    let count = 0;
    for (const rec of state.requests) {
      if (rec.status === 'PENDING' && isExpired(rec, now)) {
        rec.status = 'EXPIRED';
        count += 1;
      }
    }
    if (count > 0) await save();
    return count;
  }

  return {
    STATUSES,
    create,
    get,
    listAll,
    listPending,
    listForTenant,
    approve,
    reject,
    execute,
    expirePending,
  };
}

module.exports = { createApprovalRequestStore, STATUSES };
