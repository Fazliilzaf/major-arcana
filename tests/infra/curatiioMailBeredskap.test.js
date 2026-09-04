'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bedomMx,
  bedomSpf,
  bedomSpfAlias,
  bedomDkim,
  bedomDmarc,
  bedomBeredskap,
} = require('../../src/infra/curatiioMailBeredskap');
const DOMANFACIT = require('../../config/mail-domaner.json');

/**
 * ORD-204. Fixturerna nedan är UPPMÄTTA 2026-09-04, inte påhittade.
 *
 *   dig +short MX  curatiio.com      → 10 mailcluster.loopia.se, 20 mail2.loopia.se
 *   dig +short TXT curatiio.com      → "MS=ms23140776"
 *                                      "v=spf1 include:amazonses.com -all"
 *                                      "google-site-verification=FY2imz..."
 *   dig +short MX  hairtpclinic.com  → hairtpclinic-com.mail.protection.outlook.com
 *   dig +short TXT hairtpclinic.com  → "v=spf1 include:spf.protection.outlook.com
 *                                       include:spf.loopia.se include:_spf.google.com -all"
 *
 * Hair TP är med som KONTROLL. Utan den vet man inte om kontrollerna mäter
 * något eller bara alltid säger nej.
 */

const CURATIIO_MX = [
  { exchange: 'mailcluster.loopia.se', priority: 10 },
  { exchange: 'mail2.loopia.se', priority: 20 },
];
const CURATIIO_TXT = [
  ['MS=ms23140776'],
  ['v=spf1 include:amazonses.com -all'],
  ['google-site-verification=FY2imzVk8aeXphQ7FwVHYn6n0leiMQMcIRSz_BvnL6Q'],
];
const HAIRTP_MX = [{ exchange: 'hairtpclinic-com.mail.protection.outlook.com', priority: 10 }];
const HAIRTP_TXT = [
  ['v=spf1 include:spf.protection.outlook.com include:spf.loopia.se include:_spf.google.com -all'],
];

test('NULÄGET: curatiio.com pekar på Loopia, inte Microsoft', () => {
  const r = bedomMx(CURATIIO_MX);
  assert.equal(r.status, 'fail');
  assert.match(r.skal, /loopia/i, 'skälet ska namnge var posten faktiskt ligger');
});

test('KONTROLL: hairtpclinic.com pekar rätt — kontrollen mäter något', () => {
  assert.equal(bedomMx(HAIRTP_MX).status, 'pass');
});

test('EN KVARGLÖMD MX-POST ÄR INTE "nästan klart"', () => {
  /**
   * Halvvägs genom en flytt ser det ut så här. Frestelsen är att kalla det
   * godkänt eftersom Microsoft "finns med". Men en Loopia-post kvar är en väg
   * in som kringgår Exchange, och post som kommer den vägen syns aldrig i CCO.
   */
  const halvvags = [
    { exchange: 'curatiio-com.mail.protection.outlook.com', priority: 0 },
    { exchange: 'mailcluster.loopia.se', priority: 10 },
  ];
  const r = bedomMx(halvvags);
  assert.equal(r.status, 'fail', 'alla poster måste peka på Microsoft');
  assert.match(r.skal, /loopia/i);
});

test('inga MX-poster alls är fail, inte pass', () => {
  assert.equal(bedomMx([]).status, 'fail');
  assert.equal(bedomMx(null).status, 'fail');
});

test('NULÄGET: SPF hårdfelar Microsoft (-all med bara Amazon SES)', () => {
  const r = bedomSpf(CURATIIO_TXT);
  assert.equal(r.status, 'fail');
  assert.match(r.skal, /spf\.protection\.outlook\.com/);
  // Skälet ska visa den faktiska posten. "SPF fel" går inte att åtgärda.
  assert.match(r.skal, /amazonses/);
});

test('KONTROLL: Hair TP:s SPF godkänns', () => {
  assert.equal(bedomSpf(HAIRTP_TXT).status, 'pass');
});

test('SPF letas bland ALLA TXT-poster, inte bara den första', () => {
  // MS=-token och google-site-verification ligger före SPF på curatiio.com.
  // En kontroll som bara läste rad ett hade missat den helt.
  const r = bedomSpf([['MS=ms23140776'], ['v=spf1 include:spf.protection.outlook.com -all']]);
  assert.equal(r.status, 'pass');
});

test('ingen SPF-post alls är fail — inte "inga regler, allt tillåtet"', () => {
  assert.equal(bedomSpf([['MS=ms23140776']]).status, 'fail');
  assert.equal(bedomSpf([]).status, 'fail');
});

// ---------------------------------------------------------------------------
// ORD-204 §2 — curatiio.se. Tar bara emot, skickar aldrig.
// ---------------------------------------------------------------------------

const SE_TXT_IDAG = [['v=spf1 include:spf.loopia.se -all']];

test('NULÄGET .se: SPF pekar kvar på Loopia — en kvarglömd fullmakt', () => {
  /**
   * Det subtila felet i hela flytten. MX flyttas, alla ser att posten kommer
   * fram, och SPF står kvar och pekar på en värd som inte längre hanterar
   * domänen. Ingenting går sönder just då — men Loopia får fortfarande skicka
   * i domänens namn, och det märks först den dagen någon utnyttjar det.
   */
  const r = bedomSpfAlias(SE_TXT_IDAG);
  assert.equal(r.status, 'fail');
  assert.match(r.skal, /loopia/i);
  assert.match(r.skal, /v=spf1/, 'skälet ska visa den faktiska posten');
});

test('.se: hård nekan är GODKÄNT — domänen ska aldrig skicka', () => {
  // För en ren mottagardomän är det starkaste svaret att ingen får skicka.
  // Kravet "SPF måste släppa in Microsoft" hade varit fel krav här.
  assert.equal(bedomSpfAlias([['v=spf1 -all']]).status, 'pass');
});

test('.se: Microsoft inkluderad är också godkänt — om ni vill kunna skicka sen', () => {
  assert.equal(bedomSpfAlias([['v=spf1 include:spf.protection.outlook.com -all']]).status, 'pass');
});

test('.se: mjuk nekan utan Microsoft är varning, inte pass', () => {
  // ~all i stället för -all, och ingen som får skicka. Varken hård nekan
  // eller fungerande sändning — någon har varit halvvägs och slutat.
  const r = bedomSpfAlias([['v=spf1 ~all']]);
  assert.equal(r.status, 'varning');
});

test('.se: ingen SPF alls är fail', () => {
  assert.equal(bedomSpfAlias([]).status, 'fail');
  assert.equal(bedomSpfAlias([['MS=ms23140776']]).status, 'fail');
});

test('KRAVEN SKILJER SIG ÅT — annars är rollen bara dekoration', () => {
  /**
   * Motprovet på hela roll-uppdelningen. Skulle sandande och alias råka ge
   * samma svar på samma indata vore `roll` i facit en kommentar utan verkan,
   * och .se hade bedömts som en avsändare den aldrig ska bli.
   */
  const hardNekan = [['v=spf1 -all']];
  assert.equal(bedomSpf(hardNekan).status, 'fail', 'en avsändare måste kunna skicka');
  assert.equal(bedomSpfAlias(hardNekan).status, 'pass', 'en mottagare ska inte kunna det');
});

test('facit har alla tre domänerna, med roll och proveniens', () => {
  // curatiio.se glömdes bort i första analysen. Testet finns för att den inte
  // ska kunna falla bort igen — det är precis den bortglömda domänen som blir
  // kvar hos Loopia när resten flyttar.
  const d = DOMANFACIT.domaner || [];
  const namn = d.map((x) => x.doman);
  assert.deepEqual(namn.sort(), ['curatiio.com', 'curatiio.se', 'hairtpclinic.com']);

  const se = d.find((x) => x.doman === 'curatiio.se');
  assert.equal(se.roll, 'alias', 'tar emot, skickar aldrig');
  assert.equal(se.aliasPa, 'contact@curatiio.com');

  for (const x of d) {
    assert.ok(x._matt_2026_09_04, `${x.doman} saknar mätning`);
    assert.match(x.roll, /^(sandande|alias)$/, `${x.doman} har okänd roll`);
  }

  // Hair TP ska vara med som kontroll — en domän som redan är grön.
  assert.ok(
    namn.includes('hairtpclinic.com'),
    'utan en domän som ska bli grön vet man inte om kontrollerna mäter något'
  );
});

test('VARFÖR alias och inte vidarebefordran står skrivet i facit', () => {
  // Skälet är icke-uppenbart och kommer att ifrågasättas av den som gör
  // DNS-arbetet. Står det inte i filen blir svaret "för att Claude sa så".
  const t = (DOMANFACIT._varfor_alias_och_inte_vidarebefordran || []).join(' ');
  assert.match(t, /SPF/, 'det är SPF som brister vid vidarebefordran');
  assert.match(t, /skräpposten/, 'och konsekvensen är tyst, inte en studs');
  assert.match(t, /Avboka/, 'med det uppmätta fallet som gör det konkret');
});

test('DKIM saknas är VARNING, inte fail — Hair TP kör så i dag', () => {
  /**
   * Mätt 2026-09-04: hairtpclinic.com har inga DKIM-selektorer heller, och
   * posten går fram. Microsoft signerar då med tenantens onmicrosoft.com och
   * DMARC klarar sig på SPF-linjering. Att stoppa flytten på det hade varit
   * att låta en kosmetisk brist blockera en verklig förbättring.
   */
  const r = bedomDkim([]);
  assert.equal(r.status, 'varning');
  assert.match(r.skal, /onmicrosoft/, 'skälet ska säga varför det ändå fungerar');
});

test('DKIM med båda selektorerna godkänns; en ensam räcker inte', () => {
  const bada = [
    'selector1-curatiio-com._domainkey.hairtp.onmicrosoft.com',
    'selector2-curatiio-com._domainkey.hairtp.onmicrosoft.com',
  ];
  assert.equal(bedomDkim(bada).status, 'pass');
  assert.equal(bedomDkim([bada[0]]).status, 'varning', 'halv konfiguration är inte klar');
});

test('DMARC: saknas = varning, finns = pass', () => {
  assert.equal(bedomDmarc([]).status, 'varning');
  assert.equal(bedomDmarc([['v=DMARC1; p=none;']]).status, 'pass');
});

// ---------------------------------------------------------------------------
// Sammanvägningen. Det är här skriptet kan ljuga, så det är här det mäts hårdast.
// ---------------------------------------------------------------------------

test('ETT OMÄTT STEG BLOCKERAR — även när allt mätbart gick bra', () => {
  /**
   * DEN VIKTIGASTE REGELN.
   *
   * Skriptet körs oftast lokalt, där två av sex kontroller inte kan göras.
   * Just då är frestelsen störst att säga "fyra av fyra mätbara gick bra,
   * alltså klart". Gör man det aktiveras Curatiio innan brevlådan finns och
   * posten slutar gå fram — tyst.
   */
  const dom = bedomBeredskap([
    { id: 'C1', namn: 'MX', status: 'pass' },
    { id: 'C2', namn: 'SPF', status: 'pass' },
    { id: 'C3', namn: 'DKIM', status: 'pass' },
    { id: 'C4', namn: 'DMARC', status: 'pass' },
    { id: 'C5', namn: 'allowlist', status: 'omatt', skal: 'env saknas lokalt' },
    { id: 'C6', namn: 'brevlåda', status: 'omatt', skal: 'kräver Graph-nycklar' },
  ]);
  assert.equal(dom.klar, false, 'omätt får ALDRIG räknas som godkänt');
  assert.equal(dom.omatt, 2);
  assert.equal(dom.skal.length, 2);
  for (const s of dom.skal) assert.match(s, /KUNDE INTE MÄTAS/);
});

test('allt godkänt ger klar: true — spärren släpper också igenom', () => {
  // Motprovet. En kontroll som aldrig säger ja är en trasig kontroll.
  const dom = bedomBeredskap([
    { id: 'C1', namn: 'MX', status: 'pass' },
    { id: 'C2', namn: 'SPF', status: 'pass' },
    { id: 'C5', namn: 'allowlist', status: 'pass' },
    { id: 'C6', namn: 'brevlåda', status: 'pass' },
  ]);
  assert.equal(dom.klar, true);
  assert.deepEqual(dom.skal, []);
});

test('varningar stoppar INTE — annars blockerar DKIM en flytt som är klar', () => {
  const dom = bedomBeredskap([
    { id: 'C1', namn: 'MX', status: 'pass' },
    { id: 'C3', namn: 'DKIM', status: 'varning', skal: 'saknas' },
    { id: 'C4', namn: 'DMARC', status: 'varning', skal: 'saknas' },
  ]);
  assert.equal(dom.klar, true);
  assert.equal(dom.varning, 2);
});

test('ett underkänt steg blockerar, och skälet står med', () => {
  const dom = bedomBeredskap([
    { id: 'C1', namn: 'MX', status: 'fail', skal: 'pekar på Loopia' },
    { id: 'C2', namn: 'SPF', status: 'pass' },
  ]);
  assert.equal(dom.klar, false);
  assert.equal(dom.skal.length, 1);
  assert.match(dom.skal[0], /Loopia/);
});

test('noll kontroller är INTE klart — och skälet står med', () => {
  // Utan specialfallet ger `skal.length === 0` ett grönt svar på en körning
  // som inte gjorde någonting alls.
  //
  // Skälet mäts också. Ett blockerande svar utan angiven orsak går inte att
  // felsöka: "INTE KLAR" utan rad under är ett skript man slutar lita på.
  for (const tom of [[], null, undefined]) {
    const dom = bedomBeredskap(tom);
    assert.equal(dom.klar, false, `${tom}`);
    assert.ok(dom.skal.length > 0, `${tom} saknar skäl`);
    assert.match(dom.skal[0], /inga kontroller/i);
  }
});

test('DAGENS FAKTISKA LÄGE ger INTE KLAR', () => {
  // Sammanhanget: så här ser det ut 2026-09-04. Går det här testet grönt av
  // misstag har något i kedjan slutat mäta.
  const dom = bedomBeredskap([
    { id: 'C1', namn: 'MX', ...bedomMx(CURATIIO_MX) },
    { id: 'C2', namn: 'SPF', ...bedomSpf(CURATIIO_TXT) },
    { id: 'C3', namn: 'DKIM', ...bedomDkim([]) },
    { id: 'C4', namn: 'DMARC', ...bedomDmarc([]) },
    { id: 'C5', namn: 'allowlist', status: 'omatt', skal: 'env' },
    { id: 'C6', namn: 'brevlåda', status: 'omatt', skal: 'graph' },
  ]);
  assert.equal(dom.klar, false);
  assert.equal(dom.pass, 0, 'ingen av de sex är godkänd i dag');
  assert.equal(dom.fail, 2, 'MX och SPF');
  assert.equal(dom.omatt, 2);
});
