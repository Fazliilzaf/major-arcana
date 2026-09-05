'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ORD-234 — raden ska visa vem det är från, och vad de skrev.
 *
 * Mätt på åtta rader under "Övriga" i produktion: sex av dem inledde med något
 * som inte var meddelandet. Det verkliga innehållet i den första var
 * "Såg du bilderna?" — fyra ord, efter nittio tecken Outlook-banner. Raden
 * personalen triagerar på visade alltså allt utom det den fanns till för.
 *
 * Samtidigt låg avsändaren SIST och svagast: grå mikrotext under en pill, medan
 * ämnesraden ("Re: Offert") bar rubrikvikten. Det första ögat söker i en inkorg
 * är vem — och det stod längst ned.
 *
 * TVÅ RISKER SOM TESTET FINNS TILL FÖR
 *
 * 1. Översstädning. Ett filter som klipper för glatt döljer verkligt innehåll.
 *    En signatur kan bära ett telefonnummer som spelar roll. Därför: bruset tas
 *    bort ENDAST från början, aldrig mitt i, och aldrig så att raden blir tom.
 *    T-101 till T-106 är motproven.
 *
 * 2. Att förväxla "städa text" med "klassificera brus". Repot har redan en
 *    fraslista i messageClassification.js, men den svarar på en annan fråga:
 *    ÄR det här ett systemmejl. Ett riktigt patientmejl kan bära Outlook-
 *    bannern utan att vara skräp. Att återanvända listan hade klassat om
 *    patienter till brus. T-107 håller listorna åtskilda.
 */

const PORTAL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'staff-portal.html'),
  'utf8'
);

function funktionskropp(kalla, namn) {
  const start = kalla.indexOf(`function ${namn}(`);
  assert.notEqual(start, -1, `hittar inte function ${namn}(`);
  const parStart = kalla.indexOf('(', start);
  let par = 0;
  let i = parStart;
  for (; i < kalla.length; i += 1) {
    if (kalla[i] === '(') par += 1;
    else if (kalla[i] === ')') {
      par -= 1;
      if (par === 0) break;
    }
  }
  const kroppStart = kalla.indexOf('{', i);
  let djup = 0;
  for (let j = kroppStart; j < kalla.length; j += 1) {
    if (kalla[j] === '{') djup += 1;
    else if (kalla[j] === '}') {
      djup -= 1;
      if (djup === 0) return kalla.slice(kroppStart, j + 1);
    }
  }
  throw new Error(`obalanserade klamrar i ${namn}`);
}

// Kommentarer bort före konstruktionsmätning: dokumentationen av det gamla
// felet innehåller de mönster testet letar efter (ORD-233:s lärdom).
function utanKommentarer(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Plocka ut en const-deklaration med balansräkning. */
function konstblock(kalla, namn) {
  const start = kalla.indexOf(`const ${namn} =`);
  assert.notEqual(start, -1, `hittar inte const ${namn}`);
  const slut = kalla.indexOf('\n\n', start);
  return kalla.slice(start, slut === -1 ? start + 2000 : slut);
}

function konstblockLokal(kalla, namn) {
  const start = kalla.indexOf(`const ${namn} =`);
  const slut = kalla.indexOf('\n\n', start);
  return kalla.slice(start, slut === -1 ? start + 2000 : slut);
}

/**
 * ORD-235 lade till ett åldersmärke i alla tre kortrenderarna. Testerna här
 * bygger renderarna isolerat, så beroendet måste injiceras — annars faller de
 * på ReferenceError utan att något är fel i produkten.
 *
 * Den RIKTIGA hjälparen byggs ur källan, inte en stubbe. En stubbe hade gjort
 * testet grönt även om aldersMarke slutade fungera.
 */
const ALDERSKALLA = `${konstblockLokal(PORTAL, 'ALDERSSTEG')}
   function alderTimmar(varde, nu) ${funktionskropp(PORTAL, 'alderTimmar')}
   function aldersNyckel(timmar) ${funktionskropp(PORTAL, 'aldersNyckel')}
   function aldersEtikett(timmar) ${funktionskropp(PORTAL, 'aldersEtikett')}
   function aldersMarke(varde, nu) ${funktionskropp(PORTAL, 'aldersMarke')}`;

const RAD = funktionskropp(PORTAL, 'renderConvRow');
const RAD_KOD = utanKommentarer(RAD);
const STADA = funktionskropp(PORTAL, 'stadaForhandsvisning');

/** Bygg körbara versioner av hjälparna, med sina konstanter. */
function byggStadare() {
  const brus = konstblock(PORTAL, 'BRUSPREFIX');
  const avslut = konstblock(PORTAL, 'AVSLUTSMARKORER');
  const minlangd = konstblock(PORTAL, 'MIN_INNEHALL_FORE_AVSLUT');
  return new Function(
    `${brus}\n${avslut}\n${minlangd}\nreturn function stadaForhandsvisning(ratext) ${STADA};`
  )();
}

function byggTonhjalpare() {
  const toner = konstblock(PORTAL, 'AVSANDARTONER');
  const initialer = funktionskropp(PORTAL, 'avsandarInitialer');
  const ton = funktionskropp(PORTAL, 'avsandarTon');
  return new Function(
    `${toner}
     function avsandarInitialer(namn) ${initialer}
     function avsandarTon(namn) ${ton}
     return { avsandarInitialer, avsandarTon };`
  )();
}

const stada = byggStadare();
const { avsandarInitialer, avsandarTon } = byggTonhjalpare();

/* ── Städningen gör sitt jobb ─────────────────────────────────────────── */

test('T-001: Outlooks avsändarbanner tas bort', () => {
  const ra =
    'Du får inte ofta e-post från kons@hairtpclinic.com. Läs om varför det här är viktigt Såg du bilderna?';
  assert.equal(stada(ra), 'Såg du bilderna?');
});

test('T-002: den längre bannervarianten tas också bort', () => {
  const ra =
    'Vissa som har fått det här meddelandet får inte ofta e-post från info@x.se. Läs om varför det här är viktigt Hej! Jag jobbar med en smart tjänst.';
  assert.equal(stada(ra), 'Hej! Jag jobbar med en smart tjänst.');
});

test('T-003: citerad kontaktformulärshuvud tas bort', () => {
  const ra =
    'Från: Christian Abdulahad E-post: c@x.se Telefon: 0700000000 Hur kan vi hjälpa dig? En fråga: när man gör PRP hos er, hur många rör ingår?';
  assert.equal(stada(ra), 'En fråga: när man gör PRP hos er, hur många rör ingår?');
});

test('T-004: citatinledning med datum tas bort', () => {
  const ra = '24 apr. 2026 kl. 14:06 skrev David <d@x.se>: Hejsan! Läste på lite om ingreppet.';
  assert.equal(stada(ra), 'Hejsan! Läste på lite om ingreppet.');
});

test('T-005: lager av brus skalas av i flera varv', () => {
  const ra =
    'Du får inte ofta e-post från kons@hairtpclinic.com. Läs om varför det här är viktigt Såg du bilderna? Skickat från Outlook för iOS';
  // "Skickat från Outlook för iOS" är en avslutsmarkör, men står här efter bara
  // 16 tecken innehåll — under minlängden 25. Då kapas den INTE, eftersom en
  // kapning där hade riskerat att lämna en stump.
  assert.equal(stada(ra), 'Såg du bilderna? Skickat från Outlook för iOS');
});

test('T-006: signatur EFTER innehållet kapas — det är så mejlen faktiskt ser ut', () => {
  const ra =
    'Tack för svaret, jag återkommer på måndag. Bästa hälsningar, Fazli Krasniqi Hårspecialist | Hårtransplantationer & PRP-injektioner Vasaplatsen 2, 411 34 Göteborg';
  assert.equal(stada(ra), 'Tack för svaret, jag återkommer på måndag.');
});

test('T-007: citerad tråd efter innehållet kapas', () => {
  const ra =
    'Ja det låter bra, boka in mig på tisdagen. 11 juli 2026 kl. 15:09 skrev Kons | Hair TP Clinic <k@x.se>: hej';
  assert.equal(stada(ra), 'Ja det låter bra, boka in mig på tisdagen.');
});

test('T-008: ett kort meddelande kapas INTE av en avslutsmarkör', () => {
  // Under minlängden: hela raden är kortare än 25 tecken före markören.
  const ra = 'Hej hej Bästa hälsningar, Fazli';
  assert.equal(stada(ra), ra, 'ett kort meddelande kapades till en stump');
});

/* ── Motproven: städningen får inte äta verkligt innehåll ─────────────── */

test('T-101: en ren text lämnas exakt oförändrad', () => {
  const ra = 'Hej! Jag undrar om det går att boka om min tid till nästa vecka?';
  assert.equal(stada(ra), ra);
});

test('T-102: städning tömmer aldrig raden — originalet returneras', () => {
  const baraBrus = 'Du får inte ofta e-post från x@y.se. Läs om varför det här är viktigt';
  const ut = stada(baraBrus);
  assert.ok(ut.length > 0, 'raden blev tom');
  assert.equal(ut, baraBrus, 'när allt är brus ska originalet visas, inte tomhet');
});

test('T-103: brusfras MITT i en text rörs inte', () => {
  const ra =
    'Kunden skrev att hon fick meddelandet "Du får inte ofta e-post från oss" och undrar varför.';
  assert.equal(stada(ra), ra, 'en fras mitt i texten kapades — filtret är inte ankrat till början');
});

test('T-108: HELA bannerfrasen mitt i en text rörs inte', () => {
  // T-103 räckte inte. Dess text saknar "Läs om varför det här är viktigt",
  // så mönstret matchade inte ens utan sitt ^-ankare — testet prövade aldrig
  // det det påstod. Här står hela frasen mitt i en mening.
  const ra =
    'Kunden hörde av sig och sa: Du får inte ofta e-post från oss. Läs om varför det här är viktigt — hon undrar om det är phishing.';
  assert.equal(stada(ra), ra, 'bannerfrasen kapades mitt i texten; ^-ankaret saknas');
});

test('T-109: när två avslutsmarkörer finns kapas vid den FÖRSTA', () => {
  // T-006 och T-007 har bara en markör var, så först-kontra-sist prövades
  // aldrig. Här står signaturen före citattråden; kapningen ska ske vid
  // signaturen, annars följer den med in i förhandsvisningen.
  const ra =
    'Ja det låter bra, boka in mig på tisdagen. Med vänliga hälsningar, Anna 11 juli 2026 kl. 15:09 skrev Kons <k@x.se>: hej';
  assert.equal(stada(ra), 'Ja det låter bra, boka in mig på tisdagen.');
});

test('T-104: ett meddelande som bara NÄMNER Vasaplatsen kapas inte', () => {
  const ra = 'Ligger ni kvar på Vasaplatsen 2 eller har ni flyttat?';
  assert.equal(stada(ra), ra);
});

test('T-105: tom och saknad indata ger tom sträng, inte krasch', () => {
  assert.equal(stada(''), '');
  assert.equal(stada(null), '');
  assert.equal(stada(undefined), '');
});

test('T-106: telefonnummer i brödtext överlever städningen', () => {
  const ra = 'Hej, du når mig lättast på 0701234567 efter klockan tre.';
  assert.equal(stada(ra), ra);
});

test('T-107: brusfraslistan är EGEN och återanvänder inte klassificeraren', () => {
  assert.ok(
    !RAD_KOD.includes('STRONG_SYSTEM_MAIL_PATTERNS'),
    'raden återanvänder klassificerarens lista — den svarar på en annan fråga'
  );
  assert.ok(
    PORTAL.includes('const BRUSPREFIX'),
    'BRUSPREFIX saknas — städningen har ingen egen lista'
  );
});

/* ── Avsändaren först ─────────────────────────────────────────────────── */

test('T-201: initialer bildas av första och sista namnet', () => {
  assert.equal(avsandarInitialer('Ehssan Shaba'), 'ES');
  assert.equal(avsandarInitialer('Christian Abdulahad'), 'CA');
  assert.equal(avsandarInitialer('David'), 'DA');
  assert.equal(avsandarInitialer('Anna Maria Lind'), 'AL');
  assert.equal(avsandarInitialer(''), '');
  assert.equal(avsandarInitialer(null), '');
});

test('T-202: tonen är deterministisk — samma namn ger alltid samma färg', () => {
  const a = avsandarTon('Ehssan Shaba');
  for (let i = 0; i < 50; i += 1) {
    assert.equal(avsandarTon('Ehssan Shaba'), a, 'tonen varierar mellan anrop');
  }
  assert.equal(avsandarTon('EHSSAN SHABA'), a, 'skiftläge ger olika färg');
  assert.equal(avsandarTon('  Ehssan Shaba  '), a, 'blanksteg ger olika färg');
});

test('T-203: tonerna sprids över paletten, inte alla på samma', () => {
  const namn = [
    'Ehssan Shaba',
    'Therese Enström',
    'Christian Abdulahad',
    'David Larsson',
    'Anna Lind',
    'Magnus Eriksson',
    'Sara Nilsson',
    'Peter Ohlsson',
    'Lisa Berg',
    'Omar Haddad',
  ];
  const toner = new Set(namn.map(avsandarTon));
  assert.ok(toner.size >= 3, `endast ${toner.size} ton(er) användes för tio namn`);
});

test('T-204: tonen är alltid en av portalens egna färger', () => {
  const tillatna = new Set(['sage', 'info', 'violet', 'amber', 'accent', 'neutral']);
  for (const n of ['A', 'Bo Ek', 'Zzz Yyy', '', 'Ö Ä Å']) {
    assert.ok(tillatna.has(avsandarTon(n)), `okänd ton för "${n}": ${avsandarTon(n)}`);
  }
});

test('T-205: avsändaren renderas före ämnet i markupen', () => {
  const iAvsandare = RAD_KOD.indexOf('conv-avsandare');
  const iAmne = RAD_KOD.indexOf('conv-subject');
  assert.ok(iAvsandare !== -1, 'conv-avsandare saknas');
  assert.ok(iAmne !== -1, 'conv-subject saknas');
  assert.ok(iAvsandare < iAmne, 'ämnet står fortfarande före avsändaren');
});

test('T-206: "Ingen kundkoppling" skrivs inte ut — frånvaro behöver ingen etikett', () => {
  assert.ok(
    !RAD_KOD.includes('Ingen kundkoppling'),
    'raden skriver fortfarande ut "Ingen kundkoppling"'
  );
});

test('T-207: lane-pillen upprepar inte sektionsrubriken', () => {
  assert.ok(
    !/<span class="conv-lane/.test(RAD_KOD),
    'lane-pillen finns kvar — den upprepar rubriken sektionen redan bär'
  );
});

test('T-208: brevlådeadressen står inte på raden', () => {
  assert.ok(
    !RAD_KOD.includes('mailboxId'),
    'brevlådeadressen renderas fortfarande; den är samma för nästan alla rader'
  );
});

test('T-209: den positiva kopplingen visas fortfarande', () => {
  assert.ok(RAD_KOD.includes('conv-match'), 'kopplingsmarkören saknas helt');
  assert.ok(/arKopplad\s*\n?\s*\?/.test(RAD_KOD), 'kopplingen grindas inte på arKopplad');
});

test('T-210: avataren renderas och får en ton', () => {
  assert.ok(RAD_KOD.includes('conv-avatar'), 'avataren saknas');
  assert.ok(RAD_KOD.includes('avsandarTon('), 'tonen härleds inte');
  assert.ok(RAD_KOD.includes('avsandarInitialer('), 'initialerna härleds inte');
});

test('T-211: städningen är inkopplad på preview, inte bara definierad', () => {
  assert.ok(
    /stadaForhandsvisning\(row\.preview\)/.test(RAD_KOD),
    'stadaForhandsvisning anropas inte på row.preview'
  );
});

/* ── Hela raden, körd ─────────────────────────────────────────────────── */

test('T-301: en rad med okänd avsändare kraschar inte och visar en rimlig etikett', () => {
  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const formatDateTime = () => '11 aug 09:50';
  const brus = konstblock(PORTAL, 'BRUSPREFIX');
  const avslut = konstblock(PORTAL, 'AVSLUTSMARKORER');
  const minlangd = konstblock(PORTAL, 'MIN_INNEHALL_FORE_AVSLUT');
  const toner = konstblock(PORTAL, 'AVSANDARTONER');

  const fn = new Function(
    'escapeHtml',
    'formatDateTime',
    `${brus}\n${avslut}\n${minlangd}\n${toner}\n${ALDERSKALLA}
     function stadaForhandsvisning(ratext) ${STADA}
     function avsandarInitialer(namn) ${funktionskropp(PORTAL, 'avsandarInitialer')}
     function avsandarTon(namn) ${funktionskropp(PORTAL, 'avsandarTon')}
     return function renderConvRow(row) ${RAD};`
  )(escapeHtml, formatDateTime);

  const html = fn({
    lane: 'all',
    subject: 'Ny kund?',
    preview:
      'Vissa som har fått det här meddelandet får inte ofta e-post från info@x.se. Läs om varför det här är viktigt Hej! Jag jobbar med en smart tjänst.',
    timing: { latestMessageAt: '2026-08-11T09:50:00Z' },
  });

  assert.ok(html.includes('Okänd avsändare'), 'saknar etikett för okänd avsändare');
  assert.ok(html.includes('Hej! Jag jobbar med en smart tjänst.'), 'meddelandet visas inte');
  assert.ok(!html.includes('Läs om varför'), 'bannern visas fortfarande');
  assert.ok(!html.includes('Ingen kundkoppling'), '"Ingen kundkoppling" visas');
  assert.ok(html.includes('conv-avatar'), 'avataren saknas');
});

test('T-302: en rad med kopplad kund visar namn, bock och initialer', () => {
  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const formatDateTime = () => '05 sep 09:55';
  const brus = konstblock(PORTAL, 'BRUSPREFIX');
  const avslut = konstblock(PORTAL, 'AVSLUTSMARKORER');
  const minlangd = konstblock(PORTAL, 'MIN_INNEHALL_FORE_AVSLUT');
  const toner = konstblock(PORTAL, 'AVSANDARTONER');

  const fn = new Function(
    'escapeHtml',
    'formatDateTime',
    `${brus}\n${avslut}\n${minlangd}\n${toner}\n${ALDERSKALLA}
     function stadaForhandsvisning(ratext) ${STADA}
     function avsandarInitialer(namn) ${funktionskropp(PORTAL, 'avsandarInitialer')}
     function avsandarTon(namn) ${funktionskropp(PORTAL, 'avsandarTon')}
     return function renderConvRow(row) ${RAD};`
  )(escapeHtml, formatDateTime);

  const html = fn({
    lane: 'all',
    subject: 'Re: Offert',
    preview:
      'Du får inte ofta e-post från kons@hairtpclinic.com. Läs om varför det här är viktigt Såg du bilderna?',
    timing: { latestMessageAt: '2026-09-05T09:55:00Z' },
    customer: { name: 'Ehssan Shaba', identity: { canonicalCustomerId: 'cust-1' } },
  });

  assert.ok(html.includes('Ehssan Shaba'), 'avsändarnamnet saknas');
  assert.ok(html.includes('>ES<'), 'initialerna saknas i avataren');
  assert.ok(html.includes('conv-match'), 'kopplingsbocken saknas');
  assert.ok(html.includes('Såg du bilderna?'), 'det verkliga meddelandet saknas');
  assert.ok(!html.includes('Läs om varför'), 'bannern visas fortfarande');

  const antalES = html.split('Ehssan Shaba').length - 1;
  assert.equal(antalES, 1, 'avsändarnamnet skrivs ut mer än en gång');
});
