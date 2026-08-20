'use strict';

/**
 * Detektera e-postadresser som aldrig kan tillhöra en verklig patient.
 * Används för att permanent märka testbokningar så att de kan filtreras
 * bort i operatörsvyer, påminnelser och rapporter.
 *
 * RFC 2606-reserverade domäner:
 *   example.com, example.net, example.org, example, test, invalid, localhost
 * Plus klinikens egna reserverade domäner som explicit aldrig ska nå prod.
 */

const TEST_DATA_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'example',
  'test',
  'invalid',
  'localhost',
  'arcana.invalid',
]);

function isTestDataDomain(domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d) return false;
  if (TEST_DATA_DOMAINS.has(d)) return true;
  for (const reserved of TEST_DATA_DOMAINS) {
    if (d === reserved || d.endsWith(`.${reserved}`)) return true;
  }
  return false;
}

function isTestDataEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0) return false;
  return isTestDataDomain(normalized.slice(at + 1));
}

module.exports = { isTestDataEmail, isTestDataDomain, TEST_DATA_DOMAINS };
