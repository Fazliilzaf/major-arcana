'use strict';

/* Svarstudio v2 — design-artifacten 1:1 i isolerad shadow-DOM. Renderas ur
 * public/svarstudio-v2.css/.html i live-modalen (konversationer-bottom-actions.js).
 * Kontrollerna kopplas till EXAKT samma draft-/transition-endpoints som klassiska
 * modalen (upp till needs_approval). Live-send förblir serverspärrat — v2 anropar
 * aldrig /send och sätter aldrig status 'sent'. Testlåser assets + wiring + att
 * sändsäkerheten är orörd. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pub = (p) => path.join(__dirname, '../../public', p);
const source = fs.readFileSync(pub('konversationer-bottom-actions.js'), 'utf8');
const cssAsset = fs.readFileSync(pub('svarstudio-v2.css'), 'utf8');
const htmlAsset = fs.readFileSync(pub('svarstudio-v2.html'), 'utf8');

test('v2-assets finns och är shadow-DOM-säkra', () => {
  // CSS: tokens flyttade till :host (inte :root) så var() funkar i shadow-roten
  assert.match(cssAsset, /:host\s*\{/);
  assert.doesNotMatch(cssAsset, /:root\s*\{/);
  // HTML: artifactens egna hooks + inbäddad logga (ingen extern hotlink)
  assert.match(htmlAsset, /id="editor"/);
  assert.match(htmlAsset, /id="mailboxPicker"/);
  assert.match(htmlAsset, /id="stepper"/);
  assert.match(htmlAsset, /id="sigTpl"/);
  assert.match(htmlAsset, /data:image\/gif;base64,/);
  assert.doesNotMatch(htmlAsset, /img2\.gimm\.io/);
});

test('v2 monteras i isolerad shadow-DOM och laddar assets', () => {
  assert.match(source, /const USE_SVARSTUDIO_V2 = true/);
  assert.match(source, /async function mountSvarstudioV2\(/);
  assert.match(source, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.match(source, /fetch\('\/svarstudio-v2\.css'\)/);
  assert.match(source, /fetch\('\/svarstudio-v2\.html'\)/);
  // Öppnas före klassiska modalen, med fallback
  assert.match(source, /const mounted = await mountSvarstudioV2\(/);
});

test('v2 återanvänder EXAKT sändkedjans endpoints (ingen ny sändväg)', () => {
  assert.match(source, /POST[\s\S]{0,40}|method: 'POST'/);
  assert.match(source, /'\/api\/v1\/cco-comm\/drafts'/);
  assert.match(source, /\/transition'/);
  // "Godkänn & köa" går till needs_approval — INTE sent/live-send
  assert.match(source, /saveDraftV2\('needs_approval'\)/);
  assert.match(source, /saveDraftV2\('draft'\)/);
});

test('kundtext: aldrig streck, ingen egen avslutshälsning (finns i signaturen)', () => {
  // sanitizern finns och körs på förvalt/genererat svar innan editorn
  assert.match(source, /function sanitizeReplyText\(text\)/);
  assert.match(source, /editor\.value = sanitizeReplyText\(variantText\[idx\] \|\| ''\)/);
  // v2-varianterna får inte innehålla em/en-dash eller en egen sign-off
  const vStart = source.indexOf('const variantText = [');
  const vEnd = source.indexOf('];', vStart);
  const variants = source.slice(vStart, vEnd);
  assert.doesNotMatch(variants, /[—–]/);
  assert.doesNotMatch(variants, /Varma hälsningar|Vänligen|Mvh/i);
  // svarsmallarna (makron) använder inte streck som punktlista
  const macroStart = source.indexOf('const bodies = {');
  const macroEnd = source.indexOf('};', macroStart);
  assert.doesNotMatch(source.slice(macroStart, macroEnd), /[—–]/);
});

test('v2 rör INTE live-send: inget /send-anrop, ingen sent-transition', () => {
  // v2-mount-blocket får aldrig skicka på riktigt
  const start = source.indexOf('async function mountSvarstudioV2(');
  const end = source.indexOf('async function openSvarstudio(');
  const v2 = source.slice(start, end);
  assert.ok(v2.length > 500, 'v2-blocket hittades');
  assert.doesNotMatch(v2, /\/send'/); // ingen live-send-endpoint
  assert.doesNotMatch(v2, /saveDraftV2\('sent'\)/); // köar aldrig direkt till sent
  assert.doesNotMatch(v2, /status: 'sent'/); // ingen sent-transition
  // 'sent' förekommer bara som stepper-etikett i ordningslistan, aldrig som anrop
  assert.match(v2, /\['draft', 'needs_approval', 'approved', 'sent'\]/);
  // recipient-block (tom/klinikadress) håller köa spärrat
  assert.match(v2, /function recipientBlock\(\)/);
  assert.match(v2, /Mottagare saknas/);
});
