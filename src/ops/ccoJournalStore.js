'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');

const {
  emptyFieldsForSchema,
  normalizeFormVariant,
  resolveFormVariantFromMeridiq,
  buildImportMeta,
} = require('./ccoJournalSchemas');
const { rebuildJournalIndexes } = require('./ccoStoreIndexes');

const JOURNAL_TYPES = Object.freeze([
  'historical_import',
  'tp_treatment',
  'health_declaration',
  'fitness_certificate',
  'follow_up',
  'prp_treatment',
  'consultation_plan',
  'consent_bundle',
  'bleph_treatment',
]);

const JOURNAL_STATUSES = Object.freeze(['draft', 'signed', 'corrected']);

const JOURNAL_VISIBILITY = Object.freeze(['shared', 'private_internal']);

function normalizeJournalVisibility(value, fallback = 'shared') {
  const key = normalizeKey(value || fallback);
  return JOURNAL_VISIBILITY.includes(key) ? key : 'shared';
}

function isPatientPortalJournalVisible(entry) {
  return normalizeJournalVisibility(entry?.visibility, 'shared') !== 'private_internal';
}

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
    bookingConversationId: '',
    bookingServiceId: '',
    bookingSlotStart: '',
    bookingChannel: '',
    bookingConfirmedAt: '',
  };
}

function emptyConsentBundleFields() {
  return {
    bundleType: 'CONSENT_BUNDLE',
    step: 7,
    consentIds: [],
    patientSignedName: '',
    patientSignedId: '',
    signatures: [],
    offerLabel: '',
  };
}

function isSmokeTestPhotoLabel(label = '') {
  const normalized = normalizeKey(label);
  return (
    normalized === 'smoke front' ||
    normalized.startsWith('smoke ') ||
    normalized.includes('smoke-front') ||
    normalized === 'e2e' ||
    normalized.includes('pilot e2e')
  );
}

function emptyPrpTreatmentFields(formVariant = 'prp_skin') {
  const fromSchema = emptyFieldsForSchema('prp_treatment', formVariant);
  if (Object.keys(fromSchema).length) return fromSchema;
  return emptyFieldsForSchema('prp_treatment', 'prp_skin');
}

function emptyBlephTreatmentFields() {
  return emptyFieldsForSchema('bleph_treatment', 'curatiio_bleph');
}

function emptyFollowUpFields(formVariant = '4_manader') {
  const fromSchema = emptyFieldsForSchema('follow_up', formVariant);
  if (Object.keys(fromSchema).length) return fromSchema;
  return emptyFieldsForSchema('follow_up', '4_manader');
}

function emptyTpTreatmentFields() {
  return emptyFieldsForSchema('tp_treatment', 'hair_tp');
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

function schemaBackedEmptyFields(journalType, formVariant) {
  const fromSchema = emptyFieldsForSchema(journalType, formVariant);
  if (Object.keys(fromSchema).length) return fromSchema;
  if (journalType === 'tp_treatment') return emptyTpTreatmentFields();
  if (journalType === 'consultation_plan') return emptyConsultationPlanFields();
  if (journalType === 'consent_bundle') return emptyConsentBundleFields();
  if (journalType === 'prp_treatment') return emptyPrpTreatmentFields();
  if (journalType === 'follow_up') return emptyFollowUpFields();
  if (journalType === 'bleph_treatment') return emptyBlephTreatmentFields();
  return {};
}

function normalizeJournalEntry(input = {}, existing = {}) {
  const safe = asObject(input);
  const existingSafe = asObject(existing);
  const journalType = normalizeKey(safe.journalType || existingSafe.journalType) || 'tp_treatment';
  if (!JOURNAL_TYPES.includes(journalType)) {
    throw new Error('Ogiltig journaltyp.');
  }
  const rawImportMeta = asObject(safe.importMeta || existingSafe.importMeta);
  const importMeta = {
    ...asObject(existingSafe.importMeta),
    ...rawImportMeta,
    ...buildImportMeta(rawImportMeta),
  };
  const sourceQuestionaryIdRaw =
    safe.sourceQuestionaryId ?? existingSafe.sourceQuestionaryId ?? importMeta.sourceQuestionaryId;
  if (sourceQuestionaryIdRaw != null && sourceQuestionaryIdRaw !== '') {
    importMeta.sourceQuestionaryId = Number(sourceQuestionaryIdRaw);
  }
  const formVariant = normalizeFormVariant(
    journalType,
    resolveFormVariantFromMeridiq({
      journalType,
      formVariant: safe.formVariant || existingSafe.formVariant,
      sourceQuestionaryId:
        safe.sourceQuestionaryId ||
        existingSafe.sourceQuestionaryId ||
        importMeta.sourceQuestionaryId,
      meridiqServiceApiId: importMeta.meridiqServiceApiId,
    })
  );
  const status = normalizeKey(safe.status || existingSafe.status) || 'draft';
  const locked = status === 'signed' || Boolean(existingSafe.locked);
  const schemaDefaults = schemaBackedEmptyFields(journalType, formVariant);
  const fields = { ...schemaDefaults, ...asObject(existingSafe.fields), ...asObject(safe.fields) };

  return {
    entryId: normalizeText(safe.entryId || existingSafe.entryId) || crypto.randomUUID(),
    tenantId: normalizeText(safe.tenantId || existingSafe.tenantId),
    patientId: normalizeText(safe.patientId || existingSafe.patientId),
    personnummer: normalizeText(safe.personnummer || existingSafe.personnummer),
    treatmentEncounterId:
      normalizeText(safe.treatmentEncounterId || existingSafe.treatmentEncounterId) || '',
    journalType,
    formVariant,
    sourceQuestionaryId:
      normalizeText(safe.sourceQuestionaryId || existingSafe.sourceQuestionaryId) ||
      (importMeta.sourceQuestionaryId ? String(importMeta.sourceQuestionaryId) : ''),
    status: JOURNAL_STATUSES.includes(status) ? status : 'draft',
    locked,
    title: normalizeText(safe.title || existingSafe.title) || 'Behandlingsjournal',
    source: normalizeText(safe.source || existingSafe.source) || 'cco_journal',
    importMeta,
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
    correctionReason: normalizeText(safe.correctionReason || existingSafe.correctionReason) || null,
    correctionCreatedBy:
      normalizeText(safe.correctionCreatedBy || existingSafe.correctionCreatedBy) || null,
    correctionCreatedAt:
      normalizeText(safe.correctionCreatedAt || existingSafe.correctionCreatedAt) || null,
    visibility: normalizeJournalVisibility(
      safe.visibility || existingSafe.visibility,
      existingSafe.visibility || 'shared'
    ),
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
    treatmentEncounterId: normalizeText(safe.treatmentEncounterId || safe.encounterId),
    photoPhase: ['before', 'after'].includes(normalizeKey(safe.photoPhase))
      ? normalizeKey(safe.photoPhase)
      : '',
  };
}

function buildJournalReadout(entry) {
  const safe = asObject(entry);
  return {
    entryId: safe.entryId,
    journalType: safe.journalType,
    formVariant: safe.formVariant || '',
    sourceQuestionaryId: safe.sourceQuestionaryId || '',
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
    visibility: normalizeJournalVisibility(safe.visibility, 'shared'),
    updatedAt: safe.updatedAt,
    canEdit: !safe.locked,
    canSign: !safe.locked && safe.status === 'draft',
  };
}

async function createCcoJournalStore({ filePath, onAfterSign = null } = {}) {
  const state = await readJson(filePath, emptyState());
  rebuildJournalIndexes(state);

  async function save() {
    state.updatedAt = nowIso();
    rebuildJournalIndexes(state);
    await writeJsonAtomic(filePath, state);
  }

  async function getEntry({ tenantId, patientId, entryId } = {}) {
    const key = entryKey({ tenantId, patientId, entryId });
    const found = state.entries.find((item) => entryKey(item) === key);
    return found ? cloneEntry(found) : null;
  }

  async function listAllEntries({ tenantId } = {}) {
    const t = normalizeText(tenantId);
    return state.entries.filter((item) => !t || normalizeText(item.tenantId) === t).map(cloneEntry);
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

  async function listEntriesPage({
    tenantId,
    patientId,
    journalType,
    limit = 50,
    offset = 0,
  } = {}) {
    const rows = await listEntries({ tenantId, patientId, journalType });
    const start = Math.max(0, Number(offset) || 0);
    const max = Math.max(1, Math.min(500, Number(limit) || 50));
    return {
      total: rows.length,
      offset: start,
      limit: max,
      entries: rows.slice(start, start + max),
    };
  }

  async function upsertEntry(input = {}, { actor = {} } = {}) {
    const rawInput = asObject(input);
    if (!normalizeText(rawInput.tenantId) || !normalizeText(rawInput.patientId)) {
      throw new Error('Journalpost saknar tenantId eller patientId.');
    }

    let existing = null;
    let index = -1;
    const explicitEntryId = normalizeText(rawInput.entryId);
    if (explicitEntryId) {
      const key = entryKey({
        tenantId: rawInput.tenantId,
        patientId: rawInput.patientId,
        entryId: explicitEntryId,
      });
      index = state.entries.findIndex((item) => entryKey(item) === key);
      existing = index >= 0 ? state.entries[index] : null;
    } else if (normalizeKey(rawInput.status || 'draft') === 'draft') {
      const draftIndex = state.entries.findIndex(
        (item) =>
          item.tenantId === normalizeText(rawInput.tenantId) &&
          item.patientId === normalizeText(rawInput.patientId) &&
          normalizeKey(item.journalType) === normalizeKey(rawInput.journalType || 'tp_treatment') &&
          normalizeKey(item.formVariant || '') ===
            normalizeKey(
              rawInput.formVariant ||
                resolveFormVariantFromMeridiq({
                  journalType: rawInput.journalType || 'tp_treatment',
                  formVariant: rawInput.formVariant,
                  sourceQuestionaryId: rawInput.sourceQuestionaryId,
                }) ||
                ''
            ) &&
          !item.locked &&
          normalizeKey(item.status) === 'draft'
      );
      if (draftIndex >= 0) {
        index = draftIndex;
        existing = state.entries[draftIndex];
        rawInput.entryId = existing.entryId;
      }
    }

    const normalizedInput = normalizeJournalEntry(rawInput, existing || {});
    if (index < 0 && existing) {
      index = state.entries.findIndex((item) => entryKey(item) === entryKey(normalizedInput));
    }
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

    // P0.5 — auto-PDF generation post-sign. Hook ansvarar för:
    //  - generera PDF
    //  - kalla applyPdfArtifact() för att spara pdfPath/pdfTamperHash/pdfGeneratedAt
    //  - emittera audit-event journal.pdf_generated_at_signing
    // Hook-fel får INTE blockera signering (juridisk akt redan utförd).
    if (typeof onAfterSign === 'function') {
      try {
        await onAfterSign(cloneEntry(signed), { actor });
      } catch (hookErr) {
        // Logga men kasta inte — signering är fullbordad.
        if (process.env.NODE_ENV !== 'test') {
          console.error('[ccoJournalStore] onAfterSign hook failed:', hookErr.message);
        }
      }
    }
    // Re-hämta entry efter eventuell PDF-apply så caller ser pdfPath om hook satte den
    const refreshed = state.entries.find((item) => entryKey(item) === entryKey(signed));
    return cloneEntry(refreshed || signed);
  }

  /**
   * P0.5 — Skriv tillbaka PDF-artefakt-metadata på en signerad entry.
   * Bypasser locked-checken eftersom artefakt-metadata är en post-sign-händelse
   * (PDF:en själv är immutable i fil-systemet — vi sparar bara hash + sökväg).
   * Förändrar INTE fields/title/signering — bara nya fält:
   *   pdfPath, pdfTamperHash, pdfGeneratedAt, pdfSizeBytes
   */
  async function applyPdfArtifact({
    tenantId,
    patientId,
    entryId,
    pdfPath,
    pdfTamperHash,
    pdfSizeBytes = 0,
  } = {}) {
    const key = entryKey({ tenantId, patientId, entryId });
    const index = state.entries.findIndex((item) => entryKey(item) === key);
    if (index < 0) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    const existing = state.entries[index];
    if (!existing.locked) {
      const error = new Error('PDF-artefakt kan endast sättas på signerad/låst entry.');
      error.statusCode = 409;
      throw error;
    }
    existing.pdfPath = normalizeText(pdfPath);
    existing.pdfTamperHash = normalizeText(pdfTamperHash);
    existing.pdfSizeBytes = Number(pdfSizeBytes) || 0;
    existing.pdfGeneratedAt = nowIso();
    existing.updatedAt = nowIso();
    await save();
    return cloneEntry(existing);
  }

  /**
   * Beslut #3 — Owner-unlock av signerad journal-post.
   * Sätter locked=false + status=draft. Bevarar signed-state i unlockSnapshot.
   * Caller MÅSTE göra RBAC-check (journal.unlock = owner only) + audit innan.
   */
  async function unlockEntry({ tenantId, patientId, entryId, reason, actor = {} } = {}) {
    const existing = state.entries.find(
      (item) => entryKey(item) === entryKey({ tenantId, patientId, entryId })
    );
    if (!existing) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    if (!existing.locked) {
      const error = new Error('Posten är inte låst.');
      error.statusCode = 409;
      throw error;
    }
    // Bevara hela signed-state innan unlock
    const snapshot = {
      previouslySignedAt: existing.signedAt,
      previouslySignedByUserId: existing.signedByUserId,
      previouslySignedByName: existing.signedByName,
      previousStatus: existing.status,
      previousLocked: existing.locked,
      unlockedAt: nowIso(),
      unlockedByUserId: actor.userId,
      unlockedByName: actor.displayName || actor.userId,
      unlockedByRole: actor.role,
      reason: String(reason || ''),
    };
    existing.locked = false;
    existing.status = 'draft';
    existing.unlockSnapshot = snapshot;
    existing.updatedAt = nowIso();
    existing.events = [
      ...asArray(existing.events),
      normalizeEvent({
        type: 'journal_entry_unlocked_HIGH_SEVERITY',
        label: `OWNER UNLOCK — ${reason}`,
        actorUserId: actor.userId,
        actorName: actor.displayName || actor.userId,
        actorRole: actor.role,
      }),
    ];
    await save();
    return cloneEntry(existing);
  }

  async function addCorrection({
    tenantId,
    patientId,
    entryId,
    fields = {},
    reason = null,
    actor = {},
  } = {}) {
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
        correctionReason: reason || null,
        correctionCreatedBy: actor.displayName || actor.userId || null,
        correctionCreatedAt: nowIso(),
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
    if (existing.locked) {
      const error = new Error('Signerade journalposter kan inte raderas.');
      error.statusCode = 409;
      throw error;
    }
    if (normalizeKey(existing.journalType) === 'health_declaration') {
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
      photoPhase: photo.photoPhase,
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

  async function patchConsultationPhotoEncounter({
    tenantId,
    patientId,
    entryId,
    photoId,
    treatmentEncounterId,
    actor = {},
  } = {}) {
    const entry = await getEntry({ tenantId, patientId, entryId });
    if (!entry) {
      const error = new Error('Journalposten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    const targetPhotoId = normalizeText(photoId);
    const encounterId = normalizeText(treatmentEncounterId);
    if (!targetPhotoId || !encounterId) return entry;
    let touched = false;
    const attachments = asArray(entry.attachments).map((item) => {
      const safe = asObject(item);
      if (normalizeText(safe.photoId) !== targetPhotoId) return safe;
      touched = true;
      return normalizeAttachment({ ...safe, treatmentEncounterId: encounterId });
    });
    if (!touched) return entry;
    return upsertEntry(
      {
        ...entry,
        treatmentEncounterId: normalizeText(entry.treatmentEncounterId) || encounterId,
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

  async function clearConsultationPhotoAttachments({
    tenantId,
    patientId,
    entryId,
    smokeOnly = false,
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
    const before = asArray(entry.attachments);
    const removed = [];
    const kept = [];
    for (const item of before) {
      const safe = asObject(item);
      if (normalizeKey(safe.type) !== 'consultation_photo' || !safe.photoId) {
        kept.push(safe);
        continue;
      }
      const label = normalizeText(safe.label || safe.fileName);
      if (smokeOnly && !isSmokeTestPhotoLabel(label)) {
        kept.push(safe);
        continue;
      }
      removed.push({
        attachmentId: safe.attachmentId,
        photoId: safe.photoId,
        label,
      });
    }
    if (!removed.length) {
      return { entry: cloneEntry(entry), removed: [] };
    }
    const updated = await upsertEntry({ ...entry, attachments: kept }, { actor });
    return { entry: updated, removed };
  }

  async function removeConsultationPhotoAttachment({
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
    if (entry.locked) {
      const error = new Error('Signerad behandlingsplan kan inte ändras.');
      error.statusCode = 409;
      throw error;
    }
    const targetId = normalizeText(attachmentId);
    const before = asArray(entry.attachments);
    const attachments = before.filter(
      (item) => normalizeText(asObject(item).attachmentId) !== targetId
    );
    if (attachments.length === before.length) {
      const error = new Error('Bilagan hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    return upsertEntry({ ...entry, attachments }, { actor });
  }

  async function transferEntriesToPatient({
    tenantId,
    fromPatientId,
    toPatientId,
    actor = {},
  } = {}) {
    const fromId = normalizeText(fromPatientId);
    const toId = normalizeText(toPatientId);
    const tenant = normalizeText(tenantId);
    if (!tenant || !fromId || !toId || fromId === toId) {
      return { moved: 0 };
    }
    let moved = 0;
    for (const entry of state.entries) {
      if (normalizeText(entry.tenantId) !== tenant) continue;
      if (normalizeText(entry.patientId) !== fromId) continue;
      const index = state.entries.findIndex((item) => entryKey(item) === entryKey(entry));
      state.entries[index] = normalizeJournalEntry(
        {
          ...entry,
          patientId: toId,
          events: [
            ...asArray(entry.events),
            normalizeEvent({
              type: 'journal_patient_merged',
              label: `Journal flyttad till ${toId}`,
              actorUserId: actor.userId,
              actorName: actor.displayName || actor.userId,
              actorRole: actor.role,
            }),
          ].filter(Boolean),
        },
        entry
      );
      moved += 1;
    }
    if (moved) await save();
    return { moved };
  }

  async function getImportSummary({ tenantId } = {}) {
    const normalizedTenant = normalizeText(tenantId);
    const entries = asArray(state.entries).filter(
      (item) => !normalizedTenant || normalizeText(item.tenantId) === normalizedTenant
    );
    const historical = entries.filter(
      (item) => normalizeKey(item.journalType) === 'historical_import'
    );
    const patientIds = new Set(
      historical.map((item) => normalizeText(item.patientId)).filter(Boolean)
    );
    return {
      totalEntries: entries.length,
      historicalImportEntries: historical.length,
      patientsWithHistorical: patientIds.size,
    };
  }

  // PII-fri aggregat-statistik: antal poster, distinkta patienter (count, ej id),
  // och fördelning per journaltyp. Används av GET /cco-journal/stats för att
  // verifiera migrering utan att läsa ut patientdata.
  async function getStats({ tenantId } = {}) {
    const t = normalizeText(tenantId);
    const all = t
      ? state.entries.filter((item) => normalizeText(item.tenantId) === t)
      : state.entries.slice();
    const patients = new Set();
    const byType = {};
    for (const e of all) {
      if (e.patientId) patients.add(normalizeText(e.patientId));
      const jt = normalizeText(e.journalType) || 'unknown';
      byType[jt] = (byType[jt] || 0) + 1;
    }
    return {
      tenantId: t || null,
      totalEntries: all.length,
      distinctPatients: patients.size,
      byType,
      updatedAt: state.updatedAt || null,
    };
  }

  return {
    addConsultationPhotoAttachment,
    addCorrection,
    applyPdfArtifact,
    getStats,
    patchConsultationPhotoEncounter,
    buildJournalReadout,
    clearConsultationPhotoAttachments,
    deleteEntry,
    ensureConsultationPlan,
    findOpenConsultationPlan,
    getEntry,
    getImportSummary,
    historicalImportKey,
    importHistoricalEntries,
    importHistoricalForPatients,
    isSmokeTestPhotoLabel,
    listAllEntries,
    listEntries,
    listEntriesPage,
    markAttachmentAnnotatedPreview,
    removeConsultationPhotoAttachment,
    signEntry,
    transferEntriesToPatient,
    unlockEntry,
    updateConsultationPhotoAnnotation,
    upsertEntry,
  };
}

module.exports = {
  JOURNAL_STATUSES,
  JOURNAL_TYPES,
  JOURNAL_VISIBILITY,
  buildJournalReadout,
  createCcoJournalStore,
  emptyConsultationPlanFields,
  emptyConsentBundleFields,
  emptyFollowUpFields,
  emptyBlephTreatmentFields,
  emptyPrpTreatmentFields,
  emptyTpTreatmentFields,
  isPatientPortalJournalVisible,
  isSmokeTestPhotoLabel,
  normalizeJournalVisibility,
};
