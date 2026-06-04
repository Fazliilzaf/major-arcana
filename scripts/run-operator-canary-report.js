#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  collectOperatorCanaryReport,
  publishOperatorCanaryStatus,
} = require('./lib/ccoOperatorCanaryReport');

const REPO = path.join(__dirname, '..');
const BASE = process.env.CCO_READINESS_BASE || 'https://arcana.hairtpclinic.com';

async function main() {
  const payload = await collectOperatorCanaryReport({ base: BASE, projectRoot: REPO });
  const paths = publishOperatorCanaryStatus(payload, REPO);
  console.log('=== CCO Controlled Completion Canaries (Cycle 16) ===');
  const r = payload.completionReport || {};
  console.log('\n--- Photo Review canary ---');
  console.log(JSON.stringify(r.photo, null, 2));
  console.log('\n--- Import Review canary ---');
  console.log(JSON.stringify(r.import, null, 2));
  console.log('\n--- Mail Review canary ---');
  console.log(JSON.stringify(r.mail, null, 2));
  console.log('\nNästa:', payload.recommendedNextWork?.join(' · '));
  console.log('Wrote:', paths.publicPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
