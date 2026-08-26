'use strict';

/**
 * cfoInvoiceValidator — vattentät validering av bilaga mot transaktion/record.
 *
 * ORD-117: innan ett CFO-kvitto skapas ur CM-dokument eller mailbox-bilaga
 * måste PDF-innehållet verifieras mot den korttransaktion det ska kopplas till.
 * Målet är att stoppa felaktiga underlag (t.ex. patientavtal, andra kvitton,
 * löneutbetalningar) från att hamna på fel transaktion.
 */

const {
  tokenSet,
  supplierHint,
  parseSwedishAmount,
  normalizeForTokens,
} = require('./cfoCardReconciliation');

const AMOUNT_TOLERANCE_SEK = 1.0;
const DATE_TOLERANCE_DAYS = 3;

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function foldSwedish(v) {
  return normalizeText(v).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o');
}

function parseDateFormats(raw) {
  const text = normalizeText(raw);
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const swe = text.match(/(\d{4})(\d{2})(\d{2})/);
  if (swe) return `${swe[1]}-${swe[2]}-${swe[3]}`;
  const euro = text.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (euro) return `${euro[3]}-${euro[2]}-${euro[1]}`;
  return null;
}

function extractAmountCandidates(text) {
  const out = new Set();
  // Hitta sekvenser som ser ut som belopp (med/utan tusentalsseparator och två decimaler).
  // parseSwedishAmount tolkar både "7 096,00", "7096,00", "1.234,56" och "1,234.56".
  for (const m of text.matchAll(/\d{1,3}(?:[\s.,]\d{2,3}){1,5}/g)) {
    const n = parseSwedishAmount(m[0]);
    if (n !== null && Number.isFinite(n) && n > 0) out.add(n);
  }
  return Array.from(out);
}

function extractDateCandidates(text) {
  const out = new Set();
  const t = normalizeText(text);
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    out.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  for (const m of t.matchAll(/(\d{2})[/.-](\d{2})[/.-](\d{4})/g)) {
    out.add(`${m[3]}-${m[2]}-${m[1]}`);
  }
  return Array.from(out);
}

function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(da - db) / 86400000;
}

function amountMatchesAny(candidates, target, tolerance = AMOUNT_TOLERANCE_SEK) {
  if (!Number.isFinite(target) || target <= 0) return false;
  return candidates.some((n) => Math.abs(n - target) <= tolerance);
}

function dateMatchesAny(candidates, target, tolerance = DATE_TOLERANCE_DAYS) {
  if (!target) return false;
  return candidates.some((d) => daysBetween(d, target) <= tolerance);
}

function supplierMatches(text, supplier) {
  if (!supplier) return { matches: false, reason: 'supplier_missing' };
  const haystack = foldSwedish(text);
  if (supplierHint(text, supplier)) {
    return { matches: true, reason: 'supplier_alias_match' };
  }
  const normalizedSupplier = normalizeForTokens(supplier);
  const words = normalizedSupplier.split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) {
    const tokens = tokenSet(supplier);
    for (const t of tokens) {
      if (new RegExp(`(?:^|[^a-z0-9åäö])${t}(?:[^a-z0-9åäö]|$)`, 'i').test(text)) {
        return { matches: true, reason: `supplier_token_match:${t}` };
      }
    }
    return { matches: false, reason: 'supplier_short_no_match' };
  }
  const matches = words.filter((w) => haystack.includes(w));
  if (matches.length >= Math.min(2, words.length)) {
    return { matches: true, reason: `supplier_word_matches:${matches.join(',')}` };
  }
  return { matches: false, reason: 'supplier_words_missing' };
}

async function validatePdfAttachment({ buffer, tx = null, record = null } = {}) {
  const reasons = [];
  const details = {};

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, score: 0, reasons: ['missing_buffer'], details: { size: buffer?.length } };
  }

  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch {
    return { ok: true, score: 0.3, reasons: ['pdf_parse_not_installed'], details: {} };
  }

  let text = '';
  try {
    const parsed = await pdfParse(buffer);
    text = normalizeText(parsed?.text || '');
  } catch (err) {
    return { ok: false, score: 0, reasons: ['pdf_parse_failed'], details: { error: err.message } };
  }

  if (!text || text.length < 20) {
    return {
      ok: false,
      score: 0,
      reasons: ['pdf_text_too_short'],
      details: { length: text?.length },
    };
  }

  details.pdfTextLength = text.length;

  const supplier = normalizeText(tx?.description || record?.supplierName || '');
  const amountSek = Number(tx?.amountSek ?? record?.amountIncVat ?? null);
  const date = normalizeText(tx?.date || record?.date || '');

  let score = 0;

  const supplierCheck = supplierMatches(text, supplier);
  details.supplierCheck = supplierCheck;
  if (supplierCheck.matches) {
    score += 0.4;
    reasons.push(`supplier_ok:${supplierCheck.reason}`);
  } else {
    reasons.push(`supplier_mismatch:${supplierCheck.reason}`);
  }

  const amountCandidates = extractAmountCandidates(text);
  details.amountCandidates = amountCandidates.slice(0, 20);
  if (Number.isFinite(amountSek) && amountSek > 0) {
    if (amountMatchesAny(amountCandidates, amountSek)) {
      score += 0.35;
      reasons.push('amount_ok');
    } else {
      reasons.push('amount_mismatch');
    }
  } else {
    reasons.push('amount_missing_target');
    score += 0.1;
  }

  const dateCandidates = extractDateCandidates(text);
  details.dateCandidates = dateCandidates.slice(0, 10);
  if (date) {
    if (dateMatchesAny(dateCandidates, date)) {
      score += 0.15;
      reasons.push('date_ok');
    } else {
      reasons.push('date_mismatch');
    }
  } else {
    reasons.push('date_missing_target');
    score += 0.05;
  }

  const strongRejectSignals = [
    {
      rx: /behandlingsavtal|hårtransplantation|patient:|hälsodeklaration|employee-side filled wp application/i,
      reason: 'patient_document',
    },
    {
      rx: /målsägarkopia|polisanmälan|arbetstillstånd|ansökan om|kollegium|kollokort|notarius publicus/i,
      reason: 'authority_application_document',
    },
    {
      rx: /årsredovisning|curatiio|villa ström|svensk värdepappersservice|kapitalförvaltning|nordnet|fond|investering|prisjustering fjärrvärme|årsavgift/i,
      reason: 'financial_report_document',
    },
    {
      rx: /lönespecifikation|löneutbetalning|utbetalningslista|totalt utbetalt/i,
      reason: 'payroll_document',
    },
    {
      rx: /bokningsbekräftelse|your booking documentation|booking confirmation/i,
      reason: 'booking_confirmation',
    },
  ];

  for (const signal of strongRejectSignals) {
    if (signal.rx.test(foldSwedish(text))) {
      reasons.push(`strong_reject_signal:${signal.reason}`);
      score = Math.min(score, 0.25);
    }
  }

  const ok = score >= 0.75;

  return { ok, score, reasons, details };
}

module.exports = {
  validatePdfAttachment,
  supplierMatches,
  extractAmountCandidates,
  extractDateCandidates,
  amountMatchesAny,
  dateMatchesAny,
  AMOUNT_TOLERANCE_SEK,
  DATE_TOLERANCE_DAYS,
};
