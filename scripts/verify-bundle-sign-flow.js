#!/usr/bin/env node
'use strict';

/**
 * ORD-7 — Bundle sign flow (avtal + behandlingssamtycke, egen esign, ingen GetAccept).
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const ROUTES = path.join(REPO, 'src/routes/ccoTreatmentAgreement.js');
const BUNDLE = path.join(REPO, 'src/ops/ccoTreatmentAgreementBundle.js');
const RUNTIME = path.join(REPO, 'src/ops/meridiqConsentCatalogRuntime.js');
const DOC = path.join(REPO, 'src/ops/ccoTreatmentAgreementDocument.js');
const STORE = path.join(REPO, 'src/ops/ccoTreatmentAgreementStore.js');

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const routesSrc = fs.readFileSync(ROUTES, 'utf8');
for (const [needle, label] of [
  ['assertBundleReadyToSend', 'send-for-sign bundle gate'],
  ['bundle_signed_public', 'accept-public audit event'],
  ['parsePublicConsentAck', 'accept-public consent ack'],
  ['resolveConsentTemplateForAgreement', 'sign-page consent resolve'],
  ['consentBundle', 'sign-page consentBundle prop'],
]) {
  if (!routesSrc.includes(needle)) fail(`ccoTreatmentAgreement.js saknar ${label}`);
  else pass(`routes → ${label}`);
}

if (routesSrc.includes('getaccept') || routesSrc.includes('GetAccept')) {
  fail('GetAccept får inte refereras i treatment agreement routes (ORD-7)');
} else {
  pass('ingen GetAccept i routes');
}

const docSrc = fs.readFileSync(DOC, 'utf8');
if (!docSrc.includes('consent_ack')) {
  fail('sign page saknar consent_ack checkbox');
} else {
  pass('sign page consent_ack');
}

const bundleSrc = fs.readFileSync(BUNDLE, 'utf8');
for (const status of ['missing_consent_template', 'ready_to_send', 'sent', 'signed']) {
  if (!bundleSrc.includes(status)) fail(`bundleStatus enum saknar ${status}`);
  else pass(`bundleStatus ${status}`);
}

const storeSrc = fs.readFileSync(STORE, 'utf8');
if (!storeSrc.includes('bundleStatus') || !storeSrc.includes('normalizeConsentState')) {
  fail('store saknar bundle/consent fält');
} else {
  pass('store bundle + consent');
}

if (!fs.existsSync(RUNTIME)) {
  fail('meridiqConsentCatalogRuntime.js saknas');
} else {
  pass('meridiqConsentCatalogRuntime finns');
}

const { resolveTemplate } = require('../src/ops/meridiqConsentCatalogRuntime');
const {
  assertBundleReadyToSend,
  parsePublicConsentAck,
} = require('../src/ops/ccoTreatmentAgreementBundle');

const tpl = resolveTemplate('fue');
if (!tpl.found || tpl.template.apiId !== 170917) {
  fail('resolveTemplate(fue) ska hitta apiId 170917');
} else {
  pass('resolveTemplate(fue) → 170917');
}

const blocked = assertBundleReadyToSend({
  agreementStatus: 'draft',
  treatmentType: 'fue',
});
if (blocked.allowed || blocked.bundleStatus !== 'missing_consent_template') {
  fail('assertBundleReadyToSend ska blockera utan avtalsdokument');
} else {
  pass('assertBundleReadyToSend blockerar utan dokument');
}

if (!parsePublicConsentAck({ consent_ack: 'on' })) {
  fail('parsePublicConsentAck ska acceptera consent_ack=on');
} else {
  pass('parsePublicConsentAck');
}

if (failed) {
  console.error(`\n${failed} failure(s).`);
  process.exit(1);
}
console.log('\nAll ORD-7 bundle sign flow checks passed.');
