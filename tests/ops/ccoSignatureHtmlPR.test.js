'use strict';

/* Rik HTML-signatur för kontrollerad live-send. Det faktiska mailet får den
 * varumärkta v9-signaturen (inbäddad logga + sociala ikoner) i stället för ren
 * text. Rent presentationslager: composeHtmlBody bygger bodyHtml ur draft.body
 * + avsändar-brevlåda; ingen sändlogik ändras. Testar den rena modulen samt att
 * adaptern + /send-rutten trådar bodyHtml genom till HTML-mail. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveSignatureId,
  resolveSignatureIdFromBody,
  textToHtmlParagraphs,
  stripPlainSignature,
  getSignatureHtml,
  composeHtmlBody,
  SIG_DIVIDER,
} = require('../../src/ops/ccoSignatureHtml');

test('mallen finns med inbäddad logga + namn-placeholder ersatt', () => {
  const tpl = fs.readFileSync(
    path.join(__dirname, '../../src/ops/signatures/signatureV9Template.html'),
    'utf8'
  );
  assert.match(tpl, /data:image\/gif;base64,/); // inbäddad logga
  assert.match(tpl, /\{\{SIGNATURE_NAME\}\}/); // placeholder
  assert.doesNotMatch(tpl, /img2\.gimm\.io/); // ingen extern hotlink
  assert.match(tpl, /href="tel:\+4631881166"/); // klickbar tel-länk i E.164
  assert.doesNotMatch(tpl, /href="tel:031881166"/); // inte lokalformat i href
});

test('resolveSignatureId härleder person ur brevlåda', () => {
  assert.equal(resolveSignatureId('fazli@hairtpclinic.com'), 'fazli');
  assert.equal(resolveSignatureId('egzona@hairtpclinic.com'), 'egzona');
  assert.equal(resolveSignatureId('contact@hairtpclinic.com'), 'contact');
  assert.equal(resolveSignatureId(''), 'contact');
});

test('getSignatureHtml sätter rätt namn och lämnar ingen placeholder kvar', () => {
  const fazli = getSignatureHtml('fazli@hairtpclinic.com');
  assert.ok(fazli);
  assert.match(fazli, /Fazli Krasniqi/);
  assert.doesNotMatch(fazli, /\{\{SIGNATURE_NAME\}\}/);
  const egzona = getSignatureHtml('egzona@hairtpclinic.com');
  assert.match(egzona, /Egzona Krasniqi/);
});

test('textToHtmlParagraphs escapar och styckar text', () => {
  const html = textToHtmlParagraphs('Hej <b>Anna</b>\nrad två\n\nnytt stycke');
  assert.match(html, /&lt;b&gt;Anna&lt;\/b&gt;/); // escapad
  assert.match(html, /<br>rad två/); // enkelt radbryt → <br>
  assert.equal((html.match(/<p /g) || []).length, 2); // två stycken
});

test('stripPlainSignature tar bort textsignaturen från dividern', () => {
  const body = 'Meddelande här' + SIG_DIVIDER + 'Bästa hälsningar,\n\nFazli';
  assert.equal(stripPlainSignature(body), 'Meddelande här');
  // utan divider → orört
  assert.equal(stripPlainSignature('Bara text'), 'Bara text');
});

test('resolveSignatureIdFromBody härleder äldre utkast från textsignaturen', () => {
  assert.equal(
    resolveSignatureIdFromBody(
      'Hej' + SIG_DIVIDER + 'Bästa hälsningar,\n\nEgzona Krasniqi\nHair TP Clinic'
    ),
    'egzona'
  );
  assert.equal(resolveSignatureIdFromBody('Hej utan divider'), '');
});

test('composeHtmlBody: HTML-sig bara när textsignatur fanns', () => {
  const withSig = composeHtmlBody(
    'Hej Anna, tack för ditt meddelande.' + SIG_DIVIDER + 'Bästa hälsningar,\n\nFazli',
    'fazli@hairtpclinic.com'
  );
  assert.ok(withSig);
  assert.match(withSig, /Hej Anna, tack för ditt meddelande\./);
  assert.match(withSig, /Fazli Krasniqi/); // varumärkt HTML-sig
  assert.match(withSig, /data:image\/gif;base64,/); // inbäddad logga i mailet

  // Ingen divider → ingen signatur påtvingas (null → ren text i /send).
  assert.equal(
    composeHtmlBody('Bara ett meddelande utan signatur', 'fazli@hairtpclinic.com'),
    null
  );
});

test('composeHtmlBody följer vald signatur före mailbox-fallback', () => {
  const fazliBody =
    'Hej Anna, vi återkommer.' +
    SIG_DIVIDER +
    'Bästa hälsningar,\n\nFazli Krasniqi\nHair TP Clinic';
  const inferred = composeHtmlBody(fazliBody, 'contact@hairtpclinic.com');
  assert.match(inferred, /Fazli Krasniqi/);
  assert.doesNotMatch(inferred, /Hair TP Clinic<\/span><\/p><\/td><\/tr><tr>/);

  const explicit = composeHtmlBody(fazliBody, 'egzona');
  assert.match(explicit, /Egzona Krasniqi/);
});

test('adaptern trådar bodyHtml till connectorn (HTML-mail) när den finns', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/infra/ccoGraphSendAdapter.js'),
    'utf8'
  );
  assert.match(
    src,
    /async function sendMail\(\{ from, to, subject, body, bodyHtml, attachments \}/
  );
  assert.match(src, /\.\.\.\(bodyHtml \? \{ bodyHtml \} : \{\}\)/);
});

test('/send komponerar bodyHtml men rör ingen sändgrind', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/routes/ccoCommDraft.js'), 'utf8');
  assert.match(src, /const \{ composeHtmlBody \} = require\('\.\.\/ops\/ccoSignatureHtml'\)/);
  assert.match(
    src,
    /const bodyHtml = composeHtmlBody\(draft\.body \|\| '', draft\.signatureId \|\| senderMailbox\)/
  );
  assert.match(src, /\.\.\.\(bodyHtml \? \{ bodyHtml \} : \{\}\)/);
  // Sändgrindarna orörda
  assert.match(src, /if \(!graphSendEnabled\(\)\)/);
  assert.match(src, /allowlist\.isAllowed\(tenantId, to\)/);
  assert.match(src, /requirePermission\('mail\.live_send'\)/);
});
