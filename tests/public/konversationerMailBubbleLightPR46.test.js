'use strict';

/* PR 46 — Ljusare (nästan vit) bakgrund på mailbubblorna för högre kontrast mot
 * den mörka mailtexten, enhetligt över CCO-ytorna:
 *  - konversationer.html .msg-bubble: egen ljus ton i stället för den beige panel-
 *    kort-tonen (gäller även HTML-mail via den transparenta iframen).
 *  - styles.css .studio-conversation-message: samma ljusa ton i stället för den
 *    kalla blåvita.
 * Ingen ny palett — ljusare variant av befintliga toner. Ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');
const studioCss = fs.readFileSync(
  path.join(repoRoot, 'public', 'major-arcana-preview', 'styles.css'),
  'utf8'
);

test('PR46: läsvyns .msg-bubble har en ljus, nästan vit ton (ingen beige panel-kort-ton)', () => {
  const rule = konv.match(/\.msg-bubble\s*\{[\s\S]*?\}/);
  assert.ok(rule, '.msg-bubble-regeln ska finnas');
  assert.match(rule[0], /rgba\(250,\s*249,\s*247,\s*0\.94\)/);
  assert.doesNotMatch(rule[0], /var\(--panel-card-bottom\)/);
});

test('PR46: Svarstudions .studio-conversation-message har samma ljusa ton (ingen kall blåvit)', () => {
  const rule = studioCss.match(/\.studio-conversation-message\s*\{[\s\S]*?\}/);
  assert.ok(rule, '.studio-conversation-message-regeln ska finnas');
  assert.match(rule[0], /rgba\(250,\s*249,\s*247,\s*0\.94\)/);
  assert.doesNotMatch(rule[0], /rgba\(248,\s*250,\s*255/);
});

test('PR46: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
