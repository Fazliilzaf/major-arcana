'use strict';

/* Incident 2026-08-18 — fjärde och sista frysningen i serien (#1410 bfj,
 * #1411 O(1)-kö, #1412 lättviktig patientkatalog).
 *
 * Efter de tre tidigare fixarna frös /process-all fortfarande arcana totalt:
 * inga loggar, inga timers (60s-telemetrin och mailbox-pollern slutade båda
 * ticka), ingen exception, och raden "[mail-ingestion] processed raw=" — som
 * loggas allra sist i processRawMessage — dök ALDRIG upp. Kön stod kvar på
 * exakt samma tre meddelanden vid varje försök, dvs. ett specifikt
 * meddelandeinnehåll triggade deterministiskt samma hängning.
 *
 * Root cause: e-postmönstret /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
 * (ccoContactFormIdentity.js rad 95, samt tio kopior på andra ställen) är
 * kvadratiskt på text som saknar '@'. För varje startposition inuti en obruten
 * körning av tecken ur klassen konsumerar `+` hela körningen och backar sedan
 * ett tecken i taget. Uppmätt: 16 KB→112ms, 32 KB→479ms, 64 KB→1817ms,
 * 128 KB→7653ms (dubblad input = fyrdubblad tid). Det kördes två gånger per
 * meddelande via resolveCounterpartyEmail.
 *
 * Innehåll som ger sådana körningar OCH överlever HTML-strippningen:
 * procentkodade URL:er (% ingår i klassen), base64url-tokens (- och _ ingår),
 * långa ____/---- avdelare, CSS/<style>-innehåll.
 *
 * Fix: bundna kvantifierare enligt RFC 5321 (lokaldel ≤64, domän ≤255) i
 * src/ops/emailAddressPattern.js — linjärt istället för kvadratiskt — plus ett
 * längdtak och memoisering i collectMessageText.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EMAIL_ADDRESS_SOURCE,
  emailAddressRegExp,
  findEmailAddresses,
} = require('../../src/ops/emailAddressPattern');
const { extractContactFormEmail } = require('../../src/ops/ccoContactFormIdentity');

// Det gamla, kvadratiska mönstret — behålls här enbart som referens för att
// bevisa ekvivalens på giltiga adresser.
const LEGACY_EMAIL_RE = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}';

test('e-postmönstret är linjärt, inte kvadratiskt, på lång text utan @', () => {
  // En obruten körning av tecken som alla ligger i teckenklassen men saknar
  // '@' — exakt det som fick produktionen att frysa.
  const hostile = 'a'.repeat(256 * 1024);

  const start = process.hrtime.bigint();
  const found = findEmailAddresses(hostile);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.deepEqual(found, []);
  // Det gamla mönstret tog ~30 s på 256 KB. Det nya tar ~30 ms. Taket på 2 s
  // är avsiktligt generöst för långsamma CI-runners men fångar en återgång
  // till kvadratiskt beteende med tre tiopotensers marginal.
  assert.ok(
    elapsedMs < 2000,
    `findEmailAddresses tog ${elapsedMs.toFixed(0)}ms på 256 KB — kvadratiskt beteende är tillbaka`
  );
});

test('skalningen är linjär: dubblad input ger inte fyrdubblad tid', () => {
  // FLAKIGHET: forsta versionen matte 64 KB mot 128 KB en gang vardera och
  // krävde kvot < 3. Pa en delad CI-runner blev det 15,4 ms -> 52,7 ms = 3,4x
  // och testet foll, trots att koden var korrekt. Vid sa sma absoluta tider
  // dominerar schemalaggningsbrus over den signal vi mater.
  //
  // Tva atgarder: storre input (128/256 KB) sa att signalen vaxer, och
  // min-av-tre i stallet for enstaka matning. Minimum ar robust mot
  // brustoppar — en runner kan bli avbruten och gora en matning langsammare,
  // men aldrig snabbare an det verkliga arbetet.
  function measureOnce(sizeKb) {
    const text = 'a'.repeat(sizeKb * 1024);
    const start = process.hrtime.bigint();
    findEmailAddresses(text);
    return Number(process.hrtime.bigint() - start) / 1e6;
  }
  function measure(sizeKb) {
    return Math.min(measureOnce(sizeKb), measureOnce(sizeKb), measureOnce(sizeKb));
  }

  measureOnce(128); // uppvärmning (JIT)
  const small = measure(128);
  const large = measure(256);

  // ANDRA FLAKIGHETEN, 2026-08-19: 3,3x vid 91,5 ms -> 301,5 ms. Koden var
  // korrekt; testet var fel konstruerat, och min forsta atgard behandlade
  // symptomet.
  //
  // Kvoten ar fel matvarde. Regressionen vi vaktar mot ar INTE 2x mot 4x —
  // den ar 17 ms mot 7 653 ms pa 128 KB, alltsa ~450 ganger. Att da satta
  // troskeln till 3, mitt emellan linjart och kvadratiskt, ger 1,5x marginal
  // for att upptacka nagot som ar 450x. Storre input och min-av-tre gjorde
  // bruset mindre men andrade inte det.
  //
  // Absolut tid har den marginal signalen fortjanar: linjart mater ~300 ms pa
  // 256 KB, kvadratiskt skulle ta tiotals sekunder. Taket nedan ligger 10x
  // over det linjara utfallet och tva storleksordningar under det
  // kvadratiska. Schemalaggningsbrus pa en delad runner ryms med god marginal.
  //
  // Kvoten loggas fortfarande — den ar bra diagnostik nar testet val faller.
  const TAK_MS = 3000;
  const ratio = large / Math.max(small, 0.01);
  assert.ok(
    large < TAK_MS,
    `256 KB tog ${large.toFixed(1)}ms (tak ${TAK_MS}ms). ` +
      `128 KB tog ${small.toFixed(1)}ms, kvot ${ratio.toFixed(1)}x. ` +
      'Kvadratiskt beteende ger tiotals sekunder — kontrollera att monstret ' +
      'fortfarande ar bundet (se emailAddressPattern.js).'
  );
});

test('nya mönstret matchar exakt samma giltiga adresser som det gamla', () => {
  const samples = [
    'E-post: anna.andersson@example.com Telefon: 070-123 45 67',
    'Kontakt: <a href="mailto:bjorn+tag@sub.example.co.uk">bjorn+tag@sub.example.co.uk</a>',
    'flera: a@b.se, c.d@e-f.example.com och x_y%z@long-domain.example.museum',
    'ingen epost alls här',
    'kant: user@domain.se.',
    'versaler: ANNA@EXAMPLE.COM',
    'siffror: 123@456.se',
    'punkt-i-lokaldel: a.b.c.d@x.y.example.com',
    'omgiven text före patient@example.org och efter',
  ];

  for (const sample of samples) {
    const legacy = sample.match(new RegExp(LEGACY_EMAIL_RE, 'gi'));
    const current = sample.match(emailAddressRegExp('gi'));
    assert.deepEqual(current, legacy, `skillnad för: ${sample}`);
  }
});

test('EMAIL_ADDRESS_SOURCE har bundna kvantifierare (ingen obegränsad +)', () => {
  // Regressionsskydd: någon får inte "förenkla" tillbaka till + eller *.
  assert.ok(
    !/[+*]/.test(EMAIL_ADDRESS_SOURCE.replace(/\\\./g, '').replace('%+-', '')),
    `EMAIL_ADDRESS_SOURCE innehåller en obegränsad kvantifierare: ${EMAIL_ADDRESS_SOURCE}`
  );
  assert.match(EMAIL_ADDRESS_SOURCE, /\{1,64\}/);
  assert.match(EMAIL_ADDRESS_SOURCE, /\{1,255\}/);
});

test('extractContactFormEmail hänger inte på ett fientligt kontaktformulärsmail', () => {
  // Reproducerar produktionsmeddelandet: ser ut som ett kontaktformulär
  // (E-post: + Telefon: triggar looksLikeContactFormMessage), klinikens egen
  // adress i det märkta fältet så att koden faller igenom till den fria
  // scanningen, och en lång obruten token-vägg i kroppen.
  const message = {
    subject: 'Kontaktformulär',
    bodyText: [
      'E-post: kons@hairtpclinic.com',
      'Telefon: 070-000 00 00',
      'x'.repeat(256 * 1024),
      'Patientens riktiga adress: patient@example.com',
    ].join('\n'),
  };

  const start = process.hrtime.bigint();
  const email = extractContactFormEmail(message);
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

  assert.equal(email, 'patient@example.com');
  assert.ok(
    elapsedMs < 2000,
    `extractContactFormEmail tog ${elapsedMs.toFixed(0)}ms — hängningen är tillbaka`
  );
});

test('collectMessageText memoiseras per meddelandeobjekt (upprepade anrop är billiga)', () => {
  const message = {
    subject: 'Kontaktformulär',
    bodyText: 'E-post: patient@example.com\nTelefon: 070-000 00 00',
    rawJson: { bodyHtml: `<html><body>${'<p>fyllnad</p>'.repeat(20000)}</body></html>` },
  };

  const firstStart = process.hrtime.bigint();
  assert.equal(extractContactFormEmail(message), 'patient@example.com');
  const firstMs = Number(process.hrtime.bigint() - firstStart) / 1e6;

  const secondStart = process.hrtime.bigint();
  assert.equal(extractContactFormEmail(message), 'patient@example.com');
  const secondMs = Number(process.hrtime.bigint() - secondStart) / 1e6;

  // Andra anropet ska slippa hela HTML→text-passningen tack vare WeakMap:en.
  assert.ok(
    secondMs <= Math.max(firstMs, 1),
    `memoisering verkar inte träffa: första ${firstMs.toFixed(1)}ms, andra ${secondMs.toFixed(1)}ms`
  );
});
