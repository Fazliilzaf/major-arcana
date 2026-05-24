'use strict';

/**
 * Resend HTTP mailer — minimal client för transactional emails från Hair TP Clinic.
 *
 * Används för booking-bekräftelse efter /api/public/booking-engine/reservations.
 *
 * Aktivering:
 *   RESEND_API_KEY=re_xxx (krävs för live)
 *   RESEND_FROM=Hair TP Clinic <booking@notifications.hairtpclinic.com> (default via RESEND_DOMAIN)
 *   RESEND_REPLY_TO=contact@hairtpclinic.com
 *
 * Utan RESEND_API_KEY → logga + skippa (mock-mode). Inga email skickas men
 * boknings-flowet bryts inte. Operatören får ringa patienten istället.
 *
 * Designprinciper:
 *   - Server-only modul (Render). Webben kallar aldrig direkt.
 *   - Inga retries här — Resend HTTP är best-effort; om send failas
 *     loggar vi och fortsätter. CCO-operatören har patientens telefon
 *     och kan följa upp manuellt.
 *   - Inget side-channel-beroende (Microsoft Graph, OAuth) — Resend är
 *     en clean HTTP-API-call så detta är den enklaste integrationen.
 */

const {
  resolveResendFrom,
  resolveResendReplyTo,
  getResendRuntimeSummary,
} = require('./resendConfig');

const RESEND_API_URL = 'https://api.resend.com/emails';

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim());
}

/**
 * Skicka ett email via Resend.
 *
 * @param {object} input
 * @param {string|string[]} input.to     Mottagar-e-post (string eller array)
 * @param {string} input.subject         Ämnesrad
 * @param {string} input.html            HTML-body
 * @param {string} [input.text]          Plain-text fallback
 * @param {string} [input.from]          Override "from" (default contact@hairtpclinic.com)
 * @param {string} [input.replyTo]       Reply-to-address
 * @param {string} [input.idempotencyKey] Om satt skickar vi som idempotency-header
 * @returns {Promise<{ok: boolean, mode: 'live'|'mock', messageId?: string, error?: string}>}
 */
async function sendEmail(input = {}) {
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const validTo = to.filter((addr) => typeof addr === 'string' && addr.includes('@'));
  if (!validTo.length) {
    return { ok: false, mode: 'mock', error: 'no_recipient' };
  }

  if (!isConfigured()) {
    // Mock-mode: logga + skippa. Säkrare än att kasta — boknings-flowet
    // ska aldrig brytas av email-failure.
    console.log('[resend] mock-mode (RESEND_API_KEY saknas) — skulle ha skickat:', {
      to: validTo,
      subject: input.subject,
    });
    return { ok: true, mode: 'mock' };
  }

  const apiKey = process.env.RESEND_API_KEY.trim();
  const from = input.from || resolveResendFrom();
  const replyTo = input.replyTo || resolveResendReplyTo();
  const payload = {
    from,
    to: validTo,
    subject: input.subject || '(no subject)',
    html: input.html || '',
    ...(input.text ? { text: input.text } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...(input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : {}),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[resend] send failed ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, mode: 'live', error: `http_${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, mode: 'live', messageId: data?.id || null };
  } catch (err) {
    console.error('[resend] send threw:', err instanceof Error ? err.message : err);
    return { ok: false, mode: 'live', error: 'network_error' };
  }
}

module.exports = {
  sendEmail,
  isConfigured,
  getResendRuntimeSummary,
};
