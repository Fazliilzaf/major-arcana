#!/usr/bin/env node
'use strict';

/**
 * Pris-grinden (ORD-134 · punkt 3).
 *
 * Jämför tre priskällor och LARMAR vid divergens — den skriver aldrig.
 *
 *   - hemsidan (sanningskällan)        → migration/website-price-snapshot.json
 *   - CCO:s tjänstekatalog (kanonisk)  → src/ops/cco-service-catalog.json
 *                                        (seedad ur Meridiq — engångsfrö)
 *   - Cliento (avvecklingsmätare)      → migration/cliento-service-catalog.json
 *
 * Riktningen är enkelriktad och slutar i CCO. Meridiq och Cliento följer med
 * som avvecklingsmätare tills de är tomma. En prislista är ett affärsbeslut:
 * kod upptäcker att källorna glidit isär, men avgör aldrig vilken som har rätt.
 * Vid avvikelse: exit 1 + utförlig rapport. Vid noll avvikelse: exit 0.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CCO_SERVICE_CATALOG_PATH = path.join(ROOT, 'src/ops/cco-service-catalog.json');
const CLIENTO_PATH = path.join(ROOT, 'migration/cliento-service-catalog.json');
const WEBSITE_PATH = path.join(ROOT, 'migration/website-price-snapshot.json');

/**
 * Explicita Cliento srvId → Meridiq apiId-mappningar. Namnlikhet gissas aldrig
 * (katalogen säger "Botox: 1 område", hemsidan "Rynkbehandling BTX, 1 område",
 * Cliento "Ögonlocksplastik · Total"). Mappningen underhålls här uttryckligen.
 */
const CLIENTO_API_MAP = Object.freeze({
  '58000': '7105', // Cliento "Ögonlocksplastik · Total" → Meridiq "Övre och nedre"
  '50559': '7116', // Cliento "PRP · Skägg" → CCO:s serviceId "PRP: Skägg"
});

function parsePriceKr(price) {
  if (typeof price === 'number') return price;
  const digits = String(price || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function asServices(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.services)) return raw.services;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function loadCcoCatalog() {
  const raw = JSON.parse(fs.readFileSync(CCO_SERVICE_CATALOG_PATH, 'utf8'));
  const byApiId = new Map();
  for (const s of asServices(raw)) {
    if (s.apiId == null) continue;
    byApiId.set(String(s.apiId), { apiId: String(s.apiId), name: s.name, priceKr: parsePriceKr(s.price) });
  }
  return { exportedAt: raw.exportedAt || null, byApiId };
}

function loadCliento() {
  const raw = JSON.parse(fs.readFileSync(CLIENTO_PATH, 'utf8'));
  const bySrvId = new Map();
  for (const s of asServices(raw)) {
    if (s.srvId == null) continue;
    bySrvId.set(String(s.srvId), { srvId: String(s.srvId), name: s.name, priceKr: parsePriceKr(s.price) });
  }
  return { exportedAt: raw.exportedAt || null, bySrvId };
}

function loadWebsite() {
  const raw = JSON.parse(fs.readFileSync(WEBSITE_PATH, 'utf8'));
  return {
    exportedAt: raw.exportedAt || null,
    services: asServices(raw).map((s) => ({
      apiId: s.apiId != null ? String(s.apiId) : null,
      name: s.name || '',
      priceKr: parsePriceKr(s.priceKr != null ? s.priceKr : s.price),
      missingInCco: s.missingInCco === true,
    })),
  };
}

/**
 * Jämför och returnerar en lista av divergenser (tom = allt stämmer).
 * Skriver ingenting.
 */
function comparePrices({ cco, cliento, website }) {
  const divergences = [];

  // 1 · CCO:s katalog vs hemsidan (via apiId)
  for (const w of website.services) {
    if (w.missingInCco) {
      divergences.push({
        source: 'hemsidan',
        name: w.name,
        website: w.priceKr,
        problem: 'publicerad på hemsidan men saknas i CCO:s tjänstekatalog',
      });
      continue;
    }
    const m = cco.byApiId.get(w.apiId);
    if (!m) {
      divergences.push({
        source: 'cco',
        apiId: w.apiId,
        name: w.name,
        problem: 'saknas i CCO:s tjänstekatalog',
      });
      continue;
    }
    if (m.priceKr !== w.priceKr) {
      divergences.push({
        source: 'cco',
        apiId: w.apiId,
        name: w.name,
        cco: m.priceKr,
        website: w.priceKr,
      });
    }
  }

  // 2 · Cliento vs hemsidan (via explicit mappning; 0 kr = avsiktligt, larma ej)
  for (const [srvId, apiId] of Object.entries(CLIENTO_API_MAP)) {
    const c = cliento.bySrvId.get(srvId);
    const w = website.services.find((s) => s.apiId === apiId);
    if (!c || !w) continue;
    if (c.priceKr === 0) continue; // transplantationer: pris sätts vid konsultation
    if (c.priceKr !== w.priceKr) {
      divergences.push({
        source: 'cliento',
        srvId,
        apiId,
        name: c.name,
        cliento: c.priceKr,
        website: w.priceKr,
      });
    }
  }

  return divergences;
}

function ageInDays(isoDate) {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.round(ms / 86400000);
}

function main() {
  const cco = loadCcoCatalog();
  const cliento = loadCliento();
  const website = loadWebsite();

  const divergences = comparePrices({ cco, cliento, website });

  const meridiqAge = ageInDays(cco.exportedAt);
  console.log(`CCO-tjänstekatalog exportedAt: ${cco.exportedAt || 'SAKNAS'} (${meridiqAge ?? '?'} dagar sedan)`);
  console.log(`Hemsida (snapshot) exportedAt: ${website.exportedAt || 'SAKNAS'}`);
  console.log(`Cliento exportedAt: ${cliento.exportedAt || 'SAKNAS'}`);
  console.log(`Jämförda tjänster (hemsidan): ${website.services.length}`);

  if (divergences.length === 0) {
    console.log('✅ Ingen divergens mellan källorna.');
    process.exit(0);
  }

  console.error(`\n❌ ${divergences.length} divergenser — LARM (ändrar ingenting):`);
  for (const d of divergences) {
    if (d.problem) {
      if (d.source === 'hemsidan') {
        console.error(`  - [hemsidan] ${d.name}: ${d.problem} (${d.website} kr)`);
      } else {
        console.error(`  - [${d.source}] ${d.name} (apiId ${d.apiId}): ${d.problem}`);
      }
    } else if (d.source === 'cliento') {
      console.error(`  - [cliento] ${d.name} (srvId ${d.srvId} → apiId ${d.apiId}): Cliento ${d.cliento} kr vs hemsidan ${d.website} kr`);
    } else {
      console.error(`  - [cco] ${d.name} (apiId ${d.apiId}): CCO ${d.cco} kr vs hemsidan ${d.website} kr`);
    }
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  CCO_SERVICE_CATALOG_PATH,
  CLIENTO_PATH,
  WEBSITE_PATH,
  CLIENTO_API_MAP,
  parsePriceKr,
  loadCcoCatalog,
  loadCliento,
  loadWebsite,
  comparePrices,
  ageInDays,
};
