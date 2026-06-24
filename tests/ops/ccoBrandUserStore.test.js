const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoBrandStore,
  createCcoUserStore,
  createCcoNotificationStore,
  createCronScheduler,
} = require('../../src/ops/ccoBrandUserStore');

async function tmpFile(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `arcana-${prefix}-`));
  return path.join(dir, `${prefix}.json`);
}

test('brand store: upsert/get/list/remove + persistence', async () => {
  const filePath = await tmpFile('cco-brands');

  const store = await createCcoBrandStore({ filePath });
  assert.deepEqual(store.list(), []);
  assert.equal(store.get('tenant-a'), null);

  const created = await store.upsert(
    'tenant-a',
    { name: 'Klinik A', primaryColor: '#123', locations: [{ id: 'loc1', city: 'Stockholm' }] },
    { role: 'owner', userId: 'u1' }
  );
  assert.equal(created.tenantId, 'tenant-a');
  assert.equal(created.name, 'Klinik A');
  assert.equal(created.locations.length, 1);
  assert.ok(created.createdAt);

  // update merges
  const updated = await store.upsert('tenant-a', { phone: '08-123' }, { role: 'owner' });
  assert.equal(updated.phone, '08-123');
  assert.equal(updated.name, 'Klinik A');
  assert.equal(updated.createdAt, created.createdAt);

  const fetched = store.get('tenant-a');
  assert.equal(fetched.phone, '08-123');

  await store.upsert('tenant-b', { name: 'Klinik B' });
  assert.equal(store.list().length, 2);

  // persistence: reload from disk
  const reloaded = await createCcoBrandStore({ filePath });
  assert.equal(reloaded.list().length, 2);
  assert.equal(reloaded.get('tenant-a').phone, '08-123');

  const removed = await store.remove('tenant-b', { role: 'owner' });
  assert.equal(removed.ok, true);
  assert.equal(store.list().length, 1);
  await assert.rejects(
    () => store.remove('missing'),
    (e) => e.statusCode === 400
  );
  await assert.rejects(
    () => store.upsert(''),
    (e) => e.statusCode === 400
  );
});

test('user store: upsert/get/list', async () => {
  const filePath = await tmpFile('cco-users');
  const store = await createCcoUserStore({ filePath });

  const u = await store.upsert(
    'user-1',
    { displayName: 'Anna', email: 'anna@x.se', signature: 'Mvh Anna', prefs: { theme: 'dark' } },
    { role: 'owner' }
  );
  assert.equal(u.userId, 'user-1');
  assert.equal(u.signature, 'Mvh Anna');
  assert.equal(u.prefs.theme, 'dark');

  const merged = await store.upsert('user-1', { prefs: { lang: 'sv' } });
  assert.equal(merged.prefs.theme, 'dark');
  assert.equal(merged.prefs.lang, 'sv');
  assert.equal(merged.signature, 'Mvh Anna');

  assert.equal(store.get('user-1').email, 'anna@x.se');
  assert.equal(store.get('nope'), null);
  assert.equal(store.list().length, 1);

  const reloaded = await createCcoUserStore({ filePath });
  assert.equal(reloaded.get('user-1').displayName, 'Anna');

  await assert.rejects(
    () => store.upsert(''),
    (e) => e.statusCode === 400
  );
});

test('notification store: cron jobs upsert/list/markCronRan', async () => {
  const filePath = await tmpFile('cco-notifications');
  const store = await createCcoNotificationStore({ filePath });

  assert.deepEqual(store.listCronJobs(), []);

  const job = await store.upsertCronJob(
    { name: 'daily-digest', schedule: '0 8 * * *', trigger: 'digest' },
    { role: 'owner' }
  );
  assert.ok(job.id);
  assert.equal(job.enabled, true);
  assert.equal(store.listCronJobs().length, 1);

  const upd = await store.upsertCronJob({
    id: job.id,
    name: 'daily-digest',
    schedule: '0 9 * * *',
    enabled: false,
  });
  assert.equal(upd.schedule, '0 9 * * *');
  assert.equal(upd.enabled, false);
  assert.equal(store.listCronJobs().length, 1);

  const ran = await store.markCronRan(job.id, { ok: true, manual: true, dispatched: 3 });
  assert.ok(ran.lastRanAt);
  assert.equal(ran.lastResult.dispatched, 3);
  assert.equal(ran.lastResult.manual, true);

  await assert.rejects(
    () => store.markCronRan('missing'),
    (e) => e.statusCode === 400
  );
  await assert.rejects(
    () => store.upsertCronJob({ name: 'x' }),
    (e) => e.statusCode === 400
  );
});

test('notification store: push subscribe/list/unsubscribe', async () => {
  const filePath = await tmpFile('cco-notifications');
  const store = await createCcoNotificationStore({ filePath });

  assert.deepEqual(store.listPushSubscriptions(), []);

  const sub = await store.subscribePush(
    { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } },
    'user-1',
    { role: 'owner' }
  );
  assert.equal(sub.endpoint, 'https://push.example/abc');
  assert.equal(sub.userId, 'user-1');

  await store.subscribePush({ endpoint: 'https://push.example/def' }, 'user-2');
  assert.equal(store.listPushSubscriptions().length, 2);
  assert.equal(store.listPushSubscriptions('user-1').length, 1);

  // re-subscribe same endpoint = update, not duplicate
  await store.subscribePush({ endpoint: 'https://push.example/abc' }, 'user-1');
  assert.equal(store.listPushSubscriptions().length, 2);

  const removed = await store.unsubscribePush('https://push.example/abc', { role: 'owner' });
  assert.equal(removed.ok, true);
  assert.equal(store.listPushSubscriptions().length, 1);

  await assert.rejects(
    () => store.unsubscribePush('missing'),
    (e) => e.statusCode === 400
  );
  await assert.rejects(
    () => store.subscribePush({}, 'u'),
    (e) => e.statusCode === 400
  );
});

test('notification store: smsConfig get/update + sentLog + persistence', async () => {
  const filePath = await tmpFile('cco-notifications');
  const store = await createCcoNotificationStore({ filePath });

  const cfg = store.smsConfig();
  assert.equal(cfg.enabled, false);

  const updated = await store.updateSmsConfig({
    enabled: true,
    provider: '46elks',
    senderId: 'KLINIK',
  });
  assert.equal(updated.enabled, true);
  assert.equal(updated.provider, '46elks');
  assert.equal(store.smsConfig().senderId, 'KLINIK');

  await store.recordSent({ channel: 'sms', target: '+46700000000', templateId: 'reminder_24h_v1' });
  assert.equal(store.sentLog().length, 1);
  assert.equal(store.sentLog(1)[0].channel, 'sms');

  const reloaded = await createCcoNotificationStore({ filePath });
  assert.equal(reloaded.smsConfig().provider, '46elks');
  assert.equal(reloaded.sentLog().length, 1);
});

test('cron scheduler: runJob default + start/stop + tick drives markCronRan', async () => {
  const filePath = await tmpFile('cco-notifications');
  const store = await createCcoNotificationStore({ filePath });
  const job = await store.upsertCronJob({ name: 'j', schedule: '* * * * *', trigger: 't' });

  const scheduler = createCronScheduler({ notificationStore: store, intervalMs: 1000 });

  // default runJob returns spreadable object
  const result = await scheduler.runJob(job);
  assert.equal(typeof result, 'object');
  assert.equal(result.dryRun, true);

  // mimic route manual-trigger path
  await store.markCronRan(job.id, { ok: true, manual: true, ...result });
  assert.equal(store.listCronJobs()[0].lastResult.dryRun, true);

  // tick drives enabled jobs
  await scheduler.tick();
  assert.ok(store.listCronJobs()[0].lastRanAt);

  scheduler.start();
  assert.equal(scheduler.isRunning(), true);
  scheduler.start(); // idempotent
  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);

  // custom runJob injection
  const sched2 = createCronScheduler({
    notificationStore: store,
    runJob: async () => ({ dispatched: 7 }),
  });
  const r2 = await sched2.runJob(job);
  assert.equal(r2.dispatched, 7);
});
