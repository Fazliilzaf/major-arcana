#!/usr/bin/env node
'use strict';

/**
 * importUnderlagDrop — drop-import för manuellt hämtade månadsdokument.
 *
 * Flöde:
 *   1. Du laddar ner månadsdokument från leverantörsportaler (Google Ads-avier,
 *      Anthropic-fakturor, Meta, Bolt-utdrag m.fl.) och döper dem enligt
 *      KONVENTIONEN nedan, i mappen DROP_DIR (default ~/Downloads/underlag).
 *   2. Skriptet hittar alla CFO-kvitton som (a) fortfarande delar storageKey
 *      (fel underlag), (b) matchar filens leverantör och (c) ligger i filens
 *      månad — och laddar upp filen som nytt underlag via repair-storage-key.
 *   3. Samma PDF kan täcka många kvitton (månadsavi = aggregerat underlag).
 *
 * FILNAMNSKONVENTION:  <leverantör>_<YYYY-MM>.pdf   (valfri suffix efter månad ok)
 *   google-ads-hairtp_2026-01.pdf     (konto 6707274243)
 *   google-ads-curatiio_2026-01.pdf   (konto 6236814797)
 *   meta_2026-03.pdf · anthropic_2026-04.pdf · bolt_2026-05.pdf · apple_2026-02.pdf …
 *
 * Användning:
 *   CFO_AUTH_TOKEN=<token> node scripts/cfo/importUnderlagDrop.js            # torrkörning
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/importUnderlagDrop.js
 *   DROP_DIR=/path/till/mapp CFO_AUTH_TOKEN=<token> node scripts/cfo/importUnderlagDrop.js
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());
const dropDir = process.env.DROP_DIR || path.join(os.homedir(), 'Downloads', 'underlag');

if (!token) {
  console.error('[drop] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

// Leverantörsnyckel → tokens som ska synas i kvittots notes/beskrivning
// (normaliserat: lowercase, utan mellanslag/specialtecken).
const VENDOR_ALIASES = {
  'google-ads-hairtp': ['googleads6707274243', 'ads6707274243'],
  'google-ads-curatiio': ['googleads6236814797', 'ads6236814797'],
  'google-ads': ['googleads'],
  meta: ['facebk', 'facebook', 'metaplatforms'],
  anthropic: ['anthropic', 'claude'],
  apple: ['applecom'],
  microsoft: ['microsoft', 'msbill'],
  adobe: ['adobe'],
  figma: ['figma'],
  cursor: ['cursor'],
  openai: ['openai'],
  zapier: ['zapier'],
  zoom: ['zoomcom'],
  canva: ['canva'],
  pipedrive: ['pipedrive'],
  stripe: ['meridiqstripe', 'stripe'],
  loopia: ['loopia'],
  bolt: ['boltoperations'],
  uber: ['uber'],
  sj: ['sjinternet', 'sjsale'],
  lufthansa: ['lufthansa'],
  'british-airways': ['britishairways', 'bahigh'],
  ryanair: ['ryanair'],
  booking: ['bookingcom', 'hotelonbooking'],
  airbnb: ['airbnb'],
  nk: ['nkbeauty', 'nkkids', 'nkdetails'],
  faire: ['faire'],
  etsy: ['etsy'],
  amazon: ['amazon'],
  render: ['rendercom'],
  vercel: ['vercel'],
  whoop: ['whoop'],
  elevenlabs: ['elevenlabs'],
  dyson: ['dyson'],
};

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseFileName(name) {
  const m = String(name).match(/^([a-z0-9-]+)_(\d{4})-(\d{2})/i);
  if (!m) return null;
  const vendor = m[1].toLowerCase();
  if (!VENDOR_ALIASES[vendor]) return null;
  return { vendor, month: `${m[2]}-${m[3]}` };
}

function receiptMatches(receipt, { vendor, month }) {
  const haystack = normalizeKey(`${receipt.notes || ''} ${receipt.supplier || ''}`);
  const aliases = VENDOR_ALIASES[vendor] || [];
  if (!aliases.some((a) => haystack.includes(a))) return false;
  const rMonth = String(receipt.date || '').slice(0, 7);
  return rMonth === month;
}

async function apiJson(apiPath) {
  const res = await fetch(new URL(apiPath, baseUrl), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.error || res.statusText}`);
  return body;
}

async function uploadRepair(receiptId, filePath, vendor, month) {
  const fileBuffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), path.basename(filePath));
  form.append(
    'reason',
    `repair-drop: ${vendor} månadsdokument ${month} (${path.basename(filePath)})`
  );
  const res = await fetch(
    new URL(`/api/v1/cco-cf/receipts/${encodeURIComponent(receiptId)}/repair-storage-key`, baseUrl),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function main() {
  if (!fs.existsSync(dropDir)) {
    console.error(`[drop] mappen finns inte: ${dropDir}`);
    console.error('[drop] skapa den och lägg PDF:er där enligt filnamnskonventionen i filhuvudet.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(dropDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => ({ file: f, parsed: parseFileName(f) }));

  const usable = files.filter((f) => f.parsed);
  const skipped = files.filter((f) => !f.parsed);
  if (skipped.length) {
    console.log('[drop] hoppar över (felaktigt namn eller okänd leverantör):');
    for (const f of skipped) console.log(`  - ${f.file}`);
  }
  if (!usable.length) {
    console.log('[drop] inga användbara PDF:er hittades i', dropDir);
    process.exit(0);
  }

  console.log(`[drop] dryRun=${dryRun}, mapp=${dropDir}, filer=${usable.length}`);

  // Hämta alla kvitton live och hitta de som fortfarande delar storageKey.
  const all = [];
  let offset = 0;
  for (;;) {
    const page = await apiJson(`/api/v1/cco-cf/receipts?limit=500&offset=${offset}`);
    const rows = page.receipts || page.items || [];
    all.push(...rows);
    if (rows.length < 500) break;
    offset += rows.length;
  }
  const keyCount = new Map();
  for (const r of all) {
    if (!r.storageKey) continue;
    keyCount.set(r.storageKey, (keyCount.get(r.storageKey) || 0) + 1);
  }
  const broken = all.filter(
    (r) =>
      r.storageKey &&
      keyCount.get(r.storageKey) > 1 &&
      !String(r.notes || '').includes('[REPAIR-DROP]')
  );
  console.log(`[drop] ${broken.length} kvitton delar fortfarande storageKey`);

  const summary = [];
  for (const { file, parsed } of usable) {
    const matches = broken.filter((r) => receiptMatches(r, parsed));
    const filePath = path.join(dropDir, file);
    console.log(`\n[drop] ${file} → ${matches.length} kvitton (${parsed.vendor} ${parsed.month})`);
    let repaired = 0;
    for (const r of matches) {
      if (dryRun) {
        console.log(`  - SKULLE reparera ${r.id} ${r.supplier || ''} ${r.amountSek} ${r.date}`);
        continue;
      }
      try {
        await uploadRepair(r.id, filePath, parsed.vendor, parsed.month);
        repaired += 1;
        console.log(`  - OK ${r.id} ${r.supplier || ''} ${r.amountSek} ${r.date}`);
      } catch (err) {
        console.log(`  - MISSLYCKADES ${r.id}: ${err.message}`);
      }
      await new Promise((s) => setTimeout(s, 400));
    }
    summary.push({ file, ...parsed, matched: matches.length, repaired: dryRun ? 0 : repaired });
  }

  console.log('\n[drop] sammanfattning:', JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[drop] fatal:', err);
  process.exit(1);
});
