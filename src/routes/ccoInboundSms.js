'use strict';

/**
 * ccoInboundSms (router) — webhook som SMS-leverantören (46elks/Twilio) POST:ar
 * till när ett SMS kommer in till klinikens virtuella nummer. Gör inbound-SMS till
 * en fullvärdig tvåvägskanal: svaret hamnar i kundens tråd (channel:'sms') och
 * dyker upp i samma notis-feed/Svarstudio som portal-meddelanden.
 *
 * Säkerhet: leverantören signerar inte requests, så endpointen grindas av en
 * HEMLIG väg-token (ELKS_INBOUND_SECRET). Saknas env-hemligheten → 404 (funktion
 * ej aktiverad), så webhooken kan inte råka stå öppen.
 *
 * Publik (ingen staff-auth) — hemligheten ÄR grinden. urlencoded (46elks-format).
 */

const express = require('express');
const { ingestInboundSms } = require('../ops/ccoInboundSmsIngest');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function timingSafeEqual(a, b) {
  const crypto = require('node:crypto');
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function createCcoInboundSmsRouter({ getSecret } = {}) {
  const router = express.Router();
  // 46elks POST:ar application/x-www-form-urlencoded; Twilio likaså.
  const formParser = express.urlencoded({ extended: false, limit: '16kb' });
  const resolveSecret = () =>
    typeof getSecret === 'function' ? text(getSecret()) : text(process.env.ELKS_INBOUND_SECRET);

  router.post('/public/sms/inbound/:secret', formParser, async (req, res) => {
    const expected = resolveSecret();
    // Ingen hemlighet konfigurerad → funktionen är inte aktiverad.
    if (!expected) return res.status(404).json({ ok: false, error: 'not_found' });
    if (!timingSafeEqual(text(req.params.secret), expected)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const store = req.app?.locals?.ccoPortalMessageStore || null;
    if (!store) return res.status(503).json({ ok: false, error: 'sms_ingest_unavailable' });

    // 46elks: from/to/message/id. Twilio: From/To/Body/MessageSid.
    const b = req.body || {};
    try {
      const result = await ingestInboundSms(
        {
          from: text(b.from) || text(b.From),
          to: text(b.to) || text(b.To),
          message: text(b.message) || text(b.Body),
          providerId: text(b.id) || text(b.MessageSid),
        },
        {
          messageStore: store,
          patientMasterStore: req.app?.locals?.ccoPatientMasterStore || null,
          auditLog: req.app?.locals?.ccoAuditLog || null,
        }
      );
      // Leverantören förväntar 200. Tom body = inget auto-svar (vi svarar inte via SMS).
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      return res.status(200).json({ ok: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createCcoInboundSmsRouter };
