'use strict';

/**
 * ccoPortalSmsNudge — SMS-nudge som SISTA utväg (följdsteg). För kunder som inte
 * öppnat portalen kan ett ENGÅNGS-SMS med djuplänk skickas så de flyttar över till
 * den fria kanalen. SMS kostar pengar → medveten, hårt grindad, idempotent.
 *
 * Grindar (allt måste vara sant för skarpt utskick):
 *   - CCO_SMS_LIVE=1 (eller ref.forceLive) — annars dry-run (skickar inget).
 *   - smsSender konfigurerad (46elks/Twilio via smsConnector) — annars skickas inget.
 *   - Kunden har inte redan fått en SMS-nudge (nudgeStore.wasSmsNudged).
 *
 * Ren funktion med injicerade beroenden — enhetstestbar utan nätverk.
 */

const { buildPortalUrl } = require('./ccoPortalNudge');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSmsLive() {
  const v = String(process.env.CCO_SMS_LIVE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function buildSmsBody({ url }) {
  // Kort, ett SMS-segment om möjligt. Inga streck (samma disciplin som övrig text).
  return `Hej! Du kan skriva till Hair TP Clinic gratis i din portal: ${url}`;
}

/**
 * @param {{tenantId?:string, customerId:string, phone?:string, patientName?:string,
 *          baseUrl?:string, from?:string, forceLive?:boolean}} ref
 * @param {{accessStore:object, smsSender:object, nudgeStore:object}} stores
 * @returns {Promise<{status:'sent'|'skipped'|'failed', reason?:string, dryRun?:boolean, url?:string}>}
 */
async function sendPortalSmsNudge(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const customerId = text(ref.customerId);
  const phone = text(ref.phone);
  const { accessStore, smsSender, nudgeStore } = stores;

  if (!customerId) return { status: 'skipped', reason: 'missing_customer_id' };
  if (!accessStore?.issueToken || !smsSender?.sendSms || !nudgeStore?.recordSmsNudge) {
    return { status: 'skipped', reason: 'stores_unavailable' };
  }
  if (!phone) return { status: 'skipped', reason: 'no_phone' };
  if (nudgeStore.wasSmsNudged?.({ tenantId, customerId })) {
    return { status: 'skipped', reason: 'already_sms_nudged' };
  }

  const live = typeof ref.forceLive === 'boolean' ? ref.forceLive : isSmsLive();
  const issued = await accessStore.issueToken({ tenantId, customerId });
  const url = buildPortalUrl(ref.baseUrl || process.env.PUBLIC_BASE_URL, issued.token);

  // Grinden AV → dry-run: skicka inget och markera INTE som nudgad (så det kan
  // skickas skarpt senare när grinden öppnas).
  if (!live) {
    return { status: 'skipped', reason: 'sms_gate_off', dryRun: true, url };
  }

  const result = await smsSender.sendSms({
    to: phone,
    message: buildSmsBody({ url }),
    from: text(ref.from) || undefined,
  });

  if (!result || result.ok === false) {
    return { status: 'failed', reason: result?.error || 'send_failed', url };
  }

  // Bara vid faktiskt lyckat utskick markeras kunden som SMS-nudgad (idempotens).
  await nudgeStore.recordSmsNudge({ tenantId, customerId });
  return { status: 'sent', dryRun: false, url, messageId: result.messageId || null };
}

module.exports = { sendPortalSmsNudge, isSmsLive, buildSmsBody };
