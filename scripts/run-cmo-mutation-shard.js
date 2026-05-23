'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** @type {Record<string, { mutate: string[], incrementalFile: string, reportFile: string }>} */
const SHARDS = {
  gate: {
    mutate: [
      'src/ops/cmoOrchestrationGate.js',
      'src/ops/cmoComplianceGate.js',
      'src/ops/cmoMarketingMetrics.js',
    ],
    incrementalFile: 'reports/stryker/cmo-incremental-gate.json',
    reportFile: 'reports/stryker/cmo-mutation-gate.html',
  },
  store: {
    mutate: [
      'src/ops/cmoPublishPolicy.js',
      'src/ops/cmoPublishConnectors.js',
      'src/ops/marketingCampaignDraftsStore.js',
      'src/ops/marketingContentAssetsStore.js',
    ],
    incrementalFile: 'reports/stryker/cmo-incremental-store.json',
    reportFile: 'reports/stryker/cmo-mutation-store.html',
  },
  agent: {
    mutate: [
      'src/agents/cmoContentAgent.js',
      'src/agents/cmoCopilotComposeHelpers.js',
      'src/capabilities/generateContentSeries.js',
    ],
    incrementalFile: 'reports/stryker/cmo-incremental-agent.json',
    reportFile: 'reports/stryker/cmo-mutation-agent.html',
  },
};

const shardName = process.argv[2] || process.env.CMO_MUTATION_SHARD;
const shard = shardName ? SHARDS[shardName] : null;

if (!shard) {
  console.error(
    'Usage: node scripts/run-cmo-mutation-shard.js <gate|store|agent>',
  );
  process.exit(2);
}

const basePath = path.join(process.cwd(), 'stryker.cmo.conf.json');
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const ciMode = process.env.STRYKER_CI === '1' || process.env.STRYKER_CI === 'true';

const config = {
  ...base,
  mutate: shard.mutate,
  incremental: true,
  incrementalFile: shard.incrementalFile,
  concurrency: Number(process.env.STRYKER_CONCURRENCY || base.concurrency || 4),
  htmlReporter: {
    fileName: shard.reportFile,
  },
  reporters: ciMode ? ['progress', 'clear-text'] : base.reporters,
};

const tmpDir = path.join(process.cwd(), '.stryker-tmp');
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(path.dirname(shard.incrementalFile), { recursive: true });

const configPath = path.join(tmpDir, `stryker.cmo.${shardName}.json`);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`[cmo-mutation] shard=${shardName} mutators=${shard.mutate.length} files`);

const result = spawnSync('npx', ['stryker', 'run', configPath], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

process.exit(typeof result.status === 'number' ? result.status : 1);
