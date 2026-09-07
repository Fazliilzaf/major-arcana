'use strict';

/**
 * staffAgentContext.js — serververifierat context-token till Master Agent (WP-003).
 *
 * Major Arcana/Staffportal äger identity+tenant+role+entitlement. Denna modul
 * skapar ett HMAC-signerat, tidsbundet envelope som Master Agent senare
 * verifierar (fail-closed). Inga secrets i frontend — tokenet utfärdas endast
 * i backend efter auth + entitlement-check.
 *
 * Token-format:  base64url(canonical-json).hmac-sha256-hex
 * HMAC-nyckel:   STAFF_AGENT_CONTEXT_SECRET (≥32 tecken i prod, fail-closed).
 */

const crypto = require('node:crypto');

const AGENT_IDS = Object.freeze(['CEO', 'CCO', 'CFO', 'CMO', 'CAO', 'COO']);
const TTL_MS = 15 * 60 * 1000; // 15 minuter

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function contextSecret() {
  const s = normalizeText(process.env.STAFF_AGENT_CONTEXT_SECRET);
  if (s.length >= 32) return s;
  // Prod: fail-closed — ingen dev-hemlighet.
  if (process.env.NODE_ENV === 'production') return '';
  return 'dev-only-staff-agent-context-secret-v1';
}

function canonicalJson(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function sign(message, secret) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

function buildContextToken(fields = {}) {
  const secret = contextSecret();
  if (!secret) return null;
  const now = Date.now();
  const agentId = normalizeText(fields.agentId).toUpperCase();
  const payload = {
    request_id: normalizeText(fields.requestId) || crypto.randomUUID(),
    user_id: normalizeText(fields.userId),
    tenant_id: normalizeText(fields.tenantId),
    staff_role: normalizeText(fields.staffRole),
    agent_id: agentId,
    portal_id: normalizeText(fields.portalId || fields.agentId),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TTL_MS).toISOString(),
  };
  if (fields.pageContext != null && fields.pageContext !== '') payload.page_context = String(fields.pageContext);
  if (fields.selectedEntityId != null && fields.selectedEntityId !== '') payload.selected_entity_id = String(fields.selectedEntityId);
  if (fields.sessionId != null && fields.sessionId !== '') payload.session_id = String(fields.sessionId);

  if (!payload.user_id || !payload.tenant_id || !AGENT_IDS.includes(agentId)) return null;

  const canonical = canonicalJson(payload);
  const b64 = Buffer.from(canonical, 'utf8').toString('base64url');
  const sig = sign(b64, secret);
  return `${b64}.${sig}`;
}

function verifyContextToken(token) {
  const secret = contextSecret();
  if (!secret) return null;
  if (typeof token !== 'string' || token.length < 3) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(b64, secret);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; // manipulerad
  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (!AGENT_IDS.includes(normalizeText(payload.agent_id).toUpperCase())) return null; // CM/okänt → neka
  if (!Number.isFinite(Date.parse(payload.expires_at))) return null;
  if (Date.parse(payload.expires_at) <= Date.now()) return null; // utgånget
  return payload;
}

module.exports = { buildContextToken, verifyContextToken, contextSecret, AGENT_IDS };
