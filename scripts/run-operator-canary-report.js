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
  console.log('=== CCO Operator Canary Report ===');
  console.log('Photo:', payload.photo.writeEnabled ? 'WRITE' : 'AV', payload.photo);
  console.log('Import:', payload.import.writeEnabled ? 'WRITE' : 'AV', payload.import);
  console.log('Mail:', payload.mail.writeEnabled ? 'WRITE' : 'AV', payload.mail);
  console.log('Next:', payload.recommendedNextWork?.join(' · '));
  console.log('Wrote:', paths.publicPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
