'use strict';

/**
 * ccoPortalReplyNotification — patient-notis vid klinik-svar (följdsteg). När
 * personalen svarar i portalen skickas en kort transaktionell e-postnotis till
 * kunden ("du har ett nytt svar i din portal") med den magiska länken, så att
 * kunden kommer tillbaka till den fria kanalen i stället för att ringa/sms:a.
 *
 * ORD-125: notisen skickas inte längre från hårdkodad HTML utan UR EN MALL i
 * registret (ccoTemplateRegistry, id `portal_reply_notify`). Anropet går genom
 * `resolveSnapshot` → `snapshotForSend`, så den juridiska grinden
 * (TEMPLATE_NOT_LEGALLY_APPROVED vid legalReviewStatus !== 'approved') gäller.
 * Kroppen byggs ur revisionens subject/body via ccoMessageRenderer.renderMessage
 * (en saknad variabel stoppar med TEMPLATE_MISSING_VARIABLE — en patient ska
 * aldrig se råa {{namn}}).
 *
 * FAIL-CLOSED: ccoSendActionStore.resolveSnapshot degraderar tyst vid 404 (saknad
 * mall). Det är fel här — om mallposten saknas ska notisen INTE skickas. Vi löser
 * upp snapshot:en själv och returnerar `{ status:'skipped', reason:'template_unavailable' }`
 * i stället för att falla tillbaka på hårdkodad text.
 *
 * Disciplin bevaras: utskicket går via ccoSendActionStore.performSend, som är
 * dry-run/mock som default (isDryRunDefault). Inget lämnar systemet på riktigt
 * förrän CCO_SEND_LIVE=1 + en riktig mailer är konfigurerad. Intent registreras
 * och auditeras oavsett. Idempotent länk via accessStore.issueToken.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const { buildPortalUrl } = require('./ccoPortalNudge');
const { renderMessage } = require('./ccoMessageRenderer');
const { HAIR_TP_CANONICAL } = require('../tenant/tenantIdCanonical');

const PORTAL_REPLY_TEMPLATE_REF = 'portal_reply_notify';
const PORTAL_REPLY_TEMPLATE_LANG = 'sv';

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
 * @param {{accessStore:object, sendStore:object, templateRegistry?:object}} stores
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string, dryRun?:boolean, url?:string}>}
 */
async function notifyPatientOfPortalReply(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || HAIR_TP_CANONICAL;
  const customerId = text(ref.customerId);
  const patientEmail = text(ref.patientEmail);
  const patientName = text(ref.patientName);
  const { accessStore, sendStore, templateRegistry } = stores;

  if (!customerId) return { status: 'skipped', reason: 'missing_customer_id' };
  if (!accessStore?.issueToken || !sendStore?.performSend) {
    return { status: 'skipped', reason: 'stores_unavailable' };
  }
  // Utan mottagar-e-post kan vi inte notifiera (kunden når portalen ändå via
  // sin sparade länk) — hoppa tyst.
  if (!patientEmail) return { status: 'skipped', reason: 'no_email' };
  // Vi skickar aldrig från hårdkodad text längre: registret med `snapshotForSend`
  // är ett hårt krav. Saknas det → fail-closed, ingen sändning.
  if (typeof templateRegistry?.snapshotForSend !== 'function') {
    return { status: 'skipped', reason: 'template_unavailable' };
  }

  // FAIL-CLOSED (ORD-125): lös upp snapshot:en från mallen. `snapshotForSend`
  // kastar en 404 och `resolveSnapshot` i ccoSendActionStore skulle svälja den
  // tyst — det får den inte göra här. Saknas mallposten skickar vi INTE.
  let snapshot;
  try {
    snapshot = templateRegistry.snapshotForSend(
      PORTAL_REPLY_TEMPLATE_REF,
      PORTAL_REPLY_TEMPLATE_LANG
    );
  } catch (err) {
    if (err && err.statusCode === 404) {
      return { status: 'skipped', reason: 'template_unavailable' };
    }
    // TEMPLATE_NOT_LEGALLY_APPROVED (och allt annat) propaguerar — grinden gäller.
    throw err;
  }
  if (!snapshot) return { status: 'skipped', reason: 'template_unavailable' };

  const issued = await accessStore.issueToken({ tenantId, customerId });
  const url = buildPortalUrl(ref.baseUrl || process.env.PUBLIC_BASE_URL, issued.token);
  const firstName = patientName.split(/\s+/)[0] || '';

  // Rendera UR revisionen (subject/body). Saknad variabel → TEMPLATE_MISSING_VARIABLE
  // stoppar utskicket, så en patient aldrig ser råa {{namn}}.
  const message = renderMessage(snapshot, { firstName, portalUrl: url });

  const payload = {
    kind: 'notification',
    to: patientEmail,
    subject: message.subject,
    html: message.html,
    text: message.text,
    meta: { customerId, reason: 'portal_reply', templateRef: PORTAL_REPLY_TEMPLATE_REF },
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
    templateRef: PORTAL_REPLY_TEMPLATE_REF,
    templateLang: PORTAL_REPLY_TEMPLATE_LANG,
  });

  return {
    status: result?.ok === false ? 'failed' : 'sent',
    dryRun: result?.mode === 'dry-run',
    mode: result?.mode || null,
    url,
  };
}

module.exports = {
  notifyPatientOfPortalReply,
  isPortalNotifyLive,
  PORTAL_REPLY_TEMPLATE_REF,
  PORTAL_REPLY_TEMPLATE_LANG,
};
