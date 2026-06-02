/**
 * ccoExpenseVatRules — Sprint CF.6 (MVP 5)
 *
 * Pure functions för svenska momsregler. Ingen AI. Ingen fortnox-write.
 * Inga side-effects.
 *
 * Stödda vatMode-värden:
 *  - 'standard_25'        — Standard 25% utgående/ingående moms
 *  - 'standard_12'        — 12% (livsmedel, hotell, restaurang)
 *  - 'standard_6'         — 6% (kultur, transport, böcker)
 *  - 'standard_0'         — 0% (utförsel, försäkring, vissa undantag)
 *  - 'mixed'              — Blandad moms (handfaktura) — kräver granskning
 *  - 'reverse_charge_eu'  — EU-handel omvänd skatteskyldighet (B2B)
 *  - 'reverse_charge_non_eu' — Tredjeland omvänd skatteskyldighet (import)
 *  - 'non_deductible'     — Ej avdragsgill moms (representation över belopp,
 *                            personliga utlägg, försäkringspremier etc)
 *  - 'representation_limited' — Begränsad avdragsrätt (representation 50%)
 *  - 'needs_review'       — Owner-flaggad, behöver manuell granskning
 *
 * Skatteverkets standardsatser per kategori (för suggestVatMode):
 *  - mat_representation: 12% deductible (representation)
 *  - resor: 6% (transport) eller 12% (hotell) - default 12 men needs_review
 *  - utbildning: 0% (kursavgifter) eller 25% (kurslitteratur) - default 25
 *  - utrustning, forbrukning, lokal, personal, marknadsforing: 25%
 *  - bank_finansiell: 0% (banktjänster momsbefriade)
 *  - forsakring: 0% (försäkringspremier)
 *  - skatter_avgifter: 0%
 *  - it_telefoni: 25%
 *  - juridik_konsult: 25%
 */

'use strict';

const VALID_VAT_MODES = Object.freeze([
  'standard_25', 'standard_12', 'standard_6', 'standard_0',
  'mixed',
  'reverse_charge_eu', 'reverse_charge_non_eu',
  'non_deductible',
  'representation_limited',
  'needs_review',
]);

const VAT_MODE_LABELS = Object.freeze({
  standard_25: '25 % moms',
  standard_12: '12 % moms',
  standard_6: '6 % moms',
  standard_0: '0 % moms',
  mixed: 'Blandad moms',
  reverse_charge_eu: 'EU reverse charge',
  reverse_charge_non_eu: 'Non-EU reverse charge',
  non_deductible: 'Ej avdragsgill moms',
  representation_limited: 'Representation (50 % avdrag)',
  needs_review: 'Moms behöver granskas',
});

const VALID_REVIEW_STATUSES = Object.freeze([
  'pending',   // behöver granskas
  'reviewed',  // owner/finance har bekräftat
  'flagged',   // owner-flaggad för senare beslut
]);

// Mapping från category → default vatMode (svenska standardsatser per Skatteverket)
const CATEGORY_DEFAULT_VAT_MODE = Object.freeze({
  utrustning: 'standard_25',
  forbrukning: 'standard_25',
  lokal: 'standard_25',           // hyra med moms (om frivillig skattskyldighet)
  personal: 'standard_25',
  utbildning: 'needs_review',     // 0% kurser vs 25% material
  resor: 'needs_review',          // 6% transport vs 12% hotell vs 25% bilhyra
  mat_representation: 'representation_limited', // 50% avdragsrätt
  marknadsforing: 'standard_25',
  administrativ: 'standard_25',
  it_telefoni: 'standard_25',
  forsakring: 'standard_0',       // försäkringspremier momsbefriade
  juridik_konsult: 'standard_25',
  bank_finansiell: 'standard_0',  // bankavgifter momsbefriade
  skatter_avgifter: 'standard_0', // skatter inte moms
  annat: 'needs_review',
});

// Mapping vatMode → vatRatePercent (för auto-fyll när rate saknas)
const VAT_MODE_TO_RATE = Object.freeze({
  standard_25: 25,
  standard_12: 12,
  standard_6: 6,
  standard_0: 0,
  reverse_charge_eu: 0,         // moms hanteras separat i deklaration
  reverse_charge_non_eu: 0,
  non_deductible: null,          // okänd — sätts manuellt
  representation_limited: 12,    // standard svensk representationsmoms
  mixed: null,
  needs_review: null,
});

function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function num(v) { return isFiniteNumber(v) ? v : 0; }

/**
 * Beräkna fullständigt VAT-breakdown från expense-fält + vatMode.
 *
 * Returnerar:
 *   {
 *     grossAmountSek,        // total inkl. moms (= amountSek)
 *     netAmountSek,          // exkl. moms (= gross - vatSek)
 *     vatAmountSek,          // moms-belopp (= vatSek eller beräknat)
 *     deductibleVatSek,      // moms vi får dra av
 *     nonDeductibleVatSek,   // moms som inte är avdragsgill
 *     reverseCharge,         // bool
 *     vatMode,               // bekräftat vatMode
 *     calculation: {         // metadata om HUR vi räknat
 *       rateUsed,
 *       deductionPercent,
 *       source: 'explicit' | 'derived_from_rate' | 'reverse_charge_zero',
 *       notes: [...]
 *     }
 *   }
 *
 * Inga side-effects. Throws bara på okänd vatMode.
 */
function calculateVatBreakdown({ amountSek, vatSek, vatRatePercent, vatMode } = {}) {
  if (vatMode && !VALID_VAT_MODES.includes(vatMode)) {
    throw new Error(`Okänd vatMode: ${vatMode}. Tillåtna: ${VALID_VAT_MODES.join(', ')}`);
  }
  const gross = num(amountSek);
  const mode = vatMode || 'needs_review';
  const reverseCharge = mode === 'reverse_charge_eu' || mode === 'reverse_charge_non_eu';

  // Härled vatAmount om inte explicit satt
  let vat = vatSek;
  let calcSource = 'explicit';
  const notes = [];

  if (reverseCharge) {
    // Reverse charge: ingen moms i fakturan, men vi noterar 0
    vat = 0;
    calcSource = 'reverse_charge_zero';
    notes.push('Reverse charge — momsdeklaration hanterar både utgående och ingående');
  } else if (!isFiniteNumber(vat) || vat === null) {
    // Försök härleda från rate
    let rate = isFiniteNumber(vatRatePercent) ? vatRatePercent : VAT_MODE_TO_RATE[mode];
    if (isFiniteNumber(rate) && rate > 0) {
      // gross = net * (1 + rate/100) → vat = gross * rate / (100 + rate)
      vat = gross * rate / (100 + rate);
      calcSource = 'derived_from_rate';
      notes.push(`Härled moms från ${rate}% (gross * ${rate} / (100 + ${rate}))`);
    } else {
      vat = 0;
    }
  }

  const net = gross - num(vat);

  // Avdragsrätt
  let deductible = 0;
  let nonDeductible = 0;
  let deductionPercent = 100;
  if (reverseCharge) {
    deductible = 0;
    nonDeductible = 0;
    deductionPercent = 0;
  } else if (mode === 'non_deductible') {
    deductible = 0;
    nonDeductible = num(vat);
    deductionPercent = 0;
    notes.push('Hela momsbeloppet är ej avdragsgillt');
  } else if (mode === 'representation_limited') {
    deductible = num(vat) * 0.5;
    nonDeductible = num(vat) - deductible;
    deductionPercent = 50;
    notes.push('Representation: 50 % av momsen avdragsgill (Skatteverkets schablon)');
  } else if (mode === 'mixed' || mode === 'needs_review') {
    // Vi kan inte bestämma — markera 0/0 och kräv review
    deductible = 0;
    nonDeductible = 0;
    deductionPercent = 0;
    notes.push('Avdragsrätt kan inte bestämmas automatiskt — kräver manuell granskning');
  } else {
    deductible = num(vat);
    nonDeductible = 0;
    deductionPercent = 100;
  }

  return {
    grossAmountSek: round2(gross),
    netAmountSek: round2(net),
    vatAmountSek: round2(num(vat)),
    deductibleVatSek: round2(deductible),
    nonDeductibleVatSek: round2(nonDeductible),
    reverseCharge,
    vatMode: mode,
    calculation: {
      rateUsed: isFiniteNumber(vatRatePercent) ? vatRatePercent : VAT_MODE_TO_RATE[mode] || null,
      deductionPercent,
      source: calcSource,
      notes,
    },
  };
}

function round2(n) {
  if (!isFiniteNumber(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Föreslå vatMode för en expense baserat på category + reverseCharge-flagga.
 * Returnerar { suggestedVatMode, confidence, reason } eller null.
 */
function suggestVatMode({ category, supplierCountry = 'SE', vatRatePercent, reverseChargeHint = false } = {}) {
  // Explicit reverse-charge-hint (från owner eller vendor.notes)
  if (reverseChargeHint || supplierCountry === 'EU' || supplierCountry === 'NON_EU') {
    const mode = (supplierCountry === 'NON_EU')
      ? 'reverse_charge_non_eu'
      : 'reverse_charge_eu';
    return {
      suggestedVatMode: mode,
      confidence: 0.75,
      reason: `Reverse charge ${supplierCountry === 'NON_EU' ? 'tredjeland' : 'EU'} — owner-hint eller supplier-land`,
    };
  }

  // Om vatRatePercent är satt och passar standardsats
  if (isFiniteNumber(vatRatePercent)) {
    if (vatRatePercent === 25) return { suggestedVatMode: 'standard_25', confidence: 0.85, reason: 'vatRatePercent=25' };
    if (vatRatePercent === 12) return { suggestedVatMode: 'standard_12', confidence: 0.85, reason: 'vatRatePercent=12' };
    if (vatRatePercent === 6) return { suggestedVatMode: 'standard_6', confidence: 0.85, reason: 'vatRatePercent=6' };
    if (vatRatePercent === 0) return { suggestedVatMode: 'standard_0', confidence: 0.70, reason: 'vatRatePercent=0' };
  }

  // Härled från category
  if (category && CATEGORY_DEFAULT_VAT_MODE[category]) {
    const mode = CATEGORY_DEFAULT_VAT_MODE[category];
    const confidence = mode === 'needs_review' ? 0.30 : 0.60;
    return {
      suggestedVatMode: mode,
      confidence,
      reason: `Kategori-default för "${category}"`,
    };
  }

  return null;
}

/**
 * Validera att grossAmount = netAmount + vatAmount (med tolerance).
 */
function validateBreakdown(breakdown, tolerance = 0.05) {
  if (!breakdown) return { valid: false, reason: 'no_breakdown' };
  const diff = Math.abs(breakdown.grossAmountSek - (breakdown.netAmountSek + breakdown.vatAmountSek));
  if (diff > tolerance) return { valid: false, reason: 'gross_net_vat_mismatch', diff };
  // Reverse charge: vat ska vara 0
  if (breakdown.reverseCharge && breakdown.vatAmountSek !== 0) {
    return { valid: false, reason: 'reverse_charge_with_vat', vatAmountSek: breakdown.vatAmountSek };
  }
  // Deductible + non-deductible ska summa till vat
  const dedSum = breakdown.deductibleVatSek + breakdown.nonDeductibleVatSek;
  if (Math.abs(dedSum - breakdown.vatAmountSek) > tolerance && !breakdown.reverseCharge) {
    if (!['mixed', 'needs_review'].includes(breakdown.vatMode)) {
      return { valid: false, reason: 'deduction_sum_mismatch', dedSum, vatAmountSek: breakdown.vatAmountSek };
    }
  }
  return { valid: true };
}

module.exports = {
  VALID_VAT_MODES,
  VALID_REVIEW_STATUSES,
  VAT_MODE_LABELS,
  CATEGORY_DEFAULT_VAT_MODE,
  VAT_MODE_TO_RATE,
  calculateVatBreakdown,
  suggestVatMode,
  validateBreakdown,
};
