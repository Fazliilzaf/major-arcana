'use strict';

/* Portal-adoptionspanel i admin (följdsteg). Ny "Portal"-flik i CCO-panelraden
 * som läser /portal-metrics och visar volym/engagemang/nudge-konvertering. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);

test('Portal-fliken finns i panelraden och öppnar metrics-panelen', () => {
  assert.match(source, /key: 'portalmetrics'[\s\S]{0,60}openPortalMetrics\(\)/);
  assert.match(source, /function openPortalMetrics\(\)/);
});

test('panelen läser /portal-metrics med admin-auth (RBAC-grindad)', () => {
  assert.match(source, /'\/api\/v1\/cco\/runtime\/portal-metrics'/);
  assert.match(source, /adminAuthHeaders\(\{ 'x-cco-role': ROLE, 'x-cco-tenant': TENANT \}\)/);
  assert.match(source, /cache: 'no-store'/);
});

test('panelen visar besparings-proxy + nudge-konvertering', () => {
  assert.match(source, /Sparade SMS/);
  assert.match(source, /estimatedSmsAvoided/);
  assert.match(source, /nudgeConversion/);
  assert.match(source, /Engagerade patienter/);
  // Fel får inte krascha panelen.
  assert.match(source, /Kunde inte läsa portal-statistik/);
});

test('panelen visar aktiveringsstatus (go-live-spegel)', () => {
  assert.match(source, /'\/api\/v1\/cco\/runtime\/portal-readiness'/);
  assert.match(source, /Aktivering/);
  assert.match(source, /chip\('Patient-notis', r\.patientNotify\)/);
  assert.match(source, /chip\('SMS-nudge', r\.smsNudge\)/);
  assert.match(source, /chip\('Inbound-SMS', r\.inboundSms\)/);
  // Varnar visuellt när domänen inte är verifierad (live men sändningar failar).
  assert.match(source, /live_unverified/);
  assert.match(source, /domän ej verifierad/);
});
