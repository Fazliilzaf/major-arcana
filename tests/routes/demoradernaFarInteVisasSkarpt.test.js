'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

/**
 * ORD-212 — demoblocken i personalportalen.
 *
 * Fyra block innehåller hårdkodade patientnamn från demoläget, ritade som
 * riktiga kundrader: namn, ingrepp, graftantal, ordinationsstatus, datum.
 *
 * De gömdes bara när live-anropet gav rader:
 *
 *   if (adminList && data.queue?.length)  { ...göm... }
 *
 * `cco-booking-cases.json` finns inte i prod (mätt 2026-09-03), så kön är
 * alltid tom och villkoret blev aldrig sant. En inloggad ägare som öppnade
 * "Alla ärenden" fick fyra uppdiktade patienter serverade som klinikens
 * aktiva ärenden.
 *
 * En tom vy syns. Den här bristen gjorde det inte — och det är precis därför
 * den överlevde en baslinjemätning, blev nedskriven i handover-dokumentet, och
 * ändå låg kvar dagen efter.
 */

const FIL = path.join(__dirname, '..', '..', 'public', 'staff-portal.html');
const HTML = fs.readFileSync(FIL, 'utf8');

const DEMO_IDN = [
  'nurseFallbackList',
  'doctorFallbackReviews',
  'adminFallbackCases',
  'auditFallback',
];

test('demoblocken finns kvar i markupen — testet mäter något', () => {
  /**
   * Motprovet. Skulle någon ta bort blocken helt blir resten av testerna
   * triviala sanningar om en tom sida, och de skulle fortsätta vara gröna
   * medan de slutade betyda något.
   */
  const { document } = parseHTML(HTML);
  for (const id of DEMO_IDN) {
    assert.ok(document.getElementById(id), `${id} saknas — skriv om testet, ta inte bort det`);
  }
});

test('demoblocken innehåller PÅHITTADE PATIENTNAMN — det är vad som stod på spel', () => {
  const { document } = parseHTML(HTML);
  const text = document.getElementById('adminFallbackCases').textContent;
  assert.match(text, /Magnus Eriksson/);
  assert.match(text, /graft/i, 'raderna är ritade som kliniska ärenden, inte som exempeltext');
});

/**
 * Kör portalens EGEN funktion mot portalens EGEN markup.
 *
 * Funktionen klipps ut ur filen och evalueras — inte skriven av på nytt här.
 * Ett test som återimplementerar det det påstår sig mäta går grönt även när
 * originalet är trasigt.
 */
function kordoljDemoblock(document) {
  const start = HTML.indexOf('const DEMOBLOCK = [');
  assert.notEqual(start, -1, 'DEMOBLOCK-listan hittades inte i portalen');
  const slut = HTML.indexOf('\n      }', HTML.indexOf('function doljDemoblock()', start));
  assert.notEqual(slut, -1, 'doljDemoblock hittades inte i portalen');
  const kalla = HTML.slice(start, slut + '\n      }'.length);

  const fabrik = new Function('document', `${kalla}\nreturn doljDemoblock;`);
  fabrik(document)();
}

test('LIVE-LÄGE GÖMMER DEMOBLOCKEN — även när live-svaret är tomt', () => {
  /**
   * Det här är hela buggen. Innan rättelsen krävdes rader i svaret för att
   * demoraderna skulle försvinna; med en store som aldrig skrivits fanns
   * aldrig några rader.
   */
  const { document } = parseHTML(HTML);
  for (const id of DEMO_IDN) {
    assert.notEqual(document.getElementById(id).style.display, 'none', `${id} redan gömd`);
  }

  kordoljDemoblock(document);

  for (const id of DEMO_IDN) {
    assert.equal(document.getElementById(id).style.display, 'none', `${id} göms inte`);
  }
});

test('auditFallback är en RAD — syskonen efter den måste också bort', () => {
  /**
   * Den ligger inte i en behållare: demoraderna är syskon efter den. Göms
   * bara elementet självt står resten av loggen kvar och ser ut som riktig
   * historik i en vy vars hela syfte är spårbarhet.
   */
  const { document } = parseHTML(HTML);
  const forsta = document.getElementById('auditFallback');
  const syskon = [];
  for (let s = forsta.nextElementSibling; s; s = s.nextElementSibling) syskon.push(s);
  assert.ok(syskon.length > 0, 'inga syskon — då mäter testet ingenting');

  kordoljDemoblock(document);
  for (const s of syskon) {
    assert.equal(s.style.display, 'none', 'ett syskon till auditFallback står kvar synligt');
  }
});

test('anropet ligger DIREKT efter _liveMode = true, inte efter laddningen', () => {
  /**
   * Ordningen är inte kosmetisk. Görs gömningen efter att vyerna laddats
   * hinner demoraderna ritas, och den som tittar hinner läsa dem.
   *
   * Bunden till just den sekvensen — inte en sökning efter `doljDemoblock` i
   * hela filen, som hade träffat definitionen och gått grön utan ett enda
   * anrop.
   */
  const i = HTML.indexOf('_liveMode = true;');
  assert.notEqual(i, -1, '_liveMode sätts inte längre så — mät om');

  /**
   * KOMMENTARERNA MÅSTE BORT FÖRST. Första versionen av det här testet
   * matchade mot råtexten, och en mutation som kommenterade bort anropet
   * överlevde — assertionen läste en kommentar och kallade den kod. Samma
   * familj som att söka efter ett funktionsnamn i stället för att köra
   * funktionen.
   */
  const utanKommentarer = HTML.slice(i, i + 400)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(
    utanKommentarer,
    /doljDemoblock\(\)/,
    'doljDemoblock anropas inte när sessionen blir skarp'
  );
});

test('INGEN gömning får ligga kvar bakom ett .length-villkor', () => {
  /**
   * Regressionsspärren. Nästa gång någon lägger till ett demoblock är den
   * frestande lösningen att kopiera det gamla mönstret — göm det i
   * lyckat-grenen — och då är buggen tillbaka i exakt samma form.
   */
  for (const id of DEMO_IDN) {
    const traffar = HTML.split(`getElementById('${id}')`).length - 1;
    assert.equal(
      traffar,
      0,
      `${id} slås fortfarande upp utanför DEMOBLOCK — gömningen ska ske på ett ställe`
    );
  }
});
