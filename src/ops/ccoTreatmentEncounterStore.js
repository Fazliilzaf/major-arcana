'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const ENCOUNTER_STATUSES = Object.freeze(['reserved', 'confirmed', 'cancelled']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, encounters: [] };
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
  const dir = require('node:path').dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function encounterKey(item = {}) {
  return [
    normalizeText(item.tenantId),
    normalizeText(item.patientId),
    normalizeText(item.encounterId),
  ].join('::');
}

function normalizeEncounter(input = {}, existing = {}) {
  const safe = asObject(input);
  const existingSafe = asObject(existing);
  const status = normalizeKey(safe.status || existingSafe.status) || 'reserved';
  return {
    encounterId: normalizeText(safe.encounterId || existingSafe.encounterId) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || existingSafe.tenantId),
    patientId: normalizeText(safe.patientId || existingSafe.patientId),
    conversationId: normalizeText(safe.conversationId || existingSafe.conversationId),
    bookingId: normalizeText(safe.bookingId || existingSafe.bookingId),
    reservationId: normalizeText(safe.reservationId || existingSafe.reservationId),
    serviceId: normalizeText(safe.serviceId || existingSafe.serviceId),
    serviceLabel: normalizeText(safe.serviceLabel || existingSafe.serviceLabel),
    resourceId: normalizeText(safe.resourceId || existingSafe.resourceId),
    resourceLabel: normalizeText(safe.resourceLabel || existingSafe.resourceLabel),
    locationLabel: normalizeText(safe.locationLabel || existingSafe.locationLabel),
    startsAt: normalizeText(safe.startsAt || existingSafe.startsAt),
    endsAt: normalizeText(safe.endsAt || existingSafe.endsAt),
    status: ENCOUNTER_STATUSES.includes(status) ? status : 'reserved',
    channel: normalizeText(safe.channel || existingSafe.channel) || 'cco_staff',
    customerEmail: normalizeText(safe.customerEmail || existingSafe.customerEmail),
    customerName: normalizeText(safe.customerName || existingSafe.customerName),
    customerPhone: normalizeText(safe.customerPhone || existingSafe.customerPhone),
    journalEntryIds: [
      ...new Set(
        [...asArray(existingSafe.journalEntryIds), ...asArray(safe.journalEntryIds)]
          .map((id) => normalizeText(id))
          .filter(Boolean)
      ),
    ],
    metadata: { ...asObject(existingSafe.metadata), ...asObject(safe.metadata) },
    createdAt: normalizeText(existingSafe.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function cloneEncounter(item) {
  return JSON.parse(JSON.stringify(item));
}

async function createCcoTreatmentEncounterStore({ filePath }) {
  const state = await readJson(filePath, emptyState());

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getEncounter({ tenantId, patientId, encounterId } = {}) {
    const key = encounterKey({ tenantId, patientId, encounterId });
    const found = state.encounters.find((item) => encounterKey(item) === key);
    return found ? cloneEncounter(found) : null;
  }

  async function findByConversation({ tenantId, conversationId } = {}) {
    const conv = normalizeText(conversationId);
    if (!conv) return null;
    const found = state.encounters.find(
      (item) =>
        normalizeText(item.tenantId) === normalizeText(tenantId) &&
        normalizeText(item.conversationId) === conv
    );
    return found ? cloneEncounter(found) : null;
  }

  async function listByPatient({ tenantId, patientId, limit = 50 } = {}) {
    return state.encounters
      .filter(
        (item) =>
          normalizeText(item.tenantId) === normalizeText(tenantId) &&
          normalizeText(item.patientId) === normalizeText(patientId)
      )
      .sort((a, b) => Date.parse(b.startsAt || b.updatedAt) - Date.parse(a.startsAt || a.updatedAt))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
      .map(cloneEncounter);
  }

  async function upsertEncounter(input = {}) {
    const normalized = normalizeEncounter(input);
    if (!normalized.tenantId || !normalized.patientId) {
      throw new Error('Behandlingstillfälle saknar tenantId eller patientId.');
    }
    const key = encounterKey(normalized);
    const index = state.encounters.findIndex((item) => encounterKey(item) === key);
    if (index >= 0) {
      state.encounters[index] = normalizeEncounter(normalized, state.encounters[index]);
    } else {
      const byConversation = normalized.conversationId
        ? state.encounters.findIndex(
            (item) =>
              normalizeText(item.tenantId) === normalized.tenantId &&
              normalizeText(item.conversationId) === normalized.conversationId
          )
        : -1;
      if (byConversation >= 0) {
        state.encounters[byConversation] = normalizeEncounter(
          normalized,
          state.encounters[byConversation]
        );
      } else {
        state.encounters.push(normalized);
      }
    }
    await save();
    return getEncounter({
      tenantId: normalized.tenantId,
      patientId: normalized.patientId,
      encounterId: normalized.encounterId,
    });
  }

  async function linkJournalEntry({ tenantId, patientId, encounterId, entryId } = {}) {
    const encounter = await getEncounter({ tenantId, patientId, encounterId });
    if (!encounter) {
      const error = new Error('Behandlingstillfället hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    return upsertEncounter({
      ...encounter,
      journalEntryIds: [...asArray(encounter.journalEntryIds), normalizeText(entryId)],
    });
  }

  return {
    ENCOUNTER_STATUSES,
    findByConversation,
    getEncounter,
    linkJournalEntry,
    listByPatient,
    upsertEncounter,
  };
}

module.exports = {
  ENCOUNTER_STATUSES,
  createCcoTreatmentEncounterStore,
};
