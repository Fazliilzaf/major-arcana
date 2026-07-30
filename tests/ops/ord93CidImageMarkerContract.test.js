'use strict';

/**
 * ORD-93 — aldrig en trasig cid: kvar, alltid en synlig markering.
 *
 * `rewriteMailCidImageSources` bailade tyst i två fall: `cidMap` tom (returnerade
 * hela HTML:en oförändrad) och ett specifikt cid saknat i kartan (behöll `match`,
 * alltså den trasiga `src="cid:..."`). Webbläsaren kan inte lösa ett cid:-schema,
 * så operatören såg en trasig bildikon — utan felmeddelande, utan logg, utan
 * spår. Mätt 2026-07-30: 1 407 sådana referenser över fyra brevlådor, 396 i
 * klinikens egen utgående post.
 *
 * Principen är portad från konversationer.html, som redan gjorde exakt det här
 * för äldre mail: ersätt det olösta referensen med något som säger varför,
 * i stället för att lämna en trasig ikon.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { rewriteMailCidImageSources } = require('../../src/routes/ccoConversation');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'ccoConversation.js'), 'utf8');

test('en okänd cid: utan någon bilagemetadata alls ersätts med en synlig markering', () => {
  const html = rewriteMailCidImageSources('<div><img src="cid:missing-logo"></div>', []);
  assert.doesNotMatch(html, /cid:missing-logo/, 'ingen olöst cid: får överleva till webbläsaren');
  assert.match(html, /data:image\/svg\+xml/, 'markeringen ska vara en synlig platshållarbild');
  assert.match(html, /title="[^"]*bilagemetadata saknas/i);
  assert.match(html, /data-cid-missing="true"/);
});

test('ett olöst cid bland flera i samma mejl markeras, de lösta rörs inte', () => {
  const html = rewriteMailCidImageSources(
    '<div><img src="cid:known"><img src="cid:unknown"></div>',
    [{ id: 'att-1', contentId: 'known', isInline: true, openUrl: '/api/v1/asset?id=att-1' }]
  );
  assert.match(
    html,
    /src="\/api\/v1\/asset\?id=att-1"/,
    'det kända cid:et ska skrivas om som förut'
  );
  assert.doesNotMatch(html, /cid:unknown/, 'det okända cid:et får inte överleva');
  assert.match(html, /data-cid-missing="true"/);
});

test('en olöst url(cid:...) i style-attribut markeras, inte lämnas trasig', () => {
  const html = rewriteMailCidImageSources('<div style="background:url(cid:missing-bg)"></div>', []);
  assert.doesNotMatch(html, /cid:missing-bg/);
  assert.match(html, /url\("data:image\/svg\+xml/);
});

test('en about:blank utan entydig lokal inline-bild markeras i stället för att lämnas tom', () => {
  const html = rewriteMailCidImageSources('<img src="about:blank">', []);
  assert.doesNotMatch(html, /about:blank/);
  assert.match(html, /data:image\/svg\+xml/);
});

test('helt lösbar HTML får ingen markering alls', () => {
  const html = rewriteMailCidImageSources('<img src="cid:logo">', [
    { id: 'att-1', contentId: 'logo', isInline: true, openUrl: '/api/v1/asset?id=att-1' },
  ]);
  assert.doesNotMatch(html, /data-cid-missing/);
  assert.doesNotMatch(html, /data:image\/svg\+xml/);
});

test('VAKT: den tysta early-return:en på tom cidMap får inte komma tillbaka', () => {
  assert.doesNotMatch(
    SOURCE,
    /if \(!cidMap\.size\) return safeHtml;/,
    'en tom karta betyder att INGET cid kan lösas, inte att inget behöver göras'
  );
});
