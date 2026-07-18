'use strict';

/**
 * CCO Runtime Stream — Server-Sent Events endpoint för real-time poke.
 *
 * Endpoint: GET /api/v1/cco/runtime/stream
 *
 * Stream-formatet skickar tre event-typer:
 *   • heartbeat  var 30s    → håller anslutningen vid liv
 *   • poll       var 10s    → triggar frontend att göra background-refresh
 *   • shutdown   vid stäng  → frontend ska auto-reconnect
 *
 * Designprinciper:
 *   • Minimal-viable: ingen event-bus i backend ännu — frontend pollar
 *     vid varje "poll"-event. Det här är en "knock"-mekanism som ger
 *     real-time-känsla utan tung infrastruktur.
 *   • Idempotent: en frontend kan reconnect:a obegränsat
 *   • CORS / auth: kräver Authorization-header (samma som andra endpoints)
 *
 * Future: backend kan emitta riktiga event-types (thread_added,
 * thread_status_changed, customer_updated) när vi har event-bus i ops/.
 */

const express = require('express');
const { requirePermission } = require('../security/ccoRbac');

const BROADCAST_EVENT_NAMES = new Set([
  'worklist_updated',
  'worklist_sync_failed',
  'mailbox_sync_updated',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMailboxIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .map((mailboxId) => normalizeText(mailboxId).toLowerCase())
        .filter(Boolean)
    )
  );
}

function createTenantScopeMiddleware(tenantScopeId = '') {
  const expectedTenantId = normalizeText(tenantScopeId).toLowerCase();
  return (req, res, next) => {
    if (!expectedTenantId) {
      return res.status(503).json({ error: 'cco_stream_tenant_scope_unavailable' });
    }
    const actualTenantId = normalizeText(req.auth?.tenantId).toLowerCase();
    if (actualTenantId === expectedTenantId) return next();
    return res.status(403).json({
      error: 'tenant_scope_forbidden',
      detail: 'CCO-konversationer kan bara lasas inom den aktiva klinikens tenant.',
    });
  };
}

function createUnavailableAuthMiddleware() {
  return (_req, res) => res.status(503).json({ error: 'cco_stream_auth_unavailable' });
}

function createScopedBroadcastPayload(payload, allowedMailboxIds) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const allowed = new Set(normalizeMailboxIds(allowedMailboxIds));
  const requestedMailboxIds = normalizeMailboxIds([
    ...(Array.isArray(source.mailboxIds) ? source.mailboxIds : []),
    source.mailboxId,
    ...(Array.isArray(source.failedMailboxIds) ? source.failedMailboxIds : []),
    source.failedMailboxId,
  ]);

  // Ett broadcast-event utan en uttryckligt scopebar mailbox får inte lämna
  // processen. Det håller synkfel, konversationsnycklar och andra metadata
  // lokala, även om en ny emitter senare skulle skicka dem i payloaden.
  if (requestedMailboxIds.length === 0) return null;

  const scopedMailboxIds = normalizeMailboxIds([
    ...(Array.isArray(source.mailboxIds) ? source.mailboxIds : []),
    source.mailboxId,
  ]).filter((mailboxId) => allowed.has(mailboxId));
  const scopedFailedMailboxIds = normalizeMailboxIds([
    ...(Array.isArray(source.failedMailboxIds) ? source.failedMailboxIds : []),
    source.failedMailboxId,
  ]).filter((mailboxId) => allowed.has(mailboxId));

  if (scopedMailboxIds.length === 0 && scopedFailedMailboxIds.length === 0) return null;

  const safePayload = {};
  if (scopedMailboxIds.length > 0) safePayload.mailboxIds = scopedMailboxIds;
  if (scopedFailedMailboxIds.length > 0) {
    safePayload.failedMailboxIds = scopedFailedMailboxIds;
  }
  return safePayload;
}

function createCcoRuntimeStreamRouter({
  pollIntervalMs = 5000,
  heartbeatIntervalMs = 30000,
  requireAuth = null,
  tenantScopeId = '',
  mailboxIds = [],
} = {}) {
  const router = express.Router();
  const activeStreams = new Set();
  const requireConfiguredAuth =
    typeof requireAuth === 'function' ? requireAuth : createUnavailableAuthMiddleware();
  const requireCcoTenantScope = createTenantScopeMiddleware(tenantScopeId);
  const allowedMailboxIds = normalizeMailboxIds(mailboxIds);

  router.get(
    '/cco/runtime/stream',
    requireConfiguredAuth,
    requireCcoTenantScope,
    requirePermission('mail.read'),
    (req, res) => {
      // SSE-headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Render: disable proxy buffering
      res.flushHeaders?.();

      // Initial event: säkerställ att klienten ser anslutningen
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

      let heartbeatTimer;
      let pollTimer;
      let alive = true;

      function send(eventName, payload) {
        if (!alive) return;
        try {
          res.write(`event: ${eventName}\n`);
          res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
        } catch (_e) {
          cleanup();
        }
      }

      function cleanup() {
        if (!alive) return;
        alive = false;
        activeStreams.delete(streamRef);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (pollTimer) clearInterval(pollTimer);
        try { res.end(); } catch (_e) {}
      }

      const streamRef = { send, cleanup };
      activeStreams.add(streamRef);

      // Heartbeat — håller anslutningen vid liv genom proxy-timeouts
      heartbeatTimer = setInterval(() => {
        send('heartbeat', { at: new Date().toISOString() });
      }, heartbeatIntervalMs);

      // Poll-event — frontend gör background-refresh
      pollTimer = setInterval(() => {
        send('poll', { at: new Date().toISOString(), reason: 'periodic' });
      }, pollIntervalMs);

      // Cleanup vid client-disconnect
      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
    }
  );

  // Broadcast-data kan innehalla driftmetadata. Exponera enbart mailbox-id:n
  // som tillhor CCO:s konfigurerade scope; aldrig feltext, draft- eller
  // konversationsnycklar.
  router.broadcast = function broadcast(eventName, payload) {
    if (!BROADCAST_EVENT_NAMES.has(eventName)) return;
    const safePayload = createScopedBroadcastPayload(payload, allowedMailboxIds);
    if (!safePayload) return;
    for (const stream of activeStreams) {
      try { stream.send(eventName, safePayload); } catch (_e) {}
    }
  };

  router.activeStreamCount = function activeStreamCount() {
    return activeStreams.size;
  };

  router.shutdown = function shutdown() {
    for (const stream of activeStreams) {
      try {
        stream.send('shutdown', { at: new Date().toISOString() });
      } catch (_e) {}
      try { stream.cleanup(); } catch (_e) {}
    }
    activeStreams.clear();
  };

  return router;
}

module.exports = { createCcoRuntimeStreamRouter };
