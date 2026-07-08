'use strict';

/* Kompose-vy för nytt mail (följdsteg). Ny "✉ Nytt mail"-flik som POST:ar till
 * compose-new-mail och skapar ett needs_approval-utkast (skickar aldrig direkt). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);

test('Nytt mail-fliken finns och öppnar kompose-vyn', () => {
  assert.match(source, /key: 'nyttmail'[\s\S]{0,60}openComposeNewMail\(\)/);
  assert.match(source, /function openComposeNewMail\(\)/);
});

test('kompose POST:ar till compose-new-mail med admin-auth', () => {
  assert.match(source, /'\/api\/v1\/cco\/runtime\/compose-new-mail'/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /adminAuthHeaders\(/);
});

test('kanalval (graph/resend) + kontrollerad kedja (godkännande, aldrig direkt-send)', () => {
  assert.match(source, /value: 'graph'/);
  assert.match(source, /value: 'resend'/);
  assert.match(source, /väntar på godkännande/);
  // Fältvalidering innan submit.
  assert.match(source, /Fyll i mottagare, ämne och text/);
});

test('flytande snabbknapp (FAB) alltid nåbar, öppnar kompose-vyn', () => {
  assert.match(source, /function mountComposeFab\(\)/);
  assert.match(source, /id = 'ccoComposeFab'/);
  assert.match(source, /position:fixed/);
  assert.match(source, /openComposeNewMail\(\)/);
  // Monteras vid init + finns i action-dispatchen.
  assert.match(source, /mountComposeFab\(\);/);
  assert.match(source, /action === 'nyttmail'/);
});

test('portal-inbjudan: toggle bäddar in en personlig länk (fri kanal)', () => {
  assert.match(source, /Bjud in till portalen/);
  assert.match(source, /includePortalLink: portalChk\.checked/);
  // Live-preview speglar att en länk bifogas.
  assert.match(source, /portalLinkIncluded/);
});

test('spara som mall: egna snabbstartsmallar i localStorage', () => {
  assert.match(source, /Spara som mall/);
  assert.match(source, /cco_compose_templates_v1/);
  assert.match(source, /function loadCustomComposeTemplates\(\)/);
  assert.match(source, /function saveCustomComposeTemplates\(/);
  // Egna kort går att ta bort och sätts ihop med de inbyggda.
  assert.match(source, /Ta bort mall/);
  assert.match(source, /COMPOSE_TEMPLATES\.concat\(loadCustomComposeTemplates\(\)\)/);
});

test('owner-genväg: godkänn & skicka nu mot compose-send-endpointen', () => {
  assert.match(source, /ROLE === 'owner'[\s\S]{0,40}showSendNow/);
  assert.match(
    source,
    /'\/api\/v1\/cco\/runtime\/compose-new-mail\/' \+ encodeURIComponent\(draftId\) \+ '\/send'/
  );
  assert.match(source, /Godkänn & skicka nu/);
  // Grind-av visas tydligt, inte som ett fel.
  assert.match(source, /compose_gate_off/);
});
