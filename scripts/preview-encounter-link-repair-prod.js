#!/usr/bin/env node
'use strict';

/**
 * Read-only preview of media assets without encounterId.
 * OWNER auth required. This script never calls a write endpoint.
 *
 * Usage:
 *   node scripts/preview-encounter-link-repair-prod.js --patient-id <canonical-id>
 *   node scripts/preview-encounter-link-repair-prod.js --patient-limit 25
 *   node scripts/preview-encounter-link-repair-prod.js --json > /tmp/encounter-links.json
 */

require('dotenv').config({ quiet: true });

const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');

function parseArgs(argv) {
  const args = { patientIds: [], patientLimit: 25, patientOffset: 0, sampleSize: 25, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--patient-id') args.patientIds.push(String(argv[++i] || '').trim());
    else if (flag === '--patient-limit') args.patientLimit = Math.max(1, Number(argv[++i]) || 25);
    else if (flag === '--patient-offset') args.patientOffset = Math.max(0, Number(argv[++i]) || 0);
    else if (flag === '--sample-size') args.sampleSize = Math.max(1, Number(argv[++i]) || 25);
    else if (flag === '--json') args.json = true;
    else if (flag === '--help' || flag === '-h') {
      console.log(`Usage: node scripts/preview-encounter-link-repair-prod.js [options]

Options:
  --patient-id ID       Scope to a canonical patientId; repeatable
  --patient-limit N     Patients to scan when no ID is supplied (default 25)
  --patient-offset N    Patient page offset (default 0)
  --sample-size N       Masked examples in the response (default 25)
  --json                Write raw JSON to stdout
`);
      process.exit(0);
    }
  }
  args.patientIds = [...new Set(args.patientIds.filter(Boolean))];
  return args;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function fetchOwnerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || 'owner-token misslyckades');
  }
  const token = (result.stdout || '').trim();
  if (!token) fail('tom owner-token');
  return token;
}

async function main() {
  const args = parseArgs(process.argv);
  const token = fetchOwnerToken();
  const payload = {
    patientIds: args.patientIds,
    patientLimit: args.patientLimit,
    patientOffset: args.patientOffset,
    sampleSize: args.sampleSize,
  };
  const response = await fetch(`${BASE}/api/v1/cco-patient-master/assets/preview-encounter-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${response.status} ${body.error || JSON.stringify(body).slice(0, 240)}`);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
    return;
  }

  const stats = body.stats || {};
  console.log('✅ encounter-link preview (read-only)');
  console.log(
    `   patients=${stats.patientsScanned || 0} · assets=${stats.assetsScanned || 0} · media=${stats.mediaAssets || 0}`
  );
  console.log(
    `   missing=${stats.missingEncounterId || 0} · linkable=${stats.linkable || 0} (high=${stats.linkableHigh || 0}, medium=${stats.linkableMedium || 0}) · review=${stats.review || 0} · missingDate=${stats.missingDate || 0}`
  );
  for (const sample of body.samples || []) {
    console.log(
      `   ${sample.date || 'no-date'} · ${sample.confidence} · ${sample.reason} · ${sample.encounterType || '—'} · ${sample.fileName} · proposed=${sample.proposedEncounterId || '—'}`
    );
  }
}

main().catch((error) => fail(error.message || String(error)));
