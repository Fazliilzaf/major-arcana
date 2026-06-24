const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoNotificationFeedStore,
  NOTIFICATION_TYPES,
} = require('../../src/ops/ccoNotificationFeedStore');
const { createCcoNotificationReadStore } = require('../../src/ops/ccoNotificationReadStore');

function recentIso(hoursAgo = 1) {
  return new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
}

function buildSources() {
  // Fasta tidsstämplar så att deterministiska feed-id:n är stabila mellan anrop.
  const t1 = recentIso(1);
  const t2 = recentIso(2);
  const t3 = recentIso(3);
  const t4 = recentIso(4);
  return {
    bookingCaseStore: {
      list: () => [
        {
          id: 'bc-1',
          state: 'blocked',
          customerName: 'Anna',
          customerId: 'anna@e.com',
          updatedAt: t2,
        },
      ],
    },
    complianceScanStore: {
      getActiveFlags: () => ({
        scannedAt: t1,
        flags: [
          {
            id: 'flag-1',
            code: 'TPL_OUTDATED',
            message: 'Mall föråldrad',
            severity: 'warning',
            at: t1,
          },
        ],
      }),
    },
    idVerificationStore: {
      getStatus: (cid) => (cid === 'anna@e.com' ? { status: 'pending', updatedAt: t3 } : null),
    },
    agreementStore: {
      listForCustomer: (cid) =>
        cid === 'anna@e.com'
          ? [{ id: 'ag-1', status: 'sent', title: 'Behandlingsavtal', updatedAt: t4 }]
          : [],
    },
    journalStore: {
      listAllEntries: async () => [
        { id: 'j-1', subject: 'Nytt mail', preview: 'Hej', at: t1, customerId: 'anna@e.com' },
      ],
    },
  };
}

test('NOTIFICATION_TYPES is exported as an array of expected types', () => {
  assert.ok(Array.isArray(NOTIFICATION_TYPES));
  assert.ok(NOTIFICATION_TYPES.length > 0);
  for (const t of ['booking', 'compliance', 'mail', 'system']) {
    assert.ok(NOTIFICATION_TYPES.includes(t), `förväntade typ ${t}`);
  }
});

test('getFeed returns a unified, shaped, time-filtered feed', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-feed-'));
  const filePath = path.join(tempDir, 'cco-notification-reads.json');
  try {
    const readStore = await createCcoNotificationReadStore({ filePath });
    const feedStore = createCcoNotificationFeedStore({ ...buildSources(), readStore });

    const result = await feedStore.getFeed({
      role: 'owner',
      userId: 'owner',
      sinceHours: 72,
      limit: 100,
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });

    assert.equal(typeof result.count, 'number');
    assert.equal(result.count, result.items.length);
    assert.ok(result.total >= result.count);
    assert.equal(typeof result.unread, 'number');
    assert.ok(result.byType && typeof result.byType === 'object');
    assert.ok(result.items.length >= 5, 'förväntade items från alla källor');

    for (const item of result.items) {
      assert.ok(item.id, 'item ska ha id');
      assert.ok(NOTIFICATION_TYPES.includes(item.type), `okänd typ: ${item.type}`);
      assert.equal(typeof item.read, 'boolean');
      assert.ok(item.createdAt);
    }

    // alla olästa initialt
    assert.equal(result.unread, result.count);

    // sorterad nyast först
    for (let i = 1; i < result.items.length; i += 1) {
      assert.ok(result.items[i - 1].createdAt >= result.items[i].createdAt);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('getFeed honours sinceHours window', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-window-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const readStore = await createCcoNotificationReadStore({ filePath });
    const feedStore = createCcoNotificationFeedStore({
      journalStore: {
        listAllEntries: async () => [
          { id: 'old', subject: 'Gammalt', at: recentIso(200) },
          { id: 'new', subject: 'Färskt', at: recentIso(1) },
        ],
      },
      readStore,
    });
    const result = await feedStore.getFeed({ userId: 'u', sinceHours: 72 });
    assert.equal(result.count, 1);
    assert.equal(result.items[0].title, 'Färskt');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('markRead -> stats reflects read state and feed shows read=true', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-read-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const readStore = await createCcoNotificationReadStore({ filePath });
    const feedStore = createCcoNotificationFeedStore({ ...buildSources(), readStore });

    const before = await feedStore.getFeed({
      userId: 'owner',
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });
    const targetId = before.items[0].id;

    const markRes = await readStore.markRead('owner', [targetId]);
    assert.equal(markRes.marked, 1);
    assert.equal(markRes.markedNow, 1);
    assert.equal(markRes.totalRead, 1);

    const stats = readStore.stats();
    assert.equal(stats.users, 1);
    assert.equal(stats.totalReads, 1);
    assert.equal(stats.byUser.owner, 1);

    const after = await feedStore.getFeed({
      userId: 'owner',
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });
    const target = after.items.find((it) => it.id === targetId);
    assert.equal(target.read, true);
    assert.equal(after.unread, after.count - 1);

    // läsning för annan användare påverkas ej
    const other = await feedStore.getFeed({
      userId: 'someone-else',
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });
    assert.equal(other.unread, other.count);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('markAllRead marks every supplied id', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-all-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const readStore = await createCcoNotificationReadStore({ filePath });
    const feedStore = createCcoNotificationFeedStore({ ...buildSources(), readStore });

    const feed = await feedStore.getFeed({
      userId: 'owner',
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });
    const ids = feed.items.map((it) => it.id);

    const res = await readStore.markAllRead('owner', ids);
    assert.equal(res.all, true);
    assert.equal(res.marked, ids.length);

    const after = await feedStore.getFeed({
      userId: 'owner',
      customerEvalResults: [{ customerId: 'anna@e.com' }],
    });
    assert.equal(after.unread, 0);
    assert.ok(after.items.every((it) => it.read === true));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('read store persists across instances (atomic JSON)', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-persist-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const first = await createCcoNotificationReadStore({ filePath });
    await first.markRead('owner', ['booking_abc', 'mail_def']);

    const reloaded = await createCcoNotificationReadStore({ filePath });
    const stats = reloaded.stats();
    assert.equal(stats.byUser.owner, 2);
    assert.equal(reloaded.isRead('owner', 'booking_abc'), true);
    assert.equal(reloaded.isRead('owner', 'nope'), false);

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.ok(raw.reads.owner);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('markRead rejects blank userId and empty ids', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-reject-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const store = await createCcoNotificationReadStore({ filePath });
    await assert.rejects(() => store.markRead('   ', ['x']), /userId krävs/);
    await assert.rejects(() => store.markRead('owner', []), /notificationIds/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('createCcoNotificationReadStore rejects blank filePath', async () => {
  await assert.rejects(() => createCcoNotificationReadStore({ filePath: '   ' }), /filePath krävs/);
});

test('getFeed includes audit append when auditLog supplied', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-notif-audit-'));
  const filePath = path.join(tempDir, 'reads.json');
  try {
    const appended = [];
    const auditLog = { append: (e) => appended.push(e) };
    const readStore = await createCcoNotificationReadStore({ filePath, auditLog });
    const feedStore = createCcoNotificationFeedStore({ ...buildSources(), readStore, auditLog });

    await feedStore.getFeed({ userId: 'owner', role: 'owner' });
    await readStore.markRead('owner', ['booking_x']);

    assert.ok(appended.some((e) => e.action === 'cco.notification.feed_read'));
    assert.ok(appended.some((e) => e.action === 'cco.notification.mark_read'));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
