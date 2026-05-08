#!/usr/bin/env node
'use strict';

/**
 * scripts/i18n-merge.js — mergar data/i18n-extracted.json till
 * runtime-i18n.js. Lägger till ALLA nycklar i sv-blocket. För en/de/dk
 * skapas dummy-mappningar (fallback till sv via befintlig fallback-logik
 * om nyckel saknas; men för säkerhets skull lägger vi till tomma stubs
 * så vi kan översätta inkrementellt).
 *
 * Idempotent — kör flera gånger utan dubbletter.
 *
 * Bygger en separat sektion "// === Auto-extracted UI strings (i18n-extract) ===" som
 * uppdateras i sin helhet vid varje körning. Manuella nycklar utanför sektionen rörs ej.
 */

const fs = require('fs');
const path = require('path');

const I18N_PATH = path.resolve(__dirname, '..', 'public/major-arcana-preview/runtime-i18n.js');
const JSON_PATH = path.resolve(__dirname, '..', 'data/i18n-extracted.json');

const MARKER_BEGIN = '// === Auto-extracted UI strings (i18n-extract) ===';
const MARKER_END = '// === End auto-extracted UI strings ===';

function escapeStringForJs(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildBlockSv(dict) {
  const keys = Object.keys(dict).sort();
  const lines = keys.map((k) => `      '${k}': '${escapeStringForJs(dict[k])}',`);
  return [MARKER_BEGIN, ...lines, MARKER_END].join('\n');
}

function buildBlockOther(dict) {
  // För en/de/dk lägger vi nycklar med samma värde som sv. När någon
  // översätter manuellt kan dom överskriva. Fallback-mekanismen i
  // runtime-i18n.js redan hanterar saknade nycklar (faller tillbaka till sv).
  const keys = Object.keys(dict).sort();
  const lines = keys.map((k) => `      '${k}': '${escapeStringForJs(dict[k])}',`);
  return [MARKER_BEGIN, ...lines, MARKER_END].join('\n');
}

function injectBlock(content, lang, block) {
  // Hitta `LANG: { ... }` blocket. Ersätt befintlig auto-block om finns,
  // annars sätt in före `},` som stänger blocket.
  const re = new RegExp(`(\\s+${lang}:\\s*\\{)([\\s\\S]*?)(\\n\\s*\\},)`);
  const match = content.match(re);
  if (!match) {
    console.warn('Kunde inte hitta lang-block för', lang);
    return content;
  }
  let body = match[2];
  const beginIdx = body.indexOf(MARKER_BEGIN);
  const endIdx = body.indexOf(MARKER_END);
  if (beginIdx !== -1 && endIdx !== -1) {
    // Ersätt
    const before = body.slice(0, beginIdx);
    const after = body.slice(endIdx + MARKER_END.length);
    body = before + block + after;
  } else {
    // Lägg in före closing
    body = body + '\n      ' + block.split('\n').join('\n      ') + '\n';
  }
  return content.slice(0, match.index) + match[1] + body + match[3] + content.slice(match.index + match[0].length);
}

function main() {
  const dict = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  let content = fs.readFileSync(I18N_PATH, 'utf-8');

  const blockSv = buildBlockSv(dict);
  const blockOther = buildBlockOther(dict);

  content = injectBlock(content, 'sv', blockSv);
  content = injectBlock(content, 'en', blockOther);
  content = injectBlock(content, 'de', blockOther);
  content = injectBlock(content, 'dk', blockOther);

  fs.writeFileSync(I18N_PATH, content, 'utf-8');
  console.log('Mergeat', Object.keys(dict).length, 'nycklar till runtime-i18n.js');
}

if (require.main === module) {
  main();
}
