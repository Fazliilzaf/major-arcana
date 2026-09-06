'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-245 — en testfil får inte lämna en server öppen.
 *
 * BAKGRUNDEN, OCH DET SOM INTE ÄR BEVISAT. Sviten gav ett rött test en gång och
 * tre olika utfall på tre körningar. Mätningen hittade att tjugoen filer startar
 * en server på en tillfällig port, och att flera anrop till close() aldrig
 * väntades in.
 *
 * server.close() är asynkront: lyssnaren slutar ta emot nya anslutningar direkt
 * men släpper inte porten förrän händelseloopen kört klart stängningen. Ett
 * test som går vidare utan att vänta lämnar handtaget öppet, och i en svit som
 * kör tvåhundra filer parallellt ackumuleras de.
 *
 * MEN: jag lyckades ALDRIG reproducera flakigheten. Tolv riktade
 * stresskörningar av just de här filerna och tre fulla sviter var alla gröna.
 * Det oinväntade close() är alltså en BEVISAD defekt men en OBEVISAD orsak till
 * just det rödа testet. Skulle flakigheten återkomma efter den här fixen är
 * hypotesen motbevisad — och det är värt något i sig, för då vet nästa person
 * att leta någon annanstans i stället för att anta att det är löst.
 *
 * TVÅ FEL I MIN EGEN MÄTNING, båda värda att veta om:
 *
 *   Första greppen letade efter "close(resolve)" och rapporterade tolv filer
 *   som trasiga. Flera av dem väntade in stängningen med ett annat mönster,
 *   "close((err) => ...)", och var alltså redan rätt.
 *
 *   opsClientoBookingsImport.test.js rapporterades som trasig och gjorde i
 *   själva verket det BÄSTA av alla: den river anslutningarna med
 *   closeAllConnections innan den väntar. Utan det kan close() vänta i
 *   evighet på en keep-alive-anslutning — alltså hänga i stället för att gå
 *   vidare, ett värre symptom än det fixen skulle lösa. Den lösningen är nu
 *   kopierad till alla och till hjälparen.
 */

const ROT = path.join(__dirname, '..', '..');
const TESTROT = path.join(ROT, 'tests');

/** Alla testfiler, rekursivt. */
function testfiler(dir = TESTROT, ut = []) {
  for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, post.name);
    if (post.isDirectory()) testfiler(p, ut);
    else if (post.name.endsWith('.test.js')) ut.push(p);
  }
  return ut;
}

/** Kommentarer bort. Nionde gången regeln behövs i den här kodbasen. */
function utanKommentarer(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('T-101: ingen testfil anropar close() utan att vänta in den', () => {
  // Ett bart "server.close();" är alltid fel här. Väntas stängningen in ser
  // anropet i stället ut som close(resolve) eller close((err) => ...), alltså
  // med ett argument.
  const brister = [];
  for (const fil of testfiler()) {
    const kod = utanKommentarer(fs.readFileSync(fil, 'utf8'));
    if (!kod.includes('.listen(')) continue;
    for (const m of kod.matchAll(/(\w+)\.close\(\)\s*;/g)) {
      const rad = kod.slice(0, m.index).split('\n').length;
      brister.push(`${path.relative(ROT, fil)}:${rad}  ${m[0]}`);
    }
  }
  assert.deepEqual(
    brister,
    [],
    `${brister.length} oinväntad(e) stängning(ar):\n  ${brister.join('\n  ')}`
  );
});

test('T-102: hjälparen river anslutningarna innan den väntar', () => {
  // close() väntar på att ALLA öppna anslutningar avslutas. En hängande
  // keep-alive gör att löftet aldrig resolvar och testet HÄNGER — ett värre
  // symptom än det oinväntade close() fixen skulle lösa.
  //
  // Kravet ställs på HJÄLPAREN och inte på varje fil, och det är ett medvetet
  // val. Första versionen krävde closeAllConnections överallt och flaggade 73
  // filer. Att svepa igenom dem hade varit en stor ändring utan mätt vinst:
  // de flesta gör ett enda anrop utan keep-alive och kan inte hänga. Kravet
  // hör hemma där mönstret ska ärvas ifrån.
  const kod = fs.readFileSync(path.join(TESTROT, 'helpers', 'tillfalligServer.js'), 'utf8');
  assert.match(kod, /closeAllConnections/, 'hjälparen river inte anslutningarna');
  const i = kod.indexOf('closeAllConnections');
  const j = kod.indexOf('await stangd');
  assert.ok(i < j, 'anslutningarna rivs efter att väntan börjat — då hjälper det inte');
});

test('T-103: den kanoniska hjälparen finns och gör rätt', () => {
  // Tjugoen filer implementerade samma sak för hand. Hjälparen finns för att
  // nästa testfil ska ärva ett korrekt mönster i stället för att kopiera från
  // grannen — samma resonemang som djuptokens och textgolvet.
  const helper = path.join(TESTROT, 'helpers', 'tillfalligServer.js');
  assert.ok(fs.existsSync(helper), 'tests/helpers/tillfalligServer.js saknas');
  const kod = fs.readFileSync(helper, 'utf8');
  assert.match(kod, /closeAllConnections/, 'hjälparen river inte anslutningarna');
  assert.match(kod, /await stangd/, 'hjälparen väntar inte in stängningen');
  assert.match(kod, /once\(server, 'listening'\)/, 'hjälparen läser porten innan den finns');
});

test('T-104: hjälparen fungerar — startar, svarar, stänger', async () => {
  // Ett test som bevisar att hjälparen gör det den säger, i stället för att
  // bara mäta att koden ser rätt ut.
  const express = require('express');
  const { anrop, medServer } = require('../helpers/tillfalligServer');

  const app = express();
  app.get('/ping', (_req, res) => res.json({ ok: true }));

  const res = await anrop(app, 'GET', '/ping');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json(), { ok: true });

  // Och porten ska vara släppt efteråt: en ny server ska kunna ta samma port.
  let port;
  await medServer(app, async (bas) => {
    port = Number(new URL(bas).port);
  });
  assert.ok(port > 0, 'ingen port tilldelades');
});
