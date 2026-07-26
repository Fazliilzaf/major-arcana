'use strict';

/**
 * ORD-81 — memoisering av sanitizeMailboxSignatureHtml.
 *
 * Bakgrund: samma oförändrade signatur-HTML sanerades 26 192 gånger i ett
 * enda synkront pass i prod (1 807 248 DOM-nodbesök, 19,7 s frusen huvudtråd).
 *
 * Testet låser fast de fyra egenskaper som gör cachen säker:
 *
 *   1. Den träffar — identisk indata bygger bara ETT <template>.
 *   2. Den är BUNDEN — antalet poster överskrider aldrig taket.
 *   3. Vräkningen är FIFO — äldsta nyckeln ryker först.
 *   4. Den fylls ALDRIG från den osanerade returvägen. Funktionen returnerar
 *      rå indata när signatur-editorn saknas; cachas den posten skulle den
 *      serveras som "sanerad" efter att editorn monterats. Säkerhetsrelevant.
 *
 * HARNESS-BEGRÄNSNING: linkedom implementerar varken replaceWith(DocumentFragment)
 * eller setAttribute("style", …) — båda är no-ops. Saneringens FAKTISKA utdata
 * (taggstrippning, style-tvätt) går därför inte att verifiera här; det kräver en
 * riktig DOM. Denna ändring rör inte saneringslogiken, och att den är orörd
 * vaktas på källnivå i sista testet nedan. Visuell paritet verifieras i prod
 * enligt acceptanskriterium 2 i ORD-81.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js'),
  'utf8'
);

/** Klipper ut cache-deklarationen + saneraren ur app.js. */
const SOURCE = (() => {
  const start = APP.indexOf('  const MAILBOX_SIGNATURE_SANITIZE_CACHE_LIMIT');
  assert.ok(start > -1, 'cache-taket ska deklareras i app.js');
  const end = APP.indexOf('\n  function sanitizeConversationHtmlForDisplay(', start);
  assert.ok(end > start, 'saneraren ska avgränsas av nästa funktion');
  return APP.slice(start, end);
})();

const SIGNATURE = '<div style="behavior:url(x);color:red"><span>Hej</span></div>';

function load() {
  const { document } = parseHTML('<!doctype html><html><body></body></html>');
  let templateBuilds = 0;
  // Delegera hela dokumentet (saneraren använder även createDocumentFragment);
  // fånga bara createElement för att räkna template-byggen.
  const ownerDocument = new Proxy(document, {
    get(target, prop, receiver) {
      if (prop === 'createElement') {
        return (tagName, ...rest) => {
          if (String(tagName).toLowerCase() === 'template') templateBuilds += 1;
          return target.createElement(tagName, ...rest);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  const sandbox = {
    // Börjar OMONTERAD — testet monterar när det vill åt den vägen.
    mailboxAdminSignatureEditor: null,
    normalizeText: (value) => String(value ?? '').replace(/\s+/g, ' ').trim(),
    CCO_SIGNATURE_PUBLIC_BASE_URL: 'https://arcana.example',
    __exported: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `${SOURCE}\n__exported = {
       sanitize: sanitizeMailboxSignatureHtml,
       cache: mailboxSignatureSanitizeCache,
       limit: MAILBOX_SIGNATURE_SANITIZE_CACHE_LIMIT,
     };`,
    sandbox
  );

  return {
    ...sandbox.__exported,
    mount: () => {
      sandbox.mailboxAdminSignatureEditor = { ownerDocument };
    },
    get templateBuilds() {
      return templateBuilds;
    },
  };
}

test('cachen träffar — identisk indata bygger bara ett template', () => {
  const app = load();
  app.mount();

  const first = app.sanitize(SIGNATURE);
  const second = app.sanitize(SIGNATURE);
  const third = app.sanitize(SIGNATURE);

  assert.equal(app.templateBuilds, 1, 'saneringen ska köras exakt en gång');
  assert.equal(second, first);
  assert.equal(third, first);
  assert.equal(app.cache.size, 1);
});

test('den osanerade returvägen cachas ALDRIG', () => {
  const app = load();

  // Editorn saknas → funktionen returnerar rå indata utan att sanera.
  const raw = app.sanitize(SIGNATURE);
  assert.equal(app.templateBuilds, 0, 'ingen sanering utan editor');
  assert.equal(app.cache.size, 0, 'den osanerade posten får INTE cachas');
  assert.equal(raw, SIGNATURE.trim());

  // Editorn monteras — samma indata måste nu gå igenom den sanerande
  // grenen, inte serveras från en cachad osanerad post.
  app.mount();
  const sanitized = app.sanitize(SIGNATURE);

  assert.equal(app.templateBuilds, 1, 'saneringen SKA köras när editorn finns');
  assert.equal(app.cache.size, 1, 'först nu får posten cachas');
  assert.equal(
    app.cache.get(SIGNATURE),
    sanitized,
    'cachad post ska komma från den sanerande grenen'
  );
});

test('cachen är bunden — taket överskrids aldrig', () => {
  const app = load();
  app.mount();

  const overshoot = app.limit + 25;
  for (let i = 0; i < overshoot; i += 1) {
    app.sanitize(`<div>rad ${i}</div>`);
  }

  assert.equal(app.templateBuilds, overshoot, 'unika nycklar ska alla saneras');
  assert.ok(
    app.cache.size <= app.limit,
    `cachen ska hållas <= ${app.limit}, var ${app.cache.size}`
  );
});

test('FIFO-vräkning — äldsta nyckeln ryker först', () => {
  const app = load();
  app.mount();

  const first = '<div>först</div>';
  app.sanitize(first);
  for (let i = 0; i < app.limit; i += 1) {
    app.sanitize(`<div>fyllnad ${i}</div>`);
  }

  assert.ok(!app.cache.has(first), 'den äldsta posten ska ha vräkts');
  assert.ok(app.cache.size <= app.limit);
});

test('saneringslogiken är orörd — källnivå-vakt', () => {
  // ORD-81 är en ren cache-ändring. Om någon rör saneringen ska detta test
  // falla, så att ändringen får en egen granskning.
  for (const needle of [
    '.replace(/javascript:/gi, "")',
    '.replace(/vbscript:/gi, "")',
    '.replace(/expression\\s*\\([^)]*\\)/gi, "")',
    '.replace(/@import/gi, "")',
    '.replace(/behavior\\s*:/gi, "")',
  ]) {
    assert.ok(SOURCE.includes(needle), `style-saneringen ska behålla: ${needle}`);
  }
  assert.ok(
    SOURCE.includes('const allowedTags = new Set(['),
    'tagg-allowlistan ska finnas kvar'
  );
  assert.ok(
    /if \(!allowedTags\.has\(node\.tagName\)\) \{/.test(SOURCE),
    'taggstrippningen ska finnas kvar'
  );
});
