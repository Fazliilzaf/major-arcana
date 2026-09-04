'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBookingReminderEmail } = require('../../src/templates/bookingReminderEmail');
const { avbokningsKontakt } = require('../../src/ops/avbokningsKontakt');
const { runBookingReminders } = require('../../src/ops/bookingReminderScheduler');

/**
 * ORD-205 — omboka-länken i påminnelsen.
 *
 * BAKGRUNDEN. ORD-190 byggde fyra fungerande sidor: /avboka och /omboka, med
 * slot-picker och atomiskt lås. ORD-202 satte regeln att kunden får omboka men
 * inte avboka. Påminnelsemejlet sa ändå bara "svara på detta mejl eller ring
 * kliniken" och länkade ingenstans alls.
 *
 * Fyra färdiga sidor som ingen kund kunde nå från det enda mejl som skickas
 * inför besöket.
 */

const BAS = {
  customerName: 'Anna Andersson',
  serviceLabel: 'DHI',
  startsAt: '2026-10-01T09:00:00Z',
};
const LANKAR = {
  cancelUrl: 'https://arcana.example/avboka/abc123',
  rebookUrl: 'https://arcana.example/omboka/abc123',
};

test('omboka-länken finns i BÅDE html och text', () => {
  /**
   * Textversionen mäts med. Många läser i klienter som visar text, och en
   * påminnelse där bara HTML-versionen går att agera på är halvfärdig — felet
   * syns dessutom aldrig för den som testar i Outlook.
   */
  const m = buildBookingReminderEmail({ ...BAS, actionLinks: LANKAR });
  assert.match(m.html, /https:\/\/arcana\.example\/omboka\/abc123/, 'html saknar länken');
  assert.match(m.text, /https:\/\/arcana\.example\/omboka\/abc123/, 'text saknar länken');
});

test('AVBOKA LÄNKAS ALDRIG — sidan nekar kunden ändå', () => {
  /**
   * ORD-202: kunden får inte avboka själv, sidan svarar 405. Att skicka med
   * cancelUrl hade varit att bjuda in kunden till en låst dörr — hen klickar,
   * blir nekad, och ringer irriterad.
   *
   * `buildBookingActionLinks` returnerar båda länkarna. Mallen ska plocka en.
   */
  const m = buildBookingReminderEmail({ ...BAS, actionLinks: LANKAR });
  assert.ok(!m.html.includes('/avboka/'), 'html länkar till avbokningssidan');
  assert.ok(!m.text.includes('/avboka/'), 'text länkar till avbokningssidan');
});

test('UTAN LÄNKAR blir det gamla texten — aldrig en halv länk', () => {
  /**
   * buildBookingActionLinks ger null när token eller PUBLIC_BASE_URL saknas.
   * En trasig länk i ett mejl är värre än ingen: kunden klickar, får ett fel,
   * och tror att bokningen tappats bort.
   */
  const m = buildBookingReminderEmail(BAS);
  assert.ok(!m.html.includes('href="undefined'), 'halv länk i html');
  assert.ok(!m.html.includes('/omboka/'), 'länk trots att det saknades underlag');
  assert.match(m.html, /Behöver du omboka\?/, 'fallbacktexten ska stå kvar');
  assert.ok(!/undefined|null/.test(m.text), `text innehåller skräp: ${m.text}`);
});

test('AVBOKNINGSVÄGEN STÅR UTSKRIVEN — annars sitter kunden fast', () => {
  /**
   * Efter ORD-202 är telefon och mejl enda vägen ut ur en bokning. Ett
   * meddelande som säger "hör av dig" utan att säga vart lämnar kunden med en
   * tid hen inte blir av med, och kliniken med en uteblivning.
   */
  const k = avbokningsKontakt('hair-tp-clinic');
  const m = buildBookingReminderEmail({ ...BAS, actionLinks: LANKAR, avbokningKontakt: k });
  assert.match(m.html, /contact@hairtpclinic\.com/);
  assert.match(m.html, /031 88 11 66/);
  assert.match(m.text, /contact@hairtpclinic\.com/, 'också i textversionen');
});

test('RÄTT KLINIK — en Curatiio-patient ska inte ringa hårkliniken', () => {
  const k = avbokningsKontakt({ tenantId: 'curatiio' });
  const m = buildBookingReminderEmail({ ...BAS, actionLinks: LANKAR, avbokningKontakt: k });
  assert.match(m.html, /contact@curatiio\.com/);
  assert.match(m.html, /031-88 22 44/);
  // Avbokningsraden ska bära Curatiios uppgifter, inte Hair TP:s.
  // Regexen måste kapa vid </p> — utan det läser den vidare in i sidfoten,
  // som ÄR Hair TP, och testet failar av fel skäl.
  const rad = (m.html.match(/Behöver du avboka\?[\s\S]*?<\/p>/) || [''])[0];
  assert.ok(!/hairtpclinic/i.test(rad), `Hair TP läckte in i avbokningsraden: ${rad}`);
  assert.match(m.text, /contact@curatiio\.com/);
  assert.ok(!/contact@hairtpclinic/.test(m.text), 'Hair TP läckte in i textversionen');
});

test('ORD-206: SIDFOTEN FÖLJER KLINIKEN, inte konstanten', () => {
  /**
   * GAPET SOM ORD-205 MÄTTE OCH ORD-206 STÄNGDE.
   *
   * `renderEmailShell` la en sidfot med Hair TP:s logotyp, adress,
   * contact@hairtpclinic.com och 031 88 11 66 — oavsett klinik. En
   * Curatiio-patient fick rätt avbokningsnummer i brödtexten och fel klinik
   * längst ner, i samma brev.
   *
   * Testet mätte tidigare att gapet FANNS. Nu mäter det att det är stängt.
   */
  const k = avbokningsKontakt({ tenantId: 'curatiio' });
  const m = buildBookingReminderEmail({
    ...BAS,
    actionLinks: LANKAR,
    avbokningKontakt: k,
    tenantId: 'curatiio',
  });
  assert.ok(!m.html.includes('contact@hairtpclinic.com'), 'Hair TP:s adress kvar i foten');
  assert.ok(!m.html.includes('031 88 11 66'), 'Hair TP:s nummer kvar i foten');
  assert.match(m.html, /Curatiio/, 'klinikens namn saknas i foten');
  assert.match(m.html, /Vasaplatsen 2/, 'adressen saknas — verifierad mot curatiio.com/kontakt');
  assert.match(m.text, /Curatiio$/, `signaturen ska vara Curatiio: ${JSON.stringify(m.text)}`);
});

test('INGEN LOGGA ÄR BÄTTRE ÄN FEL LOGGA', () => {
  /**
   * Curatiio har ingen egen logotyp (brandConfig: logoUrl null, TODO). Att
   * falla tillbaka på Hair TP:s sköld hade gjort brevet fel på det mest
   * synliga stället av alla — överst, före all text.
   *
   * `logotyp: null` i facit betyder "ingen finns", inte "använd standard".
   */
  const m = buildBookingReminderEmail({ ...BAS, tenantId: 'curatiio' });
  assert.ok(!m.html.includes('htp-logo-email.png'), 'Hair TP:s logga på ett Curatiio-brev');

  /**
   * INGEN <img> ALLS, inte en tom sådan.
   *
   * Utan spärren blir src="null" — en bruten bildikon överst i brevet. Första
   * versionen av testet letade bara efter Hair TP:s filnamn och missade det
   * helt; mutationen som tog bort spärren överlevde grön.
   */
  assert.ok(!/<img/i.test(m.html), `tom bildtagg i Curatiio-brevet: ${m.html.slice(0, 400)}`);
  assert.ok(!/src="(null|undefined|)"/.test(m.html), 'bruten bildkälla');

  // Motprovet: Hair TP ska fortfarande FÅ sin logga.
  const h = buildBookingReminderEmail({ ...BAS, tenantId: 'hair-tp-clinic' });
  assert.match(h.html, /htp-logo-email\.png/, 'Hair TP tappade sin logga');
  assert.match(h.html, /<img/i);
});

test('FACIT BÄR ADRESSEN med proveniens — även när den råkar vara densamma', () => {
  /**
   * Klinikerna delar adress (Vasaplatsen 2), så en mutation som tar bort
   * Curatiios adressfält ger IDENTISK utdata — fallbacken i klinikIdentitet
   * producerar samma sträng. Den går alltså inte att fånga på utdata.
   *
   * Därför mäts strukturen: fältet ska finnas per klinik, och det ska stå
   * varifrån uppgiften kommer. Delar de adress i dag kan de sluta göra det,
   * och då ska Curatiios rad vara den som ändras — inte Hair TP:s fallback.
   */
  const FACIT = require('../../config/avbokning-kontakt.json');
  for (const id of ['hair-tp-clinic', 'curatiio']) {
    const k = FACIT.kliniker[id];
    assert.ok(k.adress && k.adress.length > 5, `${id} saknar adress i facit`);
    assert.ok(k.adressEn, `${id} saknar engelsk adress`);
  }
  const p = (FACIT._adressen_ar_verifierad || []).join(' ');
  assert.match(p, /curatiio\.com\/kontakt/, 'proveniensen för adressen saknas');
  assert.match(p, /DELAR/, 'att de delar adress ska stå uttryckligen');
});

test('UTAN tenantId blir det Hair TP — oförändrat för allt annat', () => {
  /**
   * Sju mallar delar skalet. Ändringen får inte flytta något för de anropare
   * som inte vet vilken klinik brevet gäller — de ska bete sig exakt som förut.
   */
  const m = buildBookingReminderEmail(BAS);
  assert.match(m.html, /contact@hairtpclinic\.com/);
  assert.match(m.html, /031 88 11 66/);
  assert.match(m.html, /htp-logo-email\.png/);
});

test('okänd eller saknad tenant faller tillbaka — aldrig tomt', () => {
  // Fel klinik går att ringa. Ingen klinik gör det inte.
  for (const t of [undefined, null, '', 'finns-inte', { tenantId: 'xyz' }]) {
    const k = avbokningsKontakt(t);
    assert.ok(k && k.epost && k.epost.includes('@'), `${JSON.stringify(t)} gav ingen kontakt`);
    assert.ok(k.telefonVisas || k.telefon, `${JSON.stringify(t)} gav inget nummer`);
  }
});

test('KONTAKTEN ÄR SAMMA UPPSLAG SOM AVBOKNINGSSIDAN ANVÄNDER', () => {
  /**
   * Före ORD-205 låg funktionen inne i bookingPublicActions.js. Sidan visade
   * rätt uppgifter medan mejlet inte visade några. Samma familj av fel som
   * kundresans steg i ORD-200: två ytor som räknar var för sig glider isär.
   *
   * Testet läser routefilen och kräver att den importerar den gemensamma
   * modulen i stället för att ha en egen kopia — det är strukturen som ska
   * hållas, och den går inte att mäta på utdata.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'routes', 'bookingPublicActions.js'),
    'utf8'
  );
  assert.match(route, /require\('\.\.\/ops\/avbokningsKontakt'\)/, 'routen ska läsa modulen');
  assert.ok(
    !/function avbokningsKontakt\s*\(/.test(route),
    'routen har kvar en egen kopia av uppslaget'
  );
});

// ---------------------------------------------------------------------------
// Inkopplingen. Mätt genom att köra schemaläggaren, inte genom att söka i källan.
// ---------------------------------------------------------------------------

test('SCHEMALÄGGAREN SKICKAR FAKTISKT MED LÄNKEN', async () => {
  /**
   * DEN HÄR ÄR POÄNGEN MED HELA ändringen.
   *
   * Ett test som söker efter strängen `buildBookingActionLinks` i filen blir
   * grönt av importraden ensam — exakt den dekorativa fällan som ORD-203:s
   * mutationer avslöjade två gånger. Här byggs i stället en riktig store, en
   * riktig bokning och en stubbad Graph-connector, och sedan läses vad som
   * verkligen skickades.
   */
  const om = 2 * 3600 * 1000; // inom 24h-fönstret
  const startsAt = new Date(Date.now() + om).toISOString();
  const booking = {
    bookingId: 'b-1',
    status: 'confirmed',
    tenantId: 'curatiio',
    customerName: 'Anna',
    customerEmail: 'anna@example.com',
    serviceLabel: 'Ögonlocksplastik',
    tenant: 'curatiio',
    bookingActionToken: 'a'.repeat(64),
    slot: { startsAt },
    reminders: {},
  };

  /**
   * PUBLIC_BASE_URL måste vara satt — buildBookingActionLinks läser den ur
   * process.env och ger null utan den. Uppmätt i prod 2026-09-04:
   * PUBLIC_BASE_URL = https://arcana.hairtpclinic.com, alltså satt.
   *
   * Första versionen av testet skickade basadressen via `config` och fick
   * null tillbaka. Det såg ut som att inkopplingen saknades, men var testet
   * som mätte fel miljö.
   */
  const tidigare = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = 'https://arcana.example';

  const skickade = [];
  let res;
  try {
    res = await runBookingReminders({
      bookingEngineStore: { _state: { bookings: [booking] } },
      graphSendConnector: {
        async sendMail(a) {
          skickade.push(a);
          return { ok: true };
        },
      },
    });
  } finally {
    if (tidigare === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = tidigare;
  }

  assert.ok(skickade.length > 0, `inget skickades — ${JSON.stringify(res)}`);
  const brev = JSON.stringify(skickade[0]);
  assert.match(brev, /\/omboka\//, 'påminnelsen bär ingen omboka-länk');
  assert.ok(!brev.includes('/avboka/'), 'påminnelsen länkar till avbokningssidan');
  assert.match(brev, /contact@curatiio\.com/, 'fel klinik i avbokningskontakten');

  /**
   * ORD-206 — och FOTEN ska också vara Curatiio.
   *
   * Första versionen läste bara avbokningsraden, som kommer från
   * avbokningKontakt. Mutationen som tog bort `tenantId` ur schemaläggaren
   * överlevde därför: brödtexten blev rätt medan sidfoten fortsatte säga
   * Hair TP. Exakt det fel som ORD-206 skulle stänga.
   */
  assert.ok(!brev.includes('contact@hairtpclinic.com'), 'Hair TP:s adress i foten');
  assert.ok(!brev.includes('htp-logo-email.png'), 'Hair TP:s logga på ett Curatiio-brev');
});

test('DEN ANDRA PÅMINNELSEVÄGEN ÄR OCKSÅ INKOPPLAD', async () => {
  /**
   * Det finns TVÅ avsändare av påminnelser: bookingReminderScheduler och
   * ccoPatientCareOps.dispatchPatientVisitReminderEmails. Att bara koppla in
   * den ena hade gett kunder olika mejl beroende på vilken väg som råkade
   * skicka — och felet hade varit osynligt i schemaläggarens test.
   *
   * Mutationen som tog bort actionLinks ur ccoPatientCareOps ÖVERLEVDE tills
   * det här testet fanns. Det var den enda äkta luckan av tio mutationer.
   */
  const { dispatchPatientVisitReminderEmails } = require('../../src/ops/ccoPatientCareOps');

  const tidigare = process.env.PUBLIC_BASE_URL;
  const tidigareGate = process.env.ARCANA_KUNDUTSKICK_ENABLED;
  process.env.PUBLIC_BASE_URL = 'https://arcana.example';
  /**
   * Kundutskicksspärren (ORD-184/197) blockerar den här vägen som standard —
   * verifierat: utan raden nedan gick inget alls iväg. Den öppnas bara här, i
   * testets minne, och återställs i finally. Prod rörs inte.
   */
  process.env.ARCANA_KUNDUTSKICK_ENABLED = 'true';

  const skickade = [];
  try {
    await dispatchPatientVisitReminderEmails({
      queue: {
        visitReminders: [
          {
            customerName: 'Bo',
            // INTE example.com: mailDeliveryGuard stoppar RFC2606-domäner
            // före connectorn ('reserved_domain'), och då mäter testet
            // ingenting. Uppmätt genom att först få noll skickade brev.
            customerEmail: 'bo@ord205-fiktiv-mottagare.se',
            serviceId: 'dhi',
            startsAt: '2026-10-01T09:00:00Z',
            leadTimeHours: 24,
            tenantId: 'curatiio',
            bookingActionToken: 'b'.repeat(64),
          },
        ],
      },
      bookingEngineStore: { _state: { bookings: [] } },
      graphSendConnector: {
        async sendNewMessage(a) {
          skickade.push(a);
          return { sendMode: 'send_mail' };
        },
      },
    });
  } finally {
    if (tidigare === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = tidigare;
    if (tidigareGate === undefined) delete process.env.ARCANA_KUNDUTSKICK_ENABLED;
    else process.env.ARCANA_KUNDUTSKICK_ENABLED = tidigareGate;
  }

  /**
   * Kundutskicksspärren (ORD-184/197) kan blockera vägen helt. Blockeras den
   * har vi inget att mäta — men då ska testet säga det, inte tyst gå grönt.
   */
  if (!skickade.length) {
    assert.fail(
      'inget gick ut — kundutskicksspärren blockerar troligen vägen. ' +
        'Testet mäter då ingenting och måste skrivas om, inte tas bort.'
    );
  }
  const brev = JSON.stringify(skickade[0]);
  assert.match(brev, /\/omboka\//, 'den här vägen bär ingen omboka-länk');
  assert.ok(!brev.includes('/avboka/'), 'länkar till avbokningssidan');
});
