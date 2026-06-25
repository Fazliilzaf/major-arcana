#!/usr/bin/env node
'use strict';

/**
 * Read-only counts + write/canary readiness for Import Review queue.
 * stdout: single JSON line (counts only — no patient data)
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const { collectImportReviewQueueStatus } = require('./lib/ccoImportReviewQueueSnapshot');

delete require.cache[require.resolve('../src/config.js')];
const { config } = require('../src/config.js');
const { loadState, getTrackSummary } = require('../src/ops/ccoOperatorCanary');

function main() {
  const snapshot = collectImportReviewQueueStatus({ root: REPO });
  const { state } = loadState(REPO);
  const canary = getTrackSummary(state, 'import', config.importReviewCanaryMax);
  const writeEnabled = config.enableImportReviewWrite === true;

  const payload = {
    ...snapshot,
    writeEnabled,
    readOnly: !writeEnabled,
    canaryMode: writeEnabled,
    canaryMaxDecisions: config.importReviewCanaryMax,
    canaryDecisionsUsed: canary.decisionsUsed,
    canaryDecisionsRemaining: canary.decisionsRemaining,
    canaryLimitReached: canary.limitReached,
    autoImport: false,
    newCustomerAllowed: false,
    operatorToolPath: '/cco-import-review.html',
    activation: writeEnabled
      ? 'CANARY_PÅ — granska via /cco-import-review.html (max 25 beslut/batch, stark match only)'
      : 'Sätt ENABLE_CCO_OPERATOR_CANARY + ENABLE_IMPORT_REVIEW_WRITE på Render',
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
