#!/usr/bin/env node
'use strict';

/** Read-only OWNER report for unresolved legacy media encounter links. */

require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const includeDetails = process.argv.includes('--include-details');
const json = process.argv.includes('--json');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function ownerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr?.trim() || 'owner-token misslyckades');
  const token = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  if (!token) fail('tom owner-token');
  return token;
}

async function main() {
  const query = includeDetails ? '?includeDetails=true' : '';
  const response = await fetch(
    `${BASE}/api/v1/cco-patient-master/assets/encounter-link-review-queue${query}`,
    { headers: { Authorization: `Bearer ${ownerToken()}`, Accept: 'application/json' } }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${response.status} ${body.error || 'okänt fel'}`);
  if (json) return process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);

  console.log('Encounter-link manual review queue (read-only)');
  console.log(
    `assets=${body.stats?.reviewAssets || 0} · groups=${body.stats?.reviewGroups || 0} · ambiguous=${body.stats?.ambiguousGroups || 0} · unresolved=${body.stats?.unresolvedGroups || 0}`
  );
  for (const group of body.groups || []) {
    console.log(
      `- ${group.assetPatientId} · ${group.reason} · ${group.assets.length} asset(s) · candidates=${group.candidatePatients.length}`
    );
  }
}

main().catch((error) => fail(error.message || String(error)));
