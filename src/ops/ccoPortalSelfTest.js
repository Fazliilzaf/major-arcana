'use strict';

/**
 * ccoPortalSelfTest — kör hela portal-loopen som ett diagnostiskt självtest och
 * rapporterar grönt/rött per steg. Gör go-live verifierbart inifrån appen utan
 * att gissa: "fungerar mint → notis → domän skarpt just nu?".
 *
 * Steg:
 *   1. Konfiguration  — grind på + Resend-nyckel finns? (buildPortalReadiness)
 *   2. Resend-domän   — är avsändardomänen verifierad? (checkResendDomainVerified)
 *   3. Portal-länk    — går det att mynta en magisk token? (accessStore.issueToken)
 *   4. Notis          — går notis-pipelinen? Dry-run som default (inget mejl),
 *                       eller skarpt testmejl till en adress när live=true.
 *
 * Säkert som default: utan live=true skickas INGET mejl (dry-run). Återanvänder
 * exakt samma stores/op:ar som den riktiga loopen. Ren funktion med injicerade
 * beroenden — enhetstestbar utan nätverk.
 */

const { buildPortalReadiness, checkResendDomainVerified } = require('./ccoPortalReadiness');
const { notifyPatientOfPortalReply } = require('./ccoPortalReplyNotification');
const { buildPortalUrl } = require('./ccoPortalNudge');

const SELFTEST_CUSTOMER_ID = 'portal-selftest';

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeEmail(v) {
  const s = text(v).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Visa basen + maskerad token (token är en levande access-nyckel). */
function maskUrl(url) {
  return String(url || '').replace(/\/portal-chat\/([^/?#]{0,6})[^/?#]*/, '/portal-chat/$1…');
}

/**
 * @param {{tenantId?:string, email?:string, name?:string, live?:boolean}} ref
 * @param {{accessStore:object, sendStore:object, env?:object, fetchImpl?:Function}} stores
 * @returns {Promise<{ok:boolean, live:boolean, url?:string, steps:Array}>}
 */
async function runPortalLoopSelfTest(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const email = normalizeEmail(ref.email);
  const name = text(ref.name);
  const { accessStore, sendStore, env = process.env, fetchImpl } = stores;
  const wantLiveSend = ref.live === true && Boolean(email);
  const steps = [];

  // 1. Konfiguration.
  const readiness = buildPortalReadiness(env);
  const notifyLive = readiness.patientNotify !== 'dry-run';
  const resendConfigured = readiness.detail.mail.resendConfigured;
  steps.push({
    key: 'config',
    label: 'Konfiguration',
    ok: resendConfigured && notifyLive,
    status: readiness.patientNotify,
    detail: !resendConfigured
      ? 'RESEND_API_KEY saknas → mock/dry-run'
      : notifyLive
        ? 'Grind på + Resend-nyckel finns'
        : 'Resend-nyckel finns men grinden (CCO_PORTAL_NOTIFY_LIVE) är av → dry-run',
  });

  // 2. Resend-domän verifierad.
  const domain = await checkResendDomainVerified({ env, fetchImpl });
  steps.push({
    key: 'domain',
    label: 'Resend-domän verifierad',
    ok: domain.checked ? domain.verified === true : false,
    status: domain.checked ? domain.status || 'unknown' : domain.reason || 'unknown',
    detail: !domain.checked
      ? `Kunde inte kontrollera (${domain.reason || 'okänt'})`
      : domain.verified
        ? `${domain.domain} är verifierad`
        : `${domain.domain || 'domänen'} är INTE verifierad (${domain.status}) → sändningar failar`,
  });

  // 3. Portal-länk (mynta token).
  let url = '';
  let mintOk = false;
  if (typeof accessStore?.issueToken === 'function') {
    try {
      const issued = await accessStore.issueToken({ tenantId, customerId: SELFTEST_CUSTOMER_ID });
      if (issued?.token) {
        url = buildPortalUrl(env.PUBLIC_BASE_URL, issued.token);
        mintOk = true;
      }
    } catch (_e) {
      mintOk = false;
    }
  }
  steps.push({
    key: 'mint',
    label: 'Portal-länk (mynta token)',
    ok: mintOk,
    status: mintOk ? 'ok' : 'failed',
    detail: mintOk
      ? `Länk myntad: ${maskUrl(url)}`
      : 'Kunde inte mynta token (accessStore saknas?)',
  });

  // 4. Notis-pipeline. Dry-run som default; skarpt bara när live=true + adress.
  let notify = { status: 'skipped', reason: 'stores_unavailable' };
  if (typeof sendStore?.performSend === 'function' && mintOk) {
    notify = await notifyPatientOfPortalReply(
      {
        tenantId,
        customerId: SELFTEST_CUSTOMER_ID,
        patientEmail: email || 'selftest@example.com',
        patientName: name,
        baseUrl: env.PUBLIC_BASE_URL,
        forceLive: wantLiveSend,
      },
      { accessStore, sendStore }
    );
  }
  const sent = notify.status === 'sent';
  const isDry = notify.dryRun === true || notify.mode === 'dry-run' || notify.mode === 'mock';
  steps.push({
    key: 'notify',
    label: wantLiveSend ? 'Notis skickad (skarpt)' : 'Notis-pipeline (dry-run)',
    ok: wantLiveSend ? sent && !isDry : sent,
    status: notify.status + (notify.mode ? `/${notify.mode}` : ''),
    detail: wantLiveSend
      ? sent && !isDry
        ? `Skarpt mejl skickat till ${maskEmail(email)} (${notify.mode || 'live'})`
        : sent && isDry
          ? 'Grinden är av → hamnade i dry-run, inget mejl skickat'
          : `Kunde inte skicka (${notify.reason || notify.status})`
      : sent
        ? 'Pipeline OK (dry-run, inget mejl skickat)'
        : `Pipeline-fel (${notify.reason || notify.status})`,
  });

  return {
    ok: steps.every((s) => s.ok),
    live: wantLiveSend,
    url: url ? maskUrl(url) : '',
    steps,
  };
}

module.exports = { runPortalLoopSelfTest, maskUrl, SELFTEST_CUSTOMER_ID };
