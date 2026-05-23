'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const scriptPath = path.join(repoRoot, 'scripts/run-cmo-mutation-shard.js');
const configPath = path.join(repoRoot, 'stryker.cmo.conf.json');

test('run-cmo-mutation-shard.js exists and stryker.cmo.conf.json is valid JSON', () => {
  assert.equal(fs.existsSync(scriptPath), true);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(config.concurrency, 4);
  assert.equal(config.incremental, true);
});

test('stryker CMO mutate list is fully covered by gate/store/agent shards', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const shardScript = fs.readFileSync(scriptPath, 'utf8');
  const shardFiles = [...shardScript.matchAll(/'(src\/[^']+\.js)'/g)].map((m) => m[1]);
  const uniqueShardFiles = [...new Set(shardFiles)].sort();
  const mutateFiles = [...config.mutate].sort();
  assert.deepEqual(uniqueShardFiles, mutateFiles);
});
