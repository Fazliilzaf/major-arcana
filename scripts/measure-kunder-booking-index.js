#!/usr/bin/env node
'use strict';

/**
 * ORD-85 steg 1 — vad kostar loadKunderBookingIndex per patient?
 *
 * Kör LOKALT mot syntetisk prod-skala. Prod har tagits ner en gång ikväll av
 * exakt den här kodvägen; reproduktion där tillför ingenting.
 *
 * Frågan är vilken sorts fel det är, för fixarna är motsatta:
 *
 *   container-OOM        → minska payload: streama, paginera, sluta materialisera
 *   event-loop-svält     → bryt upp det synkrona arbetet, yield mellan bitar
 *
 * Båda ser ut som "processen dog" utifrån. Skillnaden syns i heapUsed-kurvan
 * och i längsta sammanhängande synkrona block.
 *
 * Mätt i prod före detta:
 *   samma patient, kall   8,46 s
 *   samma patient, varm   1,34 s
 *   includeJournal=0      1,39 s   ← sparar 14 kB men NOLL tid, hypotes falsifierad
 *   /patient/summary      1,46 s   ← varken snabbare eller mindre, hypotes falsifierad
 *   tre NYA patienter     58,8 s → 502 → instansen omstartad
 *
 * Körning:
 *   node scripts/measure-kunder-booking-index.js
 *   node scripts/measure-kunder-booking-index.js --bookings 28974 --patients 3
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };

const N_BOOKINGS = Number(arg('--bookings', '28974'));   // prod-skala enligt ORD-58
const N_CASES = Number(arg('--cases', '5000'));          // limit i listCasesForEnrichment
const N_PATIENTS = Number(arg('--patients', '3'));
const TENANT = 'hair-tp-clinic';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord85-'));
const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;

function skrivSyntetiskData() {
  // Cliento: buckets nycklade tenantId::mailbox, som i clientoBookingStore.
  // En andra tenant med — listAllBookings({tenantId:''}) hämtar över ALLA
  // tenants, och det är den delen som är en isolationsfråga och inte bara en
  // prestandafråga.
  const buckets = {};
  const perBucket = Math.ceil(N_BOOKINGS / 4);
  for (const [i, key] of [`${TENANT}::a`, `${TENANT}::b`, `${TENANT}::c`, 'annan-tenant::a'].entries()) {
    buckets[key] = Array.from({ length: perBucket }, (_, j) => ({
      id: `bk-${i}-${j}`,
      customerEmail: `kund${j}@exempel.se`,
      customerName: `Kund ${j}`,
      startsAt: `2026-0${(j % 9) + 1}-1${j % 9}T10:00:00Z`,
      status: j % 3 === 0 ? 'attended' : 'booked',
      serviceName: 'FUE',
      notes: 'x'.repeat(120),
    }));
  }
  fs.writeFileSync(path.join(dir, 'cliento-bookings.json'), JSON.stringify({ bookings: buckets }));

  fs.writeFileSync(
    path.join(dir, 'cco-bookings.json'),
    JSON.stringify({
      cases: Array.from({ length: N_CASES }, (_, i) => ({
        id: `case-${i}`, tenantId: TENANT, patientId: `p-${i % 500}`,
        status: 'open', createdAt: '2026-01-01T00:00:00Z',
      })),
    })
  );
  fs.writeFileSync(path.join(dir, 'cco-booking-engine.json'), JSON.stringify({ bookings: [], services: [] }));
  fs.writeFileSync(path.join(dir, 'cco-treatment-encounters.json'), JSON.stringify({ encounters: [] }));
}

(async () => {
  console.log('== ORD-85 steg 1: loadKunderBookingIndex per patient ==');
  console.log(`syntetisk skala: ${N_BOOKINGS} cliento-bokningar, ${N_CASES} cases, ${N_PATIENTS} patienter`);
  console.log(`node ${process.version}\n`);

  skrivSyntetiskData();
  const { loadKunderBookingIndex } = require(
    path.join(__dirname, '..', 'src', 'ops', 'ccoKunderBookingEnrichment.js')
  );

  const config = {
    clientoBookingStorePath: path.join(dir, 'cliento-bookings.json'),
    ccoBookingStorePath: path.join(dir, 'cco-bookings.json'),
    ccoBookingEngineStorePath: path.join(dir, 'cco-booking-engine.json'),
    ccoTreatmentEncounterStorePath: path.join(dir, 'cco-treatment-encounters.json'),
  };

  // Längsta sammanhängande synkrona block: om event-loopen aldrig får andas
  // uteblir tick:en helt. En health-check kan inte besvaras under ett sådant
  // block — det är skillnaden mot OOM.
  let sistaTick = Date.now();
  let langstaGap = 0;
  const tick = setInterval(() => {
    const nu = Date.now();
    langstaGap = Math.max(langstaGap, nu - sistaTick - 10);
    sistaTick = nu;
  }, 10);
  tick.unref?.();

  if (global.gc) global.gc();
  const start = process.memoryUsage();
  console.log(`start   heapUsed=${mb(start.heapUsed)} MB  rss=${mb(start.rss)} MB\n`);

  const rader = [];
  for (let i = 1; i <= N_PATIENTS; i += 1) {
    const patient = { id: `patient-${i}`, primaryEmail: `kund${i}@exempel.se`, displayName: `Kund ${i}` };
    langstaGap = 0;
    sistaTick = Date.now();
    const t0 = process.hrtime.bigint();
    const before = process.memoryUsage().heapUsed;
    const res = await loadKunderBookingIndex(config, TENANT, [patient]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const after = process.memoryUsage();
    rader.push({
      patient: i,
      ms: Math.round(ms),
      heapDelta: mb(after.heapUsed - before),
      heapUsed: mb(after.heapUsed),
      rss: mb(after.rss),
      blockMs: langstaGap,
      clientoBokningar: (res.clientoBookings || []).length,
      shadow: (res.historicalShadowLedgerEvents || []).length,
      cases: (res.bookingCases || []).length,
    });
    console.log(
      `patient ${i}  ${String(Math.round(ms)).padStart(6)} ms   ` +
      `heapUsed ${String(mb(after.heapUsed)).padStart(7)} MB (Δ${mb(after.heapUsed - before)})   ` +
      `rss ${String(mb(after.rss)).padStart(7)} MB   längsta synkblock ${langstaGap} ms   ` +
      `cliento ${(res.clientoBookings || []).length}`
    );
  }

  clearInterval(tick);
  console.log('');
  const forsta = rader[0], sista = rader[rader.length - 1];
  const vaxer = sista.heapUsed - forsta.heapUsed;
  console.log('— Slutsats —');
  console.log(`  Tid per patient:        ${rader.map((r) => r.ms + ' ms').join('  ·  ')}`);
  console.log(`  heapUsed efter varje:   ${rader.map((r) => r.heapUsed + ' MB').join('  ·  ')}`);
  console.log(`  Längsta synkblock:      ${Math.max(...rader.map((r) => r.blockMs))} ms`);
  console.log('');
  if (Math.max(...rader.map((r) => r.blockMs)) > 1000) {
    console.log('  → EVENT-LOOP-SVÄLT: ett synkront block över en sekund. Health-checken');
    console.log('    kan inte besvaras under det. Fix: bryt upp arbetet och yielda.');
  }
  if (vaxer > 50) {
    console.log(`  → MINNET VÄXER: +${Math.round(vaxer)} MB över ${N_PATIENTS} anrop utan att släppas.`);
    console.log('    Fix: sluta materialisera hela bokningsuniverset per patient.');
  }
  if (Math.max(...rader.map((r) => r.blockMs)) <= 1000 && vaxer <= 50) {
    console.log('  → VARKEN svält eller växande minne vid denna skala. Höj --bookings');
    console.log('    eller --patients, eller så ligger orsaken utanför denna funktion.');
  }

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => {
  console.error('AVBRUTET:', e.message || e);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
