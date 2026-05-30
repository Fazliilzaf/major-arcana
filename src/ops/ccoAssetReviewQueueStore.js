'use strict';

/**
 * ccoAssetReviewQueueStore.js — P0.B av Document & Media Import Pipeline.
 *
 * Per-asset review-queue. När import-pipeline inte kan auto-koppla en fil
 * till en patient (eller hittar dubblettkandidat / låg confidence / okänt
 * format) hamnar den här. INGEN auto-merge — staff måste fatta beslut.
 *
 * Schema:
 *   {
 *     id, assetId, reason, suggestedPatientId, confidence,
 *     reviewedBy, reviewedAt, decision
 *   }
 *
 * Reason-vocab (per cursor-regeln):
 *   ambiguous_patient | no_patient_match
 *   | duplicate_candidate | low_confidence | unknown_format
 *
 * Decision-vocab:
 *   approve | reject | reassign | mark_duplicate
 *
 * Audit-events:
 *   - asset.review_enqueued  (vid enqueue)
 *   - asset.review_resolved  (vid resolveItem)
 *
 * Compliance:
 *   - Inga PII-payloads — bara IDs.
 *   - Counts only i stats.
 *   - Atomic writes.
 *   - data/cco-asset-review-queue.json är gitignored.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SCHEMA_VERSION = '1.0.0';

const VALID_REASONS = Object.freeze([
  'ambiguous_patient',
  'no_patient_match',
  'duplicate_candidate',
  'low_confidence',
  'unknown_format',
]);

const VALID_DECISIONS = Object.freeze([
  'approve',
  'reject',
  'reassign',
  'mark_duplicate',
]);

const VALID_CONFIDENCE = Object.freeze(['high', 'medium', 'low']);

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

function buildItem(input = {}) {
  const reason = normalizeText(input.reason);
  validateEnum('reason', reason, VALID_REASONS);
  const confidence = normalizeText(input.confidence) || null;
  if (confidence) validateEnum('confidence', confidence, VALID_CONFIDENCE);
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    assetId: normalizeText(input.assetId),
    reason,
    suggestedPatientId: normalizeText(input.suggestedPatientId) || null,
    confidence,
    reviewedBy: null,
    reviewedAt: null,
    decision: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function logAudit(auditLog, action, item, actor, extra = {}) {
  if (!auditLog || typeof auditLog.append !== 'function') return;
  try {
    auditLog.append({
      action,
      actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
      target: {
        kind: 'asset_review_item',
        id: item?.id || null,
        tenantId: actor?.tenantId || null,
      },
      result: 'ok',
      detail: {
        assetId: item?.assetId || null,
        reason: item?.reason || null,
        confidence: item?.confidence || null,
        decision: item?.decision || null,
        ...extra,
      },
    });
  } catch {
    /* never break flow */
  }
}

async function createCcoAssetReviewQueueStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs för ccoAssetReviewQueueStore');
  const state = await readJson(filePath, emptyState());
  if (!state.items || typeof state.items !== 'object') state.items = {};
  if (!Array.isArray(state.audit)) state.audit = [];
  if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  /**
   * Lägg in ett nytt review-item. Returnerar normaliserat item.
   *
   * @param {object} opts
   * @param {string} opts.assetId
   * @param {string} opts.reason
   * @param {string} [opts.suggestedPatientId]
   * @param {string} [opts.confidence]   high|medium|low
   */
  async function enqueue(input = {}, { actor = {} } = {}) {
    const item = buildItem(input);
    if (!item.assetId) {
      const e = new Error('assetId krävs.');
      e.statusCode = 400;
      throw e;
    }
    state.items[item.id] = item;
    await save();
    logAudit(auditLog, 'asset.review_enqueued', item, actor);
    return { ...item };
  }

  /**
   * Lista pending items (ingen decision satt). Nyast först.
   */
  function listPending() {
    return Object.values(state.items)
      .filter((i) => !i.decision)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((i) => ({ ...i }));
  }

  /**
   * Lös ett review-item. Validerar decision-vocab.
   *
   * @param {string} id
   * @param {object} opts
   * @param {string} opts.decision    approve|reject|reassign|mark_duplicate
   * @param {string} opts.reviewedBy  user-id eller staff-namn
   */
  async function resolveItem(id, { decision, reviewedBy } = {}, { actor = {} } = {}) {
    const itemId = normalizeText(id);
    const existing = state.items[itemId];
    if (!existing) {
      const e = new Error(`review-item ${itemId} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    const d = normalizeText(decision);
    validateEnum('decision', d, VALID_DECISIONS);
    if (!normalizeText(reviewedBy)) {
      const e = new Error('reviewedBy krävs.');
      e.statusCode = 400;
      throw e;
    }
    if (existing.decision) {
      const e = new Error(`item ${itemId} är redan löst (decision=${existing.decision}).`);
      e.statusCode = 409;
      throw e;
    }
    const merged = {
      ...existing,
      decision: d,
      reviewedBy: normalizeText(reviewedBy),
      reviewedAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.items[itemId] = merged;
    await save();
    logAudit(auditLog, 'asset.review_resolved', merged, actor, {
      decision: d,
    });
    return { ...merged };
  }

  function getItem(id) {
    const item = state.items[normalizeText(id)];
    return item ? { ...item } : null;
  }

  /**
   * Counts only — antal per reason, per decision, samt pending-räknare.
   */
  function stats() {
    const all = Object.values(state.items);
    const byReason = {};
    const byDecision = {};
    let pending = 0;
    let resolved = 0;
    for (const i of all) {
      byReason[i.reason] = (byReason[i.reason] || 0) + 1;
      if (i.decision) {
        byDecision[i.decision] = (byDecision[i.decision] || 0) + 1;
        resolved += 1;
      } else {
        pending += 1;
      }
    }
    return {
      schemaVersion: state.schemaVersion,
      total: all.length,
      pending,
      resolved,
      byReason,
      byDecision,
    };
  }

  return {
    enqueue,
    listPending,
    resolveItem,
    getItem,
    stats,
    _state: () => state,
  };
}

module.exports = {
  createCcoAssetReviewQueueStore,
  VALID_REASONS,
  VALID_DECISIONS,
  VALID_CONFIDENCE,
  SCHEMA_VERSION,
};
