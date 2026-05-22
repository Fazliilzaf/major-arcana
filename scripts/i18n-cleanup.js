#!/usr/bin/env node
'use strict';

/**
 * scripts/i18n-cleanup.js — efter i18n-extract.js, ta bort data-i18n från
 * element vars text är riskabel att översätta:
 *   - innehåller siffror i parens (dynamisk räknare, t.ex. "Arbetslista (3)")
 *   - är en e-postadress
 *   - är initialer (1-3 tecken stor bokstäver)
 *   - är ett känt egennamn
 *   - är version-strängar / ID-strängar
 *
 * Uppdaterar både index.html och data/i18n-extracted.json.
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.resolve(__dirname, '..', 'public/major-arcana-preview/index.html');
const JSON_PATH = path.resolve(__dirname, '..', 'data/i18n-extracted.json');

const PROPER_NOUNS = new Set([
  'Egzona',
  'Fazli',
  'Hair TP Clinic',
  'Hair TP',
  'CCO',
  'Major Arcana',
  'Outlook',
  'Cliento',
  'Live',
  'Sprint 3',
  'Sprint 4',
  'M365',
  'Microsoft',
  'Graph',
  'Slack',
  'Teams',
  'Calendar',
  'PWA',
]);

function isRiskyText(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  // Siffror i parens — dynamisk räknare
  if (/\(\s*\d+\s*\)/.test(t)) return true;
  // E-postadress
  if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(t)) return true;
  // Initialer (1-3 stora tecken)
  if (/^[A-ZÅÄÖ]{1,3}$/.test(t)) return true;
  // ID-/hash-strängar
  if (/^[A-Za-z0-9_-]{20,}$/.test(t)) return true;
  // Version-strängar
  if (/^v?\d+(\.\d+)+/.test(t)) return true;
  // Datum-format
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return true;
  // URL
  if (/^https?:\/\//.test(t)) return true;
  // Egennamn
  if (PROPER_NOUNS.has(t)) return true;
  // Egennamn-fragment (Sprint, Egzona, Hair TP följt av siffra/namn)
  for (const noun of PROPER_NOUNS) {
    if (t === noun) return true;
  }
  return false;
}

function main() {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const dict = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));

  const riskyKeys = new Set();
  for (const [key, value] of Object.entries(dict)) {
    if (isRiskyText(value)) riskyKeys.add(key);
  }

  console.log('riskabla nycklar att rensa:', riskyKeys.size);

  // Ta bort data-i18n=key för riskabla nycklar i HTML
  let nextHtml = html;
  let removedCount = 0;
  for (const key of riskyKeys) {
    // Match ` data-i18n="key"` (med varianter på whitespace)
    const re = new RegExp('\\s+data-i18n=["\']' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\']', 'g');
    const before = nextHtml.length;
    nextHtml = nextHtml.replace(re, '');
    if (nextHtml.length !== before) removedCount += 1;
  }

  // Ta bort från dict
  const cleanedDict = {};
  for (const [key, value] of Object.entries(dict)) {
    if (!riskyKeys.has(key)) cleanedDict[key] = value;
  }

  fs.writeFileSync(HTML_PATH, nextHtml, 'utf-8');
  fs.writeFileSync(JSON_PATH, JSON.stringify(cleanedDict, null, 2), 'utf-8');

  console.log('=== i18n-cleanup ===');
  console.log('  riskabla strängar borttagna från dict:', riskyKeys.size);
  console.log('  data-i18n-attribut borttagna från HTML:', removedCount);
  console.log('  kvar i dict:', Object.keys(cleanedDict).length);
}

if (require.main === module) {
  main();
}
