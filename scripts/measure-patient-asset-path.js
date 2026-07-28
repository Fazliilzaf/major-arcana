#!/usr/bin/env node
'use strict';

/**
 * ORD-85 steg 1b — var ligger tiden i asset-vägen?
 *
 * Steg 1 falsifierade ordernas rotorsak: loadKunderBookingIndex kostar 30–62 ms
 * per patient, inte sekunder. Nästa kandidat är listAssetsForPatient, som
 * anropas TRE gånger per kundkort (ccoPatientMaster.js:1055, 1097, 1404).
 *
 * Tre kostnader mäts SEPARAT, annars får man ett tal och tre förklaringar:
 *
 *   A  Första laddningen av state.items — 22 000 poster läses och parsas.
 *      Kandidat till engångskostnaden 8,46 s → 1,34 s.
 *   B  Svepet — Object.values + filter + objektkopiering.
 *      Förväntat 1–2 ms. Blir det så är det uteslutet.
 *   C  Revisionsskrivningen — logAudit → auditLog.append → fs.appendFileSync,
 *      alltså SYNKRON disk, en gång per anrop.
 *
 * C mäts två gånger: mot lokal SSD, och med konstlad latens. Renders disk är
 * nätverksmonterad och beter sig inte som min — en appendFileSync som tar 0,2 ms
 * här kan ta storleksordningar mer där, och det är hela frågan.
 *
 * Kör lokalt. Prod har tagits ner en gång ikväll; reproduktion tillför inget.
 *
 *   node --expose-gc scripts/measure-patient-asset-path.js
 *   node --expose-gc scripts/measure-patient-asset-path.js --assets 22283
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const N_ASSETS = Number(arg('--assets', '22283'));   // prod-skala enligt ORD-43
const N_CALLS = Number(arg('--calls', '3'));          // tre anrop per kundkort
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord85b-'));
const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
const ms = (t0) => Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;

function bygg() {
  const items = {};
  for (let i = 0; i < N_ASSETS; i += 1) {
    const id = `asset-${i}`;
    items[id] = {
      id,
      patientId: `patient-${i % 3500}`,   // ~3 500 patienter, som Pipedrive-kopplingen
      encounterId: i % 4 === 0 ? `enc-${i}` : null,
      category: ['before', 'after', 'journal', 'document'][i % 4],
      status: i % 5 === 0 ? 'pending' : 'approved',
      sourceSystem: ['drive', 'pipedrive', 'cliento'][i % 3],
      isPatientVisible: i % 2 === 0,
      fileName: `bild-${i}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1_200_000 + i,
      capturedAt: '2026-03-14T10:00:00Z',
      storageKey: `s3://bucket/patient/${i % 3500}/${id}.jpg`,
      checksum: 'sha256-' + 'a'.repeat(48),
    };
  }
  const p = path.join(dir, 'patient-assets.json');
  fs.writeFileSync(p, JSON.stringify({ items }));
  return p;
}

(async () => {
  console.log('== ORD-85 steg 1b: var ligger tiden i asset-vägen? ==');
  console.log(`syntetisk skala: ${N_ASSETS} assets, ${N_CALLS} anrop per kundkort`);
  console.log(`node ${process.version}\n`);

  const filePath = bygg();
  console.log(`  filstorlek: ${mb(fs.statSync(filePath).size)} MB\n`);

  const { createCcoPatientAssetStore } = require(
    path.join(__dirname, '..', 'src', 'ops', 'ccoPatientAssetStore.js')
  );
  const { createCcoAuditLog } = require(
    path.join(__dirname, '..', 'src', 'security', 'ccoAuditLog.js')
  );

  // Längsta sammanhängande synkrona block. En health-check kan inte besvaras
  // under ett sådant — det är skillnaden mot OOM.
  let sista = Date.now(); let block = 0;
  const tick = setInterval(() => { const n = Date.now(); block = Math.max(block, n - sista - 10); sista = n; }, 10);
  tick.unref?.();

  // ---- A: första laddningen ------------------------------------------
  if (global.gc) global.gc();
  const heapFore = process.memoryUsage().heapUsed;
  block = 0; sista = Date.now();
  let t = process.hrtime.bigint();
  const utanAudit = await createCcoPatientAssetStore({ filePath, auditLog: null });
  const laddMs = ms(t);
  const laddBlock = block;
  const heapEfter = process.memoryUsage().heapUsed;
  console.log(`A  första laddningen        ${String(laddMs).padStart(9)} ms   heap +${mb(heapEfter - heapFore)} MB   synkblock ${laddBlock} ms`);

  // ---- B: svepet, utan revisionslogg ----------------------------------
  const svep = [];
  for (let i = 0; i < N_CALLS; i += 1) {
    block = 0; sista = Date.now();
    t = process.hrtime.bigint();
    const r = utanAudit.listAssetsForPatient('patient-7', {}, { actor: { role: 'system' } });
    svep.push({ ms: ms(t), n: r.length, block });
  }
  console.log(`B  svep utan revisionslogg   ${svep.map((s) => String(s.ms).padStart(6) + ' ms').join(' ')}   (${svep[0].n} träffar)`);

  // ---- C: samma svep MED revisionslogg (synkron appendFileSync) --------
  const auditPath = path.join(dir, 'audit.jsonl');
  const auditLog = createCcoAuditLog ? createCcoAuditLog({ filePath: auditPath }) : null;
  if (!auditLog) { console.log('C  kunde inte skapa auditLog — hoppar'); }
  else {
    const medAudit = await createCcoPatientAssetStore({ filePath, auditLog });
    const medA = [];
    for (let i = 0; i < N_CALLS; i += 1) {
      block = 0; sista = Date.now();
      t = process.hrtime.bigint();
      medAudit.listAssetsForPatient('patient-7', {}, { actor: { role: 'system' } });
      medA.push({ ms: ms(t), block });
    }
    console.log(`C  svep MED revisionslogg    ${medA.map((s) => String(s.ms).padStart(6) + ' ms').join(' ')}   (fs.appendFileSync per anrop)`);
    const skillnad = medA.reduce((a, b) => a + b.ms, 0) - svep.reduce((a, b) => a + b.ms, 0);
    console.log(`   → revisionsskrivningen kostar ~${Math.round((skillnad / N_CALLS) * 100) / 100} ms per anrop på lokal SSD`);

    // ---- C2: samma sak med nätverksdisk-latens --------------------------
    // Render monterar disken över nätverk. Vi kan inte mäta den härifrån, men
    // vi kan visa hur känslig vägen är: skalar kostnaden linjärt med
    // skrivlatensen är tre anrop per kundkort en direkt multiplikator.
    const origAppend = fs.appendFileSync;
    for (const latensMs of [1, 5, 20]) {
      fs.appendFileSync = function (...a) {
        const slut = Date.now() + latensMs;
        while (Date.now() < slut) { /* simulerad skrivlatens */ }
        return origAppend.apply(fs, a);
      };
      t = process.hrtime.bigint();
      for (let i = 0; i < N_CALLS; i += 1) {
        medAudit.listAssetsForPatient('patient-7', {}, { actor: { role: 'system' } });
      }
      console.log(`   vid ${String(latensMs).padStart(2)} ms skrivlatens: ${String(ms(t)).padStart(7)} ms för ${N_CALLS} anrop`);
    }
    fs.appendFileSync = origAppend;
  }

  clearInterval(tick);
  console.log('');
  console.log('— Slutsats —');
  const svepSnitt = svep.reduce((a, b) => a + b.ms, 0) / svep.length;
  console.log(`  A  laddning:      ${laddMs} ms   ${laddMs > 2000 ? '← förklarar engångskostnaden 8,46 → 1,34 s' : '← för litet för att förklara 8,46 s'}`);
  console.log(`  B  svep:          ${Math.round(svepSnitt * 100) / 100} ms   ${svepSnitt > 100 ? '← betydande' : '← utesluten, som väntat'}`);
  console.log(`  C  revisionslogg: se ovan — skalar med diskens skrivlatens, 3× per kundkort`);

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => {
  console.error('AVBRUTET:', e.message || e);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
