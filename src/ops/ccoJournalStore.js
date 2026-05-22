'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const JOURNAL_TYPES = Object.freeze([
  'historical_import',
  'tp_treatment',
  'health_declaration',
  'fitness_certificate',
  'follow_up',
  'prp_treatment',
]);

const JOURNAL_STATUSES = Object.freeze(['draft', 'signed', 'corrected']);

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

function emptyTpTreatmentFields() {
  return {
    ingreppTypFaststalld: null,
    metod: '',
    behandlingsomraden: [],
    ytterligareOmrade: '',
    giltigLegitimationVisad: null,
    informeradRisker: null,
    fulltFrisk: null,
    alkoholNarkotika48h: null,
    aktuellaLakemedel: null,
    ytterligareHalsoinfo: '',
    blodtryckMmHg: '',
    puls: '',
    vitalKlockslag: '',
    allmannaAnteckningar: '',
    allmantillstandEfter: '',
    reaktionLokalbedovning1: '',
    reaktionLokalbedovning2: '',
    observationerUnderIngrepp: [],
    ovrigaObservationer: '',
    lakemedelUtlamnade: [],
    informeradLakemedelEftervard: null,
    graftsSingel: '',
    graftsDubbel: '',
    graftsTrippel: '',
    graftsKvadrupel: '',
    graftsTotalt: '',
    tidPlanering: '',
    tidLokalbedovningDonator: '',
    tidExtraktionDonator: '',
    tidLokalbedovningMottagare: '',
    tidMottagarkanaler: '',
    tidImplantationStart: '',
    tidImplantationSlut: '',
    tidPatientLamnar: '',
    bedovningCarbocainMl: '',
    bedovningMarcainMl: '',
    bedovningAdrenalinMl: '',
    bedovningTribonatMl: '',
    slutanteckningar: '',
  };
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, entries: [] };
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

function entryKey(entry = {}) {
  return [
    normalizeText(entry.tenantId),
    normalizeText(entry.patientId),
    normalizeText(entry.entryId),
  ].join('::');
}

function normalizeEvent(input = {}) {
  const safe = asObject(input);
  const type = normalizeKey(safe.type) || 'journal_event';
  if (!type) return null;
  return {
    id: normalizeText(safe.id) || crypto.randomUUID(),
    type,
    label: normalizeText(safe.label) || type,
    detail: normalizeText(safe.detail),
    actorUserId: normalizeText(safe.actorUserId),
    actorName: normalizeText(safe.actorName),
    actorRole: normalizeText(safe.actorRole),
    createdAt: normalizeText(safe.createdAt) || nowIso(),
    metadata: asObject(safe.metadata),
  };
}

function normalizeJournalEntry(input = {}, existing = {}) {
  const safe = asObject(input);
  const existingSafe = asObject(existing);
  const journalType = normalizeKey(safe.journalType || existingSafe.journalType) || 'tp_treatment';
  if (!JOURNAL_TYPES.includes(journalType)) {
    throw new Error('Ogiltig journaltyp.');
  }
  const status = normalizeKey(safe.status || existingSafe.status) || 'draft';
  const locked = status === 'signed' || Boolean(existingSafe.locked);
  const fields =
    journalType === 'tp_treatment'
      ? { ...emptyTpTreatmentFields(), ...asObject(existingSafe.fields), ...asObject(safe.fields) }
      : { ...asObject(existingSafe.fields), ...asObject(safe.fields) };

  return {
    entryId: normalizeText(safe.entryId || existingSafe.entryId) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || existingSafe.tenantId),
    patientId: normalizeText(safe.patientId || existingSafe.patientId),
    personnummer: normalizeText(safe.personnummer || existingSafe.personnummer),
    treatmentEncounterId:
      normalizeText(safe.treatmentEncounterId || existingSafe.treatmentEncounterId) || '',
    journalType,
    status: JOURNAL_STATUSES.includes(status) ? status : 'draft',
    locked,
    title: normalizeText(safe.title || existingSafe.title) || 'Behandlingsjournal',
    source: normalizeText(safe.source || existingSafe.source) || 'cco_journal',
    importMeta: asObject(safe.importMeta || existingSafe.importMeta),
    fields,
    attachments: asArray(safe.attachments || existingSafe.attachments),
    authorUserId: normalizeText(safe.authorUserId || existingSafe.authorUserId),
    authorName: normalizeText(safe.authorName || existingSafe.authorName),
    authorRole: normalizeText(safe.authorRole || existingSafe.authorRole),
    signedAt: normalizeText(safe.signedAt || existingSafe.signedAt) || null,
    signedByUserId: normalizeText(safe.signedByUserId || existingSafe.signedByUserId) || null,
    signedByName: normalizeText(safe.signedByName || existingSafe.signedByName) || null,
    correctionOfEntryId:
      normalizeText(safe.correctionOfEntryId || existingSafe.correctionOfEntryId) || null,
    events: asArray(safe.events || existingSafe.events)
      .map(normalizeEvent)
      .filter(Boolean),
    createdAt: normalizeText(existingSafe.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function cloneEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}

function buildJournalReadout(entry) {
  const safe = asObject(entry);
  return {
    entryId: safe.entryId,
    journalType: safe.journalType,
    status: safe.status,
    locked: Boolean(safe.locked),
    title: safe.title,
    source: safe.source,
    personnummer: safe.personnummer,
    treatmentEncounterId: safe.treatmentEncounterId,
    signedAt: safe.signedAt,
    signedByName: safe.signedByName,
    importMeta: safe.importMeta,
    fields: safe.fields,
    attachments: asArray(safe.attachments),
    updatedAt: safe.updatedAt,
    canEdit: !safe.locked,
    canSign: !safe.locked && safe.status === 'draft',
  };
}

async function createCcoJournalStore({ filePath }) {
  let state = await readJson(filePath, emptyState());

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function getEntry({ tenantId, patientId, entryId } = {}) {
    const key = entryKey({ tenantId, patientId, entryId });
    const found = state.entries.find((item) => entryKey(item) === key);
    return found ? cloneEntry(found) : null;
  }

  async function listEntries({ tenantId, patientId, journalType } = {}) {
    const typeFilter = normalizeKey(journalType);
    return state.entries
      .filter((item) => normalizeText(item.tenantId) === normalizeText(tenantId))
      .filter((item) => normalizeText(item.patientId) === normalizeText(patientId))
      .filter((item) => !typeFilter || normalizeKey(item.journalType) === typeFilter)
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
      .map(cloneEntry);
  }

  async function upsertEntry(input = {}, { actor = {} } = {}) {
    const normalizedInput = normalizeJournalEntry(input);
    if (!normalizedInput.tenantId || !normalizedInput.patientId) {
      throw new Error('Journalpost saknar tenantId eller patientId.');
    }
    const key = entryKey({
      tenantId: normalizedInput.tenantId,
      patientId: normalizedInput.patientId,
      entryId: normalizedInput.entryId,
    });
    const index = state.entries.findIndex((item) => entryKey(item) === key);
    const existing = index >= 0 ? state.entries[index] : null;
    if (existing?.locked) {
      const error = new Error('Signerad journalpost kan inte ändras. Skapa en rättelse.');
      error.statusCode = 409;
      throw error;
    }
    const merged = normalizeJournalEntry(
      {
        ...normalizedInput,
        authorUserId: normalizedInput.authorUserId || actor.userId,
        authorName: normalizedInput.authorName || actor.displayName || actor.userId,
        authorRole: normalizedInput.authorRole || actor.role,
        events: [
          ...asArray(existing?.events),
          normalizeEvent({
            type: existing ? 'journal_entry_updated' : 'journal_entry_created',
            label: existing ? 'Journal uppdaterad' : 'Journal skapad',
            actorUserId: actor.userId,
            actorName: actor.displayName || actor.userId,
            actorRole: actor.role,
          }),
        ].filter(Boolean),
      },
      existing || {}
    );
    if (index >= 0) state.entries[index] = merged;
    else state.entries.push(merged);
    await save();
    return cloneEntry(merged);
  }

  async function signEntry({ tenantId, patientId, entryId, actor = {} } = {}) {
    const existing = await getEntry({ tenantId, patientId, entryId });
    if (!existing) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    if (existing.locked) {
      const error = new Error('Journalposten är redan signerad.');
      error.statusCode = 409;
      throw error;
    }
    const signed = normalizeJournalEntry(
      {
        ...existing,
        status: 'signed',
        locked: true,
        signedAt: nowIso(),
        signedByUserId: actor.userId,
        signedByName: actor.displayName || actor.userId,
        events: [
          ...asArray(existing.events),
          normalizeEvent({
            type: 'journal_entry_signed',
            label: 'Journal signerad',
            actorUserId: actor.userId,
            actorName: actor.displayName || actor.userId,
            actorRole: actor.role,
          }),
        ],
      },
      existing
    );
    const index = state.entries.findIndex((item) => entryKey(item) === entryKey(signed));
    state.entries[index] = signed;
    await save();
    return cloneEntry(signed);
  }

  async function addCorrection({ tenantId, patientId, entryId, fields = {}, actor = {} } = {}) {
    const existing = await getEntry({ tenantId, patientId, entryId });
    if (!existing) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    return upsertEntry(
      {
        tenantId,
        patientId,
        personnummer: existing.personnummer,
        treatmentEncounterId: existing.treatmentEncounterId,
        journalType: existing.journalType,
        title: `${existing.title} — rättelse`,
        source: 'cco_journal_correction',
        correctionOfEntryId: existing.entryId,
        fields: { ...asObject(existing.fields), ...asObject(fields) },
      },
      { actor }
    );
  }

  async function importHistoricalEntries({ tenantId, patientId, personnummer, files = [], actor = {} } = {}) {
    let created = 0;
    for (const file of asArray(files)) {
      if (normalizeKey(file.fileType) !== 'journal_pdf') continue;
      await upsertEntry(
        {
          tenantId,
          patientId,
          personnummer,
          journalType: 'historical_import',
          title: normalizeText(file.fileName) || 'Importerad journal',
          source: 'drive_import',
          status: 'signed',
          locked: true,
          signedAt: nowIso(),
          signedByName: 'Drive-import',
          importMeta: {
            zipName: file.zipName,
            relativePath: file.relativePath,
            importedAt: nowIso(),
            readOnly: true,
          },
          attachments: [
            {
              type: 'historical_pdf',
              zipName: file.zipName,
              relativePath: file.relativePath,
              fileName: file.fileName,
            },
          ],
        },
        { actor }
      );
      created += 1;
    }
    return { created };
  }

  return {
    addCorrection,
    buildJournalReadout,
    getEntry,
    importHistoricalEntries,
    listEntries,
    signEntry,
    upsertEntry,
  };
}

module.exports = {
  JOURNAL_STATUSES,
  JOURNAL_TYPES,
  buildJournalReadout,
  createCcoJournalStore,
  emptyTpTreatmentFields,
};
