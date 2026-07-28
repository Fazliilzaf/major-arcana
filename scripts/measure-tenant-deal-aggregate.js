#!/usr/bin/env node
'use strict';

/**
 * ORD-87 — vad kostar affärsaggregatet i getTenantStats?
 *
 * INVÄNDNINGEN (Codex, före merge av #1238): funktionen läser nu VARJE affär
 * hos VARJE kund och kör parseDealValue på var och en. Tre av fyra anropsvägar
 * är ocachade:
 *
 *   ccoPatientMaster.js:809   bakom readCache (60 s)   ✓
 *   ccoStaff.js:169           direkt
 *   ccoStaff.js:268           direkt
 *   ccoMigration.js:74        direkt
 *
 * Är det 5 ms är invändningen besvarad. Är det 300 ms ska summeringen cachas
 * eller flyttas — och då är #1238 inte merge-klar.
 *
 * Att mäta det här FÖRE merge är hela poängen: ORD-82/83/84/85 handlade alla om
 * arbete som lagts i en loop utan att någon mätt vad det kostade.
 *
 * Kör i BÅDA träden för före/efter:
 *   node scripts/measure-tenant-deal-aggregate.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createCcoPatientMasterStore } = require('../src/ops/ccoPatientMasterStore');

const TENANT = 'hair-tp-clinic';

// Prod-liknande fördelning, från audit-svepet 2026-07-28:
//   7 451 aktiva identiteter
//   3 413 med Pipedrive-koppling
//     726 med minst en VUNNEN affär, 41 489 801 kr totalt
const ANTAL_PATIENTER = 7451;
const ANTAL_PIPEDRIVE = 3413;
const ANTAL_MED_VUNNET = 726;

function slump(seed) {
  // Deterministisk, så före/efter mäter EXAKT samma data.
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function byggPatienter() {
  const rnd = slump(20260728);
  const patienter = [];
  for (let i = 0; i < ANTAL_PATIENTER; i += 1) {
    const p = {
      id: `p${i}`,
      tenantId: TENANT,
      displayName: `Patient ${i}`,
      personnummer: i % 3 === 0 ? `1980010${i % 10}-${String(1000 + (i % 9000))}` : '',
      matchStatus: i % 11 === 0 ? 'needs_review' : i % 7 === 0 ? 'drive_only' : 'matched',
    };
    if (i < ANTAL_PIPEDRIVE) {
      // ORD87_DEAL_FACTOR skalar affärsvolymen för att hitta takgränsen.
      // Prod-likt är 1 (1–4 affärer per kopplad kund, 8 595 totalt).
      const faktor = Math.max(1, Number(process.env.ORD87_DEAL_FACTOR) || 1);
      const antalAffärer = Math.round((1 + Math.floor(rnd() * 4)) * faktor);
      const deals = [];
      const harVunnet = i < ANTAL_MED_VUNNET;
      for (let d = 0; d < antalAffärer; d += 1) {
        const belopp = Math.floor(20000 + rnd() * 80000);
        // Värdena kommer som STRÄNGAR med mellanslag i Pipedrive-exporten —
        // det är just det parseDealValue måste städa, så mät inte med tal.
        const value = belopp.toLocaleString('sv-SE');
        const status =
          harVunnet && d === 0 ? 'won' : rnd() < 0.35 ? 'förlorad' : rnd() < 0.6 ? 'öppen' : '';
        deals.push({ value, status, productName: `Behandling ${d}` });
      }
      p.pipedrive = { deals };
    }
    patienter.push(p);
  }
  return patienter;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord87-mät-'));
  const filePath = path.join(dir, 'pm.json');
  const patienter = byggPatienter();
  fs.writeFileSync(filePath, JSON.stringify({ tenants: { [TENANT]: { patients: patienter } } }));

  const affärer = patienter.reduce(
    (n, p) => n + (p.pipedrive ? p.pipedrive.deals.length : 0),
    0
  );

  const store = await createCcoPatientMasterStore({ filePath });

  // Uppvärmning — vi mäter funktionen, inte JIT:en eller första filläsningen.
  for (let i = 0; i < 3; i += 1) await store.getTenantStats({ tenantId: TENANT });

  const VARV = 20;
  const tider = [];
  const heapFöre = process.memoryUsage().heapUsed;
  for (let i = 0; i < VARV; i += 1) {
    const t0 = process.hrtime.bigint();
    await store.getTenantStats({ tenantId: TENANT });
    tider.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const heapEfter = process.memoryUsage().heapUsed;
  tider.sort((a, b) => a - b);

  const stats = await store.getTenantStats({ tenantId: TENANT });

  console.log('=== ORD-87 — getTenantStats ===');
  console.log(`patienter:        ${ANTAL_PATIENTER}`);
  console.log(`pipedrive-kopplade: ${ANTAL_PIPEDRIVE}`);
  console.log(`affärer totalt:   ${affärer}`);
  console.log(`varv:             ${VARV}`);
  console.log('');
  console.log(`median:  ${tider[Math.floor(VARV / 2)].toFixed(3)} ms`);
  console.log(`p95:     ${tider[Math.floor(VARV * 0.95)].toFixed(3)} ms`);
  console.log(`min–max: ${tider[0].toFixed(3)} – ${tider[VARV - 1].toFixed(3)} ms`);
  console.log(`heap-delta över ${VARV} varv: ${((heapEfter - heapFöre) / 1048576).toFixed(2)} MB`);
  console.log('');
  console.log('utfall (bekräftar att arbetet faktiskt utfördes):');
  console.log(`  totalPatients      ${stats.totalPatients}`);
  console.log(`  pipedriveLinked    ${stats.pipedriveLinked}`);
  console.log(`  wonDealsTotal      ${stats.wonDealsTotal ?? '(fältet finns inte — FÖRE-läge)'}`);
  console.log(`  openDealsTotal     ${stats.openDealsTotal ?? '(fältet finns inte — FÖRE-läge)'}`);

  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error('❌ mätningen misslyckades');
  console.error(error);
  process.exit(1);
});
