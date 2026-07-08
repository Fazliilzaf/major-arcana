'use strict';

/**
 * ccoPortalReplyNotification — patient-notis vid klinik-svar (följdsteg). När
 * personalen svarar i portalen skickas en kort transaktionell e-postnotis till
 * kunden ("du har ett nytt svar i din portal") med den magiska länken, så att
 * kunden kommer tillbaka till den fria kanalen i stället för att ringa/sms:a.
 *
 * Disciplin bevaras: utskicket går via ccoSendActionStore.performSend, som är
 * dry-run/mock som default (isDryRunDefault). Inget lämnar systemet på riktigt
 * förrän CCO_SEND_LIVE=1 + en riktig mailer är konfigurerad. Intent registreras
 * och auditeras oavsett. Idempotent länk via accessStore.issueToken.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

const { buildPortalUrl } = require('./ccoPortalNudge');

/**
 * Finkornig grind: låter BARA portal-notiser gå skarpt utan att öppna hela
 * mail-sändningen (CCO_SEND_LIVE). Läses per anrop så prod-konfig alltid vinner.
 *   - CCO_PORTAL_NOTIFY_LIVE=1  → portal-notiser försöker skickas på riktigt
 *     (kräver ändå RESEND_API_KEY hos mailern; annars mock).
 *   - annars → faller tillbaka på den globala grinden (CCO_SEND_LIVE via
 *     performSends isDryRunDefault). Inget annat utskick påverkas.
 */
function isPortalNotifyLive() {
  const v = String(process.env.CCO_PORTAL_NOTIFY_LIVE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * @param {{tenantId?:string, customerId:string, patientEmail?:string,
 *          patientName?:string, baseUrl?:string, forceLive?:boolean}} ref
 * @param {{accessStore:object, sendStore:object}} stores
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string, dryRun?:boolean, url?:string}>}
 */
async function notifyPatientOfPortalReply(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const customerId = text(ref.customerId);
  const patientEmail = text(ref.patientEmail);
  const patientName = text(ref.patientName);
  const { accessStore, sendStore } = stores;

  if (!customerId) return { status: 'skipped', reason: 'missing_customer_id' };
  if (!accessStore?.issueToken || !sendStore?.performSend) {
    return { status: 'skipped', reason: 'stores_unavailable' };
  }
  // Utan mottagar-e-post kan vi inte notifiera (kunden når portalen ändå via
  // sin sparade länk) — hoppa tyst.
  if (!patientEmail) return { status: 'skipped', reason: 'no_email' };

  const issued = await accessStore.issueToken({ tenantId, customerId });
  const url = buildPortalUrl(ref.baseUrl || process.env.PUBLIC_BASE_URL, issued.token);
  const hi = patientName ? `Hej ${patientName},` : 'Hej,';
  const payload = {
    kind: 'notification',
    to: patientEmail,
    subject: 'Du har ett nytt svar i din portal',
    html:
      `<p>${escapeHtml(hi)}</p>` +
      '<p>Kliniken har svarat dig i din trygga portal.</p>' +
      `<p><a href="${url}">Öppna portalen</a></p>` +
      '<p>Hair TP Clinic</p>',
    text: `${hi}\n\nKliniken har svarat dig i din trygga portal.\n\n${url}\n\nHair TP Clinic`,
    meta: { customerId, reason: 'portal_reply' },
  };

  // Finkornig grind: forceLive (test/anropare) eller CCO_PORTAL_NOTIFY_LIVE gör
  // att just portal-notisen försöker skickas skarpt (dryRunOverride:false). Annars
  // null → performSend följer den globala CCO_SEND_LIVE-grinden.
  const live = typeof ref.forceLive === 'boolean' ? ref.forceLive : isPortalNotifyLive();
  const result = await sendStore.performSend({
    kind: 'notification',
    payload,
    customerId,
    userId: 'automation:portal-reply-notify',
    dryRunOverride: live ? false : null,
  });

  return {
    status: result?.ok === false ? 'failed' : 'sent',
    dryRun: result?.mode === 'dry-run',
    mode: result?.mode || null,
    url,
  };
}

module.exports = { notifyPatientOfPortalReply, isPortalNotifyLive };
