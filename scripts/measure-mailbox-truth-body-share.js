#!/usr/bin/env node
'use strict';

/**
 * ORD-89 steg 1 — hur stor del av truth-shardsen är brödtext?
 *
 * Körs där shardsen ligger (Render-shell eller prod-disk):
 *   node scripts/measure-mailbox-truth-body-share.js
 *
 * DEN HÄR MÄTNINGEN GÅR INTE GENOM `loadShard()`.
 * Varje läsväg i `ccoMailboxTruthStore` parsar hela filen — alltså exakt
 * felläget vi undersöker. Skriptet läser filerna strömmande och bygger aldrig
 * en objektgraf. Se `src/ops/mailboxTruthBodyShareScan.js` för varför.
 *
 * Ordningen är MINST FÖRST. `kons@` är 0,9 MB och kostar ingenting att göra fel
 * på; `egzona@` är 179 MB och kommer sist. Faller något ska det falla billigt.
 */

const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../src/config');
const { scanShardBodyShare } = require('../src/ops/mailboxTruthBodyShareScan');

function formatMb(bytes) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
}

function formatPercent(share) {
  return `${(Number(share || 0) * 100).toFixed(1)} %`;
}

async function listShardFiles() {
  const shardDir = path.join(config.ccoMailboxTruthShardDir, 'mailboxes');
  const entries = await fs.promises.readdir(shardDir);
  const files = [];
  for (const name of entries) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const filePath = path.join(shardDir, name);
    const stat = await fs.promises.stat(filePath);
    files.push({ mailbox: name.replace(/\.json$/, ''), filePath, sizeBytes: Number(stat.size || 0) });
  }
  // Minst först.
  return files.sort((left, right) => left.sizeBytes - right.sizeBytes);
}

async function main() {
  const files = await listShardFiles();
  if (!files.length) {
    console.error('Inga shardar hittades. Kör detta på prod-disken.');
    process.exitCode = 1;
    return;
  }

  const rows = [];
  for (const file of files) {
    const startedAt = Date.now();
    const rssBefore = process.memoryUsage().rss;
    const result = await scanShardBodyShare(file.filePath);
    const rssAfter = process.memoryUsage().rss;
    rows.push({
      mailbox: file.mailbox,
      fileMb: formatMb(result.fileBytes),
      bodyMb: formatMb(result.rawBytes),
      andel: formatPercent(result.bodyShare),
      bodyText: result.bodyText.values,
      bodyHtml: result.bodyHtml.values,
      decodedChars: result.decodedChars,
      msSpent: Date.now() - startedAt,
      // Toppen av RSS under skanningen är själva poängen: den ska INTE följa
      // filstorleken. Gör den det är skannern inte strömmande på riktigt.
      rssDeltaMb: formatMb(rssAfter - rssBefore),
    });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }

  const totalFile = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const totalBody = rows.reduce((sum, row) => sum + Number(row.bodyMb) * 1024 * 1024, 0);
  console.log('');
  console.table(rows);
  console.log(
    JSON.stringify({
      totaltFilMb: formatMb(totalFile),
      totaltBrödtextMb: formatMb(totalBody),
      andelAvAllt: formatPercent(totalFile > 0 ? totalBody / totalFile : 0),
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
