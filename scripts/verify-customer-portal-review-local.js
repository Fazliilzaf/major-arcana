#!/usr/bin/env node
/**
 * K39 one-command local review for customer portal/offert.
 * Runs link sanity first, then responsive mobile/iPad/desktop QA.
 */
const { spawn } = require('node:child_process');

const steps = [
  {
    label: 'K38 local link sanity',
    command: 'npm',
    args: ['run', 'verify:customer-portal-local-links'],
  },
  {
    label: 'K36 responsive QA',
    command: 'npm',
    args: ['run', 'verify:customer-portal-responsive-local'],
  },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${step.label} ==`);
    const child = spawn(step.command, step.args, {
      env: process.env,
      shell: false,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step.label} failed with exit code ${code}`));
    });
  });
}

async function main() {
  for (const step of steps) {
    await runStep(step);
  }
  console.log('\nK39 customer portal local review: PASS');
  console.log('- Open: http://127.0.0.1:3100/customer-quote.html');
  console.log(
    '- Preview: http://127.0.0.1:3100/major-arcana-preview/cco-patient-offer-portal-v3.html'
  );
  console.log('- Staff: http://127.0.0.1:3100/staff?view=customers');
}

main().catch((error) => {
  console.error(`\nFAIL customer portal local review: ${error.message || error}`);
  process.exit(1);
});
