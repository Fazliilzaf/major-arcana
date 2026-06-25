const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  // reads: { [userId]: { [notificationId]: { at } } }
  return { version: 1, createdAt: ts, updatedAt: ts, reads: {} };
}

function normalizeIds(notificationIds) {
  if (!Array.isArray(notificationIds)) return [];
  return notificationIds.map((id) => normalizeText(id)).filter(Boolean);
}

async function createCcoNotificationReadStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoNotificationReadStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    reads: state && typeof state.reads === 'object' && state.reads ? state.reads : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function ensureUser(userKey) {
    if (!state.reads[userKey] || typeof state.reads[userKey] !== 'object') {
      state.reads[userKey] = {};
    }
    return state.reads[userKey];
  }

  // Returns the set of read notification ids for a user (used by the feed store).
  function getReadIds(userId) {
    const userKey = normalizeKey(userId);
    const bucket = state.reads[userKey];
    if (!bucket || typeof bucket !== 'object') return new Set();
    return new Set(Object.keys(bucket));
  }

  function isRead(userId, notificationId) {
    const userKey = normalizeKey(userId);
    const bucket = state.reads[userKey];
    if (!bucket || typeof bucket !== 'object') return false;
    return Boolean(bucket[normalizeText(notificationId)]);
  }

  async function markRead(userId, notificationIds) {
    const userKey = normalizeKey(userId);
    if (!userKey) throw badRequest('userId krävs för att markera lästa notifieringar.');
    const ids = normalizeIds(notificationIds);
    if (ids.length === 0) {
      throw badRequest('notificationIds[] krävs för att markera lästa notifieringar.');
    }

    const ts = nowIso();
    const bucket = ensureUser(userKey);
    let markedNow = 0;
    for (const id of ids) {
      if (!bucket[id]) markedNow += 1;
      bucket[id] = { at: ts };
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.notification.mark_read',
        actor: { role: 'system', userId: userKey },
        target: { kind: 'notification_read', id: userKey },
        detail: { count: ids.length, markedNow },
      });
    }

    return {
      userId: userKey,
      marked: ids.length,
      markedNow,
      totalRead: Object.keys(bucket).length,
      at: ts,
    };
  }

  // Mark every id in the provided list (typically the user's current feed) as read.
  async function markAllRead(userId, notificationIds) {
    const userKey = normalizeKey(userId);
    if (!userKey) throw badRequest('userId krävs för att markera lästa notifieringar.');
    const ids = normalizeIds(notificationIds);

    const ts = nowIso();
    const bucket = ensureUser(userKey);
    let markedNow = 0;
    for (const id of ids) {
      if (!bucket[id]) markedNow += 1;
      bucket[id] = { at: ts };
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.notification.mark_all_read',
        actor: { role: 'system', userId: userKey },
        target: { kind: 'notification_read', id: userKey },
        detail: { count: ids.length, markedNow },
      });
    }

    return {
      userId: userKey,
      all: true,
      marked: ids.length,
      markedNow,
      totalRead: Object.keys(bucket).length,
      at: ts,
    };
  }

  function stats() {
    const users = Object.keys(state.reads);
    const byUser = {};
    let totalReads = 0;
    for (const userKey of users) {
      const bucket = state.reads[userKey] || {};
      const count = Object.keys(bucket).length;
      byUser[userKey] = count;
      totalReads += count;
    }
    return { users: users.length, totalReads, byUser };
  }

  return { markRead, markAllRead, stats, getReadIds, isRead };
}

module.exports = { createCcoNotificationReadStore };
