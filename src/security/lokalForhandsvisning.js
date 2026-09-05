'use strict';

/**
 * ORD-224 / P0-001 — Remote Auth Bypass (lokal förhandsvisning / local preview).
 *
 * Canonical implementering av: "Är detta en TILLÅTEN lokal preview-request?"
 *
 * Tidigare fanns lokala kopior av lokalitetsbeslutet i authMiddleware.js,
 * ccoRouteShared.js, ccoBookings.js, ccoBookingEngine.js och postOpReview.js.
 * Flera av dem läste klient-styrda källor (Host, X-Forwarded-Host,
 * X-Forwarded-For, req.hostname, req.ip) och kunde därför ge en remote klient
 * local-preview/OWNER-elevation. Den här modulen är den ENDA källan till sanning;
 * alla callers ska delegera hit (REUSE → EXTEND → NEW).
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// De enda TCP-peer-adresser som räknas som genuint lokala.
const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Avgör lokalitet ENBART från TCP-peern (req.socket.remoteAddress).
 *
 * FÖRBJUDNA lokalitetskällor (klient-styrda) — används aldrig:
 *   Host, X-Forwarded-Host, X-Forwarded-For, req.hostname, req.ip,
 *   eller annan client-controlled HTTP-header.
 *
 * Fail closed: saknas eller oläsbar peer → false.
 */
function isTrustedLocalPeer(req) {
  const peer = normalizeText(req?.socket?.remoteAddress || '').toLowerCase();
  return LOOPBACK_PEERS.has(peer);
}

/**
 * Är detta en genuint lokal preview-request? (ingen produktionsgate).
 * Används av callers som redan gatar produktion separat (authMiddleware).
 */
function isLocalPreviewRequest(req) {
  return isTrustedLocalPeer(req);
}

/**
 * Är lokal preview TILLÅTEN för denna request?
 * Produktion nekar alltid (INV-001); annars avgörs det av TCP-peern.
 */
function isLocalPreviewAllowed(req, config) {
  const isProduction = Boolean(
    config?.isProduction ?? process.env.NODE_ENV === 'production'
  );
  if (isProduction) return false;
  return isTrustedLocalPeer(req);
}

module.exports = {
  isTrustedLocalPeer,
  isLocalPreviewRequest,
  isLocalPreviewAllowed,
};
