#!/usr/bin/env node
'use strict';

/**
 * Audit Retention Archive Script (S8 från Säkerhet & compliance).
 *
 * Flyttar audit-events äldre än ARCHIVE_THRESHOLD_DAYS (default 30) från
 * primary audit.jsonl till archive/audit-YYYY-MM.jsonl.gz.
 *
 * Behåller minst 7 år (legal-krav GDPR + svensk bokföringslag).
 *
 * Användning:
 *   node scripts/archive-audit.js
 *   node scripts/archive-audit.js --threshold-days=60 --dry-run
 *
 * Schemaläggning (Render cron):
 *   0 2 * * *  node scripts/archive-audit.js
 *
 * Future: ladda upp arkiv-filer till S3/R2 om CCO_AUDIT_ARCHIVE_S3_BUCKET
 * är konfigurerad.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

function parseArgs() {
  const args = { thresholdDays: 30, dryRun: false };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--threshold-days=(\d+)$/);
    if (m) args.thresholdDays = Number(m[1]);
    if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const stateRoot = process.env.ARCANA_STATE_ROOT || path.join(process.cwd(), 'data');
  const auditPath = path.join(stateRoot, 'audit.jsonl');
  const archiveDir = path.join(stateRoot, 'archive');

  if (!fs.existsSync(auditPath)) {
    console.log(`[archive-audit] No audit.jsonl found at ${auditPath} — nothing to do.`);
    return;
  }

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const thresholdMs = Date.now() - args.thresholdDays * 24 * 60 * 60 * 1000;
  const archived = new Map(); // 'YYYY-MM' → [lines]
  const retained = [];
  let totalLines = 0;
  let oldLines = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(auditPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    totalLines++;
    if (!line.trim()) continue;
    let event = null;
    try { event = JSON.parse(line); } catch (_e) { event = null; }
    const ts = event?.recordedAt ? Date.parse(event.recordedAt) : NaN;
    if (Number.isFinite(ts) && ts < thresholdMs) {
      oldLines++;
      const date = new Date(ts);
      const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!archived.has(month)) archived.set(month, []);
      archived.get(month).push(line);
    } else {
      retained.push(line);
    }
  }

  console.log(`[archive-audit] Read ${totalLines} events, ${oldLines} äldre än ${args.thresholdDays} dagar.`);
  console.log(`[archive-audit] Skapar arkiv för ${archived.size} månad(er).`);

  if (args.dryRun) {
    console.log('[archive-audit] --dry-run — inga ändringar gjorda.');
    return;
  }

  // Skriv arkiv per månad (gzippad)
  for (const [month, lines] of archived) {
    const outPath = path.join(archiveDir, `audit-${month}.jsonl.gz`);
    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(outPath, { flags: 'a' });
    gzip.pipe(out);
    for (const line of lines) {
      gzip.write(line + '\n');
    }
    gzip.end();
    await new Promise((resolve) => out.on('close', resolve));
    console.log(`[archive-audit] Wrote ${lines.length} events → ${outPath}`);
  }

  // Skriv tillbaka kvarvarande events
  const tmpPath = `${auditPath}.tmp`;
  fs.writeFileSync(tmpPath, retained.join('\n') + (retained.length ? '\n' : ''));
  fs.renameSync(tmpPath, auditPath);
  console.log(`[archive-audit] audit.jsonl trimmat till ${retained.length} events.`);
  console.log(`[archive-audit] Klart.`);
}

main().catch((error) => {
  console.error('[archive-audit] Failed:', error);
  process.exit(1);
});
