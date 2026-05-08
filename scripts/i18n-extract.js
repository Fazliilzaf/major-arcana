#!/usr/bin/env node
'use strict';

/**
 * scripts/i18n-extract.js
 *
 * Skannar public/major-arcana-preview/index.html, hittar alla svenska
 * textsträngar i element-tags som inte redan har data-i18n. Auto-genererar
 * stabila nycklar via slug-hash av texten + element-context. Skriver tillbaka
 * HTML med data-i18n och bygger en JSON-fil data/i18n-extracted.json med
 * { key: svText }.
 *
 * Idempotent — kör flera gånger utan dubbletter.
 *
 * Endast text-noder som BARA innehåller text (ingen mix med variabler eller
 * child elements) extraheras. Mycket kort text (1 tecken) hoppar.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HTML_PATH = path.resolve(__dirname, '..', 'public/major-arcana-preview/index.html');
const OUT_PATH = path.resolve(__dirname, '..', 'data/i18n-extracted.json');

// Tag-whitelist — bara dessa element-typer bearbetas
const VISIBLE_TAGS = [
  'button',
  'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p',
  'label',
  'a',
  'dt', 'dd',
  'summary', 'legend',
  'caption', 'figcaption',
  'th',
  'option',
];

// Slug-helper
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function makeKey(text, prefix = 'auto') {
  const slug = slugify(text);
  const hash = crypto.createHash('md5').update(text).digest('hex').slice(0, 6);
  if (slug) return `${prefix}.${slug}.${hash}`;
  return `${prefix}.${hash}`;
}

function shouldSkipText(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < 2) return true;
  // Pure numbers / symbols
  if (/^[\d\s.,:;\-–—()/+%×$€£¥]+$/.test(t)) return true;
  // Likely a variable / placeholder ({foo}, ${bar}, %s)
  if (/\$\{|\{\{|\{[a-z]/.test(t) || /^[<>]/.test(t)) return true;
  // Single emoji or icon-only
  if (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u.test(t)) return true;
  return false;
}

function isLikelyEnglishOnly(text) {
  // Om texten BARA innehåller ASCII-bokstäver utan svenska tecken
  // OCH består av engelska vanliga ord, hoppa
  if (!/[åäöÅÄÖéèüÉÈÜ]/.test(text)) {
    if (/^(OK|Cancel|Close|Save|Edit|Delete|Yes|No|Loading|Error|Login|Logout|Welcome|Submit|Reset|Search|Filter|Sort|View|Hide|Show)$/i.test(text.trim())) {
      return false; // bearbeta dessa, kort
    }
    // Mycket lång ASCII-text utan svenska tecken är oftast inte svensk
    if (text.length > 30 && !/\b(och|att|jag|inte|för|med|men|hur|när|kan|är|ett|åt|över|här|som|om|av|på|i|till|den)\b/i.test(text)) {
      return true;
    }
  }
  return false;
}

function processHtml(html) {
  const usedKeys = new Map(); // text → key för att undvika kollisioner
  const newEntries = {}; // key → text för output
  let modifiedCount = 0;
  let skippedExistingI18n = 0;

  // Match opening tag with content + closing tag (greedy single-line / no nested tags)
  // Vi matchar bara element som inte redan innehåller barntags eller har data-i18n.
  const tagPattern = new RegExp(
    `<(${VISIBLE_TAGS.join('|')})\\b([^>]*?)>([^<>]+?)</\\1>`,
    'gi'
  );

  const result = html.replace(tagPattern, (full, tag, attrs, content) => {
    const text = content.replace(/\s+/g, ' ').trim();
    if (shouldSkipText(text)) return full;
    if (isLikelyEnglishOnly(text)) return full;
    if (/data-i18n\s*=/.test(attrs)) {
      skippedExistingI18n += 1;
      return full;
    }
    // Aria/tooltip-attribut hanteras separat (vi rör dem inte här)
    // Generera nyckel
    let key;
    if (usedKeys.has(text)) {
      key = usedKeys.get(text);
    } else {
      key = makeKey(text, 'ui');
      usedKeys.set(text, key);
      newEntries[key] = text;
    }
    modifiedCount += 1;
    // Bevara befintliga whitespace + ev. newlines i content (men vi använder
    // den trimmade textnoden som data-i18n value)
    const newAttrs = attrs.replace(/\s+$/, '') + ` data-i18n="${key}"`;
    return `<${tag}${newAttrs}>${content}</${tag}>`;
  });

  return {
    html: result,
    entries: newEntries,
    stats: {
      modifiedCount,
      skippedExistingI18n,
      uniqueKeys: Object.keys(newEntries).length,
    },
  };
}

function main() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error('Hittar inte', HTML_PATH);
    process.exit(1);
  }
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  const { html: nextHtml, entries, stats } = processHtml(html);

  // Backup
  fs.writeFileSync(HTML_PATH + '.i18n-backup', html, 'utf-8');
  fs.writeFileSync(HTML_PATH, nextHtml, 'utf-8');

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(entries, null, 2), 'utf-8');

  console.log('=== i18n-extract ===');
  console.log('  unique keys:', stats.uniqueKeys);
  console.log('  modified:', stats.modifiedCount);
  console.log('  skipped (already had data-i18n):', stats.skippedExistingI18n);
  console.log('  backup:', HTML_PATH + '.i18n-backup');
  console.log('  output:', OUT_PATH);
}

if (require.main === module) {
  main();
}

module.exports = { processHtml, makeKey, slugify };
