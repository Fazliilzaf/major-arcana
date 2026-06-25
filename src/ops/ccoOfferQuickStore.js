// src/ops/ccoOfferQuickStore.js
// CCO Offers Quick — snabb-offert till kund med state machine + dry-run-utskick.
//
// State machine: draft -> sent -> (accepted | rejected). draft kan raderas.
// JSON-fil-backad med atomiska skrivningar (data/cco-offers-quick.json).
//
// sendOffer använder injicerade send-helpers (buildFilePayload/performSend).
// Dessa kan vara null/undefined eller returnera undefined (proxy mot
// ccoSendActionStore som kanske inte är monterad än) — vi degraderar då
// graciöst till dry-run istället för att krascha.

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATES = Object.freeze(['draft', 'sent', 'accepted', 'rejected']);

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
  return { version: 1, createdAt: ts, updatedAt: ts, offers: [] };
}

function normalizeAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function createCcoOfferQuickStore({
  filePath,
  auditLog = null,
  sendStore = null,
  buildFilePayload = null,
  performSend = null,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoOfferQuickStore.');
  }

  // send-helpers kan komma antingen direkt eller via sendStore-objektet.
  const buildPayload = buildFilePayload || sendStore?.buildFilePayload || null;
  const doSend = performSend || sendStore?.performSend || null;

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    offers: Array.isArray(state?.offers) ? state.offers : [],
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
    return state.offers.findIndex((o) => o.id === want);
  }

  function getById(id) {
    const idx = indexById(id);
    return idx === -1 ? null : { ...state.offers[idx] };
  }

  function requireOffer(id) {
    const idx = indexById(id);
    if (idx === -1) throw notFound('Offerten hittades inte.');
    return idx;
  }

  async function createOffer(input = {}, actor = {}) {
    const customerId = normalizeKey(input.customerId);
    if (!customerId) throw badRequest('customerId krävs för offert.');

    const ts = nowIso();
    const offer = {
      id: crypto.randomUUID(),
      customerId,
      customerName: normalizeText(input.customerName) || null,
      title: normalizeText(input.title) || 'Offert',
      treatmentKey: normalizeKey(input.treatmentKey) || null,
      brand: normalizeText(input.brand) || null,
      amount: normalizeAmount(input.amount),
      currency: normalizeText(input.currency) || 'SEK',
      items: Array.isArray(input.items) ? input.items : [],
      notes: normalizeText(input.notes),
      validUntil: normalizeText(input.validUntil) || null,
      state: 'draft',
      createdAt: ts,
      updatedAt: ts,
      sentAt: null,
      acceptedAt: null,
      acceptedVia: null,
      acceptedBy: null,
      rejectedAt: null,
      rejectReason: null,
      sendResult: null,
      createdByRole: normalizeText(actor?.role) || null,
      history: [{ state: 'draft', at: ts, role: normalizeText(actor?.role) || 'system' }],
    };
    state.offers.push(offer);
    await save();
    audit('cco.offer.created', actor, { kind: 'offer', id: offer.id }, { customerId });
    return { ...offer };
  }

  async function updateDraft(id, patch = {}, actor = {}) {
    const idx = requireOffer(id);
    const offer = state.offers[idx];
    if (offer.state !== 'draft') {
      throw conflict(`Endast utkast kan redigeras (nuvarande status: ${offer.state}).`);
    }
    const editable = ['customerName', 'title', 'notes', 'validUntil', 'brand', 'currency'];
    for (const field of editable) {
      if (patch[field] !== undefined) offer[field] = normalizeText(patch[field]) || null;
    }
    if (patch.treatmentKey !== undefined)
      offer.treatmentKey = normalizeKey(patch.treatmentKey) || null;
    if (patch.amount !== undefined) offer.amount = normalizeAmount(patch.amount);
    if (patch.items !== undefined && Array.isArray(patch.items)) offer.items = patch.items;
    offer.updatedAt = nowIso();
    await save();
    audit('cco.offer.updated', actor, { kind: 'offer', id: offer.id }, {});
    return { ...offer };
  }

  async function sendOffer(id, { dryRunOverride = null } = {}, actor = {}) {
    const idx = requireOffer(id);
    const offer = state.offers[idx];
    if (offer.state !== 'draft' && offer.state !== 'sent') {
      throw conflict(`Offert i status ${offer.state} kan inte skickas.`);
    }

    const dryRun = typeof dryRunOverride === 'boolean' ? dryRunOverride : true;

    let payload = null;
    if (typeof buildPayload === 'function') {
      try {
        payload = await buildPayload({
          kind: 'offer',
          customerId: offer.customerId,
          customerName: offer.customerName,
          title: offer.title,
          offerId: offer.id,
          amount: offer.amount,
          currency: offer.currency,
        });
      } catch {
        payload = null;
      }
    }

    let sendResult = { dryRun: true, delivered: false, reason: 'send_helpers_unavailable' };
    if (!dryRun && typeof doSend === 'function') {
      try {
        const result = await doSend({
          kind: 'offer',
          customerId: offer.customerId,
          offerId: offer.id,
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
      offer.state = 'sent';
      offer.sentAt = ts;
      offer.history.push({ state: 'sent', at: ts, role: normalizeText(actor?.role) || 'system' });
    }
    offer.sendResult = sendResult;
    offer.updatedAt = ts;
    await save();
    audit(
      'cco.offer.sent',
      actor,
      { kind: 'offer', id: offer.id },
      { dryRun: sendResult.dryRun, delivered: sendResult.delivered }
    );
    return { offer: { ...offer }, send: sendResult };
  }

  async function acceptOffer(id, { acceptedVia = 'manual', acceptedBy = null } = {}, actor = {}) {
    const idx = requireOffer(id);
    const offer = state.offers[idx];
    if (offer.state !== 'sent' && offer.state !== 'draft') {
      throw conflict(`Offert i status ${offer.state} kan inte accepteras.`);
    }
    const ts = nowIso();
    offer.state = 'accepted';
    offer.acceptedAt = ts;
    offer.acceptedVia = normalizeText(acceptedVia) || 'manual';
    offer.acceptedBy = normalizeText(acceptedBy) || null;
    offer.updatedAt = ts;
    offer.history.push({ state: 'accepted', at: ts, role: normalizeText(actor?.role) || 'system' });
    await save();
    audit(
      'cco.offer.accepted',
      actor,
      { kind: 'offer', id: offer.id },
      { acceptedVia: offer.acceptedVia }
    );
    return { ...offer };
  }

  async function rejectOffer(id, { reason = '' } = {}, actor = {}) {
    const idx = requireOffer(id);
    const offer = state.offers[idx];
    if (offer.state === 'accepted') {
      throw conflict('En accepterad offert kan inte avvisas.');
    }
    const ts = nowIso();
    offer.state = 'rejected';
    offer.rejectedAt = ts;
    offer.rejectReason = normalizeText(reason) || null;
    offer.updatedAt = ts;
    offer.history.push({ state: 'rejected', at: ts, role: normalizeText(actor?.role) || 'system' });
    await save();
    audit(
      'cco.offer.rejected',
      actor,
      { kind: 'offer', id: offer.id },
      { reason: offer.rejectReason }
    );
    return { ...offer };
  }

  async function deleteDraft(id, actor = {}) {
    const idx = requireOffer(id);
    const offer = state.offers[idx];
    if (offer.state !== 'draft') {
      throw conflict('Endast utkast kan raderas.');
    }
    state.offers.splice(idx, 1);
    await save();
    audit('cco.offer.deleted', actor, { kind: 'offer', id: offer.id }, {});
    return { ok: true, id: offer.id, deleted: true };
  }

  function listForCustomer(customerId) {
    const want = normalizeKey(customerId);
    return state.offers
      .filter((o) => o.customerId === want)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((o) => ({ ...o }));
  }

  function listAll({ state: wantState = null, limit = 200 } = {}) {
    const filterState = wantState ? normalizeKey(wantState) : null;
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 200;
    return state.offers
      .filter((o) => (filterState ? o.state === filterState : true))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, max)
      .map((o) => ({ ...o }));
  }

  function stats() {
    const byState = {};
    for (const s of STATES) byState[s] = 0;
    let totalAmount = 0;
    let acceptedAmount = 0;
    for (const o of state.offers) {
      byState[o.state] = (byState[o.state] || 0) + 1;
      totalAmount += normalizeAmount(o.amount);
      if (o.state === 'accepted') acceptedAmount += normalizeAmount(o.amount);
    }
    return { total: state.offers.length, byState, totalAmount, acceptedAmount };
  }

  return {
    createOffer,
    updateDraft,
    sendOffer,
    acceptOffer,
    rejectOffer,
    deleteDraft,
    getById,
    listForCustomer,
    listAll,
    stats,
  };
}

module.exports = { createCcoOfferQuickStore, STATES };
