'use strict';

/**
 * ccoInboundSmsIngest — tar emot ett inkommande SMS (från 46elks/Twilio-webhook)
 * och lägger det i kundens meddelandetråd som ett inbound-meddelande med
 * channel:'sms'. Därmed dyker SMS-svar upp i SAMMA notis-feed och Svarstudio-
 * panel som portal-meddelanden — en enad inkorg.
 *
 * Kundmatchning: avsändarnumret slås mot patientMasterStore (findPatientByPhone).
 * Okänt nummer tappas ALDRIG — det lagras under en telefon-nyckel (sms:+46…) så
 * personalen kan se och triagera det.
 *
 * Ren funktion med injicerade beroenden — enhetstestbar utan nätverk.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// E.164-ish normalisering för nyckel/uppslag (behåll + och siffror).
function normalizePhone(value) {
  const v = text(value);
  if (!v) return '';
  const digits = v.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? '+' + digits.slice(1).replace(/\D/g, '') : digits;
}

/**
 * @param {{from?:string, to?:string, message?:string, providerId?:string, tenantId?:string}} sms
 * @param {{messageStore:object, patientMasterStore?:object, auditLog?:object}} stores
 * @returns {Promise<{status:'stored'|'skipped', reason?:string, customerId?:string, matched?:boolean}>}
 */
async function ingestInboundSms(sms = {}, stores = {}) {
  const tenantId = text(sms.tenantId) || 'hairtpclinic';
  const from = normalizePhone(sms.from);
  const body = text(sms.message);
  const { messageStore, patientMasterStore = null, auditLog = null } = stores;

  if (!messageStore?.appendMessage) return { status: 'skipped', reason: 'store_unavailable' };
  if (!from) return { status: 'skipped', reason: 'missing_sender' };
  if (!body) return { status: 'skipped', reason: 'empty_message' };

  // Matcha avsändaren mot en känd kund; annars telefon-nyckel så inget tappas.
  let customerId = '';
  let matched = false;
  if (patientMasterStore?.findPatientByPhone) {
    try {
      const patient = await patientMasterStore.findPatientByPhone({ tenantId, phone: from });
      const pid = text(patient?.id) || text(patient?.patientId);
      if (pid) {
        customerId = pid;
        matched = true;
      }
    } catch {
      /* uppslag valfritt — faller tillbaka på telefon-nyckel */
    }
  }
  if (!customerId) customerId = 'sms:' + from;

  const message = await messageStore.appendMessage({
    tenantId,
    customerId,
    direction: 'inbound',
    channel: 'sms',
    body,
    author: 'patient',
  });

  try {
    auditLog?.append?.({
      action: 'portal.sms.inbound',
      actor: { role: 'system', userId: 'sms:inbound' },
      target: { kind: 'portal_message', id: message.id, tenantId },
      result: 'ok',
      detail: {
        matched,
        customerId,
        providerId: text(sms.providerId) || null,
        fromSuffix: from.slice(-4),
      },
    });
  } catch {
    /* audit får aldrig fälla ingesten */
  }

  return { status: 'stored', customerId, matched, messageId: message.id };
}

module.exports = { ingestInboundSms, normalizePhone };
