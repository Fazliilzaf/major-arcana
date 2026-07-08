'use strict';

/**
 * ccoPortalReadiness — spegel av aktiveringsstatusen för portal-kanalens utskick.
 * Läser BARA på/av-flaggor och om providers är konfigurerade — avslöjar aldrig
 * hemligheter (nycklar/lösenord). Gör go-live-checklistan verifierbar inifrån
 * appen: "vad är skarpt just nu?".
 *
 * Ren funktion över ett env-objekt (default process.env) — enkel att enhetstesta.
 */

function truthy(value) {
  const s = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function has(value) {
  return Boolean(String(value == null ? '' : value).trim());
}

function buildPortalReadiness(env = process.env) {
  const sendLive = truthy(env.CCO_SEND_LIVE);
  const portalNotifyGate = truthy(env.CCO_PORTAL_NOTIFY_LIVE);
  const resendConfigured = has(env.RESEND_API_KEY);

  const smsNudgeGate = truthy(env.CCO_SMS_LIVE);
  const smsProvider = String(env.SMS_PROVIDER || '')
    .trim()
    .toLowerCase();
  const elksConfigured = has(env.ELKS_API_USERNAME) && has(env.ELKS_API_PASSWORD);
  const twilioConfigured =
    has(env.TWILIO_ACCOUNT_SID) && has(env.TWILIO_AUTH_TOKEN) && has(env.TWILIO_FROM_NUMBER);
  let smsProviderConfigured = elksConfigured || twilioConfigured;
  if (smsProvider === 'twilio') smsProviderConfigured = twilioConfigured;
  if (smsProvider === '46elks') smsProviderConfigured = elksConfigured;
  const inboundSmsConfigured = has(env.ELKS_INBOUND_SECRET);

  const publicBaseUrlSet = has(env.PUBLIC_BASE_URL);

  // "Effektivt" = grinden öppen OCH providern konfigurerad → skickar på riktigt.
  const patientNotifyLive = (portalNotifyGate || sendLive) && resendConfigured;
  const smsNudgeLive = smsNudgeGate && smsProviderConfigured;

  return {
    // Sammanfattande status per funktion (det personalen/ops bryr sig om).
    patientNotify: patientNotifyLive ? 'live' : 'dry-run',
    smsNudge: smsNudgeLive ? 'live' : 'off',
    inboundSms: inboundSmsConfigured ? 'active' : 'off',
    // Detaljer bakom varje status (bara booleans, inga hemligheter).
    detail: {
      mail: {
        globalLive: sendLive,
        portalNotifyGate,
        resendConfigured,
      },
      sms: {
        nudgeGate: smsNudgeGate,
        providerConfigured: smsProviderConfigured,
        inboundConfigured: inboundSmsConfigured,
      },
      publicBaseUrlSet,
    },
  };
}

module.exports = { buildPortalReadiness };
