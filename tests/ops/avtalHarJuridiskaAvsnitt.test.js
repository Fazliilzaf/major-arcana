'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const reg = require('../../src/ops/patientDocumentLiveRegistry');

/**
 * ORD-157 §5 — kontrollen som saknades.
 *
 * offert_microneedling, offert_prf och offert_profilo hade ett TOMT
 * avtalsblock: rubriken "Behandlingsavtal" och sedan ingenting. Patienten
 * signerade ett dokument som hänvisade till "behandlingsavtalet" medan
 * villkoren inte fanns i det.
 *
 * Ingen märkte det. Inte för att det var svårt att se — utan för att ingen
 * räknade. Det här testet räknar.
 *
 * Två varumärken, två mallar, samma rättsliga kärna:
 *
 *   Curatiio   botox, filler, op, ortopedi   "Curatiio, en del av Hair TP Clinic AB"
 *   Hair TP    tp, prp_hair, prp_skin,       "Hair TP Clinic"
 *              microneedling, prf, profilo
 *
 * Curatiio-mallen har två avsnitt till — Behandlingen och Offert — men de är
 * behandlingsspecifika, inte juridiska. Därför mäts den rättsliga kärnan, inte
 * antalet rubriker.
 */

// De avsnitt som gör ett behandlingsavtal till ett avtal. Saknas något av dem
// är dokumentet inte komplett, oavsett hur det ser ut.
const JURIDISKA_AVSNITT = [
  'Giltighetstid och betänketid',
  'Betalningsvillkor',
  'Av- och ombokning',
  'Resultat',
  'Ansvar',
  'Ångerrätt',
  'Avtalsbrott och force majeure',
  'Information &amp; samtycke',
  'Tvist',
];

const AVTAL = [
  'offert_tp',
  'offert_prp_hair',
  'offert_prp_skin',
  'offert_microneedling',
  'offert_prf',
  'offert_profilo',
  'offert_botox',
  'offert_filler',
  'offert_op',
  'offert_ortopedi',
];

function html(id) {
  return fs.readFileSync(reg.resolveLiveDocumentAbsolutePath(id), 'utf8');
}

test('varje behandlingsavtal bär samtliga juridiska avsnitt', () => {
  const brister = [];
  for (const id of AVTAL) {
    let doc;
    try {
      doc = html(id);
    } catch {
      brister.push(`${id}: dokumentet går inte att läsa`);
      continue;
    }
    const saknade = JURIDISKA_AVSNITT.filter((a) => !doc.includes(`>${a}</h3>`));
    if (saknade.length) brister.push(`${id}: saknar ${saknade.join(', ')}`);
  }

  assert.deepEqual(
    brister,
    [],
    'Behandlingsavtal utan sina villkor — patienten signerar något som inte ' +
      'innehåller vad hon avtalar om:\n' +
      brister.map((b) => `  - ${b}`).join('\n')
  );
});

test('avtalsblocket är aldrig tomt', () => {
  // Det konkreta felet: <div class="section-title">Behandlingsavtal</div>
  // följt direkt av </div>. Rubriken fanns, innehållet inte.
  const tomma = AVTAL.filter((id) => {
    try {
      return /<div class="section-title">Behandlingsavtal<\/div>\s*<\/div>/.test(html(id));
    } catch {
      return false;
    }
  });
  assert.deepEqual(tomma, [], `Tomt avtalsblock i: ${tomma.join(', ')}`);
});

test('varje avtal anger en juridisk part', () => {
  const utanPart = [];
  for (const id of AVTAL) {
    let doc;
    try {
      doc = html(id);
    } catch {
      continue;
    }
    // Båda varumärkena bär samma organisationsnummer — det är parten som räknas.
    if (!/559034[–-]2688/.test(doc)) utanPart.push(id);
  }
  assert.deepEqual(utanPart, [], `Avtal utan angiven avtalspart: ${utanPart.join(', ')}`);
});

test('Hair TP-avtal anger inte Curatiio som part, och tvärtom', () => {
  const HAIR_TP = [
    'offert_tp',
    'offert_prp_hair',
    'offert_prp_skin',
    'offert_microneedling',
    'offert_prf',
    'offert_profilo',
  ];
  const CURATIIO = ['offert_botox', 'offert_filler', 'offert_op', 'offert_ortopedi'];

  const fel = [];
  // Ett oläsbart dokument är ett fel i sig — svälj det inte, det var precis
  // sådan tystnad som lät det tomma avtalsblocket ligga kvar.
  const las = (id) => {
    try {
      return html(id);
    } catch (err) {
      fel.push(`${id}: gick inte att läsa (${err.code || err.message})`);
      return null;
    }
  };

  for (const id of HAIR_TP) {
    const doc = las(id);
    if (doc && /Curatiio, en del av Hair TP Clinic AB/.test(doc)) {
      fel.push(`${id}: Hair TP-behandling med Curatiio som avtalspart`);
    }
  }
  for (const id of CURATIIO) {
    const doc = las(id);
    if (doc && !/Curatiio, en del av Hair TP Clinic AB/.test(doc)) {
      fel.push(`${id}: Curatiio-behandling utan Curatiio som avtalspart`);
    }
  }

  assert.deepEqual(
    fel,
    [],
    'Fel juridisk part i ett dokument patienten signerar:\n' + fel.map((f) => `  - ${f}`).join('\n')
  );
});
