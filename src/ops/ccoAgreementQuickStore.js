// src/ops/ccoAgreementQuickStore.js
// CCO Agreements Quick — snabb-avtal med state machine + dry-run-utskick + sign.
//
// State machine: draft -> sent -> signed; draft|sent -> cancelled.
// JSON-fil-backad med atomiska skrivningar (data/cco-agreements-quick.json).
//
// Sign-metoder: 'bankid_stub' (default), 'paper_signed_scanned', 'staff_override'.
// RBAC för staff_override hanteras i route-lagret (server.js); store:t accepterar
// metoden och loggar den. sendAgreement degraderar graciöst till dry-run om
// send-helpers (buildFilePayload/performSend) saknas eller returnerar undefined.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATES = Object.freeze(['draft', 'sent', 'signed', 'cancelled']);
const SIGN_METHODS = Object.freeze(['bankid_stub', 'paper_signed_scanned', 'staff_override']);

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

function conflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
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

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, agreements: [] };
}

async function createCcoAgreementQuickStore({
  filePath,
  auditLog = null,
  sendStore = null,
  buildFilePayload = null,
  performSend = null,
  offerStore = null,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoAgreementQuickStore.');
  }

  const buildPayload = buildFilePayload || sendStore?.buildFilePayload || null;
  const doSend = performSend || sendStore?.performSend || null;

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    agreements: Array.isArray(state?.agreements) ? state.agreements : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function audit(action, actor, target, detail) {
    if (!auditLog) return;
    try {
      auditLog.append({
        action,
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target,
        detail: detail || {},
      });
    } catch {
      // Audit får aldrig fälla flödet.
    }
  }

  function indexById(id) {
    const want = normalizeText(id);
    return state.agreements.findIndex((a) => a.id === want);
  }

  function getById(id) {
    const idx = indexById(id);
    return idx === -1 ? null : { ...state.agreements[idx] };
  }

  function requireAgreement(id) {
    const idx = indexById(id);
    if (idx === -1) throw notFound('Avtalet hittades inte.');
    return idx;
  }

  async function createAgreement(input = {}, actor = {}) {
    const customerId = normalizeKey(input.customerId);
    if (!customerId) throw badRequest('customerId krävs för avtal.');

    const ts = nowIso();
    const agreement = {
      id: crypto.randomUUID(),
      customerId,
      customerName: normalizeText(input.customerName) || null,
      title: normalizeText(input.title) || 'Behandlingsavtal',
      treatmentKey: normalizeKey(input.treatmentKey) || null,
      brand: normalizeText(input.brand) || null,
      templateRef: normalizeText(input.templateRef) || null,
      offerId: normalizeText(input.offerId) || null,
      body: normalizeText(input.body),
      notes: normalizeText(input.notes),
      state: 'draft',
      createdAt: ts,
      updatedAt: ts,
      sentAt: null,
      signedAt: null,
      signedByName: null,
      signMethod: null,
      signatureToken: null,
      cancelledAt: null,
      cancelReason: null,
      sendResult: null,
      createdByRole: normalizeText(actor?.role) || null,
      history: [{ state: 'draft', at: ts, role: normalizeText(actor?.role) || 'system' }],
    };
    state.agreements.push(agreement);
    await save();
    audit('cco.agreement.created', actor, { kind: 'agreement', id: agreement.id }, { customerId });
    return { ...agreement };
  }

  async function updateDraft(id, patch = {}, actor = {}) {
    const idx = requireAgreement(id);
    const agreement = state.agreements[idx];
    if (agreement.state !== 'draft') {
      throw conflict(`Endast utkast kan redigeras (nuvarande status: ${agreement.state}).`);
    }
    const editable = ['customerName', 'title', 'brand', 'templateRef', 'body', 'notes', 'offerId'];
    for (const field of editable) {
      if (patch[field] !== undefined) agreement[field] = normalizeText(patch[field]) || null;
    }
    if (patch.treatmentKey !== undefined) {
      agreement.treatmentKey = normalizeKey(patch.treatmentKey) || null;
    }
    agreement.updatedAt = nowIso();
    await save();
    audit('cco.agreement.updated', actor, { kind: 'agreement', id: agreement.id }, {});
    return { ...agreement };
  }

  async function sendAgreement(id, { dryRunOverride = null } = {}, actor = {}) {
    const idx = requireAgreement(id);
    const agreement = state.agreements[idx];
    if (agreement.state !== 'draft' && agreement.state !== 'sent') {
      throw conflict(`Avtal i status ${agreement.state} kan inte skickas.`);
    }

    const dryRun = typeof dryRunOverride === 'boolean' ? dryRunOverride : true;

    let payload = null;
    if (typeof buildPayload === 'function') {
      try {
        payload = await buildPayload({
          kind: 'agreement',
          customerId: agreement.customerId,
          customerName: agreement.customerName,
          title: agreement.title,
          agreementId: agreement.id,
          templateRef: agreement.templateRef,
        });
      } catch {
        payload = null;
      }
    }

    let sendResult = { dryRun: true, delivered: false, reason: 'send_helpers_unavailable' };
    if (!dryRun && typeof doSend === 'function') {
      try {
        const result = await doSend({
          kind: 'agreement',
          customerId: agreement.customerId,
          agreementId: agreement.id,
          payload,
          role: normalizeText(actor?.role) || 'system',
        });
        if (result === undefined || result === null) {
          sendResult = { dryRun: true, delivered: false, reason: 'send_store_unavailable' };
        } else {
          sendResult = { dryRun: false, delivered: true, result };
        }
      } catch (err) {
        sendResult = { dryRun: false, delivered: false, error: String(err?.message || err) };
      }
    } else {
      sendResult = { dryRun: true, delivered: false, payloadBuilt: Boolean(payload) };
    }

    const ts = nowIso();
    if (!sendResult.dryRun && sendResult.delivered) {
      agreement.state = 'sent';
      agreement.sentAt = ts;
      agreement.history.push({
        state: 'sent',
        at: ts,
        role: normalizeText(actor?.role) || 'system',
      });
    }
    agreement.sendResult = sendResult;
    agreement.updatedAt = ts;
    await save();
    audit(
      'cco.agreement.sent',
      actor,
      { kind: 'agreement', id: agreement.id },
      { dryRun: sendResult.dryRun, delivered: sendResult.delivered }
    );
    return { agreement: { ...agreement }, send: sendResult };
  }

  async function signAgreement(
    id,
    { signedByName = '', signMethod = 'bankid_stub', signatureToken = null } = {},
    actor = {}
  ) {
    const idx = requireAgreement(id);
    const agreement = state.agreements[idx];
    if (agreement.state === 'signed') {
      throw conflict('Avtalet är redan signerat.');
    }
    if (agreement.state === 'cancelled') {
      throw conflict('Ett avbrutet avtal kan inte signeras.');
    }
    const method = normalizeKey(signMethod) || 'bankid_stub';
    if (!SIGN_METHODS.includes(method)) {
      throw badRequest(`Ogiltig sign-metod. Tillåtna: ${SIGN_METHODS.join(', ')}.`);
    }

    const ts = nowIso();
    agreement.state = 'signed';
    agreement.signedAt = ts;
    agreement.signedByName = normalizeText(signedByName) || null;
    agreement.signMethod = method;
    agreement.signatureToken = normalizeText(signatureToken) || null;
    agreement.updatedAt = ts;
    agreement.history.push({
      state: 'signed',
      at: ts,
      role: normalizeText(actor?.role) || 'system',
      method,
    });
    await save();
    audit(
      'cco.agreement.signed',
      actor,
      { kind: 'agreement', id: agreement.id },
      { signMethod: method }
    );
    return { ...agreement };
  }

  async function cancelAgreement(id, { reason = '' } = {}, actor = {}) {
    const idx = requireAgreement(id);
    const agreement = state.agreements[idx];
    if (agreement.state === 'signed') {
      throw conflict('Ett signerat avtal kan inte avbrytas.');
    }
    if (agreement.state === 'cancelled') {
      throw conflict('Avtalet är redan avbrutet.');
    }
    const ts = nowIso();
    agreement.state = 'cancelled';
    agreement.cancelledAt = ts;
    agreement.cancelReason = normalizeText(reason) || null;
    agreement.updatedAt = ts;
    agreement.history.push({
      state: 'cancelled',
      at: ts,
      role: normalizeText(actor?.role) || 'system',
    });
    await save();
    audit(
      'cco.agreement.cancelled',
      actor,
      { kind: 'agreement', id: agreement.id },
      { reason: agreement.cancelReason }
    );
    return { ...agreement };
  }

  function listForCustomer(customerId) {
    const want = normalizeKey(customerId);
    return state.agreements
      .filter((a) => a.customerId === want)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((a) => ({ ...a }));
  }

  function listAll({ state: wantState = null, limit = 200 } = {}) {
    const filterState = wantState ? normalizeKey(wantState) : null;
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
    return state.agreements
      .filter((a) => (filterState ? a.state === filterState : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, max)
      .map((a) => ({ ...a }));
  }

  function stats() {
    const byState = {};
    for (const s of STATES) byState[s] = 0;
    const bySignMethod = {};
    for (const a of state.agreements) {
      byState[a.state] = (byState[a.state] || 0) + 1;
      if (a.signMethod) bySignMethod[a.signMethod] = (bySignMethod[a.signMethod] || 0) + 1;
    }
    return { total: state.agreements.length, byState, bySignMethod };
  }

  return {
    createAgreement,
    updateDraft,
    sendAgreement,
    signAgreement,
    cancelAgreement,
    getById,
    listForCustomer,
    listAll,
    stats,
  };
}

module.exports = { createCcoAgreementQuickStore, STATES, SIGN_METHODS };
