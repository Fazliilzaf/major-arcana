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
  'consultation_plan',
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

function emptyConsultationPlanFields() {
  return {
    consultationDate: '',
    method: '',
    graftsTotal: '',
    zones: [],
    prpIncluded: null,
    notes: '',
  };
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
      : journalType === 'consultation_plan'
        ? {
            ...emptyConsultationPlanFields(),
            ...asObject(existingSafe.fields),
            ...asObject(safe.fields),
          }
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

function historicalImportKey(file = {}) {
  const zipName = normalizeText(file.zipName);
  const relativePath = normalizeText(file.relativePath);
  const driveFileId = normalizeText(file.driveFileId);
  if (driveFileId) return `drive::${driveFileId}`;
  return `${zipName}::${relativePath}`;
}

function buildHistoricalImportEntry({ tenantId, patientId, personnummer, file, actor = {} }) {
  const importKey = historicalImportKey(file);
  return normalizeJournalEntry({
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
      importKey,
      fileId: normalizeText(file.id),
      zipName: file.zipName || '',
      relativePath: file.relativePath || '',
      driveFileId: file.driveFileId || '',
      fileType: file.fileType || '',
      importedAt: nowIso(),
      readOnly: true,
    },
    attachments: [
      {
        type: file.fileType === 'image' ? 'historical_image' : 'historical_pdf',
        fileId: normalizeText(file.id),
        zipName: file.zipName || '',
        relativePath: file.relativePath || '',
        driveFileId: file.driveFileId || '',
        fileName: file.fileName || '',
      },
    ],
    events: [
      normalizeEvent({
        type: 'journal_historical_imported',
        label: 'Historisk journal importerad',
        actorUserId: actor.userId,
        actorName: actor.displayName || actor.userId,
        actorRole: actor.role,
      }),
    ].filter(Boolean),
  });
}

function cloneEntry(entry) {
  return JSON.parse(JSON.stringify(entry));
}

function normalizePersonnummer(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  const match = raw.match(/(\d{8})[- ]?(\d{4})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
}

function normalizeAttachment(input = {}) {
  const safe = asObject(input);
  return {
    attachmentId: normalizeText(safe.attachmentId) || crypto.randomUUID(),
    type: normalizeKey(safe.type) || 'consultation_photo',
    photoId: normalizeText(safe.photoId),
    fileName: normalizeText(safe.fileName),
    mimeType: normalizeText(safe.mimeType) || 'image/jpeg',
    label: normalizeText(safe.label),
    capturedAt: normalizeText(safe.capturedAt) || nowIso(),
    annotations: asObject(safe.annotations),
    planSummary: asObject(safe.planSummary),
    hasAnnotation: Boolean(safe.hasAnnotation),
    annotatedPreviewAvailable: Boolean(safe.annotatedPreviewAvailable),
  };
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
  const state = await readJson(filePath, emptyState());

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

  async function deleteEntry({ tenantId, patientId, entryId, actor = {} } = {}) {
    const existing = await getEntry({ tenantId, patientId, entryId });
    if (!existing) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    if (normalizeKey(existing.journalType) !== 'health_declaration') {
      const error = new Error('Endast dubbletter av hälsodeklaration kan tas bort.');
      error.statusCode = 409;
      throw error;
    }
    const siblings = await listEntries({
      tenantId,
      patientId,
      journalType: 'health_declaration',
    });
    if (siblings.length <= 1) {
      const error = new Error('Kan inte ta bort enda hälsodeklarationen.');
      error.statusCode = 409;
      throw error;
    }
    const key = entryKey({ tenantId, patientId, entryId });
    const index = state.entries.findIndex((item) => entryKey(item) === key);
    if (index < 0) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    const [removed] = state.entries.splice(index, 1);
    await save();
    return cloneEntry(removed);
  }

  async function importHistoricalEntries({
    tenantId,
    patientId,
    personnummer,
    files = [],
    actor = {},
  } = {}) {
    const existingKeys = new Set(
      state.entries
        .filter(
          (item) =>
            normalizeText(item.tenantId) === normalizeText(tenantId) &&
            normalizeText(item.patientId) === normalizeText(patientId) &&
            normalizeKey(item.journalType) === 'historical_import'
        )
        .map(
          (item) =>
            normalizeText(item.importMeta?.importKey) || historicalImportKey(item.importMeta)
        )
        .filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    for (const file of asArray(files)) {
      const fileType = normalizeKey(file.fileType);
      if (fileType !== 'journal_pdf' && fileType !== 'image') continue;
      const importKey = historicalImportKey(file);
      if (existingKeys.has(importKey)) {
        skipped += 1;
        continue;
      }
      state.entries.push(
        buildHistoricalImportEntry({
          tenantId,
          patientId,
          personnummer,
          file,
          actor,
        })
      );
      existingKeys.add(importKey);
      created += 1;
    }
    if (created) await save();
    return { created, skipped };
  }

  async function importHistoricalForPatients({
    tenantId,
    patients = [],
    filesByPersonnummer = {},
    actor = {},
    onProgress,
  } = {}) {
    let patientsTouched = 0;
    let created = 0;
    let skipped = 0;
    for (const patient of asArray(patients)) {
      const pnr = normalizePersonnummer(patient.personnummer);
      const patientId = normalizeText(patient.id);
      if (!pnr || !patientId) continue;
      const files = asArray(filesByPersonnummer[pnr]);
      if (!files.length) continue;
      const result = await importHistoricalEntries({
        tenantId,
        patientId,
        personnummer: pnr,
        files,
        actor,
      });
      if (result.created || result.skipped) {
        patientsTouched += 1;
        created += result.created;
        skipped += result.skipped;
        if (onProgress) {
          onProgress({ patientsTouched, created, skipped, personnummer: pnr });
        }
      }
    }
    return { patientsTouched, created, skipped };
  }

  async function findOpenConsultationPlan({ tenantId, patientId } = {}) {
    const entries = await listEntries({ tenantId, patientId, journalType: 'consultation_plan' });
    return entries.find((entry) => !entry.locked && entry.status === 'draft') || null;
  }

  async function ensureConsultationPlan({
    tenantId,
    patientId,
    personnummer = '',
    actor = {},
  } = {}) {
    const existing = await findOpenConsultationPlan({ tenantId, patientId });
    if (existing) return existing;
    return upsertEntry(
      {
        tenantId,
        patientId,
        personnummer,
        journalType: 'consultation_plan',
        title: 'Konsultation — behandlingsplan',
        fields: {
          consultationDate: nowIso().slice(0, 10),
        },
      },
      { actor }
    );
  }

  async function addConsultationPhotoAttachment({
    tenantId,
    patientId,
    personnummer = '',
    entryId = '',
    photo = {},
    actor = {},
  } = {}) {
    let entry = entryId
      ? await getEntry({ tenantId, patientId, entryId })
      : await findOpenConsultationPlan({ tenantId, patientId });
    if (!entry) {
      entry = await ensureConsultationPlan({ tenantId, patientId, personnummer, actor });
    }
    if (entry.locked) {
      const error = new Error('Signerad behandlingsplan kan inte uppdateras.');
      error.statusCode = 409;
      throw error;
    }
    const attachment = normalizeAttachment({
      type: 'consultation_photo',
      photoId: photo.photoId,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      label: photo.label,
      capturedAt: photo.storedAt,
    });
    const attachments = [...asArray(entry.attachments), attachment];
    return upsertEntry(
      {
        ...entry,
        journalType: 'consultation_plan',
        attachments,
      },
      { actor }
    );
  }

  async function updateConsultationPhotoAnnotation({
    tenantId,
    patientId,
    entryId,
    attachmentId,
    annotations = {},
    planSummary = {},
    actor = {},
  } = {}) {
    const entry = await getEntry({ tenantId, patientId, entryId });
    if (!entry) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    if (entry.locked) {
      const error = new Error('Signerad behandlingsplan kan inte ändras.');
      error.statusCode = 409;
      throw error;
    }
    const targetId = normalizeText(attachmentId);
    let found = false;
    const attachments = asArray(entry.attachments).map((item) => {
      const safe = asObject(item);
      if (normalizeText(safe.attachmentId) !== targetId) return safe;
      found = true;
      const mergedSummary = { ...asObject(safe.planSummary), ...asObject(planSummary) };
      return normalizeAttachment({
        ...safe,
        annotations: asObject(annotations),
        planSummary: mergedSummary,
        hasAnnotation: Array.isArray(annotations.shapes) ? annotations.shapes.length > 0 : false,
        annotatedPreviewAvailable: Boolean(safe.annotatedPreviewAvailable),
      });
    });
    if (!found) {
      const error = new Error('Bilagan hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    const mergedFields = {
      ...asObject(entry.fields),
      ...asObject(planSummary),
    };
    return upsertEntry(
      {
        ...entry,
        fields: mergedFields,
        attachments,
      },
      { actor }
    );
  }

  async function markAttachmentAnnotatedPreview({
    tenantId,
    patientId,
    entryId,
    attachmentId,
    actor = {},
  } = {}) {
    const entry = await getEntry({ tenantId, patientId, entryId });
    if (!entry) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    const targetId = normalizeText(attachmentId);
    const attachments = asArray(entry.attachments).map((item) => {
      const safe = asObject(item);
      if (normalizeText(safe.attachmentId) !== targetId) return safe;
      return { ...safe, annotatedPreviewAvailable: true, hasAnnotation: true };
    });
    return upsertEntry({ ...entry, attachments }, { actor });
  }

  return {
    addConsultationPhotoAttachment,
    addCorrection,
    buildJournalReadout,
    deleteEntry,
    ensureConsultationPlan,
    findOpenConsultationPlan,
    getEntry,
    historicalImportKey,
    importHistoricalEntries,
    importHistoricalForPatients,
    listEntries,
    markAttachmentAnnotatedPreview,
    signEntry,
    updateConsultationPhotoAnnotation,
    upsertEntry,
  };
}

module.exports = {
  JOURNAL_STATUSES,
  JOURNAL_TYPES,
  buildJournalReadout,
  createCcoJournalStore,
  emptyConsultationPlanFields,
  emptyTpTreatmentFields,
};
