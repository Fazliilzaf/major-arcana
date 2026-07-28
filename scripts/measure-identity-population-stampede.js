#!/usr/bin/env node
'use strict';

/**
 * ORD-85 steg 1c — hela patientregistret per kundkort, och vad som händer
 * när cachen missar samtidigt.
 *
 * Tre kandidater har redan falsifierats med mätning:
 *   loadKunderBookingIndex   30–62 ms
 *   asset-laddning           17 ms
 *   asset-svep + logAudit     3,5 ms
 *
 * Kvar står den enda som går ihop på storleksordning:
 *
 *   ccoPatientMaster.js:1084 — för EN patient
 *   patientMasterStore.listPatients({ tenantId, limit: 20000, offset: 0 })
 *
 * Bakom readCache.wrap med 300 000 ms TTL — exakt fem minuter. Det förklarar
 * kall 8,46 s → varm 1,34 s, och att den inte påverkas av includeJournal=0
 * eller includeDriveFiles=0 (den ligger inte bakom någon flagga).
 *
 * Men långsamt är inte samma sak som dödligt. wrap() saknar stampede-skydd:
 *
 *   const cached = await get(key);
 *   if (cached != null) return { value: cached, cacheHit: true };
 *   const value = await fn();      // ← ingen in-flight-dedupliering
 *   await set(key, value, ttlMs);
 *
 * Nyckeln är per TENANT, inte per patient. Missar cachen och första anropet
 * hinner inte fram till set(), ser varje följande anrop också en miss och
 * startar sin EGEN fulla registerladdning. Tre samtidiga materialiseringar av
 * 7 451 patienter är inte tre gånger tiden — det är tre gånger minnet samtidigt.
 *
 * A  Vad kostar EN listPatients({limit:20000})?
 * B  Vad händer med tre överlappande wrap-anrop på samma nyckel?
 *
 * Kör lokalt. Prod har tagits ner en gång ikväll.
 *
 *   node --expose-gc scripts/measure-identity-population-stampede.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const N_PATIENTS = Number(arg('--patients', '7451'));   // prod-skala
const N_PARALLEL = Number(arg('--parallel', '3'));       // tre kundkort i följd
const FYLLNAD = Number(arg('--bytes', '0'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ord85c-'));
const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;
const ms = (t0) => Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;

function byggRegister() {
  const patients = Array.from({ length: N_PATIENTS }, (_, i) => ({
    id: `p-${i}`,
    tenantId: 'hair-tp-clinic',
    displayName: `Kund Nummer ${i}`,
    primaryEmail: `kund${i}@exempel.se`,
    primaryPhone: `+46701234${String(i).padStart(3, '0')}`,
    personnummer: i % 3 === 0 ? `19800101-${String(1000 + (i % 9000))}` : '',
    matchStatus: ['matched', 'needs_review', 'cliento_only'][i % 3],
    pipedrive: i % 2 === 0 ? { personId: String(i), deals: [], files: [], emails: [], phones: [] } : null,
    flags: ['needs_review'],
    demographics: { addresses: { items: [{ line1: `Gata ${i}`, postalCode: '41100', city: 'Göteborg' }] } },
    updatedAt: '2026-07-01T00:00:00Z',
    // Prod returnerar ~76 kB per patient. Mina tidigare poster var ~400 byte —
    // 200x för små, vilket är varför varje syntetisk mätning landat för lågt.
    // --bytes styr realistisk poststorlek.
    _payload: FYLLNAD ? 'x'.repeat(FYLLNAD) : undefined,
  }));
  const p = path.join(dir, 'patient-master.json');
  fs.writeFileSync(p, JSON.stringify({ tenants: { 'hair-tp-clinic': { patients } } }));
  return p;
}

(async () => {
  console.log('== ORD-85 steg 1c: registerladdning + cache-stampede ==');
  console.log(`syntetisk skala: ${N_PATIENTS} patienter, ${N_PARALLEL} överlappande anrop`);
  console.log(`node ${process.version}\n`);

  const filePath = byggRegister();
  console.log(`  filstorlek: ${mb(fs.statSync(filePath).size)} MB\n`);

  const { createCcoPatientMasterStore } = require(
    path.join(__dirname, '..', 'src', 'ops', 'ccoPatientMasterStore.js')
  );
  const { createCcoReadCache } = require(path.join(__dirname, '..', 'src', 'infra', 'ccoReadCache.js'));

  let sista = Date.now(); let block = 0;
  const tick = setInterval(() => { const n = Date.now(); block = Math.max(block, n - sista - 10); sista = n; }, 10);
  tick.unref?.();

  const store = await createCcoPatientMasterStore({ filePath });

  // ---- A: ETT anrop -----------------------------------------------
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed;
  block = 0; sista = Date.now();
  let t = process.hrtime.bigint();
  const en = await store.listPatients({ tenantId: 'hair-tp-clinic', limit: 20000, offset: 0 });
  const enMs = ms(t);
  const h1 = process.memoryUsage().heapUsed;
  const antal = (en?.patients || en || []).length;
  console.log(`A  ETT listPatients({limit:20000})`);
  console.log(`     ${enMs} ms   heap +${mb(h1 - h0)} MB   synkblock ${block} ms   ${antal} patienter\n`);

  // ---- A2: ORD-85 steg 2 — projektionen -----------------------------
  if (typeof store.listPatientIdentities === 'function') {
    if (global.gc) global.gc();
    const p0 = process.memoryUsage().heapUsed;
    block = 0; sista = Date.now();
    t = process.hrtime.bigint();
    const proj = await store.listPatientIdentities({ tenantId: 'hair-tp-clinic', limit: 20000 });
    const projMs = ms(t);
    const p1 = process.memoryUsage().heapUsed;
    console.log(`A2 listPatientIdentities (projektion)`);
    console.log(`     ${projMs} ms   heap +${mb(p1 - p0)} MB   synkblock ${block} ms   ${proj.patients.length} identiteter`);
    console.log(`     vinst mot listPatients: ${Math.round((1 - (p1 - p0) / (h1 - h0)) * 1000) / 10}% mindre heap, ${Math.round((1 - projMs / enMs) * 1000) / 10}% snabbare\n`);
  } else {
    console.log('A2 listPatientIdentities saknas — projektionen inte byggd\n');
  }

  // ---- B: tre överlappande wrap-anrop på samma nyckel ---------------
  const cache = createCcoReadCache ? createCcoReadCache({}) : null;
  if (!cache?.wrap) { console.log('B  kunde inte skapa readCache — hoppar'); }
  else {
    const key = cache.buildKey('patient-asset-identity-population', 'hair-tp-clinic');
    let fnAnrop = 0;
    const loader = async () => {
      fnAnrop += 1;
      return store.listPatients({ tenantId: 'hair-tp-clinic', limit: 20000, offset: 0 });
    };

    if (global.gc) global.gc();
    const b0 = process.memoryUsage();
    block = 0; sista = Date.now();
    t = process.hrtime.bigint();
    // Överlappande, precis som tre kundkort när cachen just förfallit.
    await Promise.all(Array.from({ length: N_PARALLEL }, () => cache.wrap(key, 300_000, loader)));
    const parMs = ms(t);
    const b1 = process.memoryUsage();
    console.log(`B  ${N_PARALLEL} ÖVERLAPPANDE wrap() på samma nyckel`);
    console.log(`     ${parMs} ms   heap +${mb(b1.heapUsed - b0.heapUsed)} MB   rss +${mb(b1.rss - b0.rss)} MB   synkblock ${block} ms`);
    console.log(`     loader-anrop: ${fnAnrop} av ${N_PARALLEL}   ${fnAnrop > 1 ? '← STAMPEDE: varje miss laddar om hela registret' : '← deduplicerat'}\n`);

    // ---- C: samma sak MED stampede-skydd, som jämförelse -------------
    const inflight = new Map();
    let fn2 = 0;
    const loader2 = async () => { fn2 += 1; return store.listPatients({ tenantId: 'hair-tp-clinic', limit: 20000, offset: 0 }); };
    const wrapSkyddad = (k, fn) => {
      if (inflight.has(k)) return inflight.get(k);
      const p = (async () => { try { return await fn(); } finally { inflight.delete(k); } })();
      inflight.set(k, p);
      return p;
    };
    if (global.gc) global.gc();
    const c0 = process.memoryUsage();
    block = 0; sista = Date.now();
    t = process.hrtime.bigint();
    await Promise.all(Array.from({ length: N_PARALLEL }, () => wrapSkyddad('k', loader2)));
    console.log(`C  samma ${N_PARALLEL} anrop MED in-flight-dedupliering`);
    console.log(`     ${ms(t)} ms   heap +${mb(process.memoryUsage().heapUsed - c0.heapUsed)} MB   synkblock ${block} ms`);
    console.log(`     loader-anrop: ${fn2} av ${N_PARALLEL}\n`);
  }

  clearInterval(tick);
  console.log('— Slutsats —');
  console.log(`  Ett anrop laddar ${antal} patienter på ${enMs} ms.`);
  console.log('  Utan stampede-skydd multipliceras BÅDE tid och minne med antalet');
  console.log('  samtidiga missar. Nyckeln är per tenant, så alla operatörer delar den.');

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => {
  console.error('AVBRUTET:', e.message || e);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
