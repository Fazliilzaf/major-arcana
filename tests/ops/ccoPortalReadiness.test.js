'use strict';

/* Portal-readiness (go-live-spegel). Ren env → status per utskicksgrind. Visar
 * bara på/av och om providers är konfigurerade — aldrig hemligheter. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPortalReadiness } = require('../../src/ops/ccoPortalReadiness');

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
    buildPortalReadiness({ CCO_SMS_LIVE: '1', ELKS_API_USERNAME: 'u' }).smsNudge,
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
