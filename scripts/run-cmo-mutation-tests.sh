#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --test \
  tests/ops/cmoPhaseA.test.js \
  tests/ops/cmoPhaseB.test.js \
  tests/ops/cmoPhaseC.test.js \
  tests/ops/cmoPhaseD.test.js \
  tests/ops/cmoPhaseE.test.js \
  tests/ops/cmoPhaseF.test.js \
  tests/ops/cmoPhaseG.test.js \
  tests/ops/cmoPhaseV2.test.js \
  tests/ops/cmoPhaseV2Connectors.test.js \
  tests/ops/cmoPhaseV2LiveAdapters.test.js \
  tests/ops/cmoPhasePublishPolicy.test.js \
  tests/ops/cmoPhaseContentAssets.test.js \
  tests/capabilities/cmoCapabilityContract.test.js \
  tests/agents/cmoAgentGateway.test.js
