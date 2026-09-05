'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createMicrosoftGraphSendConnector,
} = require('../../src/infra/microsoftGraphSendConnector');
const {
  hittaAnropsstallen,
  jamforMotFacit,
  argumentText,
} = require('../../src/infra/graphSandvagar');

/**
 * ORD-221 — kundutskicksspärren täckte inte vägen ut till Microsoft Graph.
 *
 * TREDJE GÅNGEN SAMMA HÅL. ORD-184 la spärren i transactionalMailer och
 * smsConnector och jag kallade det "hård spärr mot kundutskick". ORD-197 mätte
 * att kundposten gick förbi den. ORD-221 mätte Graph-vägen: tolv anropsställen,
 * ETT bakom spärren, fem av de övriga rakt till patienter.
 *
 * Uppmätt i prod 2026-09-05 via /api/v1/_diag/env:
 *   ARCANA_GRAPH_SEND_ENABLED = true     ← sändning påslagen
 *   CCO_SEND_LIVE             = false    ← ligger inte i Graph-kedjan
 *
 * Mellan personalportalens knappar och en patients inkorg fanns alltså bara
 * RBAC och avsändar-allowlisten. Båda släpper igenom personal som gör exakt
 * det de har rätt att göra.
 *
 * TESTERNA MÄTER MOT DEN ÄKTA CONNECTORN. En attrapp har ingen spärr, och
 * nästan hela sviten kör med attrapp — det är just därför hålet kunde finnas
 * med grön svit i över ett dygn.
 */

const ROT = path.join(__dirname, '..', '..');
const NYCKEL = 'ARCANA_KUNDUTSKICK_ENABLED';

/** Svar som ser ut som Graphs, tillräckligt för att flödet ska gå igenom. */
function jsonSvar({ status = 200, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get() {
        return null;
      },
    },
    async json() {
      return body;
    },
  };
}

/**
 * Connector med räknare. `anrop` fylls med varje URL som nådde nätet — noll
 * anrop är beviset för att spärren stoppade FÖRE Graph, inte efteråt.
 */
function nyConnector() {
  const anrop = [];
  const fetchImpl = async (url, options = {}) => {
    anrop.push(String(url));
    if (String(url).includes('/oauth2/v2.0/token')) {
      return jsonSvar({ body: { access_token: 'token-1' } });
    }
    if (String(url).includes('/createReply')) {
      return jsonSvar({ status: 201, body: { id: 'utkast-1' } });
    }
    if (String(url).includes('/createForward')) {
      return jsonSvar({ status: 201, body: { id: 'utkast-fwd-1' } });
    }
    return jsonSvar({ status: 202, body: {} });
  };
  return {
    anrop,
    connector: createMicrosoftGraphSendConnector({
      tenantId: 't-1',
      clientId: 'c-1',
      clientSecret: 's-1',
      fetchImpl,
    }),
  };
}

async function medGrind(varde, kor) {
  const tidigare = process.env[NYCKEL];
  try {
    if (varde === undefined) delete process.env[NYCKEL];
    else process.env[NYCKEL] = varde;
    await kor();
  } finally {
    if (tidigare === undefined) delete process.env[NYCKEL];
    else process.env[NYCKEL] = tidigare;
  }
}

const PATIENTBREV = {
  mailboxId: 'contact@hairtpclinic.com',
  subject: 'Din tid hos oss',
  body: 'Hej!',
  to: ['patient@example.com'],
};

// ── Körtidsspärren ─────────────────────────────────────────────────────────

test('ETT BREV UTAN DEKLARERAD MOTTAGARGRUPP NÅR ALDRIG NÄTET', async () => {
  // Det viktigaste beteendet i hela filen. Fail-closed: den som glömmer
  // deklarera får sitt utskick stoppat, inte släppt.
  await medGrind(undefined, async () => {
    const { connector, anrop } = nyConnector();
    await assert.rejects(
      connector.sendNewMessage(PATIENTBREV),
      (err) => err.code === 'KUNDUTSKICK_AVSTANGT',
      'utskick utan audience gick igenom'
    );
    assert.deepEqual(anrop, [], 'något nådde Graph trots att spärren skulle stoppa det');
  });
});

test("audience: 'customer' stoppas — det är hela poängen", async () => {
  await medGrind('false', async () => {
    const { connector, anrop } = nyConnector();
    await assert.rejects(
      connector.sendNewMessage({ ...PATIENTBREV, audience: 'customer' }),
      (err) => err.code === 'KUNDUTSKICK_AVSTANGT'
    );
    assert.equal(anrop.length, 0);
  });
});

test('PERSONALPOST GÅR FRAM — en spärr som stoppar allt är inte en spärr', async () => {
  // Motprovet. Utan det kan spärren vara trasig i stället för sträng, och det
  // syns inte förrän någon undrar var den interna notisen tog vägen.
  await medGrind('false', async () => {
    for (const audience of ['staff', 'ops', 'internal']) {
      const { connector, anrop } = nyConnector();
      await connector.sendNewMessage({ ...PATIENTBREV, audience });
      assert.ok(anrop.length > 0, `${audience} blockerades men skulle gått fram`);
    }
  });
});

test('MED GRINDEN PÅ går kundposten fram', async () => {
  await medGrind('true', async () => {
    const { connector, anrop } = nyConnector();
    await connector.sendNewMessage({ ...PATIENTBREV, audience: 'customer' });
    assert.ok(anrop.length > 0, 'kundposten stoppades trots att grinden är öppen');
  });
});

test('ALLA TRE SÄNDMETODERNA passerar spärren — inte bara sendNewMessage', async () => {
  /**
   * sendReply och sendNewMessage bygger båda ett compose-dokument och anropar
   * sendComposeDocument. Att spärren sitter där är hela skälet till att den
   * täcker tolv anropsställen. Skulle någon flytta upp den till sendNewMessage
   * blir sendReply — konversationsvyns väg, den som går till customerEmail —
   * ogrindad igen.
   */
  await medGrind(undefined, async () => {
    const { connector: c1, anrop: a1 } = nyConnector();
    await assert.rejects(
      c1.sendReply({ ...PATIENTBREV, replyToMessageId: 'msg-1' }),
      (err) => err.code === 'KUNDUTSKICK_AVSTANGT',
      'sendReply är ogrindad'
    );
    assert.deepEqual(a1, []);

    const { connector: c2, anrop: a2 } = nyConnector();
    await assert.rejects(
      c2.sendComposeDocument({
        composeDocument: {
          version: 'phase_5',
          kind: 'mail_compose_document',
          mode: 'compose',
          senderMailboxId: 'contact@hairtpclinic.com',
          recipients: { to: ['patient@example.com'], cc: [], bcc: [] },
          subject: 'Din tid hos oss',
          content: { bodyText: 'Hej!', bodyHtml: null },
          delivery: { sendStrategy: 'send_mail' },
        },
      }),
      (err) => err.code === 'KUNDUTSKICK_AVSTANGT',
      'sendComposeDocument är ogrindad'
    );
    assert.deepEqual(a2, []);
  });
});

test('sendReply OCH sendNewMessage BÄR VIDARE mottagargruppen till spärren', async () => {
  /**
   * Att båda BLOCKERAS utan audience bevisar ingenting om vidarebefordringen —
   * undefined ser likadant ut oavsett om parametern skickas med eller tappas
   * på vägen. Den första versionen av den här filen mätte bara blockeringen,
   * och mutationen som tog bort `audience,` ur sendReply överlevde.
   *
   * Det GENOMSLÄPPTA fallet är det som skiljer. Tappas parametern blockeras
   * personalposten, och sendReply är konversationsvyns väg — den som annars
   * går till customerEmail.
   */
  await medGrind('false', async () => {
    const { connector, anrop } = nyConnector();
    await connector.sendReply({
      ...PATIENTBREV,
      to: ['kons@hairtpclinic.com'],
      replyToMessageId: 'msg-1',
      audience: 'staff',
    });
    assert.ok(anrop.length > 0, 'sendReply tappade audience på vägen till spärren');

    const { connector: c2, anrop: a2 } = nyConnector();
    await c2.sendNewMessage({
      ...PATIENTBREV,
      to: ['kons@hairtpclinic.com'],
      audience: 'staff',
    });
    assert.ok(a2.length > 0, 'sendNewMessage tappade audience på vägen till spärren');
  });
});

test('MOTTAGARGRUPPEN FÅR LIGGA I COMPOSE-DOKUMENTET, inte bara som parameter', async () => {
  // executionService skickar `{ audience, composeDocument }`, medan andra
  // vägar bygger dokumentet själva. Båda formerna måste läsas, annars
  // blockeras personalpost som deklarerat rätt sak på fel plats.
  await medGrind('false', async () => {
    const { connector, anrop } = nyConnector();
    await connector.sendComposeDocument({
      composeDocument: {
        version: 'phase_5',
        kind: 'mail_compose_document',
        mode: 'compose',
        audience: 'staff',
        senderMailboxId: 'kons@hairtpclinic.com',
        recipients: { to: ['kons@hairtpclinic.com'], cc: [], bcc: [] },
        subject: 'Intern notis',
        content: { bodyText: 'Bokning bekräftad.', bodyHtml: null },
        delivery: { sendStrategy: 'send_mail' },
      },
    });
    assert.ok(anrop.length > 0, 'audience i compose-dokumentet lästes inte');
  });
});

test('ANROPARFELEN KASTAR FÖRE GRINDEN — mätt fram en gång förut', async () => {
  /**
   * ORD-197 la först sin grind före anroparkontrollerna och fick två gamla
   * test röda av rätt skäl. Tom brödtext är FEL HOS ANROPAREN. En
   * avstängningsgrind som returnerar före den gömmer buggen tills grinden
   * öppnas — alltså till skarpt läge, när det kostar som mest.
   *
   * Med grinden AV (alltså blockerande) ska ett utskick utan brödtext ändå
   * klaga på brödtexten.
   */
  await medGrind(undefined, async () => {
    const { connector } = nyConnector();
    await assert.rejects(
      connector.sendNewMessage({ ...PATIENTBREV, body: '' }),
      (err) => /requires body/.test(err.message),
      'grinden svarade före kontrollen av brödtexten'
    );
  });
});

test('SPÄRREN SITTER I KODEN, inte bara i det här testets förväntan', () => {
  // Bunden till platsen, inte till felmeddelandet. Ett meddelande står kvar i
  // källan även när `if`-satsen stängs av — den fällan överlevde en mutation i
  // ORD-219 innan den bands om.
  const kalla = fs.readFileSync(
    path.join(ROT, 'src', 'infra', 'microsoftGraphSendConnector.js'),
    'utf8'
  );
  const grind = kalla.indexOf('bedomKundutskick(');
  const token = kalla.indexOf('await fetchAccessToken()');
  const kropp = kalla.indexOf('sendComposeDocument requires body');
  assert.ok(grind > 0, 'spärren finns inte i connectorn');
  assert.ok(kropp > 0 && kropp < grind, 'anroparkontrollerna ligger efter grinden');
  assert.ok(grind < token, 'grinden ligger efter att token hämtats — för sent');
  assert.match(
    kalla,
    /if \(kundgrind\.blockerat\) \{[\s\S]{0,300}?throw err;/,
    'grinden kastar inte'
  );
});

// ── Den statiska inventeringen ─────────────────────────────────────────────

test('MÄTNINGEN HAR NÅGOT ATT MÄTA — anropsställena hittades', () => {
  // Utan den här kontrollen blir hela inventeringen grön av att sökningen
  // slutade fungera. Samma fälla som en tom allowlist.
  const funna = hittaAnropsstallen(ROT);
  assert.ok(funna.length >= 10, `hittade bara ${funna.length} anropsställen — mät om`);
  const filer = new Set(funna.map((f) => f.fil));
  assert.ok(filer.has('src/routes/ccoConversation.js'), 'konversationsvyns sändväg saknas');
  assert.ok(filer.has('src/capabilities/executionService.js'), '/cco/send saknas');
});

test('TILLGÄNGLIGHETSKONTROLLER RÄKNAS INTE som anropsställen', () => {
  /**
   * `typeof connector.sendNewMessage !== 'function'` förekommer på nio ställen.
   * Ett mönster utan kravet på `(` direkt efter metodnamnet räknar dem som
   * utskick och rapporterar ungefär dubbelt så många anropsställen som det
   * finns. Ett facit med påhittade rader slutar man lita på.
   */
  const funna = hittaAnropsstallen(ROT);
  const iOps = funna.filter((f) => f.fil === 'src/ops/ccoPatientCareOps.js');
  assert.equal(iOps.length, 1, 'tillgänglighetskontrollen räknades som ett utskick');
});

test('VARJE ANROPSSTÄLLE STÄMMER MED FACIT', () => {
  const facit = JSON.parse(
    fs.readFileSync(path.join(ROT, 'config', 'graph-sandvagar.json'), 'utf8')
  );
  const { odeklarerade, forsvunna, felDeklarerade } = jamforMotFacit(
    hittaAnropsstallen(ROT),
    facit
  );

  assert.deepEqual(
    odeklarerade,
    [],
    '\nNy väg ut till Graph som ingen tagit ställning till.\n' +
      'Lägg den i config/graph-sandvagar.json med mottagargrupp och skäl:\n'
  );
  assert.deepEqual(forsvunna, [], '\nFacit beskriver anropsställen som inte finns längre:\n');
  assert.deepEqual(felDeklarerade, [], '\nKoden och facit säger olika saker:\n');
});

test('EN NY, ODEKLARERAD SÄNDVÄG RAPPORTERAS', () => {
  /**
   * Att listan över odeklarerade är tom i dag bevisar ingenting om mätningen —
   * den är tom både när allt är deklarerat och när rapporteringen är trasig.
   * Mutationen som tog bort push-raden överlevde precis den luckan.
   *
   * Här matas ett påhittat anropsställe in. Rapporteras det inte kan en ny
   * ogrindad sändväg smyga in med grön svit.
   */
  const facit = JSON.parse(
    fs.readFileSync(path.join(ROT, 'config', 'graph-sandvagar.json'), 'utf8')
  );
  const { odeklarerade } = jamforMotFacit(
    [
      ...hittaAnropsstallen(ROT),
      {
        fil: 'src/ops/helt-ny-utskicksvag.js',
        rad: 12,
        metod: 'sendNewMessage',
        ordning: 1,
        audienceDeklaration: null,
      },
    ],
    facit
  );
  assert.equal(odeklarerade.length, 1, 'ett odeklarerat anropsställe rapporterades inte');
  assert.match(odeklarerade[0], /helt-ny-utskicksvag/);
});

test('EN KUNDVÄG SOM UTGER SIG FÖR ATT VARA PERSONALPOST FÅNGAS', () => {
  /**
   * Mätningen får inte nöja sig med ATT något deklarerats. Ett `audience:
   * 'staff'` på en patientväg deklarerar ju något — och är exakt hur
   * körtidsspärren skulle kunna kringgås.
   */
  const facit = JSON.parse(
    fs.readFileSync(path.join(ROT, 'config', 'graph-sandvagar.json'), 'utf8')
  );
  const funna = hittaAnropsstallen(ROT);
  const kundvag = funna.find((f) => f.fil === 'src/routes/ccoConversation.js');
  assert.ok(kundvag, 'konversationsvyns sändväg hittades inte');

  const ljugit = funna.map((f) => (f === kundvag ? { ...f, audienceDeklaration: "'staff'" } : f));
  const { felDeklarerade } = jamforMotFacit(ljugit, facit);
  assert.equal(felDeklarerade.length, 1, 'en kundväg som säger staff gick igenom mätningen');
  assert.match(felDeklarerade[0], /ccoConversation/);
});

test('ARGUMENTLÄSNINGEN KLARAR NÄSTLADE KLAMRAR OCH APOSTROFER', () => {
  /**
   * `sendComposeDocument({ composeDocument: { recipients: { to: [...] } } })`
   * har fyra nivåer. En läsning som stannar på första `}` missar en audience
   * längre ner och rapporterar den som saknad — alltså underkänner korrekt
   * kod, vilket är det snabbaste sättet att göra en kontroll värdelös.
   *
   * Apostrofen i en svensk kommentar ("patientens") är den andra fällan: utan
   * strängöverhoppning räknas resten av filen som inuti en sträng.
   */
  const kalla = "f({ a: { b: { c: 1 } }, audience: 'staff' })";
  assert.match(argumentText(kalla, kalla.indexOf('(')), /audience: 'staff'/);

  const medKommentar = "f({ /* patient's brev */ audience: 'staff' })";
  const arg = argumentText(medKommentar, medKommentar.indexOf('('));
  assert.match(arg, /audience: 'staff'/, 'apostrof i kommentar bröt balansräkningen');

  /**
   * STRÄNGEN MÅSTE KOMMA FÖRE audience, annars mäter fallet ingenting.
   *
   * Första versionen skrev `{ audience: 'staff', x: ')' }` och överlevde
   * mutationen som stänger av strängöverhoppningen: läsningen kapades visserligen
   * vid parentesen inuti strängen, men audience låg redan före kapet och fanns
   * kvar i det avhuggna resultatet. Ordningen var alltså skillnaden mellan ett
   * test och en illusion.
   */
  const strangForst = "f({ x: ')', audience: 'staff' })";
  assert.match(
    argumentText(strangForst, strangForst.indexOf('(')),
    /audience: 'staff'/,
    'en parentes inuti en sträng kapade argumentläsningen'
  );
});
