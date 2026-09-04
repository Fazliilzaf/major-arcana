'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-215 — ett standardvärde som alltid ger 422 är inte ett standardvärde.
 *
 * `resolveCcoRuntimeWorklistMailboxIds` föll tillbaka på fem adresser.
 * Worklist-handlern avvisade allt över två med 422. Varje anropare som inte
 * angav mailboxIds fick alltså ett hårt fel, varje gång, by design.
 *
 * FELET SÅG INTE UT SOM ETT SERVERFEL. Personalportalens `apiFetch` ger null
 * på icke-2xx, och vyn ritade "Konversationslistan är inte tillgänglig just nu.
 * Mailbox-ingestion kan sakna konfiguration." — en förklaring som pekade på
 * fel ställe. Den som läste den letade efter en ingestionsbugg som inte fanns.
 *
 * Taket självt är riktigt och rörs inte: en bred svepning materialiserar varje
 * lagrat meddelande i varje shard på event-loopen och kan svälta /readyz.
 * Skillnaden som saknades var mellan "du bad om för mycket" och "du bad inte
 * om något alls".
 */

const KOD = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'routes', 'capabilities.js'),
  'utf8'
);
const PORTAL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'staff-portal.html'),
  'utf8'
);

/**
 * Klipp ut en funktionskropp så mätningen inte råkar läsa grannen.
 *
 * FÖRSTA VERSIONEN BÖRJADE RÄKNA KLAMRAR på `KOD.indexOf('{', start)` — och
 * träffade då `{}` i signaturens standardvärde (`input = {}`). Djupet gick upp
 * till 1 och direkt ner till 0, så den returnerade två tecken i stället för
 * kroppen. Tre tester gick rött mot korrekt kod.
 *
 * Kroppen börjar efter signaturens avslutande parentes. Den letas upp först.
 */
function funktion(namn) {
  const start = KOD.indexOf(`function ${namn}(`);
  assert.notEqual(start, -1, `${namn} finns inte längre — mät om`);

  // Hoppa förbi parameterlistan med egen parentesräkning — den kan innehålla
  // både klamrar och hakparenteser.
  let parenteser = 0;
  let i = KOD.indexOf('(', start);
  for (; i < KOD.length; i++) {
    if (KOD[i] === '(') parenteser++;
    else if (KOD[i] === ')') {
      parenteser--;
      if (parenteser === 0) break;
    }
  }

  let djup = 0;
  for (let j = KOD.indexOf('{', i); j < KOD.length; j++) {
    if (KOD[j] === '{') djup++;
    else if (KOD[j] === '}') {
      djup--;
      if (djup === 0) {
        const kropp = KOD.slice(start, j + 1);
        assert.ok(kropp.length > 120, `utklippet av ${namn} är ${kropp.length} tecken — mät om`);
        return kropp;
      }
    }
  }
  throw new Error(`kunde inte klippa ut ${namn}`);
}

function taket() {
  const m = KOD.match(/const CCO_RUNTIME_WORKLIST_MAX_MAILBOX_IDS = (\d+)/);
  assert.ok(m, 'taket hittades inte');
  return Number(m[1]);
}

test('taket finns kvar — skyddet mot breda svepningar är inte borttaget', () => {
  /**
   * Den frestande "fixen" var att höja taket. Den hade gjort 422:an borta och
   * event-loopen sårbar. Testet håller taket lågt så att nästa läsare måste
   * välja medvetet.
   */
  const max = taket();
  assert.ok(max >= 1 && max <= 3, `taket är ${max} — höjt utan att skyddet omprövats?`);
});

test('RESERVVÄRDET FÅR ALDRIG ÖVERSTIGA TAKET — det var hela buggen', () => {
  const kropp = funktion('resolveCcoRuntimeWorklistMailboxIds');
  const max = taket();

  // Reservlistan ska kapas mot taket, inte returneras hel.
  assert.match(
    kropp,
    /CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS\.slice\(\s*0,\s*CCO_RUNTIME_WORKLIST_MAX_MAILBOX_IDS\s*\)/,
    'reservvärdet kapas inte mot taket'
  );
  assert.ok(
    !/CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS\.slice\(\)/.test(kropp),
    'reservvärdet returneras okapat igen'
  );

  // Och motprovet på siffrorna: listan ÄR längre än taket, annars mäter
  // testet ingenting.
  const lista = KOD.match(
    /CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS = Object\.freeze\(\[([\s\S]*?)\]\)/
  );
  assert.ok(lista, 'standardlistan hittades inte');
  const antal = (lista[1].match(/@/g) || []).length;
  assert.ok(
    antal > max,
    `listan har ${antal} adresser, taket ${max} — buggen kan inte uppstå, mät om`
  );
});

test('422 gäller BARA ett uttryckligt val — inte ett uteblivet', () => {
  /**
   * Skillnaden som saknades. Den som ber om fem brevlådor ska nekas; den som
   * inte ber om något ska betjänas.
   */
  assert.match(
    KOD,
    /query\.mailboxIdsSource === 'explicit' &&\s*\n?\s*query\.mailboxIds\.length > CCO_RUNTIME_WORKLIST_MAX_MAILBOX_IDS/,
    '422 villkoras inte på explicit val'
  );
  // Källan måste faktiskt sättas, annars är villkoret alltid falskt och taket
  // slutar skydda något.
  assert.match(funktion('resolveCcoRuntimeWorklistMailboxIds'), /arcanaKalla = 'explicit'/);
  // Källan bärs rakt igenom. Formen ändrades när ett TREDJE läge tillkom
  // (explicit_off_scope) — en ternär mot 'explicit' hade tystat det till
  // 'fallback', alltså exakt det tysta fail-open som off-scope-testet vaktar.
  assert.match(KOD, /mailboxIdsSource: mailboxIds\.arcanaKalla \|\| 'fallback'/);
});

test('OFF-SCOPE nekas fortfarande — skyddet var en bieffekt av buggen', () => {
  /**
   * DET FARLIGASTE I HELA RÄTTELSEN, och jag hittade det inte själv — den
   * befintliga sviten gjorde det.
   *
   * Före rättelsen skyddades otillåtna brevlådor så här: adressen filtrerades
   * bort, listan blev tom, reservvärdet på fem trädde in, fem överskred taket
   * två → 422. Fail-closed vilade alltså på att standardvärdet var ogiltigt.
   *
   * Med ett giltigt standardvärde hade en otillåten begäran i stället TYST
   * fått data från kons@ och info@. Anroparen ber om brevlåda X, får Y, och
   * ingenting säger ifrån. Det är sämre än felet den ersatte.
   *
   * Skillnaden mellan "angav inget" och "angav bara otillåtet" bärs därför
   * uttryckligen nu.
   */
  const kropp = funktion('resolveCcoRuntimeWorklistMailboxIds');
  assert.match(kropp, /explicit_off_scope/, 'off-scope skiljs inte från uteblivet val');
  assert.match(
    kropp,
    /const angavNagot = parseMailboxIdValues/,
    'kontrollen av "angav något" saknas'
  );

  assert.match(
    KOD,
    /query\.mailboxIdsSource === 'explicit_off_scope'/,
    'handlern nekar inte off-scope'
  );
  assert.match(KOD, /worklist_scope_off_limits/, 'felkoden saknas');

  // Ordningen spelar roll: off-scope måste avvisas FÖRE takkontrollen, annars
  // faller en tom lista igenom som ett giltigt smalt val.
  const iOff = KOD.indexOf("'explicit_off_scope'");
  const iTak = KOD.indexOf("query.mailboxIdsSource === 'explicit' &&");
  assert.ok(iOff < iTak, 'off-scope-kontrollen ligger efter takkontrollen');
});

test('HISTORIK-resolvern rörs inte — den lyder inte under worklistens tak', () => {
  /**
   * De två funktionerna ser nästan likadana ut och ligger 20 rader isär. Min
   * första redigering matchade båda, och att kapa historikens lista hade
   * smalnat av kundhistoriken utan att någon bett om det.
   */
  const kropp = funktion('resolveCcoRuntimeHistoryMailboxIds');
  assert.match(
    kropp,
    /CCO_CUSTOMER_HISTORY_DEFAULT_MAILBOX_IDS\.slice\(\)/,
    'historikens reservlista har kapats — den ska vara hel'
  );
});

test('PERSONALPORTALEN väljer brevlådor uttryckligen', () => {
  assert.match(PORTAL, /KONVERSATIONER_MAILBOXAR = \[/, 'valet är inte utskrivet i vyn');
  assert.match(
    PORTAL,
    /mailboxIds: KONVERSATIONER_MAILBOXAR\.join\(','\)/,
    'valet skickas inte med'
  );

  // Antalet får inte överstiga serverns tak — annars byter vi en tyst 422 mot
  // en högljudd.
  const m = PORTAL.match(/KONVERSATIONER_MAILBOXAR = \[([^\]]*)\]/);
  const antal = (m[1].match(/@/g) || []).length;
  assert.ok(antal >= 1 && antal <= taket(), `vyn väljer ${antal} brevlådor, taket är ${taket()}`);
});

test('FELTEXTEN GISSAR INTE LÄNGRE på orsaken', () => {
  /**
   * Den gamla texten sa "Mailbox-ingestion kan sakna konfiguration". Det var
   * fel i det enda fall som faktiskt inträffade, och en felaktig förklaring är
   * svårare att komma förbi än ingen alls — den skickar iväg felsökningen åt
   * fel håll.
   */
  /**
   * KOMMENTARERNA MÅSTE BORT FÖRST — den gamla texten citeras i förklaringen
   * till varför den togs bort, och ett rått mönster träffar citatet. Samma
   * fälla som i ORD-212, där en mutation överlevde för att assertionen läste
   * en bortkommenterad rad och kallade den kod.
   */
  const utanKommentarer = PORTAL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/Mailbox-ingestion kan sakna konfiguration/.test(utanKommentarer),
    'den gissande feltexten är tillbaka i kod'
  );
  assert.match(PORTAL, /Konversationslistan kunde inte hämtas/);
});
