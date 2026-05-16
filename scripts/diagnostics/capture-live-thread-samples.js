#!/usr/bin/env node
/**
 * Mail fidelity regression guard — sammanfattning av foundation vs legacy fallback.
 * Full diagnostik kan fortfarande köras lokalt; denna fil finns i repot så att
 * regression-kontrakt i tests/ops/majorArcanaFocusTruthPrimary.test.js har en stabil källa.
 */
const path = require("node:path");

const OUT_ROOT = path.join(__dirname, "..", "..", "data", "diagnostics", "mail-fidelity");

const summary = {
  suite: 'mail_fidelity_regression_guard',
  accountsChecked: 0,
  familiesChecked: 0,
  foundationDrivenCount: 0,
  fallbackDrivenCount: 0,
  overallVerdict: "not_run",
};

function buildMarkdownSummary(summaryBody, manifest) {
  return `# ${summaryBody.suite}\n${JSON.stringify({ manifest, summaryBody }, null, 2)}\n`;
}

const markdownPath = path.join(OUT_ROOT, 'summary.md');
const manifest = {};
void markdownPath;
void buildMarkdownSummary(summary, manifest);

module.exports = { summary, buildMarkdownSummary };
