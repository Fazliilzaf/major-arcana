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

// ─────────────────────────────────────────────────────────────────────────
//  ccoPolicyStore — klinikpolicy: öppettider, boknings-/avbokningsregler,
//  auto-svar och auto-tilldelning av mejl.
// ─────────────────────────────────────────────────────────────────────────

function defaultPolicies() {
  return {
    officeHours: {
      // Veckodag (0 = söndag ... 6 = lördag) → { open, close } i HH:MM (lokal/UTC),
      // eller null/saknad för stängt.
      timezone: 'Europe/Stockholm',
      autoReplyWhenClosed: true,
      weekly: {
        0: null,
        1: { open: '09:00', close: '17:00' },
        2: { open: '09:00', close: '17:00' },
        3: { open: '09:00', close: '17:00' },
        4: { open: '09:00', close: '17:00' },
        5: { open: '09:00', close: '17:00' },
        6: null,
      },
    },
    booking: {
      // Minsta framförhållning i timmar innan en bokning får skapas.
      minLeadHours: 24,
      // Längsta framförhållning i dagar.
      maxAdvanceDays: 180,
    },
    cancellation: {
      // Minsta framförhållning i timmar för avgiftsfri avbokning.
      minNoticeHours: 24,
      feeWhenLate: true,
    },
    autoReply: {
      enabled: true,
      message: 'Tack för ditt meddelande. Vi återkommer under våra öppettider.',
    },
    autoAssign: {
      // Standardmottagare om ingen regel matchar.
      defaultAssignee: null,
      // Lista av regler: { id, match:{field,contains}, assignee, priority }
      rules: [],
    },
  };
}

const POLICY_SECTIONS = ['officeHours', 'booking', 'cancellation', 'autoReply', 'autoAssign'];

function emptyPolicyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    policies: defaultPolicies(),
  };
}

function parseHhmmToMinutes(value) {
  const text = normalizeText(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeRule(input = {}) {
  const field = normalizeText(input?.match?.field) || normalizeText(input.field);
  const contains = normalizeText(input?.match?.contains) || normalizeText(input.contains);
  const assignee = normalizeText(input.assignee);
  if (!field || !contains || !assignee) return null;
  const priority = Number.parseInt(String(input.priority ?? ''), 10);
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    match: { field, contains },
    assignee,
    priority: Number.isFinite(priority) ? priority : 100,
  };
}

async function createCcoPolicyStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoPolicyStore.');
  }

  let state = await readJson(filePath, emptyPolicyState());
  state = {
    ...emptyPolicyState(),
    ...(state && typeof state === 'object' ? state : {}),
  };
  // Slå ihop med defaults så att alla sektioner alltid finns.
  const baseline = defaultPolicies();
  state.policies = {
    ...baseline,
    ...(state.policies && typeof state.policies === 'object' ? state.policies : {}),
  };
  state.policies.autoAssign = {
    ...baseline.autoAssign,
    ...(state.policies.autoAssign || {}),
    rules: Array.isArray(state.policies.autoAssign?.rules)
      ? state.policies.autoAssign.rules.map((r) => normalizeRule(r)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function emitAudit(action, actor, detail) {
    if (!auditLog) return;
    auditLog.append({
      action,
      actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
      target: { kind: 'cco_policy', id: detail?.section || detail?.ruleId || 'policies' },
      detail: detail || {},
    });
  }

  function get(section) {
    if (section === undefined || section === null || section === '') {
      return JSON.parse(JSON.stringify(state.policies));
    }
    const key = normalizeText(section);
    if (!POLICY_SECTIONS.includes(key)) {
      throw badRequest(`Okänd sektion: ${key}.`);
    }
    return JSON.parse(JSON.stringify(state.policies[key]));
  }

  async function update(section, patch = {}, actor = {}) {
    const key = normalizeText(section);
    if (!POLICY_SECTIONS.includes(key)) {
      throw badRequest(`Okänd sektion: ${key}.`);
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw badRequest('Uppdateringen måste vara ett objekt.');
    }
    state.policies[key] = { ...state.policies[key], ...patch };
    if (key === 'autoAssign') {
      state.policies.autoAssign.rules = Array.isArray(state.policies.autoAssign.rules)
        ? state.policies.autoAssign.rules.map((r) => normalizeRule(r)).filter(Boolean)
        : [];
    }
    await save();
    emitAudit('cco.policy.update', actor, { section: key });
    return get(key);
  }

  async function reset(section, actor = {}) {
    const baselinePolicies = defaultPolicies();
    if (section === null || section === undefined || section === '') {
      state.policies = baselinePolicies;
      await save();
      emitAudit('cco.policy.reset', actor, { section: 'all' });
      return get();
    }
    const key = normalizeText(section);
    if (!POLICY_SECTIONS.includes(key)) {
      throw badRequest(`Okänd sektion: ${key}.`);
    }
    state.policies[key] = baselinePolicies[key];
    await save();
    emitAudit('cco.policy.reset', actor, { section: key });
    return get(key);
  }

  function evaluateBooking(startsAt, { now = new Date() } = {}) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      return { allowed: false, reason: 'Ogiltigt startdatum.', code: 'invalid_date' };
    }
    const reference = now instanceof Date ? now : new Date(now);
    const diffMs = when.getTime() - reference.getTime();
    const diffHours = diffMs / 3600000;
    const cfg = state.policies.booking;

    if (diffHours < 0) {
      return { allowed: false, reason: 'Tiden har redan passerat.', code: 'in_past' };
    }
    if (diffHours < cfg.minLeadHours) {
      return {
        allowed: false,
        reason: `Bokning kräver minst ${cfg.minLeadHours} timmars framförhållning.`,
        code: 'too_soon',
        minLeadHours: cfg.minLeadHours,
      };
    }
    const diffDays = diffMs / 86400000;
    if (diffDays > cfg.maxAdvanceDays) {
      return {
        allowed: false,
        reason: `Bokning kan göras högst ${cfg.maxAdvanceDays} dagar i förväg.`,
        code: 'too_far',
        maxAdvanceDays: cfg.maxAdvanceDays,
      };
    }
    return { allowed: true, reason: 'OK', code: 'ok' };
  }

  function evaluateCancellation(startsAt, { now = new Date() } = {}) {
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      return { allowed: false, reason: 'Ogiltigt startdatum.', code: 'invalid_date' };
    }
    const reference = now instanceof Date ? now : new Date(now);
    const diffHours = (when.getTime() - reference.getTime()) / 3600000;
    const cfg = state.policies.cancellation;

    if (diffHours < cfg.minNoticeHours) {
      return {
        allowed: true,
        fee: Boolean(cfg.feeWhenLate),
        reason: `Sen avbokning (mindre än ${cfg.minNoticeHours} timmar kvar).`,
        code: 'late',
        minNoticeHours: cfg.minNoticeHours,
      };
    }
    return { allowed: true, fee: false, reason: 'Avgiftsfri avbokning.', code: 'free' };
  }

  function isOpenNow({ now = new Date() } = {}) {
    const reference = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(reference.getTime())) return false;
    const weekly = state.policies.officeHours?.weekly || {};
    const day = reference.getUTCDay();
    const slot = weekly[day] ?? weekly[String(day)];
    if (!slot) return false;
    const open = parseHhmmToMinutes(slot.open);
    const close = parseHhmmToMinutes(slot.close);
    if (open === null || close === null) return false;
    const minutes = reference.getUTCHours() * 60 + reference.getUTCMinutes();
    return minutes >= open && minutes < close;
  }

  function shouldAutoReply({ now = new Date() } = {}) {
    const oh = state.policies.officeHours || {};
    const ar = state.policies.autoReply || {};
    if (!ar.enabled) return false;
    if (oh.autoReplyWhenClosed === false) return false;
    return !isOpenNow({ now });
  }

  function assignMail(mail = {}) {
    const cfg = state.policies.autoAssign || { rules: [], defaultAssignee: null };
    const rules = [...(cfg.rules || [])].sort((a, b) => (a.priority || 100) - (b.priority || 100));
    for (const rule of rules) {
      const value = normalizeKey(mail?.[rule.match.field]);
      if (value && value.includes(normalizeKey(rule.match.contains))) {
        return {
          assignee: rule.assignee,
          matched: true,
          ruleId: rule.id,
          field: rule.match.field,
        };
      }
    }
    return {
      assignee: cfg.defaultAssignee || null,
      matched: false,
      ruleId: null,
      field: null,
    };
  }

  async function upsertAutoAssignRule(input = {}, actor = {}) {
    const rule = normalizeRule(input);
    if (!rule) {
      throw badRequest('Regel kräver match.field, match.contains och assignee.');
    }
    const rules = state.policies.autoAssign.rules;
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx === -1) {
      rules.push(rule);
    } else {
      rules[idx] = rule;
    }
    await save();
    emitAudit('cco.policy.autoassign.upsert', actor, { section: 'autoAssign', ruleId: rule.id });
    return { ...rule };
  }

  async function deleteAutoAssignRule(id, actor = {}) {
    const ruleId = normalizeText(id);
    if (!ruleId) throw badRequest('id krävs.');
    const rules = state.policies.autoAssign.rules;
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx === -1) {
      throw badRequest('Regeln finns inte.');
    }
    rules.splice(idx, 1);
    await save();
    emitAudit('cco.policy.autoassign.delete', actor, { section: 'autoAssign', ruleId });
    return { ok: true, id: ruleId };
  }

  return {
    get,
    update,
    reset,
    evaluateBooking,
    evaluateCancellation,
    isOpenNow,
    shouldAutoReply,
    assignMail,
    upsertAutoAssignRule,
    deleteAutoAssignRule,
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  ccoMailSnoozeStore — dölj ett mejl/tråd tills en viss tidpunkt.
// ─────────────────────────────────────────────────────────────────────────

function emptySnoozeState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    snoozes: [],
  };
}

function normalizeSnooze(input = {}) {
  const mailId = normalizeText(input.mailId);
  const untilIso = normalizeText(input.untilIso);
  if (!mailId || !untilIso) return null;
  if (Number.isNaN(new Date(untilIso).getTime())) return null;
  const createdAt = normalizeText(input.createdAt) || nowIso();
  return {
    mailId,
    untilIso,
    role: normalizeText(input.role) || 'system',
    userId: input.userId || null,
    createdAt,
    updatedAt: normalizeText(input.updatedAt) || createdAt,
  };
}

async function createCcoMailSnoozeStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoMailSnoozeStore.');
  }

  let state = await readJson(filePath, emptySnoozeState());
  state = {
    ...emptySnoozeState(),
    ...(state && typeof state === 'object' ? state : {}),
    snoozes: Array.isArray(state?.snoozes)
      ? state.snoozes.map((s) => normalizeSnooze(s)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  function findIndex(mailId) {
    const key = normalizeText(mailId);
    return state.snoozes.findIndex((s) => s.mailId === key);
  }

  function list() {
    return state.snoozes.map((s) => ({ ...s }));
  }

  function active({ now = new Date() } = {}) {
    const reference = now instanceof Date ? now : new Date(now);
    return state.snoozes
      .filter((s) => new Date(s.untilIso).getTime() > reference.getTime())
      .map((s) => ({ ...s }));
  }

  function ready({ now = new Date() } = {}) {
    const reference = now instanceof Date ? now : new Date(now);
    return state.snoozes
      .filter((s) => new Date(s.untilIso).getTime() <= reference.getTime())
      .map((s) => ({ ...s }));
  }

  async function snooze(mailId, untilIso, actor = {}) {
    const record = normalizeSnooze({
      mailId,
      untilIso,
      role: actor?.role,
      userId: actor?.userId,
    });
    if (!record) {
      throw badRequest('mailId och giltigt untilIso krävs.');
    }
    const idx = findIndex(mailId);
    if (idx === -1) {
      state.snoozes.push(record);
    } else {
      state.snoozes[idx] = {
        ...state.snoozes[idx],
        untilIso: record.untilIso,
        role: record.role,
        userId: record.userId,
        updatedAt: nowIso(),
      };
    }
    await save();
    if (auditLog) {
      auditLog.append({
        action: 'cco.mail_snooze.set',
        actor: { role: record.role, userId: record.userId },
        target: { kind: 'mail_snooze', id: record.mailId },
        detail: { untilIso: record.untilIso },
      });
    }
    const out = state.snoozes[idx === -1 ? state.snoozes.length - 1 : idx];
    return { ...out };
  }

  async function unsnooze(mailId, actor = {}) {
    const idx = findIndex(mailId);
    if (idx === -1) {
      throw badRequest('Ingen snooze finns för detta mejl.');
    }
    const removed = state.snoozes.splice(idx, 1)[0];
    await save();
    if (auditLog) {
      auditLog.append({
        action: 'cco.mail_snooze.clear',
        actor: { role: normalizeText(actor?.role) || 'system', userId: actor?.userId || null },
        target: { kind: 'mail_snooze', id: removed.mailId },
        detail: {},
      });
    }
    return { ok: true, mailId: removed.mailId };
  }

  return {
    active,
    list,
    ready,
    snooze,
    unsnooze,
  };
}

module.exports = {
  createCcoPolicyStore,
  createCcoMailSnoozeStore,
  POLICY_SECTIONS,
};
