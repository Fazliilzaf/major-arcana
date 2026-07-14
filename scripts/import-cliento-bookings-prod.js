#!/usr/bin/env node
'use strict';

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseCsv, rowsToClientoBookings } = require('../src/ops/clientoBookingCsvImport');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const CONFIRM_TEXT = 'IMPORT CLIENTO BOOKINGS';

function parseArgs(argv) {
  const args = { csv: '', commit: false, confirmText: '', batchSize: 250, offset: 0 };
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--csv') args.csv = path.resolve(argv[++index]);
    else if (flag === '--commit') args.commit = true;
    else if (flag === '--confirm-text') args.confirmText = String(argv[++index] || '');
    else if (flag === '--batch-size') {
      args.batchSize = Math.max(1, Math.min(500, Number(argv[++index]) || 250));
    } else if (flag === '--offset') args.offset = Math.max(0, Number(argv[++index]) || 0);
  }
  if (!args.csv || !fs.existsSync(args.csv))
    throw new Error('--csv måste peka på en befintlig fil');
  if (args.commit && args.confirmText !== CONFIRM_TEXT) {
    throw new Error(`sharp import kräver --confirm-text "${CONFIRM_TEXT}"`);
  }
  return args;
}

function fetchOwnerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || 'owner token misslyckades');
  const token = String(result.stdout || '').trim();
  if (!token) throw new Error('owner token blev tom');
  return token;
}

async function postBatch({ token, bookings, source }, attempt = 1) {
  const response = await fetch(`${BASE}/api/v1/ops/cliento/import-bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bookings, source }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      return postBatch({ token, bookings, source }, attempt + 1);
    }
    throw new Error(`${response.status} ${body.error || 'Cliento import misslyckades'}`);
  }
  return body;
}

async function main() {
  const args = parseArgs(process.argv);
  const { rows } = parseCsv(fs.readFileSync(args.csv, 'utf8'));
  const mapped = rowsToClientoBookings(rows, new Map());
  const report = {
    sourceRows: mapped.stats.inputRows,
    eligible: mapped.stats.accepted,
    rejectedNoIdentity: mapped.stats.skippedNoEmail,
    imported: 0,
    rejected: 0,
    batches: 0,
    dryRun: !args.commit,
    startOffset: args.offset,
  };
  if (!args.commit) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const token = fetchOwnerToken();
  const source = path.basename(args.csv);
  for (let offset = args.offset; offset < mapped.bookings.length; offset += args.batchSize) {
    const bookings = mapped.bookings.slice(offset, offset + args.batchSize);
    const result = await postBatch({ token, bookings, source });
    report.imported += Number(result.accepted) || 0;
    report.rejected += Number(result.rejected) || 0;
    report.batches += 1;
    process.stderr.write(
      `[cliento-prod-import] ${Math.min(offset + bookings.length, mapped.bookings.length)}/${mapped.bookings.length}\n`
    );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL: ${error.message || error}\n`);
  process.exit(1);
});
