'use strict';

/**
 * ccoBrandUserStore — CCO Sprint 5.1-5.4
 *
 * Tre JSON-file-stores + en lätt cron-scheduler:
 *   - createCcoBrandStore        → get, list, remove, upsert (klinik-brands/locations)
 *   - createCcoUserStore         → get, list, upsert (CCO-användare)
 *   - createCcoNotificationStore → push subscriptions, SMS-config, cron-jobb-register, sänt-logg
 *   - createCronScheduler        → minimal tick-baserad scheduler (start/stop/runJob)
 *
 * Följer kanoniskt store-mönster (jfr ccoPhotoConsentStore / ccoFollowUpStore):
 * atomiska JSON-skrivningar, svenska felmeddelanden, badRequest med statusCode:400,
 * valfri auditLog via auditLog.append({ action, actor, target, detail }).
 */

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

function appendAudit(auditLog, event) {
  if (auditLog && typeof auditLog.append === 'function') {
    auditLog.append(event);
  }
}

// ─────────────────────────────────────────────────────────────
// BRAND STORE — klinik-brands/locations per tenant
// ─────────────────────────────────────────────────────────────

function emptyBrandState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, brands: [] };
}

async function createCcoBrandStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBrandStore.');
  }

  let state = await readJson(filePath, emptyBrandState());
  state = {
    ...emptyBrandState(),
    ...(state && typeof state === 'object' ? state : {}),
    brands: Array.isArray(state?.brands) ? state.brands : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(tenantId) {
    const key = normalizeKey(tenantId);
    return state.brands.findIndex((b) => normalizeKey(b.tenantId) === key);
  }

  function list() {
    return state.brands.map((b) => ({ ...b }));
  }

  function get(tenantId) {
    const idx = findIndex(tenantId);
    return idx === -1 ? null : { ...state.brands[idx] };
  }

  async function upsert(tenantId, patch = {}, actor = {}) {
    const tid = normalizeText(tenantId);
    if (!tid) throw badRequest('tenantId krävs.');
    if (!patch || typeof patch !== 'object') throw badRequest('Ogiltig brand-payload.');

    const ts = nowIso();
    const idx = findIndex(tid);
    let record;
    if (idx === -1) {
      record = {
        tenantId: tid,
        name: normalizeText(patch.name) || tid,
        legalName: normalizeText(patch.legalName),
        orgNumber: normalizeText(patch.orgNumber),
        primaryColor: normalizeText(patch.primaryColor),
        logoUrl: normalizeText(patch.logoUrl),
        address: normalizeText(patch.address),
        phone: normalizeText(patch.phone),
        email: normalizeText(patch.email),
        locations: Array.isArray(patch.locations) ? patch.locations : [],
        settings: patch.settings && typeof patch.settings === 'object' ? patch.settings : {},
        createdAt: ts,
        updatedAt: ts,
      };
      state.brands.push(record);
    } else {
      const prev = state.brands[idx];
      record = {
        ...prev,
        ...patch,
        tenantId: tid,
        locations: Array.isArray(patch.locations) ? patch.locations : prev.locations || [],
        settings:
          patch.settings && typeof patch.settings === 'object'
            ? { ...(prev.settings || {}), ...patch.settings }
            : prev.settings || {},
        createdAt: prev.createdAt || ts,
        updatedAt: ts,
      };
      state.brands[idx] = record;
    }
    await save();

    appendAudit(auditLog, {
      action: 'cco.brand.upsert',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'brand', id: tid },
      detail: { created: idx === -1 },
    });

    return { ...record };
  }

  async function remove(tenantId, actor = {}) {
    const tid = normalizeText(tenantId);
    if (!tid) throw badRequest('tenantId krävs.');
    const idx = findIndex(tid);
    if (idx === -1) throw badRequest('Brand hittades inte.');
    const [removed] = state.brands.splice(idx, 1);
    await save();

    appendAudit(auditLog, {
      action: 'cco.brand.remove',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'brand', id: tid },
      detail: null,
    });

    return { ok: true, removed: { ...removed } };
  }

  return { get, list, remove, upsert };
}

// ─────────────────────────────────────────────────────────────
// USER STORE — CCO-användare (prefs, signatur, roll)
// ─────────────────────────────────────────────────────────────

function emptyUserState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, users: [] };
}

async function createCcoUserStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoUserStore.');
  }

  let state = await readJson(filePath, emptyUserState());
  state = {
    ...emptyUserState(),
    ...(state && typeof state === 'object' ? state : {}),
    users: Array.isArray(state?.users) ? state.users : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(userId) {
    const key = normalizeKey(userId);
    return state.users.findIndex((u) => normalizeKey(u.userId) === key);
  }

  function list() {
    return state.users.map((u) => ({ ...u }));
  }

  function get(userId) {
    const idx = findIndex(userId);
    return idx === -1 ? null : { ...state.users[idx] };
  }

  async function upsert(userId, patch = {}, actor = {}) {
    const uid = normalizeText(userId);
    if (!uid) throw badRequest('userId krävs.');
    if (!patch || typeof patch !== 'object') throw badRequest('Ogiltig user-payload.');

    const ts = nowIso();
    const idx = findIndex(uid);
    let record;
    if (idx === -1) {
      record = {
        userId: uid,
        displayName: normalizeText(patch.displayName) || uid,
        email: normalizeText(patch.email),
        role: normalizeText(patch.role) || 'agent',
        signature: typeof patch.signature === 'string' ? patch.signature : '',
        prefs: patch.prefs && typeof patch.prefs === 'object' ? patch.prefs : {},
        createdAt: ts,
        updatedAt: ts,
      };
      state.users.push(record);
    } else {
      const prev = state.users[idx];
      record = {
        ...prev,
        ...patch,
        userId: uid,
        signature: typeof patch.signature === 'string' ? patch.signature : prev.signature || '',
        prefs:
          patch.prefs && typeof patch.prefs === 'object'
            ? { ...(prev.prefs || {}), ...patch.prefs }
            : prev.prefs || {},
        createdAt: prev.createdAt || ts,
        updatedAt: ts,
      };
      state.users[idx] = record;
    }
    await save();

    appendAudit(auditLog, {
      action: 'cco.user.upsert',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'user', id: uid },
      detail: { created: idx === -1 },
    });

    return { ...record };
  }

  return { get, list, upsert };
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATION STORE — push-subs + SMS-config + cron-jobb + sänt-logg
// ─────────────────────────────────────────────────────────────

function emptyNotificationState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    pushSubscriptions: [],
    cronJobs: [],
    sentLog: [],
    smsConfig: {
      enabled: false,
      provider: '',
      senderId: '',
      apiKeyRef: '',
      updatedAt: ts,
    },
  };
}

async function createCcoNotificationStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoNotificationStore.');
  }

  let state = await readJson(filePath, emptyNotificationState());
  const base = emptyNotificationState();
  state = {
    ...base,
    ...(state && typeof state === 'object' ? state : {}),
    pushSubscriptions: Array.isArray(state?.pushSubscriptions) ? state.pushSubscriptions : [],
    cronJobs: Array.isArray(state?.cronJobs) ? state.cronJobs : [],
    sentLog: Array.isArray(state?.sentLog) ? state.sentLog : [],
    smsConfig:
      state?.smsConfig && typeof state.smsConfig === 'object'
        ? { ...base.smsConfig, ...state.smsConfig }
        : base.smsConfig,
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  // ── Cron jobs ──
  function listCronJobs() {
    return state.cronJobs.map((j) => ({ ...j }));
  }

  async function upsertCronJob(input = {}, actor = {}) {
    if (!input || typeof input !== 'object') throw badRequest('Ogiltig cron-job-payload.');
    const name = normalizeText(input.name);
    const schedule = normalizeText(input.schedule);
    if (!name) throw badRequest('name krävs för cron-job.');
    if (!schedule) throw badRequest('schedule krävs för cron-job.');

    const ts = nowIso();
    const id = normalizeText(input.id);
    const idx = id ? state.cronJobs.findIndex((j) => j.id === id) : -1;

    let record;
    if (idx === -1) {
      record = {
        id: id || crypto.randomUUID(),
        name,
        schedule,
        trigger: normalizeText(input.trigger),
        enabled: input.enabled !== false,
        payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
        lastRanAt: null,
        lastResult: null,
        createdAt: ts,
        updatedAt: ts,
      };
      state.cronJobs.push(record);
    } else {
      const prev = state.cronJobs[idx];
      record = {
        ...prev,
        ...input,
        id: prev.id,
        name,
        schedule,
        enabled: input.enabled !== undefined ? input.enabled !== false : prev.enabled,
        payload:
          input.payload && typeof input.payload === 'object' ? input.payload : prev.payload || {},
        createdAt: prev.createdAt || ts,
        updatedAt: ts,
      };
      state.cronJobs[idx] = record;
    }
    await save();

    appendAudit(auditLog, {
      action: 'cco.cron_job.upsert',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'cron_job', id: record.id },
      detail: { created: idx === -1, enabled: record.enabled },
    });

    return { ...record };
  }

  async function markCronRan(id, result = {}) {
    const jobId = normalizeText(id);
    const idx = state.cronJobs.findIndex((j) => j.id === jobId);
    if (idx === -1) throw badRequest('Cron-job hittades inte.');
    const ts = nowIso();
    state.cronJobs[idx].lastRanAt = ts;
    state.cronJobs[idx].lastResult =
      result && typeof result === 'object' ? { ...result } : { result };
    state.cronJobs[idx].updatedAt = ts;
    await save();
    return { ...state.cronJobs[idx] };
  }

  // ── Push subscriptions ──
  function listPushSubscriptions(userId = null) {
    const wantUser = userId ? normalizeKey(userId) : null;
    return state.pushSubscriptions
      .filter((s) => (wantUser ? normalizeKey(s.userId) === wantUser : true))
      .map((s) => ({ ...s }));
  }

  async function subscribePush(subscription, userId, actor = {}) {
    if (!subscription || typeof subscription !== 'object') {
      throw badRequest('subscription krävs.');
    }
    const endpoint = normalizeText(subscription.endpoint);
    if (!endpoint) throw badRequest('subscription.endpoint krävs.');

    const ts = nowIso();
    const idx = state.pushSubscriptions.findIndex((s) => s.endpoint === endpoint);
    let record;
    if (idx === -1) {
      record = {
        endpoint,
        keys: subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {},
        userId: normalizeText(userId) || null,
        createdAt: ts,
        updatedAt: ts,
      };
      state.pushSubscriptions.push(record);
    } else {
      record = {
        ...state.pushSubscriptions[idx],
        keys:
          subscription.keys && typeof subscription.keys === 'object'
            ? subscription.keys
            : state.pushSubscriptions[idx].keys || {},
        userId: normalizeText(userId) || state.pushSubscriptions[idx].userId || null,
        updatedAt: ts,
      };
      state.pushSubscriptions[idx] = record;
    }
    await save();

    appendAudit(auditLog, {
      action: 'cco.push.subscribe',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'push_subscription', id: endpoint },
      detail: { created: idx === -1 },
    });

    return { ...record };
  }

  async function unsubscribePush(endpoint, actor = {}) {
    const ep = normalizeText(endpoint);
    if (!ep) throw badRequest('endpoint krävs.');
    const idx = state.pushSubscriptions.findIndex((s) => s.endpoint === ep);
    if (idx === -1) throw badRequest('Prenumeration hittades inte.');
    const [removed] = state.pushSubscriptions.splice(idx, 1);
    await save();

    appendAudit(auditLog, {
      action: 'cco.push.unsubscribe',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'push_subscription', id: ep },
      detail: null,
    });

    return { ok: true, removed: { ...removed } };
  }

  // ── Sent log ──
  function sentLog(limit = 100) {
    const n = Number.parseInt(String(limit ?? ''), 10);
    const safeLimit = Number.isFinite(n) && n > 0 ? n : 100;
    return state.sentLog
      .slice()
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, safeLimit)
      .map((e) => ({ ...e }));
  }

  async function recordSent(entry = {}) {
    const record = {
      id: crypto.randomUUID(),
      channel: normalizeText(entry.channel) || 'unknown',
      target: normalizeText(entry.target),
      templateId: normalizeText(entry.templateId),
      status: normalizeText(entry.status) || 'sent',
      detail: entry.detail && typeof entry.detail === 'object' ? entry.detail : {},
      at: nowIso(),
    };
    state.sentLog.push(record);
    if (state.sentLog.length > 1000) state.sentLog = state.sentLog.slice(-1000);
    await save();
    return { ...record };
  }

  // ── SMS config ──
  function smsConfig() {
    return { ...state.smsConfig };
  }

  async function updateSmsConfig(patch = {}, actor = {}) {
    if (!patch || typeof patch !== 'object') throw badRequest('Ogiltig SMS-config-payload.');
    const ts = nowIso();
    state.smsConfig = {
      ...state.smsConfig,
      ...patch,
      enabled:
        patch.enabled !== undefined ? Boolean(patch.enabled) : Boolean(state.smsConfig.enabled),
      updatedAt: ts,
    };
    await save();

    appendAudit(auditLog, {
      action: 'cco.sms_config.update',
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'sms_config', id: 'sms-config' },
      detail: { enabled: state.smsConfig.enabled },
    });

    return { ...state.smsConfig };
  }

  return {
    listCronJobs,
    upsertCronJob,
    markCronRan,
    listPushSubscriptions,
    subscribePush,
    unsubscribePush,
    sentLog,
    recordSent,
    smsConfig,
    updateSmsConfig,
  };
}

// ─────────────────────────────────────────────────────────────
// CRON SCHEDULER — minimal tick-baserad scheduler
// ─────────────────────────────────────────────────────────────

/**
 * createCronScheduler({ notificationStore, telemetryStore, intervalMs, runJob })
 *
 * Minimal säker implementation. Routen anropar:
 *   - cronScheduler.start()          (rad 5589, vid montering)
 *   - cronScheduler.runJob(job)      (rad 5580, manuell trigger)
 *   - markCronRan(job.id, { ok, manual, ...result })  (resultat sprids in)
 *
 * runJob måste returnera ett objekt som kan spridas in i markCronRan.
 * Default runJob är en no-op stub som returnerar { dispatched: 0 } — den
 * faktiska utskicks-logiken är medvetet inte påkopplad här (Sprint 5 har
 * ingen verifierad extern dispatch-pipeline i routen). En custom runJob
 * kan injiceras via options för riktig dispatch.
 */
// Tolka ett cron-jobbs free-text-schema till ett intervall i ms (eller null = okänt).
function parseScheduleMs(schedule) {
  const s = normalizeText(schedule).toLowerCase();
  if (!s) return null;
  const keywords = {
    minutely: 60000,
    hourly: 3600000,
    daily: 86400000,
    weekly: 604800000,
    monthly: 2592000000,
  };
  if (keywords[s]) return keywords[s];
  let m = s.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2][0];
    const per = unit === 'h' ? 3600000 : unit === 'd' ? 86400000 : 60000;
    return n * per;
  }
  if (/^\d+$/.test(s)) return Number(s) * 60000; // bara siffror => minuter
  m = s.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/); // cron "*/N * * * *"
  if (m) return Number(m[1]) * 60000;
  if (/^\d+\s+\d+\s+\*\s+\*\s+\*$/.test(s)) return 86400000; // cron "M H * * *" => dagligen
  return null;
}

// Är jobbet "due" nu, givet dess schema och senaste körning?
function isJobDue(job, nowMs) {
  const intervalMs = parseScheduleMs(job?.schedule);
  if (intervalMs == null) return true; // okänt schema => kör konservativt
  if (!job?.lastRanAt) return true;
  const last = Date.parse(job.lastRanAt);
  if (Number.isNaN(last)) return true;
  return nowMs - last >= intervalMs;
}

function createCronScheduler({
  notificationStore = null,
  telemetryStore = null,
  intervalMs = 60000,
  runJob: customRunJob = null,
} = {}) {
  let timer = null;
  let running = false;

  async function defaultRunJob(job) {
    // Säker no-op: ingen verifierad extern dispatch i routen.
    // Returnerar form som markCronRan kan spreada in.
    return { dispatched: 0, trigger: job?.trigger || job?.name || null, dryRun: true };
  }

  const runJob = typeof customRunJob === 'function' ? customRunJob : defaultRunJob;

  async function tick() {
    if (!notificationStore || typeof notificationStore.listCronJobs !== 'function') return;
    const nowMs = Date.now();
    const jobs = notificationStore
      .listCronJobs()
      .filter((j) => j.enabled)
      .filter((j) => isJobDue(j, nowMs));
    for (const job of jobs) {
      try {
        const result = await runJob(job);
        if (typeof notificationStore.markCronRan === 'function') {
          await notificationStore.markCronRan(job.id, { ok: true, ...result });
        }
      } catch (err) {
        if (typeof notificationStore.markCronRan === 'function') {
          await notificationStore.markCronRan(job.id, { ok: false, error: err.message });
        }
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    const ms = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 60000;
    timer = setInterval(() => {
      tick().catch(() => {});
    }, ms);
    // Blockera inte process-exit (viktigt för tester/CLI).
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function isRunning() {
    return running;
  }

  return { start, stop, tick, runJob, isRunning, telemetryStore };
}

module.exports = {
  createCcoBrandStore,
  createCcoUserStore,
  createCcoNotificationStore,
  createCronScheduler,
};
