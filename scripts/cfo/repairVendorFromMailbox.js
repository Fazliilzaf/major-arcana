#!/usr/bin/env node
'use strict';

/**
 * repairVendorFromMailbox — per-leverantör force-reparation.
 *
 * Många kvitton pekar på fel fil trots att rätt faktura/kvitto finns i
 * mailboxen (valideringen var för strikt, inte datan fel). Detta skript:
 *   1. Hittar kvitton för en leverantör vars fil INTE ser ut att tillhöra
 *      leverantören (fel filnamn).
 *   2. Kör repair-from-mailbox?force=true — bästa kandidat från rätt tråd
 *      även om belopps/datum-valideringen inte är exakt.
 *   3. Kvittot hamnar i needs_review med rätt fil — ett klick för godkännande.
 *
 * Användning:
 *   CFO_AUTH_TOKEN=<token> node scripts/cfo/repairVendorFromMailbox.js figma
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/repairVendorFromMailbox.js figma adobe cursor booking
 */

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const vendors = process.argv.slice(2);

if (!token) {
  console.error('[vendor-repair] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}
if (!vendors.length) {
  console.error('[vendor-repair] ange minst en leverantör, t.ex.: figma adobe cursor booking');
  process.exit(1);
}

// Tokens som ska synas i kvittots notes/supplier (normaliserat) för att räknas
// som leverantörens kvitton — och tokens som RÄKNAS som rätt fil.
const VENDOR_RULES = {
  figma: { match: ['figma'], fileOk: ['figma'] },
  adobe: { match: ['adobe'], fileOk: ['invoice'] },
  cursor: { match: ['cursor'], fileOk: ['invoice-5onndzca', 'cursor'] },
  booking: { match: ['booking', 'hotelonbooking'], fileOk: ['booking', 'confirmation', 'pin'] },
  zapier: { match: ['zapier'], fileOk: ['zapier', 'invoice'] },
  microsoft: { match: ['microsoft', 'msbill'], fileOk: ['g1', 'microsoft', 'invoice'] },
  loopia: { match: ['loopia'], fileOk: ['loopia', 'invoice'] },
  openai: { match: ['openai', 'chatgpt'], fileOk: ['invoice', 'receipt'] },
  faire: { match: ['faire'], fileOk: ['faire', 'invoice'] },
  etsy: { match: ['etsy'], fileOk: ['etsy'] },
  sj: { match: ['sjinternet', 'sjsale'], fileOk: ['sj', 'biljett', 'ticket'] },
  bolt: { match: ['boltoperations'], fileOk: ['bolt'] },
  uber: { match: ['ubertrip', 'uberone', 'uber'], fileOk: ['uber', 'trip'] },
  lufthansa: { match: ['lufthansa'], fileOk: ['lufthansa', 'etk', 'eticket'] },
  ryanair: { match: ['ryanair'], fileOk: ['ryanair'] },
  airbnb: { match: ['airbnb'], fileOk: ['airbnb'] },
  whoop: { match: ['whoop'], fileOk: ['whoop'] },
  elevenlabs: { match: ['elevenlabs'], fileOk: ['elevenlabs'] },
  pipedrive: { match: ['pipedrive'], fileOk: ['pipedrive', 'invoice'] },
  canva: { match: ['canva'], fileOk: ['canva'] },
  zoom: { match: ['zoomcom'], fileOk: ['zoom', 'invoice'] },
  render: { match: ['rendercom'], fileOk: ['render', 'invoice'] },
  vercel: { match: ['vercel'], fileOk: ['vercel', 'invoice'] },
  dyson: { match: ['dyson'], fileOk: ['dyson'] },
  nk: { match: ['nkbeauty', 'nkkids', 'nkdetails'], fileOk: ['nk'] },
  apple: { match: ['applecom'], fileOk: ['apple', 'receipt'] },
  meta: { match: ['facebk', 'facebook', 'metaplatforms'], fileOk: ['facebook', 'meta', 'invoice'] },
  stripe: { match: ['meridiqstripe'], fileOk: ['stripe', 'invoice'] },
};

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function apiFetch(apiPath, { method = 'GET', body } = {}) {
  const res = await fetch(new URL(apiPath, baseUrl), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, body: payload };
}

async function main() {
  const receipts = (await apiFetch('/api/v1/cco-cf/receipts?limit=5000')).body.receipts || [];
  const summary = [];

  for (const vendor of vendors) {
    const rule = VENDOR_RULES[vendor];
    if (!rule) {
      console.log(`[vendor-repair] okänd leverantör: ${vendor} — hoppar över`);
      continue;
    }
    const mine = receipts.filter((r) => {
      const hay = norm(`${r.notes || ''} ${r.supplier || ''}`);
      return rule.match.some((t) => hay.includes(t));
    });
    // Fel fil = filnamnet bär inte leverantörens egen markör.
    const wrong = mine.filter((r) => {
      if (r.status === 'rejected') return false; // redan säkra
      const f = norm(`${r.storageKey || ''} ${r.originalFileName || ''}`);
      return !rule.fileOk.some((t) => f.includes(t));
    });

    console.log(`\n[vendor-repair] ${vendor}: ${mine.length} kvitton, ${wrong.length} med fel fil`);
    let repaired = 0;
    let failed = 0;
    for (const r of wrong) {
      if (dryRun) {
        console.log(
          `  - SKULLE force-reparera ${r.id} ${r.amountSek} ${r.date} [${r.status}] ← ${(r.originalFileName || '').slice(0, 45)}`
        );
        continue;
      }
      const res = await apiFetch(
        `/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/repair-from-mailbox?force=true`,
        { method: 'POST', body: {} }
      );
      if (res.status === 200 && res.body.ok) {
        repaired += 1;
        console.log(
          `  - OK ${r.id} → ${(res.body.receipt?.originalFileName || '').slice(0, 45)} [${res.body.receipt?.status}]`
        );
      } else {
        failed += 1;
        console.log(
          `  - MISSLYCKADES ${r.id}: ${(res.body.error || `HTTP ${res.status}`).slice(0, 60)}`
        );
      }
      await new Promise((s) => setTimeout(s, 500));
    }
    summary.push({ vendor, total: mine.length, wrongFiles: wrong.length, repaired, failed });
  }

  console.log('\n[vendor-repair] sammanfattning:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[vendor-repair] fatal:', err);
  process.exit(1);
});
