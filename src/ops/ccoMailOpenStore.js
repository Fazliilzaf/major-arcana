'use strict';

/**
 * Mail-open-store — spårar öppningar av transaktionsmail via 1x1-pixel.
 * Token-keyat (ingen PII i pixel-URL). Lagrar vilken automation + patient/e-post
 * ett utskick gällde, samt öppnings-tidsstämplar.
 *
 * OBS: e-post-öppningsspårning är inneboende oexakt (mailklienter blockerar
 * fjärrbilder; Apple Mail Privacy Protection förladdar → falska öppningar) och
 * är en integritetsfråga (GDPR). Pixel-injektion i live patient-mail sker först
 * efter uttrycklig laglig-grund-bekräftelse (Fas B).
 *
 * Struktur:
 * { version:1, sends: [ {
 *     token, tenantId, automationType, patientId, email, sentAt,
 *     openCount, firstOpenAt, lastOpenAt, opens:[{ts}]
 * } ] }
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function emptyStore() {
  return { version: 1, createdAt: nowIso(), updatedAt: nowIso(), sends: [] };
}

function normalizeSend(value) {
  const safe = asObject(value);
  return {
    token: normalizeText(safe.token),
    tenantId: normalizeText(safe.tenantId),
    automationType: normalizeText(safe.automationType),
    patientId: normalizeText(safe.patientId),
    email: normalizeText(safe.email).toLowerCase(),
    sentAt: normalizeText(safe.sentAt) || null,
    openCount: Number(safe.openCount) || 0,
    firstOpenAt: normalizeText(safe.firstOpenAt) || null,
    lastOpenAt: normalizeText(safe.lastOpenAt) || null,
    opens: asArray(safe.opens).map((o) => ({ ts: normalizeText(o && o.ts) || nowIso() })),
  };
}

async function readStoreFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      createdAt: normalizeText(parsed.createdAt) || nowIso(),
      updatedAt: normalizeText(parsed.updatedAt) || nowIso(),
      sends: asArray(parsed.sends).map(normalizeSend),
    };
  } catch (err) {
    if (err && err.code === 'ENOENT') return emptyStore();
    throw err;
  }
}

async function createCcoMailOpenStore({ filePath } = {}) {
  if (!normalizeText(filePath)) throw new Error('createCcoMailOpenStore requires filePath');
  const state = await readStoreFile(filePath);

  async function persist() {
    state.updatedAt = nowIso();
    const tmp = `${filePath}.${Date.now()}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  }

  // Registrera ett utskick → returnera token (att bädda in i pixel-URL).
  async function recordSend({ tenantId, automationType, patientId, email, sentAt } = {}) {
    const token = crypto.randomBytes(18).toString('base64url');
    const send = normalizeSend({
      token,
      tenantId,
      automationType,
      patientId,
      email,
      sentAt: sentAt || nowIso(),
    });
    state.sends.push(send);
    if (state.sends.length > 50000) state.sends = state.sends.slice(-50000);
    await persist();
    return { token, send };
  }

  // Pixel laddades → registrera öppning (idempotent-ish; räknar varje hit).
  async function recordOpen(token) {
    const tok = normalizeText(token);
    if (!tok) return null;
    const send = state.sends.find((s) => s.token === tok);
    if (!send) return null;
    const ts = nowIso();
    send.opens.push({ ts });
    if (send.opens.length > 200) send.opens = send.opens.slice(-200);
    send.openCount = send.opens.length;
    if (!send.firstOpenAt) send.firstOpenAt = ts;
    send.lastOpenAt = ts;
    await persist();
    return send;
  }

  // Lista utskick för en patient (patientId ELLER e-post) — för aggregatorn.
  function listForPatient({ tenantId, patientId, email } = {}) {
    const tid = normalizeText(tenantId);
    const pid = normalizeText(patientId);
    const mail = normalizeText(email).toLowerCase();
    return state.sends.filter((s) => {
      if (tid && s.tenantId && s.tenantId !== tid) return false;
      if (pid && s.patientId && s.patientId === pid) return true;
      if (mail && s.email && s.email === mail) return true;
      return false;
    });
  }

  function count() {
    return state.sends.length;
  }

  return { recordSend, recordOpen, listForPatient, count };
}

module.exports = { createCcoMailOpenStore };
