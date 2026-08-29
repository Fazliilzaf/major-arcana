'use strict';

/**
 * ccoPortalL2Cookie — delad hjälp för kundportalens nivå-2-sessions-cookie
 * (BankID). Samma cookie (namn + HMAC-format) och samma hemlighet måste
 * användas av ALLA routes som läser eller sätter sessionen — annars kan ett
 * avtal signeras i en router och ett annat i en annan utan att de känner igen
 * varandras session (och "vilken session" i signeringsbeviset blir fel).
 *
 * Hemlighet: injicerad `sessionSecret` → env.PORTAL_SESSION_SECRET → ephemeral
 * (dev/dry-run). Prod kräver PORTAL_SESSION_SECRET i blueprinten så sessionen
 * överlever omstarter och delas över routers.
 */

const crypto = require('node:crypto');

const L2_SESSION_COOKIE = 'cco_portal_l2';

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}

/** HMAC-signera ett JSON-objekt → "<payload>.<sig>" (base64url). */
function signCookie(obj, secret) {
  const payload = b64urlEncode(JSON.stringify(obj));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verifiera + parsa en signerad cookie. Returnerar null vid manipulation. */
function readCookie(raw, secret) {
  const value = text(raw);
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(payload));
  } catch {
    return null;
  }
}

/** Parsa `Cookie`-headern manuellt (ingen cookie-parser i stacken). */
function parseCookies(req) {
  const header = text(req && req.headers && req.headers.cookie);
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * En och samma hemlighet för alla som läser/skriver L2-cookien.
 * Injicerad sessionSecret vinner; annars env.PORTAL_SESSION_SECRET; sist en
 * ephemeral fallback som bara duger i dev/dry-run (ej över omstarter/routers).
 */
function resolveL2Secret({ sessionSecret = '', env = process.env } = {}) {
  return text(sessionSecret) || text(env.PORTAL_SESSION_SECRET) || crypto.randomBytes(32).toString('hex');
}

module.exports = {
  L2_SESSION_COOKIE,
  signCookie,
  readCookie,
  parseCookies,
  resolveL2Secret,
};
