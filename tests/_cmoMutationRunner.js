'use strict';

const { spawnSync } = require('node:child_process');

const files = [
  'tests/ops/cmoPhaseA.test.js',
  'tests/ops/cmoPhaseB.test.js',
  'tests/ops/cmoPhaseC.test.js',
  'tests/ops/cmoPhaseD.test.js',
  'tests/ops/cmoPhaseE.test.js',
  'tests/ops/cmoPhaseF.test.js',
  'tests/ops/cmoPhaseG.test.js',
  'tests/ops/cmoPhaseV2.test.js',
  'tests/ops/cmoPhaseV2Connectors.test.js',
  'tests/ops/cmoPhaseV2LiveAdapters.test.js',
  'tests/ops/cmoPhasePublishPolicy.test.js',
  'tests/ops/cmoPhaseContentAssets.test.js',
  'tests/ops/cmoMutationHardening.test.js',
  'tests/ops/cmoStoreIntegration.test.js',
  'tests/ops/cmoStoreMutationEdge.test.js',
  'tests/capabilities/cmoCapabilityContract.test.js',
  'tests/agents/cmoAgentGateway.test.js',
  'tests/agents/cmoCopilotComposeHelpers.test.js',
];

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(typeof result.status === 'number' ? result.status : 1);
