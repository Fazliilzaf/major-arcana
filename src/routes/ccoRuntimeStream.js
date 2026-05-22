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

function createCcoRuntimeStreamRouter({
  pollIntervalMs = 10000,
  heartbeatIntervalMs = 30000,
} = {}) {
  const router = express.Router();
  const activeStreams = new Set();

  router.get('/cco/runtime/stream', (req, res) => {
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
  });

  // Broadcast-API för framtida event-bus (ej använd ännu)
  router.broadcast = function broadcast(eventName, payload) {
    for (const stream of activeStreams) {
      try { stream.send(eventName, payload); } catch (_e) {}
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
