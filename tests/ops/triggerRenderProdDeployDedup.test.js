'use strict';

/* Regression: på push till main skapade BÅDE Render auto-deploy (autoDeployTrigger:
 * commit) OCH heal-workflowens trigger-steg varsin deploy för samma commit → tjänsten
 * cyklade instanser en extra gång → transient 502-fönster mitt i verifieringen (steg
 * "Verify prod version" rödmarkerade en frisk deploy). Trigger-scriptet ska nu hoppa
 * dubbeltriggern när en deploy för committen redan finns i aktivt/live-läge, men
 * fortfarande trigga som fallback när ingen deploy finns (tappad GitHub→Render-koppling).
 * Testet låser den urskiljningen. */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACTIVE_DEPLOY_STATUSES,
  commitMatches,
  findActiveDeployForCommit,
} = require('../../scripts/trigger-render-prod-deploy.js');

const SHA = 'abc1234def5678000000000000000000000000aa';

function stubFetch(deploys, { ok = true, status = 200 } = {}) {
  return async () => ({
    ok,
    status,
    json: async () => deploys,
  });
}

test('commitMatches matchar på 7-teckens kortform (full sha mot mål)', () => {
  assert.equal(commitMatches(SHA, SHA), true);
  assert.equal(commitMatches(SHA, 'abc1234'), true);
  assert.equal(commitMatches('abc1234def', 'abc1234xxxx'), true); // kortform matchar
  assert.equal(commitMatches('zzz9999', SHA), false);
  assert.equal(commitMatches('', SHA), false);
  assert.equal(commitMatches(SHA, ''), false);
});

test('aktiva/live-status skippar dubbeltrigger; terminala gör det inte', async () => {
  const original = global.fetch;
  try {
    for (const status of ['created', 'queued', 'build_in_progress', 'update_in_progress', 'live']) {
      assert.ok(ACTIVE_DEPLOY_STATUSES.has(status), `${status} ska räknas som aktiv`);
      global.fetch = stubFetch([{ deploy: { id: 'dep-1', commit: { id: SHA }, status } }]);
      const found = await findActiveDeployForCommit('key', SHA);
      assert.ok(found, `ska hitta aktiv deploy i status ${status}`);
      assert.equal(found.id, 'dep-1');
    }

    // Terminala statusar (misslyckad/avbruten) → INTE aktiv → trigga fallback.
    for (const status of ['build_failed', 'update_failed', 'canceled', 'deactivated']) {
      global.fetch = stubFetch([{ deploy: { id: 'dep-x', commit: { id: SHA }, status } }]);
      const found = await findActiveDeployForCommit('key', SHA);
      assert.equal(found, null, `terminal status ${status} ska INTE räknas som aktiv`);
    }
  } finally {
    global.fetch = original;
  }
});

test('annan commit → ingen skip (trigga fallback)', async () => {
  const original = global.fetch;
  try {
    global.fetch = stubFetch([
      { deploy: { id: 'dep-2', commit: { id: 'ffffffffffffffffffffffffffffffffffffffff' }, status: 'live' } },
    ]);
    const found = await findActiveDeployForCommit('key', SHA);
    assert.equal(found, null);
  } finally {
    global.fetch = original;
  }
});

test('list-API-fel → returnerar null (våga inte anta; anroparen triggar som vanligt)', async () => {
  const original = global.fetch;
  try {
    global.fetch = stubFetch([], { ok: false, status: 500 });
    const found = await findActiveDeployForCommit('key', SHA);
    assert.equal(found, null);
  } finally {
    global.fetch = original;
  }
});

test('tom commit → null (kan inte matcha)', async () => {
  const found = await findActiveDeployForCommit('key', '');
  assert.equal(found, null);
});
