const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoTelemetryStore,
  createCcoCollaborationStore,
} = require('../../src/ops/ccoTelemetryStore');

async function tmpFile(prefix, name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return path.join(dir, name);
}

test('telemetry: recordDaily + teamStats shape', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  await store.recordDaily({
    conversations: 10,
    responseMinTotal: 80,
    responseSamples: 10,
    slaMet: 9,
    slaTotal: 10,
    csatSum: 42,
    csatCount: 10,
    upsellSek: 5000,
    latencyP95Ms: 800,
    templates: { welcome: 4, followup: 2 },
  });

  const team = store.teamStats('week');
  assert.equal(team.conversations, 10);
  assert.equal(team.avgResponseMin, 8); // 80/10
  assert.equal(team.slaPct, 90); // 9/10
  assert.equal(team.csatAvg, 4.2); // 42/10
  assert.equal(team.upsellSek, 5000);
  assert.ok('period' in team);
  assert.ok('days' in team);
});

test('telemetry: recordDaily accumulates same-day records', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  const date = new Date().toISOString().slice(0, 10);
  await store.recordDaily({ date, conversations: 5, slaMet: 5, slaTotal: 5 });
  await store.recordDaily({ date, conversations: 3, slaMet: 2, slaTotal: 3 });

  const team = store.teamStats('week');
  assert.equal(team.conversations, 8);
  assert.equal(team.slaPct, 87.5); // 7/8
});

test('telemetry: updateUserStats + userStats shape', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  const result = await store.updateUserStats('agent-1', {
    name: 'Anna',
    conversations: 20,
    responseMinTotal: 100,
    responseSamples: 20,
    slaMet: 18,
    slaTotal: 20,
    csatSum: 90,
    csatCount: 20,
    upsellSek: 12000,
    templates: { welcome: 5 },
  });

  assert.equal(result.userId, 'agent-1');
  assert.equal(result.name, 'Anna');
  assert.equal(result.conversations, 20);
  assert.equal(result.responseMin, 5); // 100/20
  assert.equal(result.slaPct, 90);
  assert.equal(result.csatAvg, 4.5);
  assert.equal(result.upsellSek, 12000);
  assert.ok(typeof result.score === 'number');

  const fetched = store.userStats('agent-1');
  assert.equal(fetched.name, 'Anna');
  assert.equal(store.userStats('does-not-exist'), null);
});

test('telemetry: updateUserStats accumulates across calls', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  await store.updateUserStats('u', { name: 'U', conversations: 5, upsellSek: 1000 });
  const second = await store.updateUserStats('u', { conversations: 3, upsellSek: 500 });
  assert.equal(second.conversations, 8);
  assert.equal(second.upsellSek, 1500);
  assert.equal(second.name, 'U'); // preserved
});

test('telemetry: leaderboard shape and ordering', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  await store.updateUserStats('low', {
    name: 'Low',
    conversations: 2,
    responseMinTotal: 60,
    responseSamples: 2,
    slaMet: 1,
    slaTotal: 2,
    csatSum: 6,
    csatCount: 2,
    upsellSek: 100,
  });
  await store.updateUserStats('high', {
    name: 'High',
    conversations: 50,
    responseMinTotal: 100,
    responseSamples: 50,
    slaMet: 50,
    slaTotal: 50,
    csatSum: 245,
    csatCount: 50,
    upsellSek: 50000,
  });

  const lb = store.leaderboard();
  assert.equal(lb.length, 2);
  // exact field names the export route reads
  for (const item of lb) {
    assert.ok('name' in item);
    assert.ok('score' in item);
    assert.ok('conversations' in item);
    assert.ok('responseMin' in item);
    assert.ok('upsellSek' in item);
  }
  assert.equal(lb[0].name, 'High'); // higher score first
  assert.ok(lb[0].score >= lb[1].score);
});

test('telemetry: topTemplates aggregates from daily and users', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  await store.recordDaily({ conversations: 1, templates: { welcome: 3, bye: 1 } });
  await store.updateUserStats('a', { name: 'A', templates: { welcome: 2 } });

  const tpls = store.topTemplates();
  assert.ok(Array.isArray(tpls));
  const welcome = tpls.find((t) => t.template === 'welcome');
  assert.equal(welcome.uses, 5); // 3 + 2
  assert.equal(tpls[0].template, 'welcome'); // most used first
});

test('telemetry: coachingInsights returns tips array', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });

  // a slow, low-SLA user → should yield warnings
  await store.updateUserStats('slow', {
    name: 'Slow',
    conversations: 10,
    responseMinTotal: 300,
    responseSamples: 10,
    slaMet: 5,
    slaTotal: 10,
    csatSum: 30,
    csatCount: 10,
    upsellSek: 0,
  });

  const tips = store.coachingInsights('slow');
  assert.ok(Array.isArray(tips));
  assert.ok(tips.length >= 1);
  assert.ok(tips.every((t) => 'message' in t && 'severity' in t));

  // empty store still returns a positive baseline tip
  const empty = await createCcoTelemetryStore({
    filePath: await tmpFile('arcana-cco-telemetry-', 't.json'),
  });
  const baseline = empty.coachingInsights();
  assert.ok(baseline.length >= 1);
});

test('telemetry: liveMetrics is async and tolerates null bookingCaseStore', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath, bookingCaseStore: null });

  await store.recordDaily({
    conversations: 10,
    slaMet: 9,
    slaTotal: 10,
    csatSum: 40,
    csatCount: 10,
    latencyP95Ms: 500,
    openIncidents: 1,
  });

  const live = await store.liveMetrics();
  assert.ok('readiness' in live);
  assert.ok('latencyP95Ms' in live);
  assert.ok('openIncidents' in live);
  assert.ok('riskLäge' in live);
  assert.equal(live.openCases, 0);
});

test('telemetry: liveMetrics consults bookingCaseStore when present', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const bookingCaseStore = {
    async countOpen() {
      return 3;
    },
  };
  const store = await createCcoTelemetryStore({ filePath, bookingCaseStore });
  const live = await store.liveMetrics();
  assert.equal(live.openCases, 3);
  assert.ok(live.openIncidents >= 3);
});

test('telemetry: persistence across instances', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store1 = await createCcoTelemetryStore({ filePath });
  await store1.recordDaily({ conversations: 7, slaMet: 7, slaTotal: 7 });
  await store1.updateUserStats('p', { name: 'P', conversations: 4, upsellSek: 999 });

  const store2 = await createCcoTelemetryStore({ filePath });
  assert.equal(store2.teamStats('week').conversations, 7);
  assert.equal(store2.userStats('p').conversations, 4);
});

test('telemetry: auditLog is invoked when provided', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const calls = [];
  const auditLog = { append: (e) => calls.push(e) };
  const store = await createCcoTelemetryStore({ filePath, auditLog });
  await store.recordDaily({ conversations: 1 });
  await store.updateUserStats('x', { name: 'X', conversations: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].action, 'cco.telemetry.daily');
});

test('telemetry: updateUserStats requires userId', async () => {
  const filePath = await tmpFile('arcana-cco-telemetry-', 'telemetry.json');
  const store = await createCcoTelemetryStore({ filePath });
  await assert.rejects(
    () => store.updateUserStats('', {}),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

// ── Collaboration ───────────────────────────────────────────────
test('collaboration: presence heartbeat + activePresence', async () => {
  const filePath = await tmpFile('arcana-cco-collab-', 'collab.json');
  const store = await createCcoCollaborationStore({ filePath });

  await store.heartbeat('res-1', 'alice', 'owner');
  await store.heartbeat('res-1', 'bob', 'agent');
  const active = store.activePresence('res-1');
  assert.equal(active.length, 2);
  assert.ok(active.some((p) => p.userId === 'alice'));

  // re-heartbeat dedups
  await store.heartbeat('res-1', 'alice', 'owner');
  assert.equal(store.activePresence('res-1').length, 2);
});

test('collaboration: lock acquire/release and conflict', async () => {
  const filePath = await tmpFile('arcana-cco-collab-', 'collab.json');
  const store = await createCcoCollaborationStore({ filePath });

  const lock = await store.acquireLock('res-1', 'node-a', 'alice', 'owner');
  assert.equal(lock.ok, true);
  assert.equal(store.activeLocks('res-1').length, 1);

  // same user re-acquire is fine
  await store.acquireLock('res-1', 'node-a', 'alice', 'owner');

  // different user conflicts
  await assert.rejects(
    () => store.acquireLock('res-1', 'node-a', 'bob', 'agent'),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.lockedBy, 'alice');
      return true;
    }
  );

  await store.releaseLock('res-1', 'node-a', 'alice');
  assert.equal(store.activeLocks('res-1').length, 0);
});

test('collaboration: comments + mentions + resolve + persistence', async () => {
  const filePath = await tmpFile('arcana-cco-collab-', 'collab.json');
  const store = await createCcoCollaborationStore({ filePath });

  const c = await store.postComment('res-1', 'Hej @bob kolla detta', 'alice', 'owner', 'node-a');
  assert.ok(c.commentId);
  assert.deepEqual(c.mentions, ['bob']);
  assert.equal(c.resolved, false);

  const list = store.listComments('res-1');
  assert.equal(list.length, 1);

  const resolved = await store.resolveComment('res-1', c.commentId, 'alice');
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.resolvedBy, 'alice');

  // persistence
  const store2 = await createCcoCollaborationStore({ filePath });
  assert.equal(store2.listComments('res-1')[0].resolved, true);
});

test('collaboration: empty body rejected', async () => {
  const filePath = await tmpFile('arcana-cco-collab-', 'collab.json');
  const store = await createCcoCollaborationStore({ filePath });
  await assert.rejects(
    () => store.postComment('res-1', '   ', 'alice'),
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});
