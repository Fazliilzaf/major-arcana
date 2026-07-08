'use strict';

/**
 * ccoPortalMessageStore — Fas 2, steg 1. Datagrund för portal-meddelanden: den
 * FRIA tvåvägskanalen mellan patient och klinik som ska ersätta SMS-konversationer
 * (och dra ner kostnaden).
 *
 * En patient↔klinik-meddelandelogg per kund (nycklad på customerId === patientId).
 * `direction`:
 *   - 'inbound'  = patient → klinik (skrivet i patientportalen)
 *   - 'outbound' = klinik → patient (Svarstudions svar, visas i portalen)
 * Alla meddelanden får kanal 'portal' så de kan särskiljas i tråden.
 *
 * Avgränsning:
 *   - Ren datalagring. SKICKAR ingenting, rör ingen sändkedja/RBAC.
 *   - Speglar ccoRecipientAllowlistStore/ccoCommDraftStore: factory + global
 *     skrivkö + per-nyckel async-mutex + atomär skrivning.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BODY = 8000; // portalmeddelanden är text, inte bilagor
const DIRECTIONS = new Set(['inbound', 'outbound']);
// Ursprungskanal. 'portal' = fri patient-portal, 'sms' = inkom via SMS-brygga.
const CHANNELS = new Set(['portal', 'sms']);

function nowIso() {
  return new Date().toISOString();
}
function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid + '.' + crypto.randomUUID();
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}
function emptyState() {
  return { customers: {}, version: 1, updatedAt: nowIso() };
}

function cloneMessage(m = {}) {
  return {
    id: m.id,
    direction: m.direction,
    channel: m.channel || 'portal',
    body: m.body,
    author: m.author || null,
    createdAt: m.createdAt || null,
    readAt: m.readAt || null,
  };
}

async function createCcoPortalMessageStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs.');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const state = await readJson(filePath, emptyState());
  if (!state.customers || typeof state.customers !== 'object') state.customers = {};

  let saveQueue = Promise.resolve();
  async function save() {
    const run = saveQueue.then(async () => {
      state.updatedAt = nowIso();
      await writeJsonAtomic(filePath, state);
    });
    saveQueue = run.catch(() => {});
    await run;
  }

  const locks = new Map();
  async function withLock(key, fn) {
    while (locks.has(key)) await locks.get(key);
    let release;
    const gate = new Promise((r) => (release = r));
    locks.set(key, gate);
    try {
      return await fn();
    } finally {
      locks.delete(key);
      release();
    }
  }

  function keyOf(tenantId, customerId) {
    const t = normalizeText(tenantId);
    const c = normalizeText(customerId);
    if (!t) throw new Error('tenantId krävs.');
    if (!c) throw new Error('customerId krävs.');
    return t + '::' + c;
  }
  function bucket(key) {
    if (!state.customers[key]) state.customers[key] = { messages: [] };
    if (!Array.isArray(state.customers[key].messages)) state.customers[key].messages = [];
    return state.customers[key];
  }

  /**
   * Lägg till ett meddelande i kundens portal-logg.
   * @param {{tenantId, customerId, patientId?, direction, body, author?}} input
   */
  async function appendMessage(input = {}) {
    const key = keyOf(input.tenantId, input.customerId || input.patientId);
    const direction = normalizeText(input.direction);
    if (!DIRECTIONS.has(direction)) {
      throw new Error("direction måste vara 'inbound' eller 'outbound'.");
    }
    const body = normalizeText(input.body);
    if (!body) throw new Error('body krävs.');
    if (body.length > MAX_BODY) throw new Error('body för långt.');

    const channel = CHANNELS.has(normalizeText(input.channel))
      ? normalizeText(input.channel)
      : 'portal';
    return withLock(key, async () => {
      const message = {
        id: crypto.randomUUID(),
        direction,
        channel,
        body: body.slice(0, MAX_BODY),
        author: normalizeText(input.author) || null,
        createdAt: nowIso(),
        readAt: null,
      };
      bucket(key).messages.push(message);
      await save();
      auditLog?.append?.({
        action: 'portal.message.append',
        actor: { role: 'system', userId: message.author },
        target: { kind: 'portal_message', id: message.id, tenantId: normalizeText(input.tenantId) },
        result: 'ok',
        detail: { direction, channel, chars: body.length },
      });
      return cloneMessage(message);
    });
  }

  /** Lista kundens portal-meddelanden (äldst först). */
  function listMessagesForCustomer({ tenantId, customerId } = {}) {
    let key;
    try {
      key = keyOf(tenantId, customerId);
    } catch {
      return [];
    }
    const list = state.customers[key]?.messages || [];
    return list
      .slice()
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map(cloneMessage);
  }

  /** Markera inkommande (patient→klinik) som lästa efter att klinik svarat/läst. */
  async function markInboundRead({ tenantId, customerId } = {}) {
    const key = keyOf(tenantId, customerId);
    return withLock(key, async () => {
      const at = nowIso();
      let changed = 0;
      for (const m of bucket(key).messages) {
        if (m.direction === 'inbound' && !m.readAt) {
          m.readAt = at;
          changed++;
        }
      }
      if (changed) await save();
      return { markedRead: changed };
    });
  }

  /** Antal olästa inkommande meddelanden (för notis/badge). */
  function countUnreadInbound({ tenantId, customerId } = {}) {
    let key;
    try {
      key = keyOf(tenantId, customerId);
    } catch {
      return 0;
    }
    return (state.customers[key]?.messages || []).filter(
      (m) => m.direction === 'inbound' && !m.readAt
    ).length;
  }

  /**
   * Sammanfatta olästa inkommande per kund över ALLA kunder — för notis-feeden.
   * Returnerar bara kunder med minst ett oläst inbound-meddelande.
   * @returns {Array<{tenantId, customerId, unread, latestInboundAt, latestBody}>}
   */
  function listUnreadInboundSummaries() {
    const out = [];
    for (const [key, data] of Object.entries(state.customers || {})) {
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const unreadInbound = messages.filter((m) => m.direction === 'inbound' && !m.readAt);
      if (unreadInbound.length === 0) continue;
      const sep = key.indexOf('::');
      const tenantId = sep >= 0 ? key.slice(0, sep) : '';
      const customerId = sep >= 0 ? key.slice(sep + 2) : key;
      const latest = unreadInbound
        .slice()
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .pop();
      out.push({
        tenantId,
        customerId,
        unread: unreadInbound.length,
        latestInboundAt: latest?.createdAt || null,
        latestBody: latest?.body || '',
      });
    }
    return out;
  }

  /** Aggregat för adoptionsmätning: kanalvolym + engagerade patienter. */
  function stats() {
    let customers = 0;
    let patientsEngaged = 0; // kunder med minst ett inbound (patienten skrev själv)
    let inbound = 0;
    let outbound = 0;
    for (const data of Object.values(state.customers || {})) {
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      if (messages.length === 0) continue;
      customers += 1;
      let hasInbound = false;
      for (const m of messages) {
        if (m.direction === 'inbound') {
          inbound += 1;
          hasInbound = true;
        } else if (m.direction === 'outbound') {
          outbound += 1;
        }
      }
      if (hasInbound) patientsEngaged += 1;
    }
    return { customers, patientsEngaged, inbound, outbound, total: inbound + outbound };
  }

  return {
    appendMessage,
    listMessagesForCustomer,
    markInboundRead,
    countUnreadInbound,
    listUnreadInboundSummaries,
    stats,
  };
}

module.exports = { createCcoPortalMessageStore, MAX_BODY };
