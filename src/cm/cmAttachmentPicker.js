'use strict';

/**
 * cmAttachmentPicker — välj rätt bilaga när ett mail innehåller flera.
 *
 * ORD-117: CM-importet har historiskt valt den första bilagan som underlag,
 * vilket lett till att t.ex. patientavtal eller andra kvitton kopplats till
 * fel transaktion. Denna modul extraherar text från alla bilagor och väljer
 * den som bäst matchar mailets ämne/body och det belopp/leverantör som
 * extraktionen hittar.
 */

const { tokenSet, supplierHint } = require('../cfo/cfoCardReconciliation');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function foldSwedish(v) {
  return normalizeText(v).toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o');
}

function extractAmounts(text) {
  const out = new Set();
  const t = normalizeText(text).replace(/\s/g, '');
  for (const m of t.matchAll(/(\d{1,3}(?:[\s.]\d{3})*,\d{2})/g)) {
    const n = Number(m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return Array.from(out);
}

function scoreAttachment({ text, fileName, subject, bodyText, supplier, amountIncVat }) {
  const hay = foldSwedish(`${subject} ${bodyText}`);
  const pdfText = foldSwedish(text);
  const file = foldSwedish(fileName);

  let score = 0;
  const reasons = [];

  // 1. Filnamn matcher ämnet (t.ex. "invoice.pdf" från Figma)
  if (file && hay.includes(file.replace(/\.pdf|\.jpg|\.png/g, ''))) {
    score += 5;
    reasons.push('filename_in_subject_or_body');
  }

  // 2. Leverantör i PDF matchar transaktionsbeskrivning eller ämne
  if (supplier) {
    if (supplierHint(text, supplier) || supplierHint(`${subject} ${bodyText}`, supplier)) {
      score += 25;
      reasons.push('supplier_match');
    }
  }

  // 3. Belopp i PDF matchar målbeloppet
  if (amountIncVat > 0) {
    const amounts = extractAmounts(text);
    if (amounts.some((a) => Math.abs(a - amountIncVat) <= 1.0)) {
      score += 25;
      reasons.push('amount_match');
    } else if (
      amounts.some((a) => Math.abs(a - amountIncVat) <= Math.max(5, amountIncVat * 0.15))
    ) {
      score += 10;
      reasons.push('amount_approx_match');
    }
  }

  // 4. Nyckelord från ämnet/body finns i PDF-texten
  const subjectTokens = tokenSet(subject);
  const bodyTokens = tokenSet(bodyText);
  const pdfTokens = tokenSet(text);
  let tokenHits = 0;
  for (const t of new Set([...subjectTokens, ...bodyTokens])) {
    if (pdfTokens.has(t)) tokenHits++;
  }
  if (tokenHits > 0) {
    score += Math.min(15, tokenHits * 3);
    reasons.push(`token_hits:${tokenHits}`);
  }

  // 5. Avdrag för starka avvisningssignaler
  const rejectSignals = [
    /behandlingsavtal|hårtransplantation|patient:|hälsodeklaration/i,
    /målsägarkopia|polisanmälan|arbetstillstånd|ansökan om/i,
    /lönespecifikation|löneutbetalning|utbetalningslista/i,
    /bokningsbekräftelse|your booking documentation/i,
  ];
  for (const rx of rejectSignals) {
    if (rx.test(foldSwedish(text))) {
      score -= 50;
      reasons.push('reject_signal');
      break;
    }
  }

  return { score, reasons };
}

/**
 * Välj bästa bilaga bland en lista av { doc, text, fileName }.
 * @param {Array<{doc:object, text:string, fileName:string}>} attachments
 * @param {object} context — { subject, bodyText, supplier, amountIncVat }
 * @returns {{best:object|null, score:number, reasons:string[], all:Array}}
 */
function pickBestAttachment(attachments, { subject, bodyText, supplier, amountIncVat } = {}) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { best: null, score: 0, reasons: ['no_attachments'], all: [] };
  }

  const scored = attachments.map((att) => {
    const result = scoreAttachment({
      text: att.text || '',
      fileName: att.fileName || att.doc?.fileName || '',
      subject,
      bodyText,
      supplier,
      amountIncVat,
    });
    return { ...att, score: result.score, reasons: result.reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const MIN_SCORE_FOR_AUTO = 15;

  if (best.score < MIN_SCORE_FOR_AUTO) {
    return {
      best: null,
      score: best.score,
      reasons: ['no_attachment_met_minimum_score', ...best.reasons],
      all: scored,
    };
  }

  return {
    best: best.doc || best,
    score: best.score,
    reasons: best.reasons,
    all: scored,
  };
}

module.exports = {
  pickBestAttachment,
  scoreAttachment,
  extractAmounts,
};
