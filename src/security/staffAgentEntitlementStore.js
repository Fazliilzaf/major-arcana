'use strict';

/**
 * staffAgentEntitlementStore.js — separat, additiv agent-entitlement-lager.
 *
 * WP-001. Håller "vilka business-agentportaler en staff-användare får använda",
 * HELT separat från staff-rollen (vad personen ÄR i verksamheten) och från
 * befintlig vård-RBAC (roles.js / ccoRbac / authStore).
 *
 * - CM är INTE ett entitlement — det är CFO:s Customer Management intake.
 * - En user får ha flera aktiva entitlements.
 * - grant är deterministiskt idempotent (ingen dubblett).
 * - revoke raderar ingen audit-historik (status sätts bara till 'revoked').
 * - Store: JSON + atomisk write (samma idiomatiska mönster som övriga stores).
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AGENT_IDS = Object.freeze(['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']);

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function normalizeKey(v) {
  return normalizeText(v).toLowerCase();
}
function nowIso() {
  return new Date().toISOString();
}
function normalizeAgent(v) {
  const u = normalizeText(v).toUpperCase();
  return AGENT_IDS.includes(u) ? u : '';
}

async function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, entitlements: [] };
}

async function createStaffAgentEntitlementStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för staffAgentEntitlementStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    entitlements: Array.isArray(state?.entitlements) ? state.entitlements : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function audit(action, detail, actor = {}) {
    if (auditLog && typeof auditLog.append === 'function') {
      auditLog.append({
        action,
        surface: 'staff.agent_entitlement',
        ts: nowIso(),
        actor: {
          role: normalizeText(actor?.role) || 'system',
          userId: normalizeText(actor?.userId) || null,
        },
        ...(detail && typeof detail === 'object' ? detail : {}),
      });
    }
  }

  function findIndex(userId, tenantId, agent) {
    const u = normalizeKey(userId);
    const t = normalizeKey(tenantId);
    const a = normalizeAgent(agent);
    return state.entitlements.findIndex(
      (e) => normalizeKey(e.userId) === u && normalizeKey(e.tenantId) === t && normalizeAgent(e.agent) === a
    );
  }

  function listActive(userId, tenantId) {
    const u = normalizeKey(userId);
    const t = normalizeKey(tenantId);
    return state.entitlements
      .filter((e) => normalizeKey(e.userId) === u && normalizeKey(e.tenantId) === t && e.status === 'active')
      .map((e) => e.agent)
      .sort();
  }

  function hasActive(userId, tenantId, agent) {
    const a = normalizeAgent(agent);
    if (!a) return false; // okänt agent-ID → fail-closed
    const u = normalizeKey(userId);
    const t = normalizeKey(tenantId);
    return state.entitlements.some(
      (e) => normalizeKey(e.userId) === u && normalizeKey(e.tenantId) === t && e.agent === a && e.status === 'active'
    );
  }

  async function grant({ userId, tenantId, agent, actor = {} } = {}) {
    const uid = normalizeText(userId);
    const tid = normalizeText(tenantId);
    const a = normalizeAgent(agent);
    if (!uid || !tid || !a) {
      const err = new Error('Ogiltig entitlement (userId/tenantId/agent).');
      err.statusCode = 400;
      throw err;
    }
    const ts = nowIso();
    const idx = findIndex(uid, tid, a);
    let record;
    if (idx === -1) {
      record = {
        id: crypto.randomUUID(),
        userId: uid,
        tenantId: tid,
        agent: a,
        status: 'active',
        grantedBy: normalizeText(actor?.userId) || null,
        grantedAt: ts,
        revokedBy: null,
        revokedAt: null,
      };
      state.entitlements.push(record);
    } else {
      record = state.entitlements[idx];
      if (record.status === 'active') {
        // Deterministic idempotent — ingen dubblett.
        return { ...record, alreadyActive: true };
      }
      record.status = 'active';
      record.grantedBy = normalizeText(actor?.userId) || null;
      record.grantedAt = ts;
      record.revokedBy = null;
      record.revokedAt = null;
    }
    await save();
    audit('staff.agent_entitlement.grant', {
      targetUser: uid,
      tenantId: tid,
      agent: a,
    }, actor);
    return { ...state.entitlements[findIndex(uid, tid, a)] };
  }

  async function revoke({ userId, tenantId, agent, actor = {} } = {}) {
    const uid = normalizeText(userId);
    const tid = normalizeText(tenantId);
    const a = normalizeAgent(agent);
    if (!uid || !tid || !a) {
      const err = new Error('Ogiltig entitlement (userId/tenantId/agent).');
      err.statusCode = 400;
      throw err;
    }
    const idx = findIndex(uid, tid, a);
    if (idx === -1 || state.entitlements[idx].status !== 'active') {
      return { ok: true, alreadyRevoked: true };
    }
    state.entitlements[idx].status = 'revoked';
    state.entitlements[idx].revokedBy = normalizeText(actor?.userId) || null;
    state.entitlements[idx].revokedAt = nowIso();
    await save();
    audit('staff.agent_entitlement.revoke', {
      targetUser: uid,
      tenantId: tid,
      agent: a,
    }, actor);
    return { ok: true };
  }

  function listAll() {
    return state.entitlements.map((e) => ({ ...e }));
  }

  function listForTenant(tenantId) {
    const t = normalizeKey(tenantId);
    return state.entitlements
      .filter((e) => normalizeKey(e.tenantId) === t)
      .map((e) => ({ ...e }));
  }

  return { AGENT_IDS, listActive, hasActive, grant, revoke, listAll, listForTenant };
}

module.exports = { createStaffAgentEntitlementStore, AGENT_IDS };
