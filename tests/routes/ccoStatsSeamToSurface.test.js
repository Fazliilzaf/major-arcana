'use strict';

/**
 * SÖMMEN mellan store och yta — ledet som ingen test täckte.
 *
 * ORD-87 lämnade en lucka som är värd mer än en rad:
 *
 *   store-testerna   verifierar att aggregatet RÄKNAS rätt
 *   UI-testerna      verifierar att källtexten LÄSER rätt fält
 *   ingenting        verifierade att fälten faktiskt tar sig DIT
 *
 * Under v9 returnerar loadStats() tidigt. Ytan får sina siffror från
 * customers-shell (ccoStaff.js), inte från /cco-patient-master/stats som jag
 * verifierade när jag skrev ordern. Att det ändå fungerade beror på en enda
 * rad:
 *
 *   const enrichedStats = { ...stats, kunderPanel, bookingSources, bookingCoverage };
 *
 * Spridningen bär allt. Hade den plockat fält explicit — vilket är precis vad
 * någon gör när listan känns lång — hade de fem nya fälten aldrig nått ytan,
 * OCH ALLA TESTER HADE VARIT GRÖNA.
 *
 * Det är samma lucka som lät `Snitt LTV` visa "—" i månader: noden läste
 * stats.totalRevenue, ett fält som aldrig skickats, och inget test kopplade
 * ihop de två sidorna.
 *
 * Det här testet går genom den RIKTIGA rutten med en stubbad store, så det
 * fångar borttappade fält oavsett var i kedjan de tappas.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createCcoStaffRouter } = require('../../src/routes/ccoStaff');

const TENANT = 'hair-tp-clinic';

// Sentinelvärden — omöjliga att förväxla med något annat i payloaden.
const STATS_FRÅN_STORE = Object.freeze({
  totalPatients: 7451,
  withPersonnummer: 4001,
  matched: 3664,
  clientoOnly: 12,
  driveOnly: 34,
  needsReview: 56,
  pipedriveLinked: 3413,
  archivedPatients: 78,
  // ORD-87 — de fält som ska överleva hela vägen till ytan.
  wonDealsTotal: 41489801,
  wonDealsCount: 912,
  customersWithWonDeals: 726,
  openDealsTotal: 80463813,
  openDealsCount: 1443,
  customersWithOpenDeals: 1201,
  lifetimeValueDenominator: 7451,
  lifetimeValueAverage: 5568,
  dealTotalsAreFloor: true,
  imports: {},
  updatedAt: '2026-07-28T00:00:00.000Z',
});

// Fälten ytan faktiskt läser i renderV9MetricHeader. Tappas något av dem
// visar Snitt LTV "—" utan att något annat går sönder.
const YTANS_FÄLT = [
  'wonDealsTotal',
  'openDealsTotal',
  'lifetimeValueDenominator',
  'lifetimeValueAverage',
  'totalPatients',
];

function requireAuth(req, _res, next) {
  req.auth = { tenantId: TENANT, userId: 'owner-1', role: 'OWNER' };
  req.currentUser = { id: 'owner-1', email: 'owner@example.test', displayName: 'Owner' };
  next();
}
function requireRole() {
  return (_req, _res, next) => next();
}

function byggApp() {
  const patients = [
    {
      id: 'patient-1',
      tenantId: TENANT,
      displayName: 'Anna Andersson',
      primaryEmail: 'anna@example.test',
      emails: ['anna@example.test'],
      phones: [],
      flags: [],
      fileSummary: {},
    },
  ];
  const patientMasterStore = {
    async listPatients(options) {
      return {
        total: patients.length,
        offset: Number(options.offset) || 0,
        limit: Number(options.limit) || 60,
        patients,
      };
    },
    async getTenantStats() {
      return { ...STATS_FRÅN_STORE };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    createCcoStaffRouter({
      patientMasterStore,
      authStore: {},
      config: { defaultTenantId: TENANT },
      requireAuth,
      requireRole,
    })
  );
  return app;
}

async function medServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}

test('SÖM: affärsaggregatet överlever hela vägen från store till shell-payload', async () => {
  const body = await medServer(byggApp(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/cco/staff/customers-shell?limit=1&offset=0`);
    assert.equal(r.status, 200, 'shell-anropet ska lyckas');
    return r.json();
  });

  assert.ok(body.stats, 'payloaden ska bära stats');

  for (const fält of YTANS_FÄLT) {
    assert.equal(
      body.stats[fält],
      STATS_FRÅN_STORE[fält],
      `fältet ${fält} tappades mellan store och yta — Snitt LTV skulle visa "—"`
    );
  }
});

/**
 * Fält som med FLIT inte når ytan. Nyckel -> skäl.
 *
 * Utan den här listan har vakten bara ett svar på en avsiktlig utelämning:
 * ta bort assertionen. Det är samma svaghet som `.se`-vakterna i ORD-86 fick
 * bort — en vakt utan väg framåt är en vakt någon stänger av, och då skyddar
 * den ingenting alls.
 *
 * Tom idag. Det är rätt läge: allt store räknar fram är billigt och används.
 */
const MEDVETET_UTELÄMNADE = Object.freeze({
  // exempel: 'internDiagnostik': 'bara för ops-loggen, ska inte till klienten',
});

test('SÖM: INGET fält från store får tappas på vägen', async () => {
  // Bredare än ytans fem fält. Plockas listan om explicit ska varje
  // borttappat fält synas här, inte upptäckas i produktion månader senare.
  const body = await medServer(byggApp(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/cco/staff/customers-shell?limit=1&offset=0`);
    return r.json();
  });

  const tappade = Object.keys(STATS_FRÅN_STORE).filter(
    (nyckel) => !(nyckel in (body.stats || {})) && !(nyckel in MEDVETET_UTELÄMNADE)
  );
  assert.deepEqual(
    tappade,
    [],
    `dessa fält nådde aldrig ytan: ${tappade.join(', ')}. ` +
      'Sprider rutten fortfarande hela stats-objektet? Är utelämningen avsiktlig — ' +
      'lägg nyckeln i MEDVETET_UTELÄMNADE med ett skäl, så blir det ett dokumenterat beslut.'
  );

  // Åt andra hållet: en post som INTE längre utelämnas ska bort ur listan.
  // Annars växer undantagen tills de täcker allt och vakten tystnar av sig själv.
  const föråldrade = Object.keys(MEDVETET_UTELÄMNADE).filter(
    (nyckel) => nyckel in (body.stats || {})
  );
  assert.deepEqual(
    föråldrade,
    [],
    `MEDVETET_UTELÄMNADE har poster som faktiskt når ytan: ${föråldrade.join(', ')}`
  );
});

test('SÖM: golv-flaggan är en boolean hela vägen, inte en sträng', async () => {
  // JSON-serialisering är lätt att ta för given. Blir true till "true"
  // någonstans blir varje falsy-kontroll på ytan fel åt andra hållet.
  const body = await medServer(byggApp(), async (baseUrl) => {
    const r = await fetch(`${baseUrl}/cco/staff/customers-shell?limit=1&offset=0`);
    return r.json();
  });
  assert.equal(typeof body.stats.dealTotalsAreFloor, 'boolean');
  assert.equal(body.stats.dealTotalsAreFloor, true);
});
