'use strict';

/**
 * cmAmountCorrector — hjälpmodul för att hitta och rätta ×100-fel i CM.
 *
 * Många kvitton/fakturor har extraherats med belopp multiplicerat med 100,
 * t.ex. 983 kr -> 98 300 kr eller €212.50 -> 21 250 kr. Denna modul läser
 * råmailet och försöker extrahera det verkliga beloppet med regex.
 */

const CURRENCY_HINTS = ['SEK', 'kr', 'EUR', '€'];

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ') // non-breaking space -> space
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function parseAmount(raw) {
  if (!raw) return null;
  // Acceptera både punkt och komma som decimaltecken.
  // Hantera tusentalsavgränsare (mellanslag eller NBSP).
  const cleaned = String(raw)
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.');
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function extractWithRegex(text, regex) {
  const match = text.match(regex);
  if (!match || !match[1]) return null;
  const amount = parseAmount(match[1]);
  return amount;
}

function looksLike100xError(currentAmount, parsedAmount) {
  if (!currentAmount || !parsedAmount || parsedAmount <= 0) return false;
  if (currentAmount < 1000) return false; // vi korrigerar bara uppenbara stora fel
  if (parsedAmount >= currentAmount / 2) return false; // inte rimligt ×100-fel
  const ratio = currentAmount / parsedAmount;
  return ratio >= 50 && ratio <= 150;
}

function detectCurrency(text, matchIndex) {
  const beforeAndAfter = text.slice(Math.max(0, matchIndex - 30), matchIndex + 40).toLowerCase();
  if (beforeAndAfter.includes('zar')) return 'ZAR';
  if (beforeAndAfter.includes('€') || beforeAndAfter.includes('eur')) return 'EUR';
  if (beforeAndAfter.includes('sek') || beforeAndAfter.includes('kr')) return 'SEK';
  return null;
}

// Grova växelkursuppskattningar för att konvertera till SEK.
// Används endast för att rensa uppenbara ×100-fel; ägaren bör granska.
const RATES_TO_SEK = {
  EUR: 11.5,
  ZAR: 0.6,
  SEK: 1,
};

function convertToSek(parsedAmount, currency) {
  const rate = RATES_TO_SEK[currency] || 1;
  return Math.round(parsedAmount * rate);
}

const PATTERNS = [
  {
    name: 'total_sek_decimal',
    regex:
      /Total(?:\s+(?:betalning|belopp|SEK|kr))?[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'totalt_belatt_som_betalats',
    regex:
      /Totalt belopp som betalats[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'betalning_total',
    regex:
      /Total betalning[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr|\s*inkl)?/i,
  },
  {
    name: 'fakturerat_belopp',
    regex:
      /Fakturerat belopp[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'belopp_line',
    regex:
      /Belopp[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'paypal_betald',
    regex:
      /Du betalade\s+(?:kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'paypal_paid_to',
    regex:
      /betalade\s+(?:kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?\s*till/i,
  },
  {
    name: 'receipt_eur',
    regex: /Receipt from [^€]+€\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)/i,
  },
  {
    name: 'euro_symbol',
    regex: /€\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)/,
  },
  {
    name: 'paid_amount_sek',
    regex:
      /(?:paid|betalat)\s+(?:amount|belopp)?[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'amount_due',
    regex:
      /(?:Kvar att betala|Att betala)[:\s]+(?:SEK|kr)?\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)\s*(?:SEK|kr)?/i,
  },
  {
    name: 'uber_total_zar',
    regex: /Total\s+(?:ZAR|R)\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)/i,
  },
  {
    name: 'zar_symbol',
    regex: /ZAR\s*([0-9]{1,3}(?:[\s\u00A0][0-9]{3})*(?:[.,][0-9]{2})?)/i,
  },
];

/**
 * Extrahera det mest sannolika verkliga beloppet från råmailet.
 * @param {Object} rawItem
 * @param {number} currentAmountIncVat
 * @returns {Object|null} { parsedAmount, sekAmount, currency, strategy, confidence }
 */
function extractAmountFromRawItem(rawItem, currentAmountIncVat) {
  const text = normalizeWhitespace(
    (rawItem?.rawBodyText || '') + '\n' + (rawItem?.bodyPreview || '')
  );
  if (!text) return null;

  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('i') ? 'gi' : 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const parsedAmount = parseAmount(match[1]);
      if (!parsedAmount) continue;
      const currency = detectCurrency(text, match.index);
      if (looksLike100xError(currentAmountIncVat, parsedAmount)) {
        return {
          parsedAmount,
          sekAmount: convertToSek(parsedAmount, currency),
          currency,
          strategy: pattern.name,
          confidence: 0.9,
        };
      }
    }
  }

  return null;
}

module.exports = {
  extractAmountFromRawItem,
  parseAmount,
  looksLike100xError,
  PATTERNS,
};
