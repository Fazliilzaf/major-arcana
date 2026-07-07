'use strict';

/* PR 45 — Två saker på CCO-läsytan:
 *  1) HTML-mailbubblan (sandboxad iframe) hade vit bakgrund medan text-bubblorna
 *     har panel-kortets ton → olika bakgrund i samma tråd. Iframen görs transparent
 *     så bubblans panel-kort-ton lyser igenom (srcdoc-body är redan transparent).
 *  2) Lättviktig latens-diagnostik: messages-endpointen returnerar en timings-post
 *     (server-fas-tider) och klienten loggar total vs server vs nätverk, så vi kan
 *     lokalisera de kvarvarande ~2 sekunderna innan vi optimerar. Ren CSS + diagnostik,
 *     ingen ny design/palett, ingen live-send. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');
const route = fs.readFileSync(path.join(repoRoot, 'src', 'routes', 'ccoConversation.js'), 'utf8');

test('PR45: HTML-mailbubblans iframe är transparent (delar panel-kort-tonen)', () => {
  const rule = konv.match(/\.msg-html-frame\s*\{[\s\S]*?\}/);
  assert.ok(rule, '.msg-html-frame-regeln ska finnas');
  assert.match(rule[0], /background:\s*transparent/);
  assert.doesNotMatch(rule[0], /background:\s*#fff/);
});

test('PR45: messages-endpointen returnerar server-fas-timings', () => {
  assert.match(route, /timings:\s*\{/);
  assert.match(route, /truthMs:/);
  assert.match(route, /enrichMs:/);
  assert.match(route, /totalMs:/);
});

test('PR45: klienten loggar trådöppnings-timing (total vs server vs nät)', () => {
  assert.match(konv, /\[cco-timing\]/);
});

test('PR45: ingen live-send introducerad', () => {
  assert.doesNotMatch(konv, /graphSend|messages\/send/);
});
