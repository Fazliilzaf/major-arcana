'use strict';

/* Portal-readiness (go-live-spegel). Ren env → status per utskicksgrind. Visar
 * bara på/av och om providers är konfigurerade — aldrig hemligheter. */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPortalReadiness,
  checkResendDomainVerified,
} = require('../../src/ops/ccoPortalReadiness');

test('allt av → dry-run/off', () => {
  const r = buildPortalReadiness({});
  assert.equal(r.patientNotify, 'dry-run');
  assert.equal(r.smsNudge, 'off');
  assert.equal(r.inboundSms, 'off');
});

test('patient-notis live kräver BÅDE grind OCH resend-nyckel', () => {
  // Grind på men ingen nyckel → fortfarande dry-run.
  assert.equal(buildPortalReadiness({ CCO_PORTAL_NOTIFY_LIVE: '1' }).patientNotify, 'dry-run');
  // Nyckel men ingen grind → dry-run.
  assert.equal(buildPortalReadiness({ RESEND_API_KEY: 're_x' }).patientNotify, 'dry-run');
  // Båda → live.
  assert.equal(
    buildPortalReadiness({ CCO_PORTAL_NOTIFY_LIVE: '1', RESEND_API_KEY: 're_x' }).patientNotify,
    'live'
  );
  // Global grind räcker också (om resend finns).
  assert.equal(
    buildPortalReadiness({ CCO_SEND_LIVE: 'true', RESEND_API_KEY: 're_x' }).patientNotify,
    'live'
  );
});

test('SMS-nudge live kräver grind + provider', () => {
  assert.equal(buildPortalReadiness({ CCO_SMS_LIVE: '1' }).smsNudge, 'off');
  assert.equal(
    buildPortalReadiness({ CCO_SMS_LIVE: '1', SMS_PROVIDER: '46elks' }).smsNudge,
    'off'
  );
  assert.equal(
    buildPortalReadiness({ CCO_SMS_LIVE: '1', ELKS_API_USERNAME: 'u' }).smsNudge,
    'off'
  );
  assert.equal(
    buildPortalReadiness({ CCO_SMS_LIVE: '1', ELKS_API_USERNAME: 'u', ELKS_API_PASSWORD: 'p' })
      .smsNudge,
    'live'
  );
  assert.equal(
    buildPortalReadiness({
      CCO_SMS_LIVE: '1',
      SMS_PROVIDER: 'twilio',
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_FROM_NUMBER: '+4670',
    }).smsNudge,
    'live'
  );
});

test('inbound-SMS active när hemligheten är satt', () => {
  assert.equal(buildPortalReadiness({ ELKS_INBOUND_SECRET: 's' }).inboundSms, 'active');
});

test('avslöjar ALDRIG hemligheter — bara booleans/status', () => {
  const r = buildPortalReadiness({
    RESEND_API_KEY: 're_SUPERSECRET',
    ELKS_INBOUND_SECRET: 'HEMLIG',
    ELKS_API_PASSWORD: 'PW',
  });
  const s = JSON.stringify(r);
  assert.doesNotMatch(s, /SUPERSECRET/);
  assert.doesNotMatch(s, /HEMLIG/);
  assert.doesNotMatch(s, /\bPW\b/);
  // Men statusen syns.
  assert.equal(r.detail.mail.resendConfigured, true);
  assert.equal(r.detail.sms.inboundConfigured, true);
});

// ── Domän-verifiering (checkResendDomainVerified) ────────────────────────────

function fakeFetch(payload, ok = true, status = 200) {
  return async () => ({
    ok,
    status,
    json: async () => payload,
  });
}

test('utan nyckel → checked:false (no_key), inget nätverksanrop', async () => {
  const r = await checkResendDomainVerified({ env: {}, fetchImpl: fakeFetch({}) });
  assert.equal(r.checked, false);
  assert.equal(r.reason, 'no_key');
});

test('verifierad domän → verified:true', async () => {
  const env = { RESEND_API_KEY: 're_x', RESEND_DOMAIN: 'notifications.hairtpclinic.com' };
  const payload = { data: [{ name: 'notifications.hairtpclinic.com', status: 'verified' }] };
  const r = await checkResendDomainVerified({ env, fetchImpl: fakeFetch(payload) });
  assert.equal(r.checked, true);
  assert.equal(r.verified, true);
  assert.equal(r.status, 'verified');
});

test('overifierad domän → verified:false (pending)', async () => {
  const env = { RESEND_API_KEY: 're_x', RESEND_DOMAIN: 'notifications.hairtpclinic.com' };
  const payload = { data: [{ name: 'notifications.hairtpclinic.com', status: 'pending' }] };
  const r = await checkResendDomainVerified({ env, fetchImpl: fakeFetch(payload) });
  assert.equal(r.checked, true);
  assert.equal(r.verified, false);
  assert.equal(r.status, 'pending');
});

test('domän saknas i Resend → verified:false (not_found)', async () => {
  const env = { RESEND_API_KEY: 're_x', RESEND_DOMAIN: 'notifications.hairtpclinic.com' };
  const r = await checkResendDomainVerified({ env, fetchImpl: fakeFetch({ data: [] }) });
  assert.equal(r.verified, false);
  assert.equal(r.status, 'not_found');
});

test('nätverksfel/timeout → checked:false, aldrig kast', async () => {
  const env = { RESEND_API_KEY: 're_x' };
  const r = await checkResendDomainVerified({
    env,
    fetchImpl: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(r.checked, false);
  assert.equal(r.reason, 'check_failed');
});
