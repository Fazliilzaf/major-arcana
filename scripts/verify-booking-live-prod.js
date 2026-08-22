#!/usr/bin/env node
/**
 * Verifierar bokningsvägen som FAKTISKT körs på hairtpclinic.com i dag:
 * Clientos widget, laddad i webbläsaren, med tider från Clientos eget API.
 *
 * Motsatsen till check-plan-a-booking-readiness-prod.js, som mäter den
 * oskeppade Arcana-ersättaren och failar med flit så länge Cliento sitter kvar.
 *
 * LÄSANDE. Skickar ingen bokning, skapar inget lead, rör ingen kalender.
 *
 * Bakgrund: en tidigare felsökning drog slutsatsen "sidan visar falska tider"
 * efter att ha frågat hairtpclinic.com/api/availability — en endpoint som hör
 * till Plan A-bryggan och svarar med mockdata, men som bokningssidan aldrig
 * anropar för att fylla kalendern. Det här skriptet finns för att den frågan
 * ska gå att besvara på det som körs, inte på det som råkar svara.
 *
 * Usage:
 *   npm run verify:booking-live-prod
 *   CLIENTO_SRV_IDS=<id[,id]> npm run verify:booking-live-prod   # även slot-kontroll
 */
require('dotenv').config({ quiet: true });

const WEB_BASE = (process.env.WEB_BASE || 'https://hairtpclinic.com').replace(/\/+$/, '');
const CBK_ID = process.env.CLIENTO_CBK_ID || '4yPQXQy6WMgoZnCAOylVjx';
const CLIENTO_BASE = 'https://cliento.com';
const SRV_IDS = process.env.CLIENTO_SRV_IDS || '';
const FROM = process.env.FROM || new Date().toISOString().slice(0, 10);
const TO = process.env.TO || new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);

let hardFail = false;

function record(name, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) hardFail = true;
  return pass;
}

function skip(name, detail = '') {
  console.log(`SKIP: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getText(url) {
  const res = await fetch(url, { headers: { Accept: 'text/html,application/javascript' } });
  return { status: res.status, text: await res.text() };
}

/**
 * /boka är klientrenderad — widget-konfigurationen ligger i en Next.js-chunk,
 * inte i sidans HTML. Vi följer scripttaggarna och letar i dem.
 */
async function findWidgetConfig(html) {
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const candidates = srcs
    .map((src) =>
      src.startsWith('http') ? src : `${WEB_BASE}${src.startsWith('/') ? '' : '/'}${src}`
    )
    .filter((url) => /_next|chunk|boka/i.test(url));

  for (const url of candidates.slice(0, 40)) {
    const chunk = await getText(url).catch(() => null);
    if (!chunk || chunk.status !== 200) continue;
    if (chunk.text.includes(CBK_ID)) {
      return { url, text: chunk.text };
    }
  }
  return null;
}

async function main() {
  console.log(`Bokning LIVE @ ${WEB_BASE}`);
  console.log('Verifierar Cliento-vägen — den som patienten faktiskt använder.\n');

  const boka = await getText(`${WEB_BASE}/boka`);
  if (!record('LB-01 /boka svarar', boka.status === 200, `HTTP ${boka.status}`)) {
    console.log('\n❌ Bokningssidan svarar inte — allt annat är meningslöst.');
    process.exit(1);
  }

  const found = await findWidgetConfig(boka.text);
  record(
    'LB-02 Cliento-widget med rätt konto',
    Boolean(found),
    found
      ? `cbk-id ${CBK_ID} i ${found.url.replace(WEB_BASE, '')}`
      : `hittade inte cbk-id ${CBK_ID} i sidans chunkar`
  );

  if (found) {
    record(
      'LB-03 widget-skriptet laddas från cliento.com',
      found.text.includes('cliento.com'),
      'cliento.js refereras i chunken'
    );
  } else {
    skip('LB-03 widget-skriptet', 'ingen chunk att läsa');
  }

  // Levande tjänst svarar med sitt eget valideringsspråk på ofullständig fråga.
  // 404/5xx eller tystnad = något är fel hos Cliento eller med konto-id:t.
  const slotsUrl = `${CLIENTO_BASE}/api/v2/partner/cliento/${CBK_ID}/resources/slots`;
  const probe = await fetch(slotsUrl, { headers: { Accept: 'application/json' } })
    .then(async (r) => ({ status: r.status, body: await r.text() }))
    .catch((e) => ({ status: 0, body: String(e.message || e) }));

  const alive =
    probe.status > 0 && probe.status < 500 && /srvIds|required|parameter/i.test(probe.body);
  record(
    'LB-04 Clientos slots-endpoint lever',
    alive,
    `HTTP ${probe.status} — ${probe.body.slice(0, 120).replace(/\s+/g, ' ')}`
  );

  if (!SRV_IDS) {
    skip(
      'LB-05 riktiga tider i kalendern',
      'sätt CLIENTO_SRV_IDS för att kontrollera att tider finns och varierar mellan dagar'
    );
  } else {
    const url = `${slotsUrl}?srvIds=${encodeURIComponent(SRV_IDS)}&fromDate=${FROM}&toDate=${TO}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .catch((e) => ({ status: 0, body: { error: String(e.message || e) } }));

    const slots = Array.isArray(res.body?.slots) ? res.body.slots : [];
    record('LB-05 tider finns', slots.length > 0, `${slots.length} slots ${FROM}..${TO}`);

    // En riktig kalender har luckor: olika dagar bär olika många tider.
    // Identisk uppsättning varje dag är signaturen för ett statiskt svar.
    const perDay = new Map();
    for (const slot of slots) {
      const day = String(slot.start || slot.startsAt || '').slice(0, 10);
      if (day) perDay.set(day, (perDay.get(day) || 0) + 1);
    }
    const counts = [...perDay.values()];
    const varierar = counts.length > 1 && new Set(counts).size > 1;
    record(
      'LB-06 tiderna varierar mellan dagar',
      varierar,
      counts.length
        ? `${perDay.size} dagar, antal per dag: ${counts.join(', ')}`
        : 'inga dagar att jämföra'
    );
  }

  console.log(
    '\nOBS: bokningarna landar i Cliento, inte i CCO. Det är väntat i dag' +
      ' — det är precis det Plan A ska ändra.'
  );

  if (hardFail) {
    console.log('\n❌ Bokningsvägen ser INTE frisk ut — kontrollera Cliento-kontot och /boka.');
    process.exit(1);
  }
  console.log('\n✅ Bokningsvägen frisk: /boka bär Cliento-widgeten och Clientos API svarar.');
}

main().catch((err) => {
  console.error('❌ Bokning LIVE:', err.message || err);
  process.exit(1);
});
