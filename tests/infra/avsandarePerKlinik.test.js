'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { avsandareForKlinik, arTillaten, adressUr } = require('../../src/infra/avsandarePerKlinik');
const FACIT = require('../../config/avsandare-per-klinik.json');

/**
 * ORD-203 — avsändaradress per klinik.
 *
 * UPPMÄTT I PROD 2026-09-04:
 *
 *   DEFAULT_GRAPH_FROM           contact@hairtpclinic.com
 *   RESEND_FROM                  (ej satt)
 *   ARCANA_GRAPH_DEFAULT_SENDER  (ej satt)
 *   ARCANA_GRAPH_SEND_ALLOWLIST  8 adresser, ALLA @hairtpclinic.com
 *
 * Det finns ingen Curatiio-gren i sändvägen. All post — även till Curatiios
 * ögonlocks- och ortopedipatienter — går ut från en hårklinik.
 *
 * MEN: att peka avsändaren mot contact@curatiio.com innan brevlådan finns gör
 * inte posten rätt, den gör den OSKICKAD. Graph vägrar skicka som en adress
 * appen inte får skicka som. Fel avsändare kommer åtminstone fram.
 *
 * Testerna nedan handlar därför lika mycket om att modulen INTE ska aktivera
 * något för tidigt som om att den ska kunna göra det sen.
 */

test('Hair TP får sin egen adress — dagens beteende, oförändrat', () => {
  const r = avsandareForKlinik('hair-tp-clinic', { env: {} });
  assert.equal(r.avsandare, 'contact@hairtpclinic.com');
  assert.equal(r.aktiv, true);
});

test('CURATIIO ÄR VILANDE — och faller tillbaka på en adress som fungerar', () => {
  // Kärnan. Filen finns, adressen står i den, och den används ändå inte.
  const r = avsandareForKlinik('curatiio', { env: {} });
  assert.equal(r.aktiv, false);
  assert.equal(r.avsandare, 'contact@hairtpclinic.com', 'faller tillbaka, inte tomt');
  assert.match(r.skal, /vilande|brevlådan/, 'och säger varför');
});

test('skälet står ALLTID med när klinikens egen adress inte används', () => {
  // Ett svar utan skäl går inte att felsöka. "Varför kom brevet från Hair TP?"
  // ska gå att svara på utan att läsa kod.
  for (const id of ['curatiio', 'finns-inte', '', null]) {
    const r = avsandareForKlinik(id, { env: {} });
    assert.equal(r.aktiv, false, `${id}`);
    assert.ok(r.skal.length > 0, `${id} saknar skäl`);
  }
});

test('okänd klinik får standardadressen — aldrig tom avsändare', () => {
  // En tom avsändare är inte "ingen avsändare", det är ett brev som studsar.
  for (const id of ['', null, undefined, 'meridiq', 'HAIR-TP-CLINIC ']) {
    const r = avsandareForKlinik(id, { env: {} });
    assert.match(r.avsandare, /@/, `${id} gav ingen giltig adress`);
  }
});

/**
 * Ladda om modulen med ett tillfälligt ändrat facit.
 *
 * Behövs för att testa vad som händer när någon sätter aktiv: true. Första
 * versionen av testet nedan anropade bara `arTillaten()` direkt — funktionen
 * BREDVID spärren, inte spärren. Mutationen som kopplade bort
 * allowlist-kontrollen i `avsandareForKlinik` överlevde därför grön.
 */
const OCKSA = ['../../src/infra/transactionalMailer', '../../src/ops/ccoSendActionStore'];

function glomModuler() {
  delete require.cache[require.resolve('../../config/avsandare-per-klinik.json')];
  delete require.cache[require.resolve('../../src/infra/avsandarePerKlinik')];
  // Konsumenterna håller en referens till den GAMLA funktionen. Utan att tömma
  // dem också mäter man den oförändrade modulen och tror att det gick vägen.
  for (const m of OCKSA) delete require.cache[require.resolve(m)];
}

function medFacit(andra, run) {
  const p = path.join(__dirname, '..', '..', 'config', 'avsandare-per-klinik.json');
  const original = fs.readFileSync(p, 'utf8');
  try {
    const d = JSON.parse(original);
    andra(d);
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    glomModuler();
    return run(require('../../src/infra/avsandarePerKlinik'));
  } finally {
    fs.writeFileSync(p, original);
    glomModuler();
  }
}

test('ALLOWLISTEN ÄR SISTA ORDET — även när aktiv är true', () => {
  /**
   * Den viktigaste spärren, och den som är lättast att testa fel.
   *
   * Scenariot: någon sätter aktiv: true innan IT lagt adressen i allowlisten.
   * Utan kontrollen hade Curatiio-posten slutat gå fram — tyst, eftersom Graph
   * nekar och felet hamnar i en logg ingen läser.
   *
   * Testet går via `avsandareForKlinik`, inte via `arTillaten`, eftersom det är
   * DÄR spärren sitter.
   */
  medFacit(
    (d) => {
      d.kliniker.curatiio.aktiv = true;
    },
    (modul) => {
      const r = modul.avsandareForKlinik('curatiio', {
        // Prod-allowlisten: enbart Hair TP.
        env: { ARCANA_GRAPH_SEND_ALLOWLIST: 'contact@hairtpclinic.com,fazli@hairtpclinic.com' },
      });
      assert.equal(r.aktiv, false, 'aktiv:true räcker INTE utan allowlist');
      assert.equal(r.avsandare, 'contact@hairtpclinic.com', 'faller tillbaka på det som fungerar');
      assert.match(r.skal, /ALLOWLIST/, 'och säger exakt vad som saknas');
    }
  );
});

test('arTillaten svarar rätt på egen hand också', () => {
  const env = { ARCANA_GRAPH_SEND_ALLOWLIST: 'contact@hairtpclinic.com,fazli@hairtpclinic.com' };
  assert.equal(arTillaten('contact@curatiio.com', env), false);
  assert.equal(arTillaten('contact@hairtpclinic.com', env), true);
  assert.equal(arTillaten('Hair TP <CONTACT@hairtpclinic.com>', env), true, 'skiftläge och namn');
});

test('med adressen i allowlisten OCH aktiv: true används den', async () => {
  // Motprovet. En spärr som aldrig släpper igenom är en trasig väg, inte en
  // spärr. Testet laddar modulen med ett tillfälligt facit där Curatiio är
  // aktiv, för att bevisa att mekaniken fungerar den dag flaggan vänds.
  const p = path.join(__dirname, '..', '..', 'config', 'avsandare-per-klinik.json');
  const original = fs.readFileSync(p, 'utf8');
  try {
    const d = JSON.parse(original);
    d.kliniker.curatiio.aktiv = true;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    delete require.cache[require.resolve('../../config/avsandare-per-klinik.json')];
    delete require.cache[require.resolve('../../src/infra/avsandarePerKlinik')];
    const modul = require('../../src/infra/avsandarePerKlinik');
    const r = modul.avsandareForKlinik('curatiio', {
      env: { ARCANA_GRAPH_SEND_ALLOWLIST: 'contact@hairtpclinic.com,contact@curatiio.com' },
    });
    assert.equal(r.aktiv, true);
    assert.equal(r.avsandare, 'contact@curatiio.com');
    assert.equal(r.skal, '');
  } finally {
    fs.writeFileSync(p, original);
    delete require.cache[require.resolve('../../config/avsandare-per-klinik.json')];
    delete require.cache[require.resolve('../../src/infra/avsandarePerKlinik')];
  }
});

test('tom allowlist betyder ingen kontroll — inte "allt tillåtet i prod"', () => {
  // Lokalt och i test är listan inte satt. Att då neka allt hade gjort
  // testsviten obrukbar. I prod ÄR den satt, vilket är där det spelar roll.
  assert.equal(arTillaten('vadsomhelst@example.com', {}), true);
});

test('adressen plockas ur "Namn <a@b.se>"', () => {
  assert.equal(adressUr('Curatiio <contact@curatiio.com>'), 'contact@curatiio.com');
  assert.equal(adressUr('CONTACT@Curatiio.com'), 'contact@curatiio.com');
  assert.equal(adressUr(''), '');
  assert.equal(adressUr(null), '');
});

test('facit säger UTTRYCKLIGEN vad som krävs innan Curatiio aktiveras', () => {
  // Utan den listan blir "sätt aktiv: true" en enrads-ändring som ser ofarlig
  // ut och stoppar posten.
  assert.equal(FACIT.kliniker.curatiio.aktiv, false, 'ska vara vilande tills IT är klart');
  assert.ok(Array.isArray(FACIT._innan_curatiio_kan_aktiveras));
  const text = FACIT._innan_curatiio_kan_aktiveras.join(' ');
  assert.match(text, /Microsoft 365/, 'domänen in i tenanten');
  assert.match(text, /\bMX\b/, 'MX-flytten — själva flytten');
  assert.match(text, /SPF/, 'SPF måste släppa in Microsoft');
  assert.match(text, /Send-As/, 'appen måste få skicka som adressen');
  assert.match(text, /ALLOWLIST/, 'allowlisten');
  assert.match(text, /[Tt]estmejl/, 'och ett prov innan kund berörs');
});

test('facit BÄR RÄTTELSEN — listan sa först fel sak, och det ska synas', () => {
  /**
   * ORD-204. Första kravlistan sa "skapa contact@curatiio.com i Microsoft
   * 365". Mätningen visade att adressen redan finns och används — den ligger
   * bara hos Loopia. Det är inte samma jobb: en mailflytt är inte en
   * brevlådeskapelse.
   *
   * Rättelsen står kvar i filen med flit. En kravlista som tyst blir rätt
   * lär ingen någonting, och nästa person som läser den vet inte att den
   * grundar sig på en mätning i stället för en gissning.
   */
  const r = (FACIT._rattelse_2026_09_04 || []).join(' ');
  assert.ok(r.length > 0, 'rättelsen ska stå kvar');
  assert.match(r, /[Ll]oopia/, 'var posten faktiskt ligger');
  assert.match(r, /ErrorInvalidUser/, 'hur det mättes');
  assert.match(r, /13 ?537/, 'och kontrollmätningen som gör nej-svaret trovärdigt');
});

test('den stora kundpostvägen sätter FAKTISKT en avsändare', async () => {
  /**
   * ORD-197 §1 lärde det här: kundposten går via ccoSendActionStore, som får
   * resendMailer injicerad DIREKT. Att bara koppla in klinikvalet i
   * transactionalMailer hade lämnat offerter, avtal och portalsvar orörda.
   *
   * Första versionen av det här testet läste filen och sökte efter strängen
   * `avsandareForKlinik`. Import-raden ensam räckte för att den skulle bli
   * grön — mutationen som tog bort `|| klinik.avsandare` ur anropet överlevde.
   * Ett grep på ett funktionsnamn testar inte funktionens kropp.
   *
   * Testet nedan går i stället hela vägen genom performSend och läser vad
   * mailern faktiskt tog emot.
   */
  const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

  const mottaget = [];
  const stubMailer = {
    async sendEmail(input) {
      mottaget.push(input);
      return { ok: true, mode: 'live', provider: 'stub', messageId: 'stub-1' };
    },
  };

  const filPath = path.join(
    fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ord203-')),
    'sends.json'
  );
  const store = await createCcoSendActionStore({ filePath: filPath, mailer: stubMailer });

  await store.performSend({
    kind: 'form',
    dryRunOverride: false, // skarp väg — det är den som väljer avsändare
    payload: {
      to: 'personal@hairtpclinic.com',
      subject: 'ORD-203 avsändartest',
      text: 'kropp',
      tenantId: 'curatiio',
      // 'staff' passerar kundutskicksspärren. Ingen kund berörs av testet.
      audience: 'staff',
    },
  });

  assert.equal(mottaget.length, 1, 'mailern ska ha anropats');
  const from = mottaget[0].from;
  assert.ok(from && String(from).includes('@'), `from saknas eller är ogiltig: ${from}`);
  // Curatiio är vilande → faller tillbaka på adressen som fungerar.
  assert.equal(from, 'contact@hairtpclinic.com');
});

test('transactionalMailer väljer också avsändare per klinik', async () => {
  // Motsvarande mätning för den andra sändvägen: bokningsbekräftelser och
  // operatörsnotiser. Ingen Resend-nyckel i test → Graph-connectorn används.
  const { createTransactionalMailer } = require('../../src/infra/transactionalMailer');
  const sedda = [];
  const mailer = createTransactionalMailer({
    graphSendConnector: {
      async sendNewMessage(args) {
        sedda.push(args);
        return { sendMode: 'send_mail' };
      },
    },
  });

  const r = await mailer.sendEmail({
    to: 'personal@hairtpclinic.com',
    subject: 'ORD-203',
    text: 'kropp',
    tenantId: 'curatiio',
    audience: 'staff',
  });

  assert.equal(r.ok, true, r.error || '');
  assert.equal(sedda.length, 1, 'graph-connectorn ska ha anropats');
  assert.equal(sedda[0].mailboxId, 'contact@hairtpclinic.com', 'vilande → fallback');
});

test('DEN DAG FLAGGAN VÄNDS går brevet ut från rätt klinik', async () => {
  /**
   * Testet ovan bevisar mindre än det ser ut att göra: Curatiio är vilande, så
   * klinikvalet ger contact@hairtpclinic.com — och det är också mailerns egen
   * standardadress. Ett anrop som struntar i klinikvalet ger alltså samma svar.
   * Mutationen som kopplade bort valet i transactionalMailer överlevde därför.
   *
   * Enda sättet att skilja dem åt är ett fall där de svarar OLIKA: en aktiv
   * klinik med en annan adress. Det är dessutom exakt scenariot vi vill kunna
   * lita på den dag brevlådan finns.
   */
  const tidigare = process.env.ARCANA_GRAPH_SEND_ALLOWLIST;
  process.env.ARCANA_GRAPH_SEND_ALLOWLIST = 'contact@hairtpclinic.com,contact@curatiio.com';
  const p = path.join(__dirname, '..', '..', 'config', 'avsandare-per-klinik.json');
  const original = fs.readFileSync(p, 'utf8');
  try {
    const d = JSON.parse(original);
    d.kliniker.curatiio.aktiv = true;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
    glomModuler();

    const { createTransactionalMailer } = require('../../src/infra/transactionalMailer');
    const sedda = [];
    const mailer = createTransactionalMailer({
      graphSendConnector: {
        async sendNewMessage(args) {
          sedda.push(args);
          return { sendMode: 'send_mail' };
        },
      },
    });
    await mailer.sendEmail({
      to: 'personal@hairtpclinic.com',
      subject: 'ORD-203',
      text: 'kropp',
      tenantId: 'curatiio',
      audience: 'staff',
    });
    assert.equal(sedda.length, 1);
    assert.equal(sedda[0].mailboxId, 'contact@curatiio.com', 'aktiv klinik → egen adress');

    // Och Hair TP påverkas inte av att grannen aktiverats.
    const store = require('../../src/ops/ccoSendActionStore');
    const mottaget = [];
    const s = await store.createCcoSendActionStore({
      filePath: path.join(
        fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ord203b-')),
        'sends.json'
      ),
      mailer: {
        async sendEmail(input) {
          mottaget.push(input);
          return { ok: true, mode: 'live', provider: 'stub' };
        },
      },
    });
    await s.performSend({
      kind: 'form',
      dryRunOverride: false,
      payload: {
        to: 'personal@hairtpclinic.com',
        subject: 'ORD-203',
        text: 'kropp',
        tenantId: 'curatiio',
        audience: 'staff',
      },
    });
    assert.equal(mottaget[0].from, 'contact@curatiio.com', 'sändstoren följer med');
  } finally {
    fs.writeFileSync(p, original);
    glomModuler();
    if (tidigare === undefined) delete process.env.ARCANA_GRAPH_SEND_ALLOWLIST;
    else process.env.ARCANA_GRAPH_SEND_ALLOWLIST = tidigare;
  }
});

test('en anropare som satt from själv får behålla den', () => {
  // Diagnostik och driftmejl sätter ibland avsändare uttryckligen. Klinikvalet
  // får inte skriva över ett medvetet val.
  const mailer = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'infra', 'transactionalMailer.js'),
    'utf8'
  );
  assert.match(mailer, /input\.from\s*\?/, 'anroparens from ska vinna');
});
