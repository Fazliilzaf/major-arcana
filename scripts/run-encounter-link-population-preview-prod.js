#!/usr/bin/env node
'use strict';

/**
 * Population-wide, read-only encounter-link inventory.
 * Checkpoints every page so transient prod errors never require a full restart.
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_OUTPUT = '/tmp/encounter-link-population-preview.json';

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    startOffset: 0,
    maxPatients: 7500,
    retries: 5,
    delayMs: 3000,
    pageSize: DEFAULT_PAGE_SIZE,
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--output') args.output = String(argv[++i] || DEFAULT_OUTPUT);
    else if (argv[i] === '--start-offset') args.startOffset = Math.max(0, Number(argv[++i]) || 0);
    else if (argv[i] === '--max-patients')
      args.maxPatients = Math.max(1, Number(argv[++i]) || 7500);
    else if (argv[i] === '--retries') args.retries = Math.max(1, Number(argv[++i]) || 5);
    else if (argv[i] === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (argv[i] === '--page-size')
      args.pageSize = Math.min(100, Math.max(1, Number(argv[++i]) || DEFAULT_PAGE_SIZE));
  }
  return args;
}

function ownerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0 || !String(result.stdout || '').trim()) {
    throw new Error(String(result.stderr || result.stdout || 'Owner-token saknas').trim());
  }
  return String(result.stdout).trim();
}

function readCheckpoint(output) {
  try {
    const parsed = JSON.parse(fs.readFileSync(output, 'utf8'));
    return Array.isArray(parsed.pages) ? parsed : { pages: [] };
  } catch {
    return { pages: [] };
  }
}

function summarize(pages) {
  const totals = {
    patientsScanned: 0,
    assetsScanned: 0,
    mediaAssets: 0,
    alreadyLinked: 0,
    missingEncounterId: 0,
    linkable: 0,
    linkableHigh: 0,
    linkableMedium: 0,
    review: 0,
    missingDate: 0,
  };
  for (const page of pages) {
    for (const key of Object.keys(totals)) totals[key] += Number(page.stats?.[key] || 0);
  }
  return totals;
}

async function fetchPage({ offset, pageSize, retries, getToken }) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(
        `${BASE}/api/v1/cco-patient-master/assets/preview-encounter-links`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getToken(attempt > 1)}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            patientLimit: pageSize,
            patientOffset: offset,
            sampleSize: 25,
            includeBookingIndex: false,
          }),
          signal: AbortSignal.timeout(120000),
        }
      );
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          offset,
          selection: body.patientSelection,
          stats: body.stats,
          samples: body.samples || [],
        };
      }
      lastError = new Error(`HTTP ${response.status}: ${body.error || 'okänt svar'}`);
      if (![401, 429, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw lastError || new Error(`Kunde inte läsa offset ${offset}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const checkpoint = readCheckpoint(args.output);
  const pagesByOffset = new Map(checkpoint.pages.map((page) => [Number(page.offset), page]));
  let token = '';
  const getToken = (refresh = false) => {
    if (!token || refresh) token = ownerToken();
    return token;
  };

  for (let offset = args.startOffset; offset < args.maxPatients; offset += args.pageSize) {
    if (pagesByOffset.has(offset)) continue;
    const page = await fetchPage({
      offset,
      pageSize: args.pageSize,
      retries: args.retries,
      getToken,
    });
    pagesByOffset.set(offset, page);
    const pages = [...pagesByOffset.values()].sort((a, b) => a.offset - b.offset);
    const report = {
      generatedAt: new Date().toISOString(),
      zeroWrites: true,
      pageSize: args.pageSize,
      totals: summarize(pages),
      pages,
    };
    fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
    process.stderr.write(
      `offset=${offset} patients=${page.stats?.patientsScanned || 0} ` +
        `linkable=${page.stats?.linkable || 0} review=${page.stats?.review || 0}\n`
    );
    if (Number(page.selection?.returned || 0) < args.pageSize) break;
    if (args.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, args.delayMs));
    }
  }

  const pages = [...pagesByOffset.values()].sort((a, b) => a.offset - b.offset);
  process.stdout.write(
    `${JSON.stringify({ zeroWrites: true, totals: summarize(pages), pages: pages.length }, null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(`encounter-link population preview: ${error.message || error}`);
  process.exit(1);
});
