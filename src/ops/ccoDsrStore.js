'use strict';

/**
 * ccoDsrStore.js — GDPR Data Subject Request (DSR) store.
 *
 * Hanterar registrerades begäranden enligt GDPR art. 15–22 (access,
 * rectification, erasure, restriction, portability, objection). Statutorisk
 * svarsfrist är 30 dagar (kan förlängas med upp till 60 dagar för komplexa
 * ärenden, art. 12.3). "overdue" = fristen passerad utan att ärendet stängts.
 * "imminent" = fristen infaller inom angiven timmar-horisont.
 *
 * JSON-fil-persistens med atomic write. State:
 *   { version, createdAt, updatedAt, requests: [] }
 *
 * Mönster följer ccoFollowUpStore / ccoPhotoConsentStore.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATE_VERSION = 1;
const DEFAULT_DEADLINE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// GDPR art. 15–22 request-typer.
const VALID_TYPES = [
  'access', // art. 15
  'rectification', // art. 16
  'erasure', // art. 17
  'restriction', // art. 18
  'portability', // art. 20
  'objection', // art. 21
];

// Livscykel-status för ett DSR-ärende.
const VALID_STATUSES = [
  'received',
  'identity_pending',
  'identity_verified',
  'in_progress',
  'on_hold',
  'completed',
  'rejected',
  'withdrawn',
];

// Statusar som räknas som "stängda" (ej overdue/imminent).
const TERMINAL_STATUSES = new Set(['completed', 'rejected', 'withdrawn']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function emptyState() {
  const ts = nowIso();
  return { version: STATE_VERSION, createdAt: ts, updatedAt: ts, requests: [] };
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
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

function addDays(fromIso, days) {
  const base = new Date(fromIso);
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

function normalizeActor(actor = {}) {
  return {
    userId: normalizeText(actor?.userId) || null,
    role: normalizeText(actor?.role) || 'system',
  };
}

function appendHistory(record, event, actor, detail = {}) {
  record.history = Array.isArray(record.history) ? record.history : [];
  record.history.push({
    event,
    at: nowIso(),
    actor: normalizeActor(actor),
    detail,
  });
}

async function createCcoDsrStore({ filePath, auditLog = null, secureStorage = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoDsrStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    requests: Array.isArray(state?.requests) ? state.requests : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndexById(dsrId) {
    const id = normalizeText(dsrId);
    if (!id) return -1;
    return state.requests.findIndex((r) => r.dsrId === id);
  }

  function clone(record) {
    return record ? JSON.parse(JSON.stringify(record)) : record;
  }

  function audit(action, actor, dsrId, detail = {}) {
    if (!auditLog || typeof auditLog.append !== 'function') return;
    try {
      auditLog.append({
        action,
        actor: normalizeActor(actor),
        target: { kind: 'dsr', id: dsrId },
        detail,
      });
    } catch {
      /* audit är best-effort */
    }
  }

  // --- create -------------------------------------------------------------
  async function createRequest(input = {}) {
    const type = normalizeKey(input.type || input.requestType);
    if (!VALID_TYPES.includes(type)) {
      throw badRequest(`Ogiltig DSR-typ. Tillåtna: ${VALID_TYPES.join(', ')}.`);
    }
    const customerId = normalizeKey(input.customerId);
    if (!customerId) {
      throw badRequest('customerId krävs.');
    }

    const actor = normalizeActor(input.actor);
    const ts = nowIso();
    const deadlineDays =
      Number.isFinite(Number(input.deadlineDays)) && Number(input.deadlineDays) > 0
        ? Math.floor(Number(input.deadlineDays))
        : DEFAULT_DEADLINE_DAYS;

    const record = {
      dsrId: normalizeText(input.dsrId) || crypto.randomUUID(),
      type,
      customerId,
      requesterName: normalizeText(input.requesterName) || null,
      requesterEmail: normalizeText(input.requesterEmail) || null,
      channel: normalizeText(input.channel) || 'portal',
      notes: normalizeText(input.notes),
      status: 'received',
      identityVerified: false,
      identityVerifiedAt: null,
      identityMethod: null,
      receivedAt: ts,
      deadlineDays,
      deadlineAt: addDays(ts, deadlineDays),
      deadlineExtended: false,
      extensionReason: null,
      pdlBlock: null,
      responsePackage: null,
      createdAt: ts,
      updatedAt: ts,
      history: [],
    };
    appendHistory(record, 'created', actor, { type, customerId });

    state.requests.push(record);
    await save();
    audit('cco.dsr.created', actor, record.dsrId, { type, customerId });
    return clone(record);
  }

  // --- verifyIdentity -----------------------------------------------------
  async function verifyIdentity({ dsrId, actor, method = null, verified = true } = {}) {
    const idx = findIndexById(dsrId);
    if (idx === -1) throw notFound('dsr not found');
    const record = state.requests[idx];
    const ts = nowIso();

    record.identityVerified = verified !== false;
    record.identityVerifiedAt = record.identityVerified ? ts : null;
    record.identityMethod = normalizeText(method) || record.identityMethod || 'manual';
    if (record.identityVerified && record.status === 'received') {
      record.status = 'identity_verified';
    } else if (!record.identityVerified && record.status === 'received') {
      record.status = 'identity_pending';
    }
    record.updatedAt = ts;
    appendHistory(record, 'identity_verified', actor, {
      verified: record.identityVerified,
      method: record.identityMethod,
    });
    await save();
    audit('cco.dsr.identity_verified', actor, record.dsrId, {
      verified: record.identityVerified,
      method: record.identityMethod,
    });
    return clone(record);
  }

  // --- extendDeadline -----------------------------------------------------
  async function extendDeadline({ dsrId, actor, days = DEFAULT_DEADLINE_DAYS, reason = '' } = {}) {
    const idx = findIndexById(dsrId);
    if (idx === -1) throw notFound('dsr not found');
    const record = state.requests[idx];
    const extraDays =
      Number.isFinite(Number(days)) && Number(days) > 0
        ? Math.floor(Number(days))
        : DEFAULT_DEADLINE_DAYS;

    const previousDeadline = record.deadlineAt;
    record.deadlineAt = addDays(record.deadlineAt, extraDays);
    record.deadlineDays += extraDays;
    record.deadlineExtended = true;
    record.extensionReason = normalizeText(reason) || record.extensionReason || null;
    record.updatedAt = nowIso();
    appendHistory(record, 'deadline_extended', actor, {
      extraDays,
      previousDeadline,
      newDeadline: record.deadlineAt,
      reason: record.extensionReason,
    });
    await save();
    audit('cco.dsr.deadline_extended', actor, record.dsrId, {
      extraDays,
      newDeadline: record.deadlineAt,
    });
    return clone(record);
  }

  // --- recordPdlBlock -----------------------------------------------------
  // PDL = Patientdatalagen. Vissa raderingar kan blockeras av lagstadgad
  // journalförvaringsplikt — vi registrerar blocket på ärendet.
  async function recordPdlBlock({
    dsrId,
    actor,
    blocked = true,
    reason = '',
    retainUntil = null,
  } = {}) {
    const idx = findIndexById(dsrId);
    if (idx === -1) throw notFound('dsr not found');
    const record = state.requests[idx];
    const ts = nowIso();

    if (blocked === false) {
      record.pdlBlock = null;
    } else {
      record.pdlBlock = {
        blocked: true,
        reason: normalizeText(reason) || null,
        retainUntil: normalizeText(retainUntil) || null,
        recordedAt: ts,
        recordedBy: normalizeActor(actor),
      };
    }
    record.updatedAt = ts;
    appendHistory(record, 'pdl_block', actor, {
      blocked: blocked !== false,
      reason: normalizeText(reason),
    });
    await save();
    audit('cco.dsr.pdl_block', actor, record.dsrId, { blocked: blocked !== false });
    return clone(record);
  }

  // --- transitionStatus ---------------------------------------------------
  async function transitionStatus({ dsrId, actor, status, reason = '' } = {}) {
    const idx = findIndexById(dsrId);
    if (idx === -1) throw notFound('dsr not found');
    const next = normalizeKey(status);
    if (!VALID_STATUSES.includes(next)) {
      throw badRequest(`Ogiltig status. Tillåtna: ${VALID_STATUSES.join(', ')}.`);
    }
    const record = state.requests[idx];
    const previous = record.status;
    record.status = next;
    if (TERMINAL_STATUSES.has(next)) {
      record.closedAt = nowIso();
    }
    record.updatedAt = nowIso();
    appendHistory(record, 'status_changed', actor, {
      from: previous,
      to: next,
      reason: normalizeText(reason),
    });
    await save();
    audit('cco.dsr.status_changed', actor, record.dsrId, { from: previous, to: next });
    return clone(record);
  }

  // --- attachResponsePackage ---------------------------------------------
  async function attachResponsePackage({
    dsrId,
    actor,
    buffer = null,
    filename = null,
    mimeType = 'application/octet-stream',
    delivery = 'portal_download',
    storageKey = null,
  } = {}) {
    const idx = findIndexById(dsrId);
    if (idx === -1) throw notFound('dsr not found');
    const record = state.requests[idx];
    const ts = nowIso();

    let resolvedKey = normalizeText(storageKey) || null;
    let sha256 = null;
    let sizeBytes = null;

    if (buffer) {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      sizeBytes = buf.length;
      if (secureStorage && typeof secureStorage.putObject === 'function') {
        const key =
          resolvedKey || `dsr/${record.dsrId}/${normalizeText(filename) || 'response.bin'}`;
        // Provider-signatur varierar: stödjer både
        //   putObject(key, body, { mimeType })  och
        //   putObject({ key, body, contentType, metadata })
        let putResult;
        try {
          putResult = await secureStorage.putObject({
            key,
            body: buf,
            contentType: mimeType,
            metadata: { dsrId: record.dsrId, customerId: record.customerId },
          });
        } catch {
          putResult = await secureStorage.putObject(key, buf, { mimeType });
        }
        resolvedKey = (putResult && (putResult.storageKey || putResult.key)) || key;
        if (putResult && putResult.checksum) sha256 = putResult.checksum;
        if (putResult && Number.isFinite(putResult.size)) sizeBytes = putResult.size;
      }
    }

    record.responsePackage = {
      storageKey: resolvedKey,
      filename: normalizeText(filename) || null,
      mimeType: normalizeText(mimeType) || 'application/octet-stream',
      delivery: normalizeText(delivery) || 'portal_download',
      sha256,
      sizeBytes,
      attachedAt: ts,
      attachedBy: normalizeActor(actor),
    };
    record.updatedAt = ts;
    appendHistory(record, 'response_attached', actor, {
      storageKey: resolvedKey,
      filename: record.responsePackage.filename,
      sizeBytes,
    });
    await save();
    audit('cco.dsr.response_attached', actor, record.dsrId, {
      storageKey: resolvedKey,
      sizeBytes,
    });
    return clone(record);
  }

  // --- queries ------------------------------------------------------------
  function getById(dsrId) {
    const idx = findIndexById(dsrId);
    if (idx === -1) return null;
    return clone(state.requests[idx]);
  }

  function listAll() {
    return state.requests
      .slice()
      .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
      .map(clone);
  }

  function isOpen(record) {
    return !TERMINAL_STATUSES.has(record.status);
  }

  function listOverdue({ now = null } = {}) {
    const ref = now ? new Date(now).getTime() : Date.now();
    return state.requests
      .filter((r) => isOpen(r))
      .filter((r) => {
        const dl = new Date(r.deadlineAt).getTime();
        return Number.isFinite(dl) && dl < ref;
      })
      .sort((a, b) => String(a.deadlineAt).localeCompare(String(b.deadlineAt)))
      .map(clone);
  }

  function listImminent(withinHours = 72, { now = null } = {}) {
    const hours =
      Number.isFinite(Number(withinHours)) && Number(withinHours) > 0 ? Number(withinHours) : 72;
    const ref = now ? new Date(now).getTime() : Date.now();
    const horizon = ref + hours * MS_PER_HOUR;
    return state.requests
      .filter((r) => isOpen(r))
      .filter((r) => {
        const dl = new Date(r.deadlineAt).getTime();
        return Number.isFinite(dl) && dl >= ref && dl <= horizon;
      })
      .sort((a, b) => String(a.deadlineAt).localeCompare(String(b.deadlineAt)))
      .map(clone);
  }

  return {
    createRequest,
    verifyIdentity,
    extendDeadline,
    recordPdlBlock,
    transitionStatus,
    getById,
    attachResponsePackage,
    listAll,
    listOverdue,
    listImminent,
  };
}

module.exports = {
  createCcoDsrStore,
  VALID_TYPES,
  VALID_STATUSES,
  DEFAULT_DEADLINE_DAYS,
};
