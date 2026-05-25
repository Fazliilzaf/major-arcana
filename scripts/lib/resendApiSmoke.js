'use strict';

/**
 * Resend API smoke — samma test som provision-resend-go-live-prod.sh.
 */
async function resendApiSmoke(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { ok: false, reason: 'missing_api_key' };

  const from = env.RESEND_FROM || 'Hair TP Clinic <booking@notifications.hairtpclinic.com>';
  const to = env.OPERATOR_NOTIFY_TO || env.RESEND_REPLY_TO || 'contact@hairtpclinic.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: '[Arcana] Resend verify smoke',
      html: '<p>Resend API verify smoke OK.</p>',
      reply_to: env.RESEND_REPLY_TO || 'contact@hairtpclinic.com',
    }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    messageId: body.id || null,
    error: body.message || body.error || null,
    status: res.status,
  };
}

module.exports = { resendApiSmoke };
