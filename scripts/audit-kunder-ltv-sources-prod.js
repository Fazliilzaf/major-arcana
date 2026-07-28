#!/usr/bin/env node
'use strict';

/**
 * Kunder-vyns LTV — varifrån kan den komma? Read-only revision mot prod.
 *
 * Bakgrund: `Snitt LTV` visar `—` och `Intäkt ej kopplad` på Kunder-vyn.
 * Kodläsningen visar att kedjan är KORREKT: ccoPatientMasterStore sätter
 *
 *     lifetimeValue: pipedriveWon.total > 0 ? pipedriveWon.total : null
 *
 * och `sumPipedriveWonDeals` räknar bara VUNNA affärer. `null` betyder alltså
 * "noll vunna affärer", inte "värdet tappades". Ett stickprov på 4 affärer gav
 * status "Pågående" på alla fyra och noll `wonAt` — men fyra affärer säger
 * ingenting om 3 486 kopplade kunder.
 *
 * Scriptet svarar på tre frågor innan någon designar om ytan:
 *
 *   F1  Statusfördelningen över alla affärer. Förekommer "Vunnen" över huvud
 *       taget i datan? Är svaret nej är vunnet-detekteringen oprövad, hur
 *       korrekt den än ser ut i koden.
 *
 *   F2  Avvikelsen: kunder med pipedriveDealCount > 0 vars detaljsvar bär
 *       färre affärer. Antingen tysta HTTP-fel eller så räknar dealCount något
 *       annat än deals-arrayen. HTTP-fel räknas SEPARAT så de aldrig kan
 *       maskera sig som "noll affärer".
 *
 *   F3  Fortnox som alternativ källa. Det finns ingen endpoint för fakturerad
 *       intäkt per kund idag (bara connect/status/sync-patient), så scriptet
 *       mäter hur många kunder som ens är kopplade — alltså om vägen är
 *       byggbar, inte om den är byggd.
 *
 * INGA SKRIVNINGAR. Endast GET.
 *
 * Körning:
 *   node scripts/audit-kunder-ltv-sources-prod.js
 *   node scripts/audit-kunder-ltv-sources-prod.js --sample 200 --json rapport.json
 *
 * Miljö:
 *   BASE                        default https://arcana.hairtpclinic.com
 *   ARCANA_SMOKE_BEARER_TOKEN   owner-token; annars via get-prod-auth-token.js
 */

require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.BASE || process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com')
  .replace(/\/+$/, '');

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] ? args[i + 1] : fallback;
};
const SAMPLE = Number(argValue('--sample', '150'));
const CONCURRENCY = Number(argValue('--concurrency', '4'));
const JSON_OUT = argValue('--json', '');
const PAGE = 400;

function getToken() {
  if (process.env.ARCANA_SMOKE_BEARER_TOKEN) return process.env.ARCANA_SMOKE_BEARER_TOKEN.trim();
  return execSync(`node "${path.join(__dirname, 'get-prod-auth-token.js')}" --owner`, {
    encoding: 'utf8',
  }).trim();
}

const TOKEN = getToken();

/** Läser bara. Returnerar {ok, status, body} — kastar aldrig på HTTP-fel, så
 *  anroparen kan skilja "fel" från "tomt". Det är hela poängen med F2. */
async function get(pathname) {
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.json() };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: String(error.message || error) };
  }
}

const num = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0;

async function mapLimited(items, limit, worker) {
  const out = [];
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, limit) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
      if ((i + 1) % 25 === 0) process.stderr.write(`  …${i + 1}/${items.length}\n`);
    }
  });
  await Promise.all(runners);
  return out;
}

async function hamtaAllaKunder() {
  const alla = [];
  let offset = 0;
  for (;;) {
    const r = await get(`/api/v1/cco/staff/customers-shell?limit=${PAGE}&offset=${offset}&phase=list`);
    if (!r.ok) throw new Error(`customers-shell ${r.status} vid offset ${offset}`);
    const block = r.body?.patients;
    const rows = block?.patients || [];
    alla.push(...rows);
    const total = Number(block?.total || 0);
    offset += rows.length;
    process.stderr.write(`  kundlista ${alla.length}/${total}\n`);
    if (!rows.length || alla.length >= total) return { rows: alla, total };
  }
}

(async () => {
  console.log('== Kunder-LTV: varifrån kan den komma? (read-only) ==');
  console.log(`BASE: ${BASE}`);
  console.log('');

  const { rows, total } = await hamtaAllaKunder();

  // ---- F3: Fortnox-täckning (mäts på listan, inga extra anrop) -----------
  const medFortnoxId = rows.filter((p) => String(p.fortnoxCustomerId || '').trim()).length;
  const medFortnoxFel = rows.filter((p) => String(p.fortnoxSyncError || '').trim()).length;
  const fortnoxStatus = await get('/api/v1/cco-fortnox/status');

  // ---- Listnivå: vad säger den om Pipedrive? ----------------------------
  const medPdLank = rows.filter((p) => p.pipedriveLinked).length;
  const medDealCount = rows.filter((p) => num(p.pipedriveDealCount) > 0);
  const dealCountSumma = rows.reduce((a, p) => a + num(p.pipedriveDealCount), 0);
  // Aggregatet som saknas i getTenantStats. Räknas här ur HELA listan — inga
  // detaljanrop, ingen sampling, alltså inget stickprov att missförstå.
  const medLtv = rows.filter((p) => num(p.lifetimeValue) > 0);
  const medLtvPaListan = medLtv.length;
  const totalRevenueFacit = rows.reduce((a, p) => a + num(p.lifetimeValue), 0);
  const snittHelaRegistret = total ? Math.round(totalRevenueFacit / total) : 0;
  const snittBaraMedVunnet = medLtvPaListan
    ? Math.round(totalRevenueFacit / medLtvPaListan)
    : 0;

  // ---- F1 + F2: detaljsvaren ------------------------------------------
  const urval = medDealCount.slice(0, Math.max(0, SAMPLE));
  console.log(`Hämtar detaljer för ${urval.length} av ${medDealCount.length} kunder med affärer…`);

  const statusar = Object.create(null);
  const faser = Object.create(null);
  let httpFel = 0;
  let dealsIDetalj = 0;
  let affarerMedWonAt = 0;
  let affarerVunnetStatus = 0;
  let sumVunnet = 0;
  let sumPipen = 0;
  let kunderMedVunnet = 0;
  const avvikelser = [];

  await mapLimited(urval, CONCURRENCY, async (p) => {
    const r = await get(`/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(p.patientId)}`);
    if (!r.ok) {
      httpFel += 1;
      avvikelser.push({ patientId: p.patientId, listDealCount: num(p.pipedriveDealCount), fel: r.status });
      return;
    }
    const deals = r.body?.patient?.pipedrive?.deals || [];
    dealsIDetalj += deals.length;
    if (deals.length !== num(p.pipedriveDealCount)) {
      avvikelser.push({
        patientId: p.patientId,
        listDealCount: num(p.pipedriveDealCount),
        detaljDeals: deals.length,
      });
    }
    let vunnetKund = 0;
    for (const d of deals) {
      const st = String(d.status || '(tom)');
      statusar[st] = (statusar[st] || 0) + 1;
      const fas = String(d.stage || '(tom)');
      faser[fas] = (faser[fas] || 0) + 1;
      const harWonAt = Boolean(String(d.wonAt || '').trim());
      const vunnenStatus = /vunn|won/i.test(st);
      if (harWonAt) affarerMedWonAt += 1;
      if (vunnenStatus) affarerVunnetStatus += 1;
      if (harWonAt || vunnenStatus) vunnetKund += num(d.value);
      else sumPipen += num(d.value);
    }
    if (vunnetKund > 0) {
      kunderMedVunnet += 1;
      sumVunnet += vunnetKund;
    }
  });

  const sorterad = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

  const rapport = {
    bas: BASE,
    kordAt: new Date().toISOString(),
    tackning: {
      kunderIRegistret: total,
      kunderLasta: rows.length,
      kunderMedPipedriveLank: medPdLank,
      kunderMedDealCountOver0: medDealCount.length,
      dealCountSummaEnligtListan: dealCountSumma,
      detaljerHamtade: urval.length,
      andelAvKunderMedAffarer: medDealCount.length
        ? `${Math.round((100 * urval.length) / medDealCount.length)}%`
        : '—',
    },
    F1_status: {
      affarerILasta: dealsIDetalj,
      statusfordelning: sorterad(statusar),
      fasfordelning: sorterad(faser).slice(0, 12),
      affarerMedVunnenStatus: affarerVunnetStatus,
      affarerMedWonAt: affarerMedWonAt,
      slutsats:
        affarerVunnetStatus + affarerMedWonAt === 0
          ? 'INGEN vunnen affär i urvalet — vunnet-detekteringen är oprövad mot verklig data'
          : 'Vunna affärer förekommer — Pipedrive kan bära LTV',
    },
    F2_avvikelse: {
      httpFelSeparatRaknade: httpFel,
      kunderMedAvvikandeAntal: avvikelser.filter((a) => a.fel === undefined).length,
      exempel: avvikelser.slice(0, 10),
      slutsats:
        httpFel > 0
          ? `${httpFel} detaljanrop misslyckades — de får INTE tolkas som noll affärer`
          : avvikelser.length
            ? 'dealCount och deals-arrayen är inte samma sak — reds ut innan siffran används'
            : 'dealCount matchar deals-arrayen i hela urvalet',
    },
    F3_fortnox: {
      kunderMedFortnoxId: medFortnoxId,
      kunderMedSynkfel: medFortnoxFel,
      statusEndpoint: fortnoxStatus.ok ? 'svarar' : `fel ${fortnoxStatus.status}`,
      intaktPerKundEndpoint:
        'FINNS INTE — endast /connect, /status, /sync-patient. Fakturerad intäkt per kund skulle behöva byggas.',
    },
    // Det här är svaret på varför Snitt LTV visar "—": talen FINNS, de
    // aggregeras bara aldrig. Räknat ur hela listan, inte ur ett urval.
    F4_aggregatet_som_saknas: {
      kunderMedVunnetVarde: medLtvPaListan,
      totalRevenue: totalRevenueFacit,
      snittLtvHelaRegistret: snittHelaRegistret,
      snittLtvBaraKunderMedVunnet: snittBaraMedVunnet,
      slutsats:
        totalRevenueFacit > 0
          ? `getTenantStats saknar totalRevenue. Summan finns: ${totalRevenueFacit.toLocaleString('sv-SE')} kr över ${medLtvPaListan} kunder.`
          : 'Ingen vunnen intäkt i registret — aggregatet skulle bli 0.',
    },
    belopp: {
      summaVunnetIUrvalet: sumVunnet,
      summaIPipenIUrvalet: sumPipen,
      kunderMedVunnetVardeIUrvalet: kunderMedVunnet,
    },
  };

  console.log('');
  console.log(JSON.stringify(rapport, null, 2));

  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify(rapport, null, 2));
    console.log(`\nSkrev ${JSON_OUT}`);
  }

  console.log('');
  console.log('— Slutsatser —');
  console.log(`F1  ${rapport.F1_status.slutsats}`);
  console.log(`F2  ${rapport.F2_avvikelse.slutsats}`);
  console.log(
    `F3  ${medFortnoxId} av ${total} kunder har Fortnox-id; intäkt per kund saknar endpoint.`
  );
  console.log(`F4  ${rapport.F4_aggregatet_som_saknas.slutsats}`);
  console.log(
    `    Snitt LTV skulle bli ${snittHelaRegistret.toLocaleString('sv-SE')} kr mot hela registret, ` +
      `${snittBaraMedVunnet.toLocaleString('sv-SE')} kr mot bara kunder med vunnet.`
  );
})().catch((error) => {
  console.error('AVBRUTET:', error.message || error);
  process.exit(1);
});
