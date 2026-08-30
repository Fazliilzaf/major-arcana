'use strict';

/**
 * cfoReceiptAutoApprove — auto-godkännande av reparerade/importerade kvitton.
 *
 * Efter repair-from-mailbox?force=true (eller framtida auto-flöden) ligger
 * kvittot i needs_review med rätt fil men utan auto-validering. Denna modul:
 *
 *   1. Hämtar kvittots PDF ur secure storage.
 *   2. Parsar texten (pdf-parse) och kräver: leverantörstoken + rätt period
 *      (månad/datum i text eller filnamn).
 *   3. Vid träff: status → exported, länkad expense → categorized.
 *   4. Vid miss: ligger kvar i needs_review (säkert default).
 *
 * Belopp krävs INTE — utländska leverantörer (Anthropic, Figma, Cursor m.fl.)
 * fakturerar i USD/EUR så SEK-beloppet på kortdragningen finns aldrig i
 * fakturan. Samma princip som månadsavier: rätt leverantör + rätt period
 * räcker. Beloppsträff loggas som bonus-confidence.
 *
 * Delas av scheduler-jobbet cfo_receipt_auto_approve och routen
 * POST /api/v1/cco-cf/receipts/auto-approve.
 */

const pdfParse = require('pdf-parse');

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
  'pipedrive',
  'canva',
  'zoom',
  'render',
  'vercel',
  'elevenlabs',
  'dyson',
  'bolt',
  'uber',
  'ryanair',
  'airbnb',
  'whoop',
  'stripe',
  'meta',
  'apple',
];

function normText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
}

function amountInText(text, amountSek) {
  if (!Number.isFinite(amountSek)) return false;
  const target = Math.round(amountSek * 100);
  const re = /(\d[\d\s\u00a0.,]*\d)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/[\s\u00a0]/g, '');
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
  const ym = String(isoDate || '').slice(0, 7);
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
  const day = String(Number(String(isoDate).slice(8, 10)));
  if (text.includes(abbrEn[idx]) && text.includes(y) && new RegExp(`\\b0?${day}\\b`).test(text))
    return true;
  const compact = `${y}${mo}`;
  return fileName.includes(compact) || fileName.includes(ym) || fileName.includes(`${y}_${mo}`);
}

function vendorInText(text) {
  return VENDOR_TOKENS.some((t) => text.includes(t));
}

async function validateReceiptPdf({ receipt, secureStorage }) {
  if (!receipt?.storageKey || !secureStorage) return { pass: false, reason: 'saknar storageKey' };
  let buffer = null;
  try {
    const obj = await secureStorage.getObject(receipt.storageKey);
    buffer = obj?.buffer || obj;
  } catch (err) {
    return { pass: false, reason: `kunde inte läsa PDF: ${err?.message || err}` };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { pass: false, reason: 'tom PDF-buffer' };
  }
  let text = '';
  try {
    const parsed = await pdfParse(buffer);
    text = normText(parsed.text || '');
  } catch (err) {
    return { pass: false, reason: `pdf-parse misslyckades: ${err?.message || err}` };
  }
  const checks = {
    vendor: vendorInText(text),
    amount: amountInText(text, Number(receipt.amountSek)),
    month: monthInText(text, receipt.date, normText(receipt.originalFileName || '')),
  };
  return {
    pass: checks.vendor && checks.month,
    checks,
    reason: checks.vendor && checks.month ? null : 'leverantör eller period saknas i PDF:en',
  };
}

/**
 * autoApproveRepairedReceipts — kör validering + godkännande för alla
 * needs_review-kvitton med reparationshistorik.
 *
 * Returnerar { scanned, approved, kept, failed, details }.
 */
async function autoApproveRepairedReceipts({
  receiptStore,
  expenseStore,
  secureStorage,
  actor = { userId: 'system', role: 'system' },
  dryRun = true,
  limit = 50,
} = {}) {
  if (!receiptStore || !secureStorage) {
    return { ok: false, error: 'receiptStore och secureStorage krävs' };
  }
  const receipts = receiptStore.listReceipts({ limit: 10000 });
  const expenses =
    expenseStore && typeof expenseStore.listExpenses === 'function'
      ? expenseStore.listExpenses({ limit: 10000 })
      : [];
  const expenseByReceiptId = new Map();
  for (const e of expenses) {
    if (e.receiptId) expenseByReceiptId.set(e.receiptId, e);
  }

  const candidates = receipts
    .filter((r) => {
      if (r.status !== 'needs_review') return false;
      const hist = JSON.stringify(r.history || []);
      return hist.includes('repair-from-mailbox') || hist.includes('repair-from-vendors');
    })
    .slice(0, limit);

  const report = {
    ok: true,
    dryRun,
    scanned: candidates.length,
    approved: 0,
    kept: 0,
    failed: 0,
    details: [],
  };
  for (const r of candidates) {
    const label = `${r.id} ${r.supplier || ''} ${r.amountSek} ${r.date}`;
    try {
      const v = await validateReceiptPdf({ receipt: r, secureStorage });
      if (!v.pass) {
        report.kept += 1;
        report.details.push({ id: r.id, result: 'kept', reason: v.reason, checks: v.checks });
        continue;
      }
      if (dryRun) {
        report.details.push({ id: r.id, result: 'would_approve', checks: v.checks });
        continue;
      }
      await receiptStore.transitionStatus({
        id: r.id,
        newStatus: 'exported',
        reason: '[AUTO-APPROVE] underlag validerat: leverantör+period stämmer',
        actor,
      });
      const expense = expenseByReceiptId.get(r.id);
      if (expense && expense.status === 'needs_review' && expenseStore) {
        await expenseStore.transitionStatus({
          id: expense.id,
          newStatus: 'categorized',
          reason: '[AUTO-APPROVE] kvittots underlag validerat',
          actor,
        });
      }
      report.approved += 1;
      report.details.push({ id: r.id, result: 'approved', label, checks: v.checks });
    } catch (err) {
      report.failed += 1;
      report.details.push({ id: r.id, result: 'failed', error: err?.message || String(err) });
    }
  }
  return report;
}

module.exports = {
  autoApproveRepairedReceipts,
  validateReceiptPdf,
};
