'use strict';

/**
 * SMS Connector — multi-provider support.
 *
 * Supported providers:
 * - 46elks (Swedish SMS API, GDPR-compliant EU)
 * - Twilio (global fallback)
 *
 * Env:
 *   SMS_PROVIDER=46elks|twilio
 *   ELKS_API_USERNAME + ELKS_API_PASSWORD (46elks)
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER (Twilio)
 *   SMS_FROM_NUMBER (sender for 46elks, e.g. "HairTP")
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

function resolveProvider() {
  const provider = normalizeText(process.env.SMS_PROVIDER).toLowerCase();
  if (provider === 'twilio') return 'twilio';
  if (provider === '46elks' || normalizeText(process.env.ELKS_API_USERNAME)) return '46elks';
  if (normalizeText(process.env.TWILIO_ACCOUNT_SID)) return 'twilio';
  return 'none';
}

function isConfigured() {
  return resolveProvider() !== 'none';
}

async function send46elks({ to, message, from, dryrun = false }) {
  const username = normalizeText(process.env.ELKS_API_USERNAME);
  const password = normalizeText(process.env.ELKS_API_PASSWORD);
  if (!username || !password) {
    return { ok: false, error: 'elks_not_configured' };
  }

  const sender = normalizeText(from) || normalizeText(process.env.SMS_FROM_NUMBER) || 'HairTP';
  const form = { from: sender, to, message };
  // 46elks `dryrun=yes` validerar autentisering + avsändare + format och
  // returnerar ett svar med ett dryrun-id — utan att skicka eller debitera.
  if (dryrun) form.dryrun = 'yes';
  const body = new URLSearchParams(form);

  try {
    const res = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: 'elks_api_error', status: res.status, details: data };
    return {
      ok: true,
      messageId: data.id,
      provider: '46elks',
      to,
      sentAt: nowIso(),
      dryrun: Boolean(dryrun),
    };
  } catch (err) {
    return { ok: false, error: 'elks_network_error', message: err.message };
  }
}

async function sendTwilio({ to, message, from }) {
  const accountSid = normalizeText(process.env.TWILIO_ACCOUNT_SID);
  const authToken = normalizeText(process.env.TWILIO_AUTH_TOKEN);
  const fromNumber = normalizeText(from) || normalizeText(process.env.TWILIO_FROM_NUMBER);
  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, error: 'twilio_not_configured' };
  }

  const body = new URLSearchParams({ To: to, From: fromNumber, Body: message });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );
    const data = await res.json();
    if (!res.ok) return { ok: false, error: 'twilio_api_error', status: res.status, details: data };
    return { ok: true, messageId: data.sid, provider: 'twilio', to, sentAt: nowIso() };
  } catch (err) {
    return { ok: false, error: 'twilio_network_error', message: err.message };
  }
}

async function sendSms({ to, message, from, dryrun = false }) {
  const phone = normalizeText(to);
  if (!phone) return { ok: false, error: 'missing_recipient' };
  if (!normalizeText(message)) return { ok: false, error: 'missing_message' };

  // ORD-147 §3 — sändgränsspärr (fail-closed) på mottagarens telefonnummer.
  // Personal/drift-larm (ccoStaff, uptimeMonitor) går också här igenom, men deras
  // nummer matchar aldrig en avliden patient.
  const { assertNotDeceased } = require('../ops/ccoDeceasedSendGuard');
  await assertNotDeceased({ phone });

  const provider = resolveProvider();
  switch (provider) {
    case '46elks':
      return send46elks({ to: phone, message, from, dryrun });
    case 'twilio':
      return sendTwilio({ to: phone, message, from });
    default:
      return {
        ok: false,
        error: 'sms_not_configured',
        message: 'Ingen SMS-provider konfigurerad. Sätt SMS_PROVIDER + credentials.',
      };
  }
}

/**
 * Klinikens telefonnummer i utgående SMS.
 *
 * Utskicken går med avsändarnamnet "HairTP", ett text-sender-ID. 46elks kan
 * inte ta emot svar på ett sådant — mottagaren ser ett namn, inte ett nummer,
 * och har ingen väg tillbaka. Texterna bad tidigare kunden avboka respektive
 * "kontakta oss" utan att säga hur. Numret måste därför stå i meddelandet.
 *
 * Ändras det här: kontrollera teckenlängden. Gränsen för ett SMS är 160 tecken
 * i GSM 03.38, och varje del därutöver kostar ett helt SMS till. Å, ä och ö
 * ingår i teckenuppsättningen och kostar inget extra — men en emoji tvingar
 * hela meddelandet till UTF-16 och sänker gränsen till 70.
 */
const CLINIC_PHONE = '+4631881166';

function buildBookingReminderSms({
  patientName,
  serviceName,
  date,
  time,
  clinicName = 'Hair TP Clinic',
  clinicPhone = CLINIC_PHONE,
}) {
  return `Hej ${patientName}! Påminnelse om din tid: ${serviceName} ${date} kl ${time} på ${clinicName}. Avboka senast 24h före: ${clinicPhone}. Välkommen!`;
}

function buildCancellationSms({
  patientName,
  serviceName,
  date,
  time,
  clinicPhone = CLINIC_PHONE,
}) {
  return `Hej ${patientName}. Din bokning ${serviceName} ${date} kl ${time} är avbokad. Ring ${clinicPhone} för ny tid.`;
}

function buildFormReminderSms({ patientName, formName, portalUrl }) {
  return `Hej ${patientName}! Fyll i ${formName} före ditt besök: ${portalUrl}`;
}

module.exports = {
  sendSms,
  isConfigured,
  resolveProvider,
  buildBookingReminderSms,
  buildCancellationSms,
  buildFormReminderSms,
};
