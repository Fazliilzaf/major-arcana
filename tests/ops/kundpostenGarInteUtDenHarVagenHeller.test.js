'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { createCcoSendActionStore } = require('../../src/ops/ccoSendActionStore');

/**
 * ORD-197 §1 — kundutskicksspärren täckte inte den väg kundposten går.
 *
 * ORD-184 lade `bedomKundutskick` i transactionalMailer och smsConnector, och
 * jag beskrev resultatet för ägaren som "hård spärr mot kundutskick" med
 * "dubbelt skydd". Det var fel, och felet var mitt.
 *
 * UPPMÄTT 2026-09-04: ccoSendActionStore får `resendMailer` injicerad DIREKT
 * (server.js:6878), inte transactionalMailer. Spärren låg inte i vägen.
 *
 * Och det är den här vägen kundposten går — sex moduler anropar performSend:
 *   ccoOfferQuickStore          offerter
 *   ccoAgreementQuickStore      avtal
 *   ccoAftercareSchedulerStore  eftervård
 *   ccoPortalReplyNotification  portalsvar
 *   ccoComposeSend              manuella utskick
 *   ccoPortalSelfTest           självtest
 *
 * Att inget gått ut beror på CCO_SEND_LIVE=false, som gör allt till
 * torrkörning. Inte på spärren. Skillnaden spelar roll den dag flaggan sätts
 * av driftskäl: då hade kundposten börjat gå utan att någon bestämt det.
 *
 * Testerna nedan mäter mot en SKARP sändning (dryRunOverride: false). Med
 * torrkörning på hade de varit gröna oavsett — det är just den fällan som
 * gjorde att hålet inte syntes.
 */

const NYCKEL = 'ARCANA_KUNDUTSKICK_ENABLED';

async function medStore(run, { env = {} } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord197-'));
  const original = process.env[NYCKEL];
  const originalLive = process.env.CCO_SEND_LIVE;
  const skickade = [];
  try {
    if (env[NYCKEL] === undefined) delete process.env[NYCKEL];
    else process.env[NYCKEL] = env[NYCKEL];

    const store = await createCcoSendActionStore({
      filePath: path.join(dir, 'sends.json'),
      mailer: {
        async sendEmail(input) {
          skickade.push(input);
          return { ok: true, mode: 'live', messageId: 'm-1' };
        },
      },
    });
    await run({ store, skickade });
  } finally {
    if (original === undefined) delete process.env[NYCKEL];
    else process.env[NYCKEL] = original;
    if (originalLive === undefined) delete process.env.CCO_SEND_LIVE;
    else process.env.CCO_SEND_LIVE = originalLive;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

const brev = ({ payload = {}, ...extra } = {}) => ({
  kind: 'notification',
  customerId: 'kund-1',
  // dryRunOverride: false — SKARP sändning. Utan den mäter testet ingenting:
  // torrkörningen hade stoppat brevet oavsett om spärren fanns eller ej.
  dryRunOverride: false,
  ...extra,
  payload: {
    to: 'kund@example.com',
    subject: 'Ditt besök',
    text: 'Hej!',
    html: '<p>Hej!</p>',
    ...payload,
  },
});

test('ett skarpt kundutskick STOPPAS när spärren är på', async () => {
  await medStore(async ({ store, skickade }) => {
    const r = await store.performSend(brev());
    assert.equal(r.mode, 'blocked');
    assert.equal(skickade.length, 0, 'mailern får aldrig anropas');
    assert.match(r.skipped, /kundutskick_avstangt/);
  });
});

test('det blockerade utskicket syns i loggen — inte som skickat, inte som torrkörning', async () => {
  // Ett tyst stopp är nästan lika farligt som ett tyst utskick: ingen kan
  // svara på "gick brevet iväg?".
  await medStore(async ({ store }) => {
    await store.performSend(brev());
    const rader = await store.listSends?.({ limit: 10 });
    const lista = Array.isArray(rader) ? rader : rader?.sends || [];
    const rad = lista.find((s) => s.status === 'blocked');
    assert.ok(rad, 'ska finnas en rad med status blocked');
    assert.equal(rad.dryRun, false, 'den var inte en torrkörning');
    assert.match(rad.blockReason, /kundutskick_avstangt/);
  });
});

test('utan audience behandlas utskicket som KUND — fail-closed', async () => {
  // Det viktigaste beteendet. Ett nytt utskick som glömmer deklarera sin
  // mottagargrupp ska stoppas, inte släppas igenom.
  await medStore(async ({ store, skickade }) => {
    const r = await store.performSend(brev({ payload: { audience: undefined } }));
    assert.equal(r.mode, 'blocked');
    assert.equal(skickade.length, 0);
  });
});

test('internpost till personal går fram — spärren gäller kunder', async () => {
  await medStore(async ({ store, skickade }) => {
    for (const audience of ['staff', 'ops', 'internal']) {
      const r = await store.performSend(brev({ payload: { audience } }));
      assert.notEqual(r.mode, 'blocked', `${audience} ska inte blockeras`);
    }
    assert.equal(skickade.length, 3, 'alla tre ska nå mailern');
  });
});

test('med spärren AV går kundposten fram', async () => {
  // Motprovet. En spärr som blockerar allt alltid är inte en spärr, den är en
  // trasig väg.
  await medStore(
    async ({ store, skickade }) => {
      const r = await store.performSend(brev());
      assert.notEqual(r.mode, 'blocked');
      assert.equal(skickade.length, 1);
      assert.equal(skickade[0].to, 'kund@example.com');
    },
    { env: { [NYCKEL]: 'true' } }
  );
});

test('de kontroller som KASTAR går före grinden som bara blockerar', async () => {
  // Mätt fram, inte valt på känsla. Första versionen låg direkt efter
  // avlidenspärren, och två befintliga test gick rött:
  //
  //   ORD-111 #1: utskick utan brödtext går inte iväg skarpt
  //   FALL 3: mall godkänd → skickat, kroppen ur revisionen
  //
  // De hade rätt. Tom kropp och icke godkänd mall är FEL HOS ANROPAREN. En
  // avstängningsgrind som returnerar före dem gömmer buggen tills grinden
  // öppnas — alltså till skarpt läge, när det kostar som mest.
  await medStore(async ({ store }) => {
    await assert.rejects(
      store.performSend({
        kind: 'aftercare',
        dryRunOverride: false,
        payload: { to: 'kund@example.com' }, // tomt ämne OCH tom kropp
      }),
      (err) => err.code === 'TEMPLATE_EMPTY_MESSAGE',
      'tom kropp ska kasta, inte tyst blockeras'
    );
  });
});

test('spärren sitter EFTER avlidenspärren', async () => {
  // ORD-184: avlidenspärren kastar, kundgrinden returnerar. Ligger min först
  // ser ett blockerat utskick till en avliden ut som vilket blockerat utskick
  // som helst — och den skillnaden är inte kosmetisk.
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoSendActionStore.js'),
    'utf8'
  );
  const avliden = kalla.indexOf('sendBlocker && typeof sendBlocker');
  const kundgrind = kalla.indexOf('bedomKundutskick(payload.audience)');
  assert.ok(avliden > 0 && kundgrind > 0, 'båda spärrarna ska finnas');
  assert.ok(avliden < kundgrind, 'avlidenspärren måste komma först');
});

test('storen får INTE kringgå spärren genom att ta mailern direkt', () => {
  // Det var precis så hålet uppstod: server.js injicerar resendMailer rakt in,
  // förbi transactionalMailer där ORD-184:s spärr satt. Spärren måste därför
  // finnas i storen själv, inte bara i lagret under.
  const kalla = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'ops', 'ccoSendActionStore.js'),
    'utf8'
  );
  assert.match(kalla, /require\('\.\.\/infra\/kundutskickGate'\)/);

  const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
  assert.match(
    server,
    /require\('\.\/src\/infra\/resendMailer'\)/,
    'dokumenterar att injektionen fortfarande är den råa mailern'
  );
});
