#!/usr/bin/env node
'use strict';

/**
 * Read-only pilot candidate preview mot prod.
 * Kräver owner-token. Inga writes.
 *
 * Usage:
 *   node scripts/preview-internalize-candidates-prod.js
 *   node scripts/preview-internalize-candidates-prod.js --limit 10 --offset 0
 *   node scripts/preview-internalize-candidates-prod.js --include-unknown
 */

require('dotenv').config({ quiet: true });

const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

function parseArgs(argv) {
  const args = {
    limit: 10,
    offset: 0,
    excludeUnknownMonth: true,
    includePilotWindow: true,
    pilotWindowSize: 10,
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--limit') args.limit = Math.max(1, Number(argv[++i]) || 10);
    else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--include-unknown') args.excludeUnknownMonth = false;
    else if (flag === '--pilot-window-size') {
      args.pilotWindowSize = Math.max(1, Number(argv[++i]) || 10);
    } else if (flag === '--json') args.json = true;
    else if (flag === '--help' || flag === '-h') {
      console.log(`Usage: node scripts/preview-internalize-candidates-prod.js [options]

Options:
  --limit N                 Preview-rader (default 10)
  --offset N                Browse-offset i filtrerad lista (default 0)
  --include-unknown         Inkludera unknown_month-bucket
  --pilot-window-size N     Consecutive pilot-fönster (default 10)
  --json                    Skriv rå JSON till stdout
`);
      process.exit(0);
    }
  }
  return args;
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function fetchOwnerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || 'owner token misslyckades');
  }
  const token = (result.stdout || '').trim();
  if (!token) fail('tom owner-token');
  return token;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = fetchOwnerToken();
  const res = await fetch(
    `${BASE}/api/v1/cco-patient-master/assets/internalize/preview-candidates`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        limit: args.limit,
        offset: args.offset,
        excludeUnknownMonth: args.excludeUnknownMonth,
        includePilotWindow: args.includePilotWindow,
        pilotWindowSize: args.pilotWindowSize,
      }),
    }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`${res.status} ${body.error || JSON.stringify(body).slice(0, 240)}`);
  }
  if (args.json) {
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    return;
  }

  const preview = body.preview || {};
  console.log('✅ preview-candidates (read-only)');
  console.log(`   rowsCollected: ${body.rowsCollected}`);
  console.log(
    `   remaining: ${preview.stats?.remaining} · calendarClear: ${preview.stats?.calendarClearRemaining} · unknown_month: ${preview.stats?.unknownMonthRemaining}`
  );
  if (preview.pilotWindow) {
    console.log(
      `   pilotWindow: offset=${preview.pilotWindow.offset} size=${preview.pilotWindow.size} (commit offset för limit ${preview.pilotWindow.size})`
    );
  } else {
    console.log('   pilotWindow: none');
  }
  console.log(`   candidates (${preview.candidates?.length || 0}):`);
  for (const row of preview.candidates || []) {
    console.log(
      `     [${row.remainingOffset}] ${row.monthFolder} · ${row.documentDateSource} · ${row.family} · ${row.fileName} · ${row.driveRef}`
    );
  }
}

main().catch((err) => fail(err.message || String(err)));
