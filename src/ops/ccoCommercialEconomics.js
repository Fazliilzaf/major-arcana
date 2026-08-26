'use strict';

// Kommersiell ekonomi för CCO: deposition (20 %), utestående balans och
// slutfaktura (80 %). Rena, testbara hjälpfunktioner — inga affärsbeslut,
// ingen Fortnox-integrering. Fortnox-beslut ägs av operatören.
//
// Konventioner:
// - Belopp accepteras som siffra ("38400"/"38 400") eller formaterad sträng
//   ("38 400 kr") och normaliseras via parseSekNumber.
// - depositAmount = 20 % av accepterat pris (DEPOSIT_RATIO).
// - slutfaktura = accepterat pris - deposition = 80 % (FINAL_INVOICE_RATIO).
// - outstandingBalance = accepterat pris - deposition - betalt (clampad ≥ 0).
//   Saknas accepterat pris → null (okänt), aldrig en fejkad 0.

const DEPOSIT_RATIO = 0.2;
const FINAL_INVOICE_RATIO = 1 - DEPOSIT_RATIO; // 0.8

const FINAL_INVOICE_RULE_ID = 'customer.final_invoice_due';

// Journaltyper som motsvarar utförd behandling → slutfaktura-signal.
const TREATMENT_JOURNAL_TYPES = Object.freeze(['tp_treatment', 'prp_treatment', 'bleph_treatment']);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseSekNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = normalizeText(value);
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // ta bort tusentals-punkter, behåll decimalkomma
    .replace(',', '.');
  if (!cleaned || cleaned === '.' || cleaned === '-') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSekAmount(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '';
  const formatted = num.toLocaleString('sv-SE', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} kr`;
}

// 20 % av det accepterade priset (deposition). Returnerar tal eller null.
function computeDepositFromAcceptedPrice(acceptedPrice, ratio = DEPOSIT_RATIO) {
  const price = parseSekNumber(acceptedPrice);
  if (price == null) return null;
  const safeRatio = Number.isFinite(ratio) ? ratio : DEPOSIT_RATIO;
  return Math.round(price * safeRatio);
}

// Återstår till slutfaktura = accepterat pris - deposition (80 %). Tal eller null.
function computeFinalInvoiceAmount(acceptedPrice, depositAmount) {
  const price = parseSekNumber(acceptedPrice);
  if (price == null) return null;
  const deposit = parseSekNumber(depositAmount);
  const depositValue = deposit == null || deposit < 0 ? 0 : deposit;
  return Math.max(0, price - depositValue);
}

// Utestående balans = accepterat pris - deposition - betalt. Clampad ≥ 0.
// Saknas accepterat pris → null (okänt).
function computeOutstandingBalance({ acceptedPrice, deposit, paid } = {}) {
  const price = parseSekNumber(acceptedPrice);
  if (price == null) return null;
  const dep = parseSekNumber(deposit);
  const paidNum = parseSekNumber(paid);
  const depositValue = dep == null || dep < 0 ? 0 : dep;
  const paidValue = paidNum == null || paidNum < 0 ? 0 : paidNum;
  return Math.max(0, price - depositValue - paidValue);
}

// CCO-signal när en behandlingsjournal är signerad: slutfaktura (80 %) ska
// utfärdas. Ingen Fortnox-utskick — bara en signal operatören agerar på.
function buildFinalInvoiceSignal(
  commercialCase = {},
  { journalSignedAt = '', journalType = '' } = {}
) {
  const safe = asObject(commercialCase);
  const accepted =
    normalizeKey(safe.quoteStatus) === 'accepted' || Boolean(normalizeText(safe.quoteAcceptedAt));
  if (!accepted) return null;
  const acceptedPrice = normalizeText(safe.quotedAmount);
  const price = parseSekNumber(acceptedPrice);
  if (price == null) return null;

  const deposit = parseSekNumber(safe.depositAmount);
  const finalInvoice = computeFinalInvoiceAmount(acceptedPrice, safe.depositAmount);
  const finalInvoiceLabel = formatSekAmount(finalInvoice);
  const depositLabel = deposit == null ? '—' : formatSekAmount(deposit);
  const priceLabel = formatSekAmount(price);
  const journalTypeLabel = normalizeText(journalType);

  return {
    ruleId: FINAL_INVOICE_RULE_ID,
    status: 'active',
    risk: 'review',
    what: `Slutfaktura ${finalInvoiceLabel} (80 % av ${priceLabel}) — behandling journalförd`,
    why: journalTypeLabel
      ? `Behandlingsjournal (${journalTypeLabel}) är signerad. Utfärda slutbetalningen på ${finalInvoiceLabel}.`
      : `Behandlingsjournal är signerad. Utfärda slutbetalningen på ${finalInvoiceLabel}.`,
    source: 'cco_commercial_invoice',
    metadata: {
      invoiceAmount: finalInvoice,
      invoiceRatio: FINAL_INVOICE_RATIO,
      depositAmount: depositLabel,
      acceptedPrice: priceLabel,
      journalSignedAt: normalizeText(journalSignedAt),
      journalType: journalTypeLabel,
    },
  };
}

module.exports = {
  DEPOSIT_RATIO,
  FINAL_INVOICE_RATIO,
  FINAL_INVOICE_RULE_ID,
  TREATMENT_JOURNAL_TYPES,
  parseSekNumber,
  formatSekAmount,
  computeDepositFromAcceptedPrice,
  computeFinalInvoiceAmount,
  computeOutstandingBalance,
  buildFinalInvoiceSignal,
};
