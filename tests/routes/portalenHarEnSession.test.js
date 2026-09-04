'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const express = require('express');

const { createStaffPortalRouter } = require('../../src/routes/staffPortal');

/**
 * ORD-196 — personalportalen hade ingen session i produktion.
 *
 * UPPMÄTT MOT PROD 2026-09-04, utan token:
 *
 *   GET /api/v1/staff/availability-rules  ->  401 {"error":"Inloggning krävs."}
 *   GET /api/v1/staff/team                ->  401 {"error":"Inloggning krävs."}
 *   GET /staff-portal.html                ->  200
 *
 * Sidan gick alltså att öppna, men inget den bad om gick igenom.
 *
 * ORSAKEN. requireAuth läser token ur `Authorization: Bearer` eller
 * `x-auth-token` (src/security/authMiddleware.js:87). staff-portal.html
 * skickade `credentials: 'include'` — cookies. Det finns ingen cookie i det här
 * auth-systemet: ingen res.cookie sätter en session, ingen cookie-parser är
 * monterad, ingenting bryggar cookie till header. Och ingen HTML-sida i public/
 * anropade auth/login mot portalen.
 *
 * VARFÖR DET INTE SYNTES. `apiFetch` returnerade `null` på allt utom 2xx. 401
 * och en tom lista blev samma värde. `_liveMode` blev aldrig true, alla 24 vyer
 * visade sitt tomma läge, och statusraden sa "Demoläge · ingen session" — sant,
 * men det lästes som ett läge någon valt, inte som ett fel.
 *
 * VARFÖR INGET TEST FÅNGADE DET. Varje test av portalen — inklusive de jag
 * skrev i ORD-191 och ORD-194 — monterar routern med en egen requireAuth som
 * sätter req.auth direkt. De bevisar att SERVERN svarar rätt. Ingen av dem
 * läste klientfilen. Testerna nedan gör det, för det var där felet satt.
 */

const PORTAL = path.join(__dirname, '..', '..', 'public', 'staff-portal.html');
const html = () => fs.readFileSync(PORTAL, 'utf8');

/**
 * Kod utan kommentarer, radnumren bevarade.
 *
 * Behövs för att testet nedan letar efter ett mönster som med avsikt STÅR i en
 * kommentar: förklaringen av vad felet var. Samma fälla slog till i ORD-190 —
 * testet gick rött på min egen beskrivning av buggen. Att då tona ner
 * assertionen hade varit fel väg; det är kommentarerna som ska bort, inte
 * kravet.
 */
function kodUtanKommentarer() {
  return html()
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
    .replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '));
}

/**
 * ORD-196b — portalens skript måste gå att TOLKA.
 *
 * Det här testet finns för att jag deployade ett syntaxfel till produktion med
 * 7 907 gröna test bakom mig. När sessionslogiken flyttades till en egen modul
 * blev en kommentarsblock-avslutning kvar mitt i texten:
 *
 *     ... en andra inloggning byggs. *\/
 *     Logiken ligger i staff-portal-session.js ...
 *
 * Resten av raderna blev kod. `Uncaught SyntaxError: Unexpected identifier
 * 'ligger'`. HELA inline-skriptet kördes aldrig — ingen session, ingen banner,
 * ingen data, bara demoinnehållet kvar och "Laddar data…" i hörnet.
 *
 * Inget test såg det, eftersom varje test läste filen som TEXT. Samma grundfel
 * som ORD-196 handlade om, en nivå upp: att kontrollera stavning är inte att
 * kontrollera att något fungerar.
 */
test('varje inline-skript i portalen är giltig JavaScript', () => {
  const kod = html();
  const skript = [...kod.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(skript.length > 0, 'portalen ska ha minst ett inline-skript');

  skript.forEach((m, i) => {
    const kropp = m[1];
    if (!kropp.trim()) return;
    const radnr = kod.slice(0, m.index).split('\n').length;
    assert.doesNotThrow(
      () => new Function(kropp),
      `inline-skript ${i + 1} (rad ~${radnr}) går inte att tolka`
    );
  });
});

test('sessionsmodulen går att tolka i webbläsarens miljö', () => {
  const modul = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'staff-portal-session.js'),
    'utf8'
  );

  assert.doesNotThrow(() => new Function(modul));
});

test('klienten läser samma tokennyckel som admin.js skriver', () => {
  // Poängen med hela lösningen: ingen andra inloggning byggs. admin.js loggar in
  // och lägger token i localStorage — samma origin, samma nyckel.
  assert.equal(TOKEN_KEY, 'ARCANA_ADMIN_TOKEN');
  const adminKod = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'admin.js'), 'utf8');
  assert.match(
    adminKod,
    new RegExp(`TOKEN_KEY = '${TOKEN_KEY}'`),
    'admin.js måste fortsätta skriva till just den nyckeln'
  );
});

test('INGET anrop får skicka credentials i stället för token', () => {
  // Det här är hela buggen, och den kan smyga tillbaka varje gång någon
  // kopierar ett gammalt fetch-anrop. `credentials: 'include'` ser ut som
  // autentisering och är det inte här.
  const kod = kodUtanKommentarer();
  const traffar = kod.match(/credentials:\s*'include'/g) || [];
  assert.equal(
    traffar.length,
    0,
    `hittade ${traffar.length} fetch-anrop med credentials: 'include' — de blir 401`
  );
  // Kontroll att strippningen inte gjort testet tandlöst: mönstret ska
  // fortfarande finnas i filen, i kommentaren som förklarar felet.
  assert.match(html(), /credentials: 'include'/, 'förklaringen ska stå kvar i koden');
});

test('varje fetch går via withAuth', () => {
  // Ett enda anrop som glömmer headern blir 401, och 401 ser ut som tomt.
  const rader = kodUtanKommentarer().split('\n');
  const utanAuth = [];
  rader.forEach((rad, i) => {
    if (!/\bfetch\(/.test(rad)) return;
    if (/apiFetch\(/.test(rad)) return; // definitionen och anropen av wrappern
    const fonster = rader.slice(i, i + 6).join(' ');
    if (!/withAuth\(/.test(fonster)) utanAuth.push(i + 1);
  });
  assert.deepEqual(utanAuth, [], `rader med fetch utan withAuth: ${utanAuth.join(', ')}`);
});

/* ── sessionsmodulen, körd på riktigt ─────────────────────────────────────
   Första versionen av testet nedan letade efter strängen `status === 401` i
   HTML-filen. Det var dekorativt: mutationen som ersatte villkoret med `false`
   lämnade strängen kvar på ett annat ställe och testet fortsatte grönt. Därför
   ligger logiken i en egen modul nu, och testet kör den. */

const { createSessionGuard, TOKEN_KEY } = require('../../public/staff-portal-session');

const fejkLagring = (start = {}) => {
  const data = { ...start };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    _data: data,
  };
};

test('401 sätter ett läge som går att skilja från tomt', () => {
  const g = createSessionGuard({ storage: fejkLagring({ [TOKEN_KEY]: 't-1' }) });
  g.laddaToken();
  assert.equal(g.lage().kod, 'okant', 'token finns men svaret är inte inne än');

  g.noteResponse({ status: 200 });
  assert.equal(g.sawUnauthorized, false, '200 ska inte flagga något');

  g.noteResponse({ status: 401 });
  assert.equal(g.sawUnauthorized, true);
  assert.equal(g.lage().kod, 'nekad', 'nekad token är sitt eget läge');
});

test('403 räknas också som nekad', () => {
  const g = createSessionGuard({ storage: fejkLagring({ [TOKEN_KEY]: 't-1' }) });
  g.laddaToken();
  g.noteResponse({ status: 403 });
  assert.equal(g.lage().kod, 'nekad');
});

test('utan token är läget ingen_token, inte nekad', () => {
  // Skillnaden styr vad som står i bannern, och det är skillnaden mellan
  // "logga in" och "logga in igen".
  const g = createSessionGuard({ storage: fejkLagring() });
  g.laddaToken();
  assert.equal(g.lage().kod, 'ingen_token');
});

test('withAuth sätter bearer och TAR BORT credentials', () => {
  const g = createSessionGuard({ storage: fejkLagring({ [TOKEN_KEY]: 'abc' }) });
  g.laddaToken();
  const opts = g.withAuth({ method: 'POST', credentials: 'include' });
  assert.equal(opts.headers.Authorization, 'Bearer abc');
  assert.equal('credentials' in opts, false, 'credentials bär ingenting här och ska bort');
  assert.equal(opts.method, 'POST', 'övriga fält ska överleva');
});

test('utan token sätts ingen Authorization — anropet ska bli 401, inte tomt', () => {
  const g = createSessionGuard({ storage: fejkLagring() });
  g.laddaToken();
  assert.equal(g.withAuth({}).headers.Authorization, undefined);
});

test('en lagring som kastar ger tom token i stället för att krascha vyn', () => {
  const trasig = {
    getItem() {
      throw new Error('privat läge');
    },
    setItem() {
      throw new Error('privat läge');
    },
  };
  const g = createSessionGuard({ storage: trasig });
  assert.equal(g.laddaToken(), '');
  assert.equal(g.skrivToken('x'), false, 'ett misslyckat skriv får inte rapporteras som lyckat');
});

test('okänd tenant blir ALDRIG ett kliniknamn', () => {
  // Att visa "Hair TP Clinic" när sessionen är okänd är ett påstående om vems
  // uppgifter man ser.
  const g = createSessionGuard({ storage: fejkLagring() });
  assert.equal(g.tenantLabel(''), 'Klinik okänd');
  assert.equal(g.tenantLabel('  '), 'Klinik okänd');
  assert.equal(g.tenantLabel('hair-tp-clinic'), 'Hair TP Clinic');
  assert.equal(g.tenantLabel('curatiio'), 'Curatiio');
  // En tenant vi inte har ett namn för visas som sitt id — inte som fel klinik.
  assert.equal(g.tenantLabel('ny-klinik'), 'ny-klinik');
});

test('live-läget nollställer nekad-flaggan', () => {
  const g = createSessionGuard({ storage: fejkLagring({ [TOKEN_KEY]: 't' }) });
  g.laddaToken();
  g.noteResponse({ status: 401 });
  g.setLive(true, 'curatiio');
  assert.equal(g.lage().kod, 'live');
  assert.equal(g.lage().tenantLabel, 'Curatiio');
});

test('onChange kallas när läget ändras — bannern uppdateras inte av sig själv', () => {
  let antal = 0;
  const g = createSessionGuard({
    storage: fejkLagring({ [TOKEN_KEY]: 't' }),
    onChange: () => {
      antal += 1;
    },
  });
  g.laddaToken();
  const efterLadd = antal;
  g.noteResponse({ status: 401 });
  assert.ok(antal > efterLadd, '401 ska meddela');
  const efter401 = antal;
  g.noteResponse({ status: 401 });
  assert.equal(antal, efter401, 'samma läge igen ska inte meddela på nytt');
});

test('portalen använder modulen, inte en egen kopia', () => {
  const kod = html();
  assert.match(kod, /src="\/staff-portal-session\.js"/, 'modulen ska laddas');
  assert.match(kod, /ArcanaStaffSession\.createSessionGuard/, 'och användas');
});

test('kliniknamnet är inte hårdkodat', () => {
  // Stod `<div class="logo">Hair TP Clinic</div>`. Curatiio nämndes inte en
  // enda gång i filen — och personalen ska aldrig gissa vilken kliniks
  // uppgifter de tittar på.
  const kod = html();
  assert.ok(
    !/<div class="logo">Hair TP Clinic<\/div>/.test(kod),
    'kliniknamnet får inte stå hårdkodat i markupen'
  );
  assert.match(kod, /renderTenantName/, 'namnet ska sättas ur sessionen');
  assert.match(kod, /curatiio/i, 'Curatiio måste finnas i filen');
});

test('utan känd tenant visas ingen klinik alls', () => {
  // Att visa "Hair TP Clinic" när sessionen är okänd är värre än att visa
  // ingenting: det är ett påstående om vems data man ser.
  const kod = html();
  assert.match(kod, /Klinik okänd/, 'okänt läge ska sägas rakt ut');
});

test('bannern säger VILKET av lägena det är', () => {
  const kod = html();
  assert.match(kod, /Du är inte inloggad/, 'ingen token');
  assert.match(kod, /Sessionen gäller inte längre/, 'nekad token');
  assert.match(kod, /Demoläge · inte inloggad/, 'statusraden ska skilja lägena');
  assert.match(kod, /Demoläge · sessionen nekades/);
});

/* ── serversidan ──────────────────────────────────────────────────────── */

async function medPortal(run, { user = null } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ord196-'));
  try {
    const app = express();
    app.use(express.json());
    app.use(
      createStaffPortalRouter({
        config: { stateRoot: dir },
        ccoAuditLog: { append: () => {}, query: () => [] },
        requireAuth: (req, _res, next) => {
          req.auth = {
            userId: 'u-1',
            tenantId: 'curatiio',
            role: 'operator',
            email: 'sabina@curatiio.se',
          };
          req.cco = { ...(req.cco || {}), role: 'operator' };
          if (user) req.currentUser = user;
          next();
        },
      })
    );
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

test('staff/me ger namnet ur currentUser, inte ur req.auth', async () => {
  // req.auth innehåller { token, sessionId, userId, email, membershipId,
  // tenantId, role, resourceId } — aldrig ett namn. Rutten läste auth.name och
  // svarade därför null för VARJE riktig session, vilket lämnade demonamnet
  // "Anna Lindström" i sidofoten som om någon var inloggad.
  await medPortal(
    async (baseUrl) => {
      const me = await fetch(`${baseUrl}/api/v1/staff/me`).then((r) => r.json());
      assert.equal(me.ok, true);
      assert.equal(me.name, 'Sabina Nordvall');
      assert.equal(me.tenantId, 'curatiio', 'portalen behöver tenant för kliniknamnet');
    },
    { user: { id: 'u-1', displayName: 'Sabina Nordvall', email: 'sabina@curatiio.se' } }
  );
});

test('utan namn faller den tillbaka på e-post, inte på null', async () => {
  await medPortal(async (baseUrl) => {
    const me = await fetch(`${baseUrl}/api/v1/staff/me`).then((r) => r.json());
    assert.equal(me.name, 'sabina@curatiio.se', 'hellre e-post än inget namn');
  });
});

test('demonamnet står kvar i ROLES men får inte vara det som visas live', () => {
  // "Anna Lindström" är prototypens platshållare. Den får finnas som demoläge —
  // men loadMe måste skriva över den när en session finns.
  const kod = html();
  assert.match(kod, /userNameEl'\)\.textContent = me\.name/, 'namnet ska sättas ur sessionen');
});
