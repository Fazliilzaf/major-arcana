'use strict';

/* Fullt mail i trådvyn: messages-endpointen exponerar bodyHtml (lokala fält)
 * och UI:t renderar den ENDAST i sandboxad iframe. Låser:
 *  - deriveBodyHtml-prioritering (truth bodyHtml → mailDocument → Graph-body
 *    med contentType html → ingestion-raw), tom sträng för ren text/preview,
 *  - sandbox-attributet är tomt (inga scripts, ingen same-origin) och HTML
 *    injiceras via escapad srcdoc — aldrig direkt i sidans DOM. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { deriveBodyHtml } = require('../../src/routes/ccoConversation');

test('deriveBodyHtml prioriterar truth bodyHtml, sedan mailDocument, sedan Graph-body(html)', () => {
  assert.equal(
    deriveBodyHtml({ bodyHtml: '<p>A</p>', mailDocument: { primaryBodyHtml: '<p>B</p>' } }),
    '<p>A</p>'
  );
  assert.equal(deriveBodyHtml({ mailDocument: { primaryBodyHtml: '<p>B</p>' } }), '<p>B</p>');
  assert.equal(deriveBodyHtml({ body: { contentType: 'HTML', content: '<p>C</p>' } }), '<p>C</p>');
  assert.equal(
    deriveBodyHtml({ rawJson: { body: { contentType: 'html', content: '<p>D</p>' } } }),
    '<p>D</p>'
  );
});

test('deriveBodyHtml ger tom sträng för ren text/preview (UI faller till textbubbla)', () => {
  assert.equal(deriveBodyHtml({ bodyPreview: 'bara preview' }), '');
  assert.equal(deriveBodyHtml({ body: { contentType: 'text', content: 'ren text' } }), '');
  assert.equal(deriveBodyHtml({}), '');
  assert.equal(deriveBodyHtml(null), '');
});

test('UI: HTML renderas endast i sandboxad iframe med escapad srcdoc', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'konversationer.html'),
    'utf8'
  );
  // Sandbox utan allow-scripts/allow-same-origin — kund-HTML kan aldrig köra
  // kod eller nå appens cookies/API:er.
  // allow-popups krävs för att mail-länkar (base target=_blank) ska fungera;
  // inget annat får släppas igenom.
  assert.match(
    html,
    /sandbox="allow-popups allow-popups-to-escape-sandbox"\s+referrerpolicy="no-referrer"/,
    'iframe ska ha exakt popup-sandbox'
  );
  assert.ok(!/sandbox="[^"]*allow-scripts/.test(html), 'allow-scripts får aldrig läggas till');
  assert.ok(
    !/sandbox="[^"]*allow-same-origin/.test(html),
    'allow-same-origin får aldrig läggas till'
  );
  // srcdoc byggs med escapeHtml — bodyHtml hamnar aldrig oescapad i sidans DOM.
  assert.match(html, /srcdoc="\$\{escapeHtml\(doc\)\}"/, 'srcdoc ska vara escapad');
  // Textfallet är kvar som förut när HTML saknas.
  assert.match(html, /renderMessageBubbleInner/, 'bubbelrenderaren ska användas');
});

test('messages-svaret exponerar bodyHtml-fältet', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'ccoConversation.js'),
    'utf8'
  );
  assert.match(src, /bodyHtml: deriveBodyHtml\(safe\) \|\| null/, 'endpoint ska skicka bodyHtml');
});

test('deriveBodyHtml läser även uniqueBody (Graph) och rawJson.uniqueBody', () => {
  assert.equal(
    deriveBodyHtml({ uniqueBody: { contentType: 'html', content: '<p>U</p>' } }),
    '<p>U</p>'
  );
  assert.equal(
    deriveBodyHtml({ rawJson: { uniqueBody: { contentType: 'HTML', content: '<p>RU</p>' } } }),
    '<p>RU</p>'
  );
  assert.equal(deriveBodyHtml({ uniqueBody: { contentType: 'text', content: 'txt' } }), '');
});
