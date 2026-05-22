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

function emptyState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    followUps: [],
  };
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

function normalizeReminderMinutes(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return parsed;
}

function toScheduleIso(date, time) {
  const safeDate = normalizeText(date);
  const safeTime = normalizeText(time);
  if (!safeDate || !safeTime) return '';
  const parsed = new Date(`${safeDate}T${safeTime}:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function normalizeFollowUpRecord(input = {}) {
  const tenantId = normalizeText(input.tenantId);
  const workspaceId = normalizeText(input.workspaceId);
  const conversationId = normalizeText(input.conversationId);
  const customerId = normalizeKey(input.customerId);
  const date = normalizeText(input.date);
  const time = normalizeText(input.time);
  const scheduledForIso = toScheduleIso(date, time);
  if (!tenantId || !workspaceId || !conversationId || !customerId || !scheduledForIso) {
    return null;
  }

  const createdAt = normalizeText(input.createdAt) || nowIso();
  const updatedAt = normalizeText(input.updatedAt) || createdAt;

  return {
    followUpId: normalizeText(input.followUpId) || crypto.randomUUID(),
    tenantId,
    workspaceId,
    conversationId,
    customerId,
    customerName: normalizeText(input.customerName) || null,
    date,
    time,
    scheduledForIso,
    doctorName: normalizeText(input.doctorName) || 'Dr. Eriksson',
    category: normalizeText(input.category) || 'Uppföljning',
    reminderLeadMinutes: normalizeReminderMinutes(input.reminderLeadMinutes),
    notes: normalizeText(input.notes),
    status: normalizeText(input.status) || 'scheduled',
    actorUserId: normalizeText(input.actorUserId) || null,
    createdAt,
    updatedAt,
  };
}

async function createCcoFollowUpStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoFollowUpStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    followUps: Array.isArray(state?.followUps)
      ? state.followUps.map((item) => normalizeFollowUpRecord(item)).filter(Boolean)
      : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function createFollowUp(input) {
    const followUp = normalizeFollowUpRecord(input);
    if (!followUp) {
      throw new Error('Uppföljningen saknar obligatoriska fält.');
    }
    state.followUps.push({
      ...followUp,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    await save();
    return { ...state.followUps[state.followUps.length - 1] };
  }

  async function listFollowUps({ tenantId, workspaceId, conversationId }) {
    return state.followUps
      .filter(
        (item) =>
          item.tenantId === normalizeText(tenantId) &&
          item.workspaceId === normalizeText(workspaceId) &&
          item.conversationId === normalizeText(conversationId)
      )
      .sort((a, b) => String(b.scheduledForIso).localeCompare(String(a.scheduledForIso)))
      .map((item) => ({ ...item }));
  }

  async function getLatestFollowUp({ tenantId, workspaceId, conversationId }) {
    const items = await listFollowUps({ tenantId, workspaceId, conversationId });
    return items[0] || null;
  }

  async function findConflict({
    tenantId,
    doctorName,
    scheduledForIso,
    excludeFollowUpId = '',
  }) {
    const tenant = normalizeText(tenantId);
    const doctor = normalizeText(doctorName);
    const scheduled = normalizeText(scheduledForIso);
    const excluded = normalizeText(excludeFollowUpId);
    if (!tenant || !doctor || !scheduled) return null;
    const match = state.followUps.find(
      (item) =>
        item.tenantId === tenant &&
        item.doctorName === doctor &&
        item.scheduledForIso === scheduled &&
        item.followUpId !== excluded
    );
    return match ? { ...match } : null;
  }

  return {
    createFollowUp,
    listFollowUps,
    getLatestFollowUp,
    findConflict,
  };
}

module.exports = {
  createCcoFollowUpStore,
};
