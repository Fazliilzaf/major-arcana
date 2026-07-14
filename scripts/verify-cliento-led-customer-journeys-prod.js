#!/usr/bin/env node
'use strict';

/**
 * Read-only helkundsrevision med Cliento-bokningshistoriken som ryggrad.
 * Microsoft/CCO verifierar HD + FF; Pipedrive/CCO verifierar offert + avtal.
 *
 * Usage:
 *   node scripts/verify-cliento-led-customer-journeys-prod.js
 *   node scripts/verify-cliento-led-customer-journeys-prod.js --all --json > /tmp/journey-audit.json
 */

require('dotenv').config({ quiet: true });

const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

function parseArgs(argv) {
  return {
    onlyGaps: !argv.includes('--all'),
    json: argv.includes('--json'),
    pageSize: 1000,
  };
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ownerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || 'owner-token misslyckades');
  }
  const token = normalizeText(result.stdout);
  if (!token) fail('tom owner-token');
  return token;
}

async function fetchPage(token, { onlyGaps, offset, limit }) {
  const query = new URLSearchParams({
    onlyGaps: onlyGaps ? '1' : '0',
    offset: String(offset),
    limit: String(limit),
  });
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(
        `${BASE}/api/v1/cco-patient-master/journey-audit?${query.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`${response.status} ${body.error || 'journey-audit'}`);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = ownerToken();
  let offset = 0;
  let summary = null;
  let bookingCoverage = null;
  let bookingSources = null;
  const rows = [];
  do {
    const page = await fetchPage(token, {
      onlyGaps: args.onlyGaps,
      offset,
      limit: args.pageSize,
    });
    summary = page.summary;
    bookingCoverage = page.bookingCoverage;
    bookingSources = page.bookingSources;
    rows.push(...(Array.isArray(page.rows) ? page.rows : []));
    if (!page.page?.hasMore) break;
    offset += Number(page.page.returned || args.pageSize);
  } while (offset < 20000);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    zeroWrites: true,
    onlyGaps: args.onlyGaps,
    bookingCoverage,
    bookingSources,
    summary,
    rows,
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log('Cliento-led customer journey audit (read-only)');
  console.log(`Patients scanned: ${summary?.patientsScanned || 0}`);
  console.log(`With Cliento history: ${summary?.patientsWithClientoHistory || 0}`);
  console.log(`Without Cliento history: ${summary?.patientsWithoutClientoHistory || 0}`);
  console.log(`Matched bookings: ${summary?.bookingsMatched || 0}`);
  console.log(`Unmatched bookings: ${summary?.unmatchedBookings || 0}`);
  console.log(`Review required: ${summary?.reviewRequired || 0}`);
  console.log(`Gaps: ${JSON.stringify(summary?.gapCounts || {})}`);
  console.log(`Rows fetched: ${rows.length} (${args.onlyGaps ? 'gaps only' : 'all patients'})`);
}

main().catch((error) => fail(error.message || String(error)));
