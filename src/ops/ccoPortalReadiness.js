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

/**
 * Kollar om Resend-sändomänen är VERIFIERAD (SPF/DKIM klart hos Resend). Detta är
 * ett tillstånd HOS Resend, inte en env-flagga — därför ett valfritt async-anrop.
 * Fångar fallet "readiness=live men domänen inte verifierad → sändningar failar".
 *
 * Robust: utan nyckel eller vid nätverksfel returneras `checked:false` (okänt) —
 * aldrig ett kast, aldrig blockering (kort timeout).
 *
 * @param {{env?:object, fetchImpl?:Function, timeoutMs?:number}} opts
 * @returns {Promise<{checked:boolean, verified?:boolean, status?:string, domain?:string, reason?:string}>}
 */
async function checkResendDomainVerified({ env = process.env, fetchImpl, timeoutMs = 4000 } = {}) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { checked: false, reason: 'no_key' };
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl : global.fetch;
  if (typeof doFetch !== 'function') return { checked: false, reason: 'no_fetch' };

  let domain = '';
  try {
    domain = require('../infra/resendConfig').resolveResendDomain(env);
  } catch {
    domain = '';
  }

  let timer = null;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await doFetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) return { checked: false, reason: `http_${res.status}`, domain };
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const match = list.find(
      (d) => String(d?.name || '').toLowerCase() === String(domain || '').toLowerCase()
    );
    if (!match) return { checked: true, verified: false, status: 'not_found', domain };
    const status = String(match.status || '').toLowerCase();
    return { checked: true, verified: status === 'verified', status: status || 'unknown', domain };
  } catch {
    return { checked: false, reason: 'check_failed', domain };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { buildPortalReadiness, checkResendDomainVerified };
