'use strict';

/**
 * Commitlint — conventional commits + projektspecifika scopes.
 *
 * Format: type(scope): subject
 * Exempel:
 *   feat(cco-i18n-a11y): I1-I3 + A1 — i18n-runtime + a11y modules
 *   fix(deps): refresha package-lock.json
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // Ny funktion
        'fix',      // Buggfix
        'docs',     // Endast dokumentation
        'style',    // Formatering, ej kod-logik
        'refactor', // Kod-refactor utan bug/feat
        'perf',     // Prestanda
        'test',     // Testar
        'build',    // Build-system / dependencies
        'ci',       // CI-config
        'chore',    // Underhåll, scripts
        'revert',   // Återställ commit
      ],
    ],
    'subject-case': [0],
    'subject-max-length': [2, 'always', 100],
    'header-max-length': [2, 'always', 120],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
