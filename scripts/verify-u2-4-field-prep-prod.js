#!/usr/bin/env node
'use strict';

/**
 * U2.4 fältprep — kedjar prod-verify innan fysisk iPhone/Android-test.
 * Se docs/ops/runbooks/u2-4-staff-field-login-checklist.md
 */
require('dotenv').config({ quiet: true });

const { execSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const checklist = 'docs/ops/runbooks/u2-4-staff-field-login-checklist.md';

const steps = [
  { name: 'U2.4-01 staff-mobile-login', cmd: 'npm run verify:staff-mobile-login-prod' },
  { name: 'U2.4-02 staff-ui', cmd: 'npm run verify:staff-ui-prod' },
  { name: 'U2.4-03 booking-engine-policy', cmd: 'npm run verify:booking-engine-policy-prod' },
  { name: 'U2.4-04 cco-mobile-pilot', cmd: 'npm run verify:cco-mobile-pilot-prod' },
];

function main() {
  console.log('U2.4 field prep verify (automation before physical device)\n');
  console.log(`Checklist: ${checklist}\n`);

  let hardFail = false;
  for (const step of steps) {
    console.log(`--- ${step.name} ---`);
    try {
      execSync(step.cmd, { cwd: root, stdio: 'inherit', env: process.env });
      console.log(`PASS ${step.name}\n`);
    } catch (error) {
      console.error(`FAIL ${step.name}\n`);
      hardFail = true;
      break;
    }
  }

  if (hardFail) {
    console.error('U2.4 field prep: FAIL — fix automation before physical field test.');
    process.exit(1);
  }

  console.log('U2.4 field prep: PASS');
  console.log('Next: complete physical checklist in docs/ops/runbooks/u2-4-staff-field-login-checklist.md');
  process.exit(0);
}

main();
