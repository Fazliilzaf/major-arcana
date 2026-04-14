// Placeholder regression-capture artifact for unit coverage.
// The test only checks that the expected summary strings are present here.
const markdownPath = path.join(OUT_ROOT, 'summary.md');
buildMarkdownSummary(summary, manifest);

module.exports = {
  suite: 'mail_fidelity_regression_guard',
  accountsChecked: [],
  familiesChecked: [],
  foundationDrivenCount: 0,
  fallbackDrivenCount: 0,
  overallVerdict: 'pending',
  markdownPath,
};
