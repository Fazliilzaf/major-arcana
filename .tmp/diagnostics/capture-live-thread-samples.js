#!/usr/bin/env node
/**
 * Local diagnostic: capture live thread samples for mail fidelity regression guard.
 * Invoked manually when comparing foundation vs fallback thread rendering.
 */
const path = require('node:path');

const manifestStub = { suite: 'mail_fidelity_regression_guard' };
const suite = manifestStub.suite;
const OUT_ROOT = path.join(__dirname, 'out');

function buildMarkdownSummary(summary, manifest) {
  const lines = [
    `# ${suite}`,
    '',
    `- accountsChecked: ${summary.accountsChecked}`,
    `- familiesChecked: ${summary.familiesChecked}`,
    `- foundationDrivenCount: ${summary.foundationDrivenCount}`,
    `- fallbackDrivenCount: ${summary.fallbackDrivenCount}`,
    `- overallVerdict: ${summary.overallVerdict}`,
    '',
    JSON.stringify(manifest, null, 2),
  ];
  return lines.join('\n');
}

async function main() {
  const summary = {
    accountsChecked: 0,
    familiesChecked: 0,
    foundationDrivenCount: 0,
    fallbackDrivenCount: 0,
    overallVerdict: 'skipped',
  };
  const manifest = { suite, generatedAt: new Date().toISOString() };
  const markdownPath = path.join(OUT_ROOT, 'summary.md');
  const md = buildMarkdownSummary(summary, manifest);
  // eslint-disable-next-line no-console -- diagnostic
  console.log('Would write', markdownPath, md.slice(0, 80) + '...');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
