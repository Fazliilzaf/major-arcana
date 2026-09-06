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
  // KRAVET STÄLLS BARA HÄR, och skälet är mätt — inte antaget.
  //
  // Jag ville först kräva closeAllConnections i alla filer som startar en
  // server. Det flaggade 73 stycken, och motiveringen jag skrev var att en
  // vilande keep-alive-anslutning kan hänga close(). Den motiveringen var FEL.
  // Mätningen på den här Node-versionen:
  //
  //   vanlig fetch, anslutningen vilande      close() -> 0 ms
  //   explicit http.Agent keepAlive: true     close() -> 0 ms
  //   request som PÅGÅR och aldrig svarar     close() -> HÄNGER
  //   samma, med closeAllConnections          rivs på 302 ms
  //
  // Node stänger vilande anslutningar själv. Det enda fall som behöver
  // rivningen är en request som ÄR I LUFTEN när vi stänger — alltså när `run`
  // kastar mitt i ett anrop och vi hamnar i finally med en levande request.
  //
  // Att svepa 117 filer för ett fall de inte kan nå hade varit ceremoni. Kravet
  // hör hemma i hjälparen, som är det enda stället där mönstret ska ärvas
  // ifrån — och där fallet FAKTISKT kan inträffa.
  const kod = fs.readFileSync(path.join(TESTROT, 'helpers', 'tillfalligServer.js'), 'utf8');
  assert.match(kod, /closeAllConnections/, 'hjälparen river inte anslutningarna');
  const i = kod.indexOf('closeAllConnections');
  const j = kod.indexOf('await stangd');
  assert.ok(i < j, 'anslutningarna rivs efter att väntan börjat — då hjälper det inte');
});

test('T-105: hjälparen HÄNGER INTE när testkroppen kastar mitt i ett anrop', async () => {
  // Motprovet mot exakt det fall som motiverar closeAllConnections, och det
  // enda som gör den nödvändig. Ett misslyckat test ska rapportera sitt fel,
  // inte hänga — ett hängande test är svårare att förstå än ett rött.
  const express = require('express');
  const { medServer } = require('../helpers/tillfalligServer');

  const app = express();
  // Rutten svarar ALDRIG. Anropet är därmed i luften när vi stänger.
  app.get('/tyst', () => {});

  const start = Date.now();
  await assert.rejects(
    () =>
      medServer(app, async (bas) => {
        const svar = fetch(`${bas}/tyst`);
        await new Promise((r) => setTimeout(r, 60)); // låt requesten nå fram
        svar.catch(() => {});
        throw new Error('testet misslyckades mitt i anropet');
      }),
    /misslyckades mitt i anropet/,
    'felet från testkroppen nådde inte fram'
  );
  const tid = Date.now() - start;
  assert.ok(tid < 2000, `stängningen tog ${tid} ms — hjälparen hängde på den öppna requesten`);
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
