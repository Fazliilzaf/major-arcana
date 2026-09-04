'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createDiagRouter } = require('../../src/routes/diag');
const FACIT = require('../../config/avsandare-per-klinik.json');

/**
 * ORD-213 — "kan kliniken skicka?" måste gå att läsa utifrån.
 *
 * TVÅ FAKTA BOR PÅ OLIKA STÄLLEN. Viljan (`aktiv: true`) står i
 * config/avsandare-per-klinik.json, i repot. Tillåtelsen står i
 * ARCANA_GRAPH_SEND_ALLOWLIST, som en maskerad hemlighet i Render.
 *
 * Ingen vy visade dem tillsammans. Frågan "kan Curatiio skicka?" gick därför
 * bara att besvara genom att logga in på Render och läsa av en maskerad
 * hemlighet för hand — vilket jag gjorde 2026-09-04, och som inte är en
 * mätning som går att upprepa eller larma på.
 *
 * DET FARLIGA LÄGET är `aktiv: true` + adressen saknas i allowlisten. Då
 * vägrar Graph, och resultatet är inte fel avsändare utan INGET BREV. Fel
 * avsändare kommer åtminstone fram. Därför har svaret ett eget fält:
 * `tystFel`.
 *
 * Samma familj som ORD-153 §6: utan att grindens läge syns utifrån bevisar ett
 * grönt verifieringsskript ingenting — det kan lika gärna ha kört mot en
 * öppen grind.
 */

function bygg(allowlist) {
  const tidigare = process.env.ARCANA_GRAPH_SEND_ALLOWLIST;
  if (allowlist === null) delete process.env.ARCANA_GRAPH_SEND_ALLOWLIST;
  else process.env.ARCANA_GRAPH_SEND_ALLOWLIST = allowlist;

  const app = express();
  app.use(
    '/api/v1',
    createDiagRouter({
      config: { publicBaseUrl: null, stateRoot: '/tmp', aiProvider: 'fallback' },
      runtimeState: { startedAt: new Date().toISOString() },
    })
  );
  return {
    app,
    ateruppratta() {
      if (tidigare === undefined) delete process.env.ARCANA_GRAPH_SEND_ALLOWLIST;
      else process.env.ARCANA_GRAPH_SEND_ALLOWLIST = tidigare;
    },
  };
}

async function las(allowlist) {
  const { app, ateruppratta } = bygg(allowlist);
  const server = app.listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/_diag/env`);
    const json = await res.json();
    return json.resolved.avsandarePerKlinik;
  } finally {
    server.close();
    ateruppratta();
  }
}

test('varje klinik i facit får en rad — ingen kan falla bort tyst', async () => {
  const rader = await las('contact@hairtpclinic.com');
  const namn = rader.map((r) => r.klinik).sort();
  assert.deepEqual(namn, Object.keys(FACIT.kliniker).sort());
});

test('TYSTFEL: aktiv men inte i allowlisten — det läge som tappar brev', async () => {
  /**
   * Hela poängen med fältet. En klinik som vill skicka men inte får är den
   * enda kombinationen där ingenting alls kommer fram, och den syntes inte
   * någonstans förut.
   */
  const rader = await las('nagon.annan@example.org');
  for (const r of rader) {
    assert.equal(r.tillatenIAllowlist, false, `${r.klinik}: skulle inte vara tillåten`);
    assert.equal(r.kanSkicka, false);
    assert.equal(r.tystFel, r.aktiv, `${r.klinik}: tystFel ska följa aktiv när tillåtelse saknas`);
  }
  assert.ok(
    rader.some((r) => r.tystFel),
    'ingen klinik är aktiv — testet mäter ingenting'
  );
});

test('tillåten OCH aktiv ger kanSkicka, och då inget tystFel', async () => {
  const adresser = Object.values(FACIT.kliniker)
    .map((k) => k.avsandare)
    .join(',');
  const rader = await las(adresser);
  for (const r of rader) {
    assert.equal(r.tillatenIAllowlist, true, `${r.klinik} saknas trots att adressen står med`);
    assert.equal(r.kanSkicka, r.aktiv);
    assert.equal(r.tystFel, false);
  }
});

test('VILANDE klinik i allowlisten är INTE ett tyst fel', async () => {
  /**
   * Curatiio står som `aktiv: false` tills brevlådan är klar. Att adressen
   * ligger i allowlisten är då helt riktigt och ska inte larma — annars
   * skriker mätaren om det normala tillståndet och slutar bli lyssnad på.
   */
  const adresser = Object.values(FACIT.kliniker)
    .map((k) => k.avsandare)
    .join(',');
  const rader = await las(adresser);
  const vilande = rader.filter((r) => !r.aktiv);
  for (const r of vilande) {
    assert.equal(r.tystFel, false, `${r.klinik}: vilande klinik larmar`);
    assert.equal(r.kanSkicka, false, `${r.klinik}: vilande ska inte kunna skicka`);
  }
});

test('tom eller saknad allowlist ger inte tillåtelse åt någon', async () => {
  // Tomt värde får aldrig tolkas som "alla tillåtna". Det är den sortens
  // fallback som gör en spärr till dekoration.
  for (const v of ['', null, ' , , ']) {
    const rader = await las(v);
    assert.ok(
      rader.every((r) => !r.tillatenIAllowlist),
      `allowlist ${JSON.stringify(v)} gav tillåtelse`
    );
  }
});

test('matchningen är skiftlägesokänslig och tål mellanslag', async () => {
  const a = Object.values(FACIT.kliniker)[0].avsandare;
  const rader = await las(`  ${a.toUpperCase()} , annat@example.org `);
  const rad = rader.find((r) => FACIT.kliniker[r.klinik].avsandare === a);
  assert.equal(rad.tillatenIAllowlist, true, 'versaler eller mellanslag fällde matchningen');
});

test('ADRESSERNA LÄCKS INTE i svaret', async () => {
  /**
   * Listan är maskerad i Render av ett skäl. Svaret ska bära namn, viljeläge
   * och ett ja/nej — inte adresserna. Annars byter jag ut ett synlighets-
   * problem mot ett läckage.
   */
  const adresser = Object.values(FACIT.kliniker).map((k) => k.avsandare);
  const rader = await las(adresser.join(','));
  const text = JSON.stringify(rader);
  for (const a of adresser) {
    assert.ok(!text.includes(a), `${a} står i klartext i diag-svaret`);
  }
  assert.ok(!/@/.test(text), 'någon e-postadress läcker ut');
});
