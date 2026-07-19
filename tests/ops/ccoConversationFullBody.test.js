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

const { deriveBodyHtml, deriveDisplayMailBody } = require('../../src/routes/ccoConversation');

test('deriveBodyHtml hittar HTML i varje lokal källa (rikaste kandidaten vinner)', () => {
  // Efter #640 väljer chooseRicherHtml den RIKASTE kandidaten, inte första i
  // en fast ordning. Låser att varje källa ensam ger sin HTML, och att en
  // rikare kandidat vinner över en kortare.
  assert.equal(deriveBodyHtml({ bodyHtml: '<p>A</p>' }), '<p>A</p>');
  assert.equal(deriveBodyHtml({ mailDocument: { primaryBodyHtml: '<p>B</p>' } }), '<p>B</p>');
  assert.equal(deriveBodyHtml({ body: { contentType: 'HTML', content: '<p>C</p>' } }), '<p>C</p>');
  assert.equal(
    deriveBodyHtml({ rawJson: { body: { contentType: 'html', content: '<p>D</p>' } } }),
    '<p>D</p>'
  );
  const richer = '<div><img src="cid:logo"><p>Signatur med logga och längre innehåll</p></div>';
  assert.equal(
    deriveBodyHtml({ bodyHtml: '<p>kort</p>', mailDocument: { primaryBodyHtml: richer } }),
    richer,
    'rikare HTML (bilder/längd) ska vinna'
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
  // Sandbox utan allow-scripts — kund-HTML kan aldrig köra kod. allow-same-origin
  // används endast för att mäta srcdoc-höjden; scripts saknas fortfarande.
  // allow-popups krävs för att mail-länkar (base target=_blank) ska fungera;
  // inget annat får släppas igenom.
  assert.match(
    html,
    /sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"\s+referrerpolicy="no-referrer"/,
    'iframe ska ha popup-sandbox med säker höjdmätning'
  );
  assert.ok(!/sandbox="[^"]*allow-scripts/.test(html), 'allow-scripts får aldrig läggas till');
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
  // Efter #640: bodyHtml byggs via bounded deriveBodyHtml + cid-omskrivning och
  // exponeras som bodyHtml || null i messages-svaret.
  assert.match(
    src,
    /rewriteMailCidImageSources\(boundedBodyHtml, attachments\)/,
    'endpoint ska härleda bodyHtml med cid-omskrivning'
  );
  assert.match(src, /bodyHtml: bodyHtml \|\| null/, 'endpoint ska skicka bodyHtml || null');
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

test('deriveDisplayMailBody håller en reply-bubbla till eget mejl och synlig signatur', () => {
  const display = deriveDisplayMailBody({
    bodyHtml: [
      '<div>Hej Joel,</div>',
      '<div>Tack, vi hjalper dig vidare.</div>',
      '<div>Basta halsningar<br>Hair TP Clinic</div>',
      '<blockquote><div>11 juli 2026 skrev Joel Frodin:</div><div>Det tidigare mailet.</div></blockquote>',
    ].join(''),
    bodyText:
      'Hej Joel,\nTack, vi hjalper dig vidare.\n\nBasta halsningar\nHair TP Clinic\n\n11 juli 2026 skrev Joel Frodin:\nDet tidigare mailet.',
  });

  assert.match(display.html, /Tack, vi hjalper dig vidare/);
  assert.match(display.html, /Basta halsningar/);
  assert.doesNotMatch(display.html, /Det tidigare mailet/);
  assert.match(display.text, /Hair TP Clinic/);
  assert.doesNotMatch(display.text, /Det tidigare mailet/);
});

test('deriveDisplayMailBody behaller inline-signaturbild men tar bort citerad historik', () => {
  const display = deriveDisplayMailBody({
    bodyHtml: [
      '<div>Hej!</div>',
      '<div>Vanliga halsningar</div>',
      '<table role="presentation"><tr><td><img src="cid:clinic-logo" alt="Hair TP Clinic"></td><td>Hair TP Clinic</td></tr></table>',
      '<div>Från: Kund &lt;kund@example.com&gt;</div>',
      '<div>Ämne: Re: Fråga</div>',
      '<div>Gammal historik ska inte visas.</div>',
    ].join(''),
    bodyText: 'Hej!\nVanliga hälsningar\nHair TP Clinic\nFrån: Kund <kund@example.com>\nGammal historik ska inte visas.',
  });

  assert.match(display.html, /cid:clinic-logo/);
  assert.match(display.html, /Hair TP Clinic/);
  assert.doesNotMatch(display.html, /Gammal historik ska inte visas/);
});
