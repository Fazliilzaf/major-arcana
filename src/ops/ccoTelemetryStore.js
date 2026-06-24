const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

// ── Shared helpers ──────────────────────────────────────────────
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

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round1(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function todayKey() {
  return nowIso().slice(0, 10);
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

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + toNumber(v), 0) / values.length;
}

function periodCutoffDays(period) {
  switch (normalizeKey(period)) {
    case 'day':
      return 1;
    case 'month':
      return 30;
    case 'week':
    default:
      return 7;
  }
}

// ════════════════════════════════════════════════════════════════
//  Telemetry store — CCO team performance
// ════════════════════════════════════════════════════════════════
function emptyTelemetryState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    // Per-day team rollups, keyed implicitly by `date`.
    daily: [],
    // Per-user aggregate stats, keyed by userId.
    users: {},
  };
}

function normalizeDailyRecord(input = {}) {
  const date = normalizeText(input.date) || todayKey();
  return {
    date,
    conversations: toNumber(input.conversations),
    responseMinTotal: toNumber(input.responseMinTotal),
    responseSamples: toNumber(
      input.responseSamples,
      input.conversations ? toNumber(input.conversations) : 0
    ),
    slaMet: toNumber(input.slaMet),
    slaTotal: toNumber(input.slaTotal, input.conversations ? toNumber(input.conversations) : 0),
    csatSum: toNumber(input.csatSum),
    csatCount: toNumber(input.csatCount),
    upsellSek: toNumber(input.upsellSek),
    latencyP95Ms: toNumber(input.latencyP95Ms),
    openIncidents: toNumber(input.openIncidents),
    templates: input.templates && typeof input.templates === 'object' ? { ...input.templates } : {},
    createdAt: normalizeText(input.createdAt) || nowIso(),
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

function normalizeUserRecord(userId, input = {}) {
  return {
    userId: normalizeKey(userId),
    name: normalizeText(input.name) || normalizeText(userId) || normalizeKey(userId),
    conversations: toNumber(input.conversations),
    responseMinTotal: toNumber(input.responseMinTotal),
    responseSamples: toNumber(input.responseSamples),
    slaMet: toNumber(input.slaMet),
    slaTotal: toNumber(input.slaTotal),
    csatSum: toNumber(input.csatSum),
    csatCount: toNumber(input.csatCount),
    upsellSek: toNumber(input.upsellSek),
    templates: input.templates && typeof input.templates === 'object' ? { ...input.templates } : {},
    createdAt: normalizeText(input.createdAt) || nowIso(),
    updatedAt: normalizeText(input.updatedAt) || nowIso(),
  };
}

function userResponseMin(user) {
  return user.responseSamples > 0 ? user.responseMinTotal / user.responseSamples : 0;
}

function userSlaPct(user) {
  return user.slaTotal > 0 ? (user.slaMet / user.slaTotal) * 100 : 0;
}

function userCsatAvg(user) {
  return user.csatCount > 0 ? user.csatSum / user.csatCount : 0;
}

// Composite leaderboard score: rewards volume, upsell, SLA & CSAT; penalises slow responses.
function userScore(user) {
  const resp = userResponseMin(user);
  const sla = userSlaPct(user);
  const csat = userCsatAvg(user);
  const score = user.conversations * 2 + user.upsellSek / 100 + sla * 0.5 + csat * 20 - resp * 3;
  return Math.max(0, Math.round(score));
}

async function createCcoTelemetryStore({
  filePath,
  auditLog = null,
  bookingCaseStore = null,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoTelemetryStore.');
  }

  let state = await readJson(filePath, emptyTelemetryState());
  state = {
    ...emptyTelemetryState(),
    ...(state && typeof state === 'object' ? state : {}),
    daily: Array.isArray(state?.daily) ? state.daily.map((d) => normalizeDailyRecord(d)) : [],
    users:
      state?.users && typeof state.users === 'object'
        ? Object.fromEntries(
            Object.entries(state.users).map(([id, u]) => [
              normalizeKey(id),
              normalizeUserRecord(id, u),
            ])
          )
        : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function dailyInPeriod(period) {
    const days = periodCutoffDays(period);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return state.daily.filter((d) => {
      const t = new Date(`${d.date}T00:00:00.000Z`).getTime();
      return Number.isFinite(t) ? t >= cutoff : true;
    });
  }

  // ── Aggregation: team ──
  function teamStats(period = 'week') {
    const rows = dailyInPeriod(period);
    const conversations = rows.reduce((acc, d) => acc + d.conversations, 0);
    const responseMinTotal = rows.reduce((acc, d) => acc + d.responseMinTotal, 0);
    const responseSamples = rows.reduce((acc, d) => acc + d.responseSamples, 0);
    const slaMet = rows.reduce((acc, d) => acc + d.slaMet, 0);
    const slaTotal = rows.reduce((acc, d) => acc + d.slaTotal, 0);
    const csatSum = rows.reduce((acc, d) => acc + d.csatSum, 0);
    const csatCount = rows.reduce((acc, d) => acc + d.csatCount, 0);
    const upsellSek = rows.reduce((acc, d) => acc + d.upsellSek, 0);

    return {
      period: normalizeKey(period) || 'week',
      conversations,
      avgResponseMin: responseSamples > 0 ? round1(responseMinTotal / responseSamples) : 0,
      slaPct: slaTotal > 0 ? round1((slaMet / slaTotal) * 100) : 0,
      csatAvg: csatCount > 0 ? round1(csatSum / csatCount) : 0,
      upsellSek: Math.round(upsellSek),
      days: rows.length,
    };
  }

  // ── Aggregation: single user ──
  function userStats(userId) {
    const id = normalizeKey(userId);
    const user = state.users[id];
    if (!user) return null;
    return {
      userId: user.userId,
      name: user.name,
      conversations: user.conversations,
      responseMin: round1(userResponseMin(user)),
      slaPct: round1(userSlaPct(user)),
      csatAvg: round1(userCsatAvg(user)),
      upsellSek: Math.round(user.upsellSek),
      score: userScore(user),
      updatedAt: user.updatedAt,
    };
  }

  // ── Aggregation: leaderboard ──
  function leaderboard() {
    return Object.values(state.users)
      .map((user) => ({
        userId: user.userId,
        name: user.name,
        score: userScore(user),
        conversations: user.conversations,
        responseMin: round1(userResponseMin(user)),
        slaPct: round1(userSlaPct(user)),
        csatAvg: round1(userCsatAvg(user)),
        upsellSek: Math.round(user.upsellSek),
      }))
      .sort((a, b) => b.score - a.score || b.conversations - a.conversations);
  }

  // ── Aggregation: top templates ──
  function topTemplates({ limit = 10 } = {}) {
    const counts = {};
    for (const d of state.daily) {
      for (const [tpl, n] of Object.entries(d.templates || {})) {
        counts[tpl] = (counts[tpl] || 0) + toNumber(n);
      }
    }
    for (const u of Object.values(state.users)) {
      for (const [tpl, n] of Object.entries(u.templates || {})) {
        counts[tpl] = (counts[tpl] || 0) + toNumber(n);
      }
    }
    return Object.entries(counts)
      .map(([template, uses]) => ({ template, uses }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, limit);
  }

  // ── Coaching insights (rule-based tips) ──
  function coachingInsights(userId = null) {
    const tips = [];
    const team = teamStats('week');

    const targets = userId
      ? state.users[normalizeKey(userId)]
        ? [state.users[normalizeKey(userId)]]
        : []
      : Object.values(state.users);

    for (const user of targets) {
      const resp = userResponseMin(user);
      const sla = userSlaPct(user);
      const csat = userCsatAvg(user);

      if (user.responseSamples > 0 && resp > 15) {
        tips.push({
          userId: user.userId,
          severity: 'warn',
          metric: 'responseMin',
          message: `${user.name}: snitt-svarstid ${round1(resp)} min är hög. Sikta på under 15 min.`,
        });
      }
      if (user.slaTotal > 0 && sla < 85) {
        tips.push({
          userId: user.userId,
          severity: 'warn',
          metric: 'slaPct',
          message: `${user.name}: SLA ${round1(sla)}% ligger under målet 85%.`,
        });
      }
      if (user.csatCount > 0 && csat < 4) {
        tips.push({
          userId: user.userId,
          severity: 'info',
          metric: 'csatAvg',
          message: `${user.name}: CSAT ${round1(csat)}/5 — be om feedback för att höja nöjdheten.`,
        });
      }
      if (user.conversations > 0 && user.upsellSek === 0) {
        tips.push({
          userId: user.userId,
          severity: 'info',
          metric: 'upsellSek',
          message: `${user.name}: inga registrerade upsell-intäkter ännu — utforska merförsäljning.`,
        });
      }
    }

    if (!tips.length) {
      tips.push({
        userId: userId ? normalizeKey(userId) : null,
        severity: 'ok',
        metric: 'team',
        message: `Teamet presterar enligt mål (SLA ${team.slaPct}%, CSAT ${team.csatAvg}/5).`,
      });
    }
    return tips;
  }

  // ── Live operational metrics (async; may consult bookingCaseStore) ──
  async function liveMetrics() {
    const recent = dailyInPeriod('day');
    const latencyP95Ms = recent.length ? Math.max(...recent.map((d) => d.latencyP95Ms)) : 0;
    let openIncidents = recent.reduce((acc, d) => acc + d.openIncidents, 0);

    // bookingCaseStore may be null — tolerate it.
    let openCases = 0;
    if (bookingCaseStore) {
      try {
        if (typeof bookingCaseStore.countOpen === 'function') {
          openCases = toNumber(await bookingCaseStore.countOpen());
        } else if (typeof bookingCaseStore.listOpen === 'function') {
          const list = await bookingCaseStore.listOpen();
          openCases = Array.isArray(list) ? list.length : 0;
        }
      } catch {
        openCases = 0;
      }
    }
    openIncidents += openCases;

    const team = teamStats('week');
    let riskLäge = 'låg';
    if (openIncidents >= 5 || latencyP95Ms >= 2000 || team.slaPct < 70) {
      riskLäge = 'hög';
    } else if (openIncidents >= 2 || latencyP95Ms >= 1000 || team.slaPct < 85) {
      riskLäge = 'medel';
    }

    let readiness = 'redo';
    if (riskLäge === 'hög') readiness = 'kritisk';
    else if (riskLäge === 'medel') readiness = 'bevakas';

    return {
      readiness,
      latencyP95Ms,
      openIncidents,
      openCases,
      riskLäge,
      slaPct: team.slaPct,
      csatAvg: team.csatAvg,
      activeUsers: Object.keys(state.users).length,
      generatedAt: nowIso(),
    };
  }

  // ── Ingest: daily team rollup ──
  async function recordDaily(input = {}, actor = {}) {
    const date = normalizeText(input.date) || todayKey();
    const incoming = normalizeDailyRecord({ ...input, date });

    const idx = state.daily.findIndex((d) => d.date === date);
    let record;
    if (idx === -1) {
      record = incoming;
      state.daily.push(record);
    } else {
      // Accumulate into the existing day.
      record = state.daily[idx];
      record.conversations += incoming.conversations;
      record.responseMinTotal += incoming.responseMinTotal;
      record.responseSamples += incoming.responseSamples;
      record.slaMet += incoming.slaMet;
      record.slaTotal += incoming.slaTotal;
      record.csatSum += incoming.csatSum;
      record.csatCount += incoming.csatCount;
      record.upsellSek += incoming.upsellSek;
      record.latencyP95Ms = Math.max(record.latencyP95Ms, incoming.latencyP95Ms);
      record.openIncidents = incoming.openIncidents;
      for (const [tpl, n] of Object.entries(incoming.templates || {})) {
        record.templates[tpl] = (record.templates[tpl] || 0) + toNumber(n);
      }
      record.updatedAt = nowIso();
    }

    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.telemetry.daily',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'telemetry_daily', id: date },
        detail: { conversations: record.conversations },
      });
    }

    return { ...record, ok: true };
  }

  // ── Ingest: per-user stats ──
  async function updateUserStats(userId, input = {}, actor = {}) {
    const id = normalizeKey(userId);
    if (!id) throw badRequest('userId krävs.');

    const incoming = normalizeUserRecord(id, input);
    let user = state.users[id];
    if (!user) {
      user = incoming;
      state.users[id] = user;
    } else {
      if (normalizeText(input.name)) user.name = normalizeText(input.name);
      user.conversations += incoming.conversations;
      user.responseMinTotal += incoming.responseMinTotal;
      user.responseSamples += incoming.responseSamples;
      user.slaMet += incoming.slaMet;
      user.slaTotal += incoming.slaTotal;
      user.csatSum += incoming.csatSum;
      user.csatCount += incoming.csatCount;
      user.upsellSek += incoming.upsellSek;
      for (const [tpl, n] of Object.entries(incoming.templates || {})) {
        user.templates[tpl] = (user.templates[tpl] || 0) + toNumber(n);
      }
      user.updatedAt = nowIso();
    }

    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.telemetry.user',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'telemetry_user', id },
        detail: { conversations: user.conversations },
      });
    }

    return userStats(id);
  }

  return {
    liveMetrics,
    teamStats,
    userStats,
    leaderboard,
    topTemplates,
    coachingInsights,
    recordDaily,
    updateUserStats,
  };
}

// ════════════════════════════════════════════════════════════════
//  Collaboration store — presence / locks / comments
// ════════════════════════════════════════════════════════════════
const PRESENCE_TTL_MS = 30 * 1000;
const LOCK_TTL_MS = 5 * 60 * 1000;

function emptyCollabState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    // Keyed by resourceId.
    resources: {},
  };
}

function ensureResource(state, resourceId) {
  const id = normalizeText(resourceId);
  if (!state.resources[id]) {
    state.resources[id] = { presence: [], locks: [], comments: [] };
  }
  return state.resources[id];
}

async function createCcoCollaborationStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoCollaborationStore.');
  }

  let state = await readJson(filePath, emptyCollabState());
  state = {
    ...emptyCollabState(),
    ...(state && typeof state === 'object' ? state : {}),
    resources: state?.resources && typeof state.resources === 'object' ? state.resources : {},
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function fresh(entries, ttl, stamp = 'at') {
    const cutoff = Date.now() - ttl;
    return entries.filter((e) => {
      const t = new Date(e[stamp]).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  // ── Presence ──
  async function heartbeat(resourceId, userId, role = null) {
    const rid = normalizeText(resourceId);
    const uid = normalizeText(userId);
    if (!rid || !uid) throw badRequest('resourceId och userId krävs.');

    const res = ensureResource(state, rid);
    const ts = nowIso();
    const existing = res.presence.find((p) => p.userId === uid);
    if (existing) {
      existing.at = ts;
      existing.role = normalizeText(role) || existing.role;
    } else {
      res.presence.push({ userId: uid, role: normalizeText(role) || null, at: ts });
    }
    res.presence = fresh(res.presence, PRESENCE_TTL_MS);
    await save();
    return { ok: true, resourceId: rid, userId: uid, at: ts };
  }

  function activePresence(resourceId) {
    const res = state.resources[normalizeText(resourceId)];
    if (!res) return [];
    return fresh(res.presence, PRESENCE_TTL_MS).map((p) => ({ ...p }));
  }

  // ── Locks ──
  async function acquireLock(resourceId, nodeId, userId, role = null) {
    const rid = normalizeText(resourceId);
    const node = normalizeText(nodeId);
    const uid = normalizeText(userId);
    if (!rid || !node || !uid) throw badRequest('resourceId, nodeId och userId krävs.');

    const res = ensureResource(state, rid);
    res.locks = fresh(res.locks, LOCK_TTL_MS);
    const held = res.locks.find((l) => l.nodeId === node);
    if (held && held.userId !== uid) {
      const err = badRequest(`Noden är låst av ${held.userId}.`);
      err.statusCode = 409;
      err.lockedBy = held.userId;
      throw err;
    }
    const ts = nowIso();
    if (held) {
      held.at = ts;
    } else {
      res.locks.push({ nodeId: node, userId: uid, role: normalizeText(role) || null, at: ts });
    }
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.collaboration.lock',
        actor: { role: normalizeText(role) || 'system', userId: uid },
        target: { kind: 'collab_node', id: `${rid}::${node}` },
        detail: { acquired: true },
      });
    }
    return { ok: true, resourceId: rid, nodeId: node, userId: uid, at: ts };
  }

  async function releaseLock(resourceId, nodeId, userId) {
    const rid = normalizeText(resourceId);
    const node = normalizeText(nodeId);
    const uid = normalizeText(userId);
    const res = state.resources[rid];
    if (!res) return { ok: true };
    const before = res.locks.length;
    res.locks = res.locks.filter((l) => !(l.nodeId === node && (!uid || l.userId === uid)));
    if (res.locks.length !== before) await save();
    return { ok: true, resourceId: rid, nodeId: node };
  }

  function activeLocks(resourceId) {
    const res = state.resources[normalizeText(resourceId)];
    if (!res) return [];
    return fresh(res.locks, LOCK_TTL_MS).map((l) => ({ ...l }));
  }

  // ── Comments / mentions ──
  function extractMentions(body) {
    const matches = String(body || '').match(/@([a-z0-9._-]+)/gi) || [];
    return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
  }

  async function postComment(resourceId, body, userId, role = null, nodeId = null) {
    const rid = normalizeText(resourceId);
    const text = normalizeText(body);
    const uid = normalizeText(userId);
    if (!rid || !uid) throw badRequest('resourceId och userId krävs.');
    if (!text) throw badRequest('Kommentaren får inte vara tom.');

    const res = ensureResource(state, rid);
    const comment = {
      commentId: crypto.randomUUID(),
      resourceId: rid,
      nodeId: normalizeText(nodeId) || null,
      userId: uid,
      role: normalizeText(role) || null,
      body: text,
      mentions: extractMentions(text),
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: nowIso(),
    };
    res.comments.push(comment);
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.collaboration.comment',
        actor: { role: comment.role || 'system', userId: uid },
        target: { kind: 'collab_comment', id: comment.commentId },
        detail: { mentions: comment.mentions },
      });
    }
    return { ...comment };
  }

  function listComments(resourceId) {
    const res = state.resources[normalizeText(resourceId)];
    if (!res) return [];
    return res.comments.map((c) => ({ ...c }));
  }

  async function resolveComment(resourceId, commentId, userId) {
    const rid = normalizeText(resourceId);
    const cid = normalizeText(commentId);
    const uid = normalizeText(userId);
    const res = state.resources[rid];
    if (!res) throw badRequest('Resursen finns inte.');
    const comment = res.comments.find((c) => c.commentId === cid);
    if (!comment) throw badRequest('Kommentaren finns inte.');
    comment.resolved = true;
    comment.resolvedBy = uid || null;
    comment.resolvedAt = nowIso();
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.collaboration.comment.resolve',
        actor: { role: 'system', userId: uid },
        target: { kind: 'collab_comment', id: cid },
        detail: {},
      });
    }
    return { ...comment };
  }

  return {
    heartbeat,
    activePresence,
    acquireLock,
    releaseLock,
    activeLocks,
    postComment,
    listComments,
    resolveComment,
  };
}

module.exports = {
  createCcoTelemetryStore,
  createCcoCollaborationStore,
};
