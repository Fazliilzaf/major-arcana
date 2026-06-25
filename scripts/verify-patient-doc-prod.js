#!/usr/bin/env node
/**
 * E10 — kör alla patient-doc prod-verify scripts i ordning.
 * ARCANA_PROD_URL=https://arcana.hairtpclinic.com npm run verify:patient-doc-prod
 */
'use strict';

const { spawnSync } = require('node:child_process');

const SCRIPTS = [
  'verify:patient-doc-live-routes',
  'verify:patient-doc-v-column',
  'verify:patient-doc-sign-e8',
  'verify:patient-doc-staff-e9',
  'verify:patient-doc-eng1',
];

function main() {
  const base = process.env.ARCANA_PROD_URL || 'http://127.0.0.1:3100';
  console.log(`\n=== verify:patient-doc-prod (E10) · base=${base} ===\n`);

  for (const script of SCRIPTS) {
    console.log(`--- npm run ${script} ---\n`);
    const result = spawnSync('npm', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`\nFAIL: ${script} (exit ${result.status ?? 1})\n`);
      process.exit(result.status || 1);
    }
    console.log('');
  }

  console.log('=== verify:patient-doc-prod · ALL PASS ===\n');
}

main();
