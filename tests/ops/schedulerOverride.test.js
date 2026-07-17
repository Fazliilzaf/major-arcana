'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { applySchedulerOverride, resolveOverridePath } = require('../../src/ops/schedulerOverride');

const silent = { warn() {}, error() {} };

function tmpPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sched-ovr-')), name);
}

test('ingen fil → ingen ändring', () => {
  const cfg = { schedulerEnabled: false, schedulerJobsAllowlist: ['a'] };
  const res = applySchedulerOverride(cfg, {
    env: { ARCANA_SCHEDULER_OVERRIDE_PATH: tmpPath('saknas.json') },
    logger: silent,
  });
  assert.equal(res.applied, false);
  assert.equal(cfg.schedulerEnabled, false);
  assert.deepEqual(cfg.schedulerJobsAllowlist, ['a']);
});

test('giltig fil vinner över env-config', () => {
  const p = tmpPath('override.json');
  fs.writeFileSync(p, JSON.stringify({ schedulerEnabled: true, schedulerJobs: '' }));
  const cfg = { schedulerEnabled: false, schedulerJobsAllowlist: ['alert_probe'] };
  const res = applySchedulerOverride(cfg, {
    env: { ARCANA_SCHEDULER_OVERRIDE_PATH: p },
    logger: silent,
  });
  assert.equal(res.applied, true);
  assert.equal(cfg.schedulerEnabled, true);
  assert.deepEqual(cfg.schedulerJobsAllowlist, []);
});

test('jobs-sträng splittras och trimmas', () => {
  const p = tmpPath('override.json');
  fs.writeFileSync(p, JSON.stringify({ schedulerJobs: ' alert_probe , backup_prune ' }));
  const cfg = { schedulerJobsAllowlist: [] };
  applySchedulerOverride(cfg, { env: { ARCANA_SCHEDULER_OVERRIDE_PATH: p }, logger: silent });
  assert.deepEqual(cfg.schedulerJobsAllowlist, ['alert_probe', 'backup_prune']);
});

test('ogiltig JSON ignoreras utan att röra config', () => {
  const p = tmpPath('trasig.json');
  fs.writeFileSync(p, '{trasig');
  const cfg = { schedulerEnabled: false };
  const res = applySchedulerOverride(cfg, {
    env: { ARCANA_SCHEDULER_OVERRIDE_PATH: p },
    logger: silent,
  });
  assert.equal(res.applied, false);
  assert.equal(res.error, 'invalid_json');
  assert.equal(cfg.schedulerEnabled, false);
});

test('okända/feltypade nycklar ignoreras', () => {
  const p = tmpPath('override.json');
  fs.writeFileSync(p, JSON.stringify({ schedulerEnabled: 'ja', foo: 1 }));
  const cfg = { schedulerEnabled: false };
  const res = applySchedulerOverride(cfg, {
    env: { ARCANA_SCHEDULER_OVERRIDE_PATH: p },
    logger: silent,
  });
  assert.equal(res.applied, false);
  assert.equal(cfg.schedulerEnabled, false);
});

test('resolveOverridePath: env-path vinner, annars STATE_ROOT', () => {
  assert.equal(
    resolveOverridePath({ ARCANA_SCHEDULER_OVERRIDE_PATH: '/x/y.json' }),
    '/x/y.json'
  );
  assert.equal(
    resolveOverridePath({ ARCANA_STATE_ROOT: '/data' }),
    path.join('/data', 'scheduler-override.json')
  );
});
