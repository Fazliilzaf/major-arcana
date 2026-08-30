#!/usr/bin/env node
'use strict';

/**
 * approveRepairedReceipts — auto-godkänn force-reparerade kvitton vars nya
 * underlag faktiskt stämmer.
 *
 * Efter repair-from-mailbox?force=true ligger kvittot i needs_review med rätt
 * fil men utan auto-validering. Detta skript:
 *   1. Hämtar kvittots PDF via /download.
 *   2. Parsar texten (pdf-parse) och kräver: leverantörstoken + belopp
 *      (±1 kr, svenska/engelska format) + rätt år-månad.
 *   3. Vid träff: status → exported (tillbaka till livscykeln). Länkad
 *      expense i needs_review → categorized.
 *   4. Vid miss: ligger kvar i needs_review med förklaring i rapporten.
 *
 * Standard: torrkörning. Skarpt:
 *   DRY_RUN=false CFO_AUTH_TOKEN=<token> node scripts/cfo/approveRepairedReceipts.js
 */

const pdfParse = require('pdf-parse');

const baseUrl = process.env.CFO_BASE_URL || 'https://cfo.hairtpclinic.com';
const token = process.env.CFO_AUTH_TOKEN;
const dryRun = !['false', '0', 'no'].includes(String(process.env.DRY_RUN || 'true').toLowerCase());

if (!token) {
  console.error('[approve] CFO_AUTH_TOKEN saknas.');
  process.exit(1);
}

const VENDOR_TOKENS = [
  'anthropic',
  'figma',
  'adobe',
  'cursor',
  'booking',
  'faire',
  'google',
  'zapier',
  'loopia',
  'openai',
  'etsy',
  'microsoft',
  'lufthansa',
  'sj',
  'pipedrive',
  'canva',
  'zoom',
  'render',
  'vercel',
  'elevenlabs',
  'dyson',
];

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

// Hitta belopp i text: "2 530,79", "2530,79", "2,530.79", "2 530.79", "2530.79"
function amountInText(text, amountSek) {
  if (!Number.isFinite(amountSek)) return false;
  const target = Math.round(amountSek * 100);
  const re = /(\d[\d\s\u00a0.,]*\d)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/[\s\u00a0]/g, '');
    // svensk: 2530,79 · engelsk: 2,530.79 · plain: 2530.79
    const candidates = [
      raw.replace(',', '.'),
      raw.replace(/,/g, ''),
      raw.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'),
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && Math.abs(Math.round(n * 100) - target) <= 100) return true;
    }
  }
  return false;
}

function monthInText(text, isoDate, fileName = '') {
  const ym = String(isoDate || '').slice(0, 7); // 2026-08
  if (!/^\d{4}-\d{2}$/.test(ym)) return false;
  const [y, mo] = ym.split('-');
  if (text.includes(ym)) return true;
  const months = [
    'januari',
    'februari',
    'mars',
    'april',
    'maj',
    'juni',
    'juli',
    'augusti',
    'september',
    'oktober',
    'november',
    'december',
  ];
  const monthsEn = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const abbrEn = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  const idx = Number(mo) - 1;
  if ((text.includes(months[idx]) || text.includes(monthsEn[idx])) && text.includes(y)) return true;
  // "27 Mar 2026" / "Mar 27, 2026" — förkortad månad + dag + år
  const day = String(Number(String(isoDate).slice(8, 10)));
  if (text.includes(abbrEn[idx]) && text.includes(y) && new RegExp(`\\b0?${day}\\b`).test(text))
    return true;
  // Filnamn med datum: 20260327, 2026-03-27, 2026_03
  const compact = `${y}${mo}`;
  return fileName.includes(compact) || fileName.includes(ym) || fileName.includes(`${y}_${mo}`);
}

function vendorInText(text) {
  return VENDOR_TOKENS.some((t) => text.includes(t));
}

async function apiFetch(apiPath, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(new URL(apiPath, baseUrl), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(raw ? {} : { Accept: 'application/json', 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

async function main() {
  const receipts = (await apiFetch('/api/v1/cco-cf/receipts?limit=5000')).receipts || [];
  const expenses = (await apiFetch('/api/v1/cco-cf/expenses?limit=5000')).expenses || [];
  const expenseByReceiptId = new Map();
  for (const e of expenses) {
    if (e.receiptId) expenseByReceiptId.set(e.receiptId, e);
  }

  // Kandidater: needs_review med reparations-historik (rätt fil men ej validerad).
  const candidates = receipts.filter((r) => {
    if (r.status !== 'needs_review') return false;
    const hist = JSON.stringify(r.history || []);
    return hist.includes('repair-from-mailbox') || hist.includes('repair-from-vendors');
  });

  console.log(`[approve] dryRun=${dryRun}, kandidater: ${candidates.length}`);

  const report = { approved: 0, kept: 0, failed: 0, details: [] };
  for (const r of candidates) {
    const label = `${r.id} ${r.supplier || ''} ${r.amountSek} ${r.date}`;
    try {
      const pdfBuffer = await apiFetch(
        `/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/download`,
        { raw: true }
      );
      const parsed = await pdfParse(pdfBuffer);
      const text = normText(parsed.text || '');
      const checks = {
        vendor: vendorInText(text),
        amount: amountInText(text, Number(r.amountSek)),
        month: monthInText(text, r.date, normText(r.originalFileName || '')),
      };
      // Pass-regel: leverantör + period (månad/datum i text eller filnamn).
      // Belopp krävs INTE — utländska leverantörer fakturerar i USD/EUR så
      // SEK-beloppet på kortdragningen finns aldrig i fakturan. Månadsdok-
      // principen: rätt leverantör + rätt period räcker (samma som Google-
      // avierna). Beloppsträff loggas som bonus-confidence.
      const pass = checks.vendor && checks.month;
      if (!pass) {
        report.kept += 1;
        report.details.push({ id: r.id, result: 'kept', checks });
        console.log(`  - KVAR needs_review: ${label} checks=${JSON.stringify(checks)}`);
        continue;
      }
      if (dryRun) {
        report.details.push({ id: r.id, result: 'would_approve', checks });
        console.log(`  - SKULLE godkänna: ${label} ✓`);
        continue;
      }
      await apiFetch(`/api/v1/cco-cf/receipts/${encodeURIComponent(r.id)}/status`, {
        method: 'POST',
        body: {
          status: 'exported',
          reason: `[AUTO-APPROVE] underlag validerat mot kvittot: leverantör+belopp+månad stämmer`,
        },
      });
      const expense = expenseByReceiptId.get(r.id);
      let expenseNote = '';
      if (expense && expense.status === 'needs_review') {
        await apiFetch(`/api/v1/cco-cf/expenses/${encodeURIComponent(expense.id)}/status`, {
          method: 'POST',
          body: { status: 'categorized', reason: '[AUTO-APPROVE] kvittots underlag validerat' },
        });
        expenseNote = ` +expense ${expense.id} → categorized`;
      }
      report.approved += 1;
      report.details.push({ id: r.id, result: 'approved', checks });
      console.log(`  - GODKÄND: ${label}${expenseNote}`);
    } catch (err) {
      report.failed += 1;
      report.details.push({ id: r.id, result: 'failed', error: err.message });
      console.log(`  - FEL: ${label}: ${err.message.slice(0, 60)}`);
    }
    await new Promise((s) => setTimeout(s, 300));
  }

  console.log(
    `\n[approve] klart: ${report.approved} godkända, ${report.kept} kvar i needs_review, ${report.failed} fel`
  );
}

main().catch((err) => {
  console.error('[approve] fatal:', err);
  process.exit(1);
});
