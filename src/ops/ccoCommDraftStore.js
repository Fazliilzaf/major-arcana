'use strict';

/**
 * ccoCommDraftStore — Komm/Journey Sprint 2.
 *
 * State-machine för kommunikation-utkast:
 *   draft → needs_approval → approved → queued → sent
 *                                              → failed
 *                                              → cancelled (från alla utom sent)
 *
 * Owner-mandat:
 *   - INGEN auto-send i Sprint 2 — bara queued_send/ready_to_send.
 *   - INGEN extern AI på journalinnehåll.
 *   - Human approval krävs alltid innan extern utskick.
 *   - Audit på varje statusändring + content-edit.
 *   - Patientdata stannar i payload-shape, INTE i GitHub.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const VALID_STATUSES = Object.freeze([
  'draft',
  'needs_approval',
  'approved',
  'queued',
  'sent',
  'failed',
  'cancelled',
]);

const VALID_CHANNELS = Object.freeze(['email', 'sms', 'internal', 'portal']);

const STATUS_TRANSITIONS = Object.freeze({
  draft: ['needs_approval', 'cancelled'],
  needs_approval: ['approved', 'draft', 'cancelled'],
  approved: ['queued', 'cancelled'],
  queued: ['sent', 'failed', 'cancelled'],
  sent: [], // terminal
  failed: ['queued', 'cancelled'],
  cancelled: [], // terminal
});

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function maskRecipient(email) {
  const e = String(email || '').trim();
  if (!e || !e.includes('@')) return null;
  const [local, domain] = e.split('@');
  return local.slice(0, 2) + '***@' + domain;
}

async function readJson(filePath, fallback) {
  try {
    const txt = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

function emptyState() {
  return { drafts: {}, version: 1, updatedAt: nowIso() };
}

function normalizeDraft(input = {}, existing = {}) {
  const safe = input || {};
  const ex = existing || {};
  const status = normalizeText(safe.status || ex.status).toLowerCase() || 'draft';
  if (!VALID_STATUSES.includes(status)) throw new Error('invalid status: ' + status);
  const channel = normalizeText(safe.channel || ex.channel).toLowerCase() || 'email';
  if (!VALID_CHANNELS.includes(channel)) throw new Error('invalid channel: ' + channel);
  return {
    draftId: normalizeText(safe.draftId || ex.draftId) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || ex.tenantId),
    customerId: normalizeText(safe.customerId || ex.customerId),
    templateId: normalizeText(safe.templateId || ex.templateId) || null,
    templateVersion: normalizeText(safe.templateVersion || ex.templateVersion) || null,
    journeyStep: normalizeText(safe.journeyStep || ex.journeyStep) || null,
    channel,
    subject: normalizeText(safe.subject ?? ex.subject) || '',
    body: typeof safe.body === 'string' ? safe.body : typeof ex.body === 'string' ? ex.body : '',
    mergeFields: safe.mergeFields || ex.mergeFields || {},
    recipientHash: safe.recipientHash || ex.recipientHash || null,
    recipientMasked: safe.recipientMasked || ex.recipientMasked || null,
    bookingId: normalizeText(safe.bookingId || ex.bookingId) || null,
    encounterId: normalizeText(safe.encounterId || ex.encounterId) || null,
    aiGenerated: !!(safe.aiGenerated ?? ex.aiGenerated),
    status,
    statusHistory: Array.isArray(ex.statusHistory) ? ex.statusHistory.slice(-49) : [],
    createdBy: normalizeText(safe.createdBy || ex.createdBy) || null,
    createdAt: normalizeText(ex.createdAt) || nowIso(),
    updatedAt: nowIso(),
    approvedBy: normalizeText(safe.approvedBy || ex.approvedBy) || null,
    approvedAt: normalizeText(safe.approvedAt || ex.approvedAt) || null,
    queuedAt: normalizeText(safe.queuedAt || ex.queuedAt) || null,
    sentAt: normalizeText(safe.sentAt || ex.sentAt) || null,
    failureReason: normalizeText(safe.failureReason || ex.failureReason) || null,
    cancelledReason: normalizeText(safe.cancelledReason || ex.cancelledReason) || null,
  };
}

function logAudit(auditLog, action, draft, actor, result = 'ok', extra = {}) {
  if (!auditLog?.append) return;
  auditLog.append({
    action,
    actor: { role: actor?.role || 'unknown', userId: actor?.userId || null },
    target: { kind: 'comm_draft', id: draft.draftId, tenantId: draft.tenantId },
    result,
    detail: {
      customerId: draft.customerId,
      channel: draft.channel,
      status: draft.status,
      templateId: draft.templateId,
      templateVersion: draft.templateVersion,
      journeyStep: draft.journeyStep,
      bodyLength: (draft.body || '').length,
      aiGenerated: !!draft.aiGenerated,
      ...extra,
    },
  });
}

async function createCcoCommDraftStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = await readJson(filePath, emptyState());
  if (!state.drafts) state.drafts = {};

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function createDraft(input = {}, { actor = {} } = {}) {
    if (!input.tenantId) throw new Error('tenantId krävs.');
    if (!input.customerId) throw new Error('customerId krävs.');
    const draft = normalizeDraft({
      ...input,
      status: 'draft',
      createdBy: actor.userId || actor.displayName || null,
    });
    draft.statusHistory = [
      { ts: draft.createdAt, from: null, to: 'draft', actor: actor.userId || null },
    ];
    state.drafts[draft.draftId] = draft;
    await save();
    logAudit(auditLog, 'communication.draft.created', draft, actor);
    return { ...draft };
  }

  async function updateDraft(draftId, patch = {}, { actor = {} } = {}) {
    const ex = state.drafts[draftId];
    if (!ex) {
      const e = new Error('draft not found');
      e.statusCode = 404;
      throw e;
    }
    if (['sent', 'cancelled'].includes(ex.status)) {
      const e = new Error('draft is ' + ex.status + ', cannot edit');
      e.statusCode = 409;
      throw e;
    }
    // Tillåt patch av subject/body/mergeFields/channel/templateId
    const next = normalizeDraft(
      {
        ...ex,
        subject: patch.subject ?? ex.subject,
        body: patch.body ?? ex.body,
        mergeFields: patch.mergeFields ?? ex.mergeFields,
        channel: patch.channel ?? ex.channel,
        templateId: patch.templateId ?? ex.templateId,
        templateVersion: patch.templateVersion ?? ex.templateVersion,
        recipientMasked: patch.recipientMasked ?? ex.recipientMasked,
        recipientHash: patch.recipientHash ?? ex.recipientHash,
      },
      ex
    );
    next.status = ex.status; // status changes via transitionStatus only
    state.drafts[draftId] = next;
    await save();
    logAudit(auditLog, 'communication.draft.edited', next, actor, 'ok', {
      changedFields: Object.keys(patch),
    });
    return { ...next };
  }

  async function transitionStatus(draftId, newStatus, { actor = {}, reason = null } = {}) {
    const ex = state.drafts[draftId];
    if (!ex) {
      const e = new Error('draft not found');
      e.statusCode = 404;
      throw e;
    }
    const allowed = STATUS_TRANSITIONS[ex.status] || [];
    if (!allowed.includes(newStatus)) {
      const e = new Error('invalid transition ' + ex.status + ' -> ' + newStatus);
      e.statusCode = 409;
      throw e;
    }
    const prev = ex.status;
    ex.status = newStatus;
    ex.updatedAt = nowIso();
    ex.statusHistory.push({
      ts: ex.updatedAt,
      from: prev,
      to: newStatus,
      actor: actor.userId || null,
      reason,
    });
    if (ex.statusHistory.length > 50) ex.statusHistory = ex.statusHistory.slice(-50);
    if (newStatus === 'approved') {
      ex.approvedBy = actor.userId || actor.displayName || null;
      ex.approvedAt = ex.updatedAt;
    } else if (newStatus === 'queued') {
      ex.queuedAt = ex.updatedAt;
    } else if (newStatus === 'sent') {
      ex.sentAt = ex.updatedAt;
    } else if (newStatus === 'failed') {
      ex.failureReason = reason || null;
    } else if (newStatus === 'cancelled') {
      ex.cancelledReason = reason || null;
    }
    await save();
    logAudit(auditLog, 'communication.draft.status_changed', ex, actor, 'ok', {
      from: prev,
      to: newStatus,
      reason,
    });
    return { ...ex };
  }

  function getDraft(draftId) {
    const d = state.drafts[draftId];
    return d ? { ...d } : null;
  }

  function listForCustomer(customerId, { status = null, limit = 100 } = {}) {
    const out = [];
    for (const d of Object.values(state.drafts)) {
      if (d.customerId !== customerId) continue;
      if (status && d.status !== status) continue;
      out.push({ ...d });
    }
    out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return out.slice(0, limit);
  }

  function listByStatus(status, { tenantId = null, limit = 100 } = {}) {
    const out = [];
    for (const d of Object.values(state.drafts)) {
      if (d.status !== status) continue;
      if (tenantId && d.tenantId !== tenantId) continue;
      out.push({ ...d });
    }
    out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return out.slice(0, limit);
  }

  function stats({ tenantId = null } = {}) {
    const s = { total: 0, byStatus: {}, byChannel: {} };
    for (const d of Object.values(state.drafts)) {
      if (tenantId && d.tenantId !== tenantId) continue;
      s.total += 1;
      s.byStatus[d.status] = (s.byStatus[d.status] || 0) + 1;
      s.byChannel[d.channel] = (s.byChannel[d.channel] || 0) + 1;
    }
    return s;
  }

  return {
    createDraft,
    updateDraft,
    transitionStatus,
    getDraft,
    listForCustomer,
    listByStatus,
    stats,
    _state: state,
  };
}

module.exports = {
  createCcoCommDraftStore,
  maskRecipient,
  VALID_STATUSES,
  VALID_CHANNELS,
  STATUS_TRANSITIONS,
};
