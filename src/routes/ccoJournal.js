'use strict';

const express = require('express');
const multer = require('multer');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const {
  resolveCcoRouteActor,
  serializePatient360,
  buildPatient360SyncContext,
} = require('./ccoRouteShared');
const { syncPatient360FromJournalCase } = require('../ops/ccoPatient360Bridge');
const { syncConsultationPhotoToEncounter, syncJournalEntryToEncounter, lockEncounterOnJournalSign } = require('../ops/ccoJournalBookingBridge');
const { JOURNAL_TYPES } = require('../ops/ccoJournalStore');
const { catalog: journalSchemaCatalog, listSchemas } = require('../ops/ccoJournalSchemas');
const {
  isAllowedJournalPhotoMime,
  normalizeJournalPhotoUpload,
} = require('../ops/ccoJournalPhotoProcess');
const { listJournalTextTemplates } = require('../ops/ccoJournalTextTemplates');
const { listBeforeAfterPhotos, normalizePhotoPhase } = require('../ops/ccoJournalBeforeAfter');
const {
  getPhotoPublishConsent,
  setPhotoPublishConsent,
} = require('../ops/ccoPhotoPublishConsent');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedJournalPhotoMime(file.mimetype, file.originalname)) {
      cb(Object.assign(new Error('Endast JPEG, PNG och HEIC stöds.'), { statusCode: 415 }));
      return;
    }
    cb(null, true);
  },
});

function decodeDataUrl(dataUrl) {
  const raw = normalizeText(dataUrl);
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}

function createCcoJournalRouter({
  journalStore,
  journalPhotoStore = null,
  patientMasterStore = null,
  treatmentEncounterStore = null,
  migrationIndexStore = null,
  patientSystemStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function handle(req, res, run) {
    try {
      const actor = await resolveCcoRouteActor(req, { authStore, config });
      return await run(actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte hantera journalmodulen.' });
    }
  }

  async function requirePatientJournalWritable(actor, patientId) {
    if (!patientMasterStore || !patientId) return;
    const patient = await patientMasterStore.getPatient({
      tenantId: actor.tenantId,
      patientId,
    });
    if (!patient) {
      const error = new Error('Patienten hittades inte.');
      error.statusCode = 404;
      throw error;
    }
    patientMasterStore.assertPatientJournalWritable(patient);
  }

  async function auditJournal(actor, action, targetId) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_journal',
      targetId: targetId || actor.tenantId,
    });
  }

  async function syncJournalPatient360(actor, entry) {
    if (!patientSystemStore || !entry) return null;
    return syncPatient360FromJournalCase({
      patientSystemStore,
      context: buildPatient360SyncContext({
        tenantId: actor.tenantId,
        customerId: entry.patientId,
      }),
      journalEntry: entry,
    });
  }

  router.get(
    '/cco-journal/schemas',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const journalType = normalizeText(req.query.journalType);
        const schemas = journalType ? listSchemas(journalType) : journalSchemaCatalog.schemas;
        await auditJournal(actor, 'cco.journal.schemas.read', journalType || 'all');
        return res.json({
          exportedAt: journalSchemaCatalog.exportedAt,
          schemaCount: schemas.length,
          stats: journalSchemaCatalog.stats,
          serviceBindingHints: journalSchemaCatalog.serviceBindingHints,
          schemas,
        });
      })
  );

  // PII-fri aggregat-statistik för migreringsverifiering: antal journalposter,
  // distinkta patienter (count), fördelning per journaltyp + patient-master-total.
  // Returnerar inga namn/personnummer/journalinnehåll.
  router.get(
    '/cco-journal/stats',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const journal = await journalStore.getStats({ tenantId: actor.tenantId });
        let patientMasterCount = null;
        if (patientMasterStore) {
          const listed = await patientMasterStore.listPatients({
            tenantId: actor.tenantId,
            limit: 1,
            offset: 0,
          });
          patientMasterCount = typeof listed?.total === 'number' ? listed.total : null;
        }
        await auditJournal(actor, 'cco.journal.stats.read', actor.tenantId);
        return res.json({ tenantId: actor.tenantId, journal, patientMasterCount });
      }),
  );

  router.get(
    '/cco-journal/entries',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId saknas.' });
        }
        const entries = await journalStore.listEntries({
          tenantId: actor.tenantId,
          patientId,
          journalType: normalizeText(req.query.journalType),
        });
        await auditJournal(actor, 'cco.journal.entries.read', patientId);
        return res.json({
          entries: entries.map((entry) => journalStore.buildJournalReadout(entry)),
          journalTypes: JOURNAL_TYPES,
        });
      })
  );

  router.get(
    '/cco-journal/entry',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        const entryId = normalizeText(req.query.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        const entry = await journalStore.getEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
        });
        if (!entry) return res.status(404).json({ error: 'Journalposten hittades inte.' });
        await auditJournal(actor, 'cco.journal.entry.read', entryId);
        return res.json({ entry, readout: journalStore.buildJournalReadout(entry) });
      })
  );

  router.put(
    '/cco-journal/entry',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        await requirePatientJournalWritable(actor, patientId);
        const entry = await journalStore.upsertEntry(
          {
            ...body,
            tenantId: actor.tenantId,
            patientId,
          },
          {
            actor: {
              userId: actor.userId,
              role: actor.role,
              displayName: actor.userId,
            },
          }
        );
        let syncedEntry = entry;
        if (treatmentEncounterStore) {
          const synced = await syncJournalEntryToEncounter({
            treatmentEncounterStore,
            journalStore,
            patientMasterStore,
            tenantId: actor.tenantId,
            entry,
            actor: {
              userId: actor.userId,
              role: actor.role,
              displayName: actor.userId,
            },
          });
          if (!synced.skipped) syncedEntry = synced.entry;
        }
        const patientRecord = await syncJournalPatient360(actor, syncedEntry);
        await auditJournal(actor, 'cco.journal.entry.write', syncedEntry.entryId);
        return res.json({
          entry: syncedEntry,
          readout: journalStore.buildJournalReadout(syncedEntry),
          patient360: serializePatient360(patientRecord),
        });
      })
  );

  router.post(
    '/cco-journal/entry/sign',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        await requirePatientJournalWritable(actor, patientId);
        const entry = await journalStore.signEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        if (treatmentEncounterStore) {
          await lockEncounterOnJournalSign({
            treatmentEncounterStore,
            tenantId: actor.tenantId,
            entry,
          });
        }
        await auditJournal(actor, 'cco.journal.entry.sign', entryId);
        return res.json({ entry, readout: journalStore.buildJournalReadout(entry) });
      })
  );

  router.delete(
    '/cco-journal/entry',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        const entryId = normalizeText(req.query.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        const entry = await journalStore.deleteEntry({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await auditJournal(actor, 'cco.journal.entry.delete', entryId);
        return res.json({ entry, readout: journalStore.buildJournalReadout(entry) });
      })
  );

  router.post(
    '/cco-journal/import-historical',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        let files = Array.isArray(body.files) ? body.files : [];
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        await requirePatientJournalWritable(actor, patientId);
        let personnummer = normalizeText(body.personnummer);
        let patient = null;
        if (patientMasterStore) {
          patient = await patientMasterStore.getPatient({
            tenantId: actor.tenantId,
            patientId,
          });
          personnummer = personnummer || patient?.personnummer || '';
        }
        if (!files.length && migrationIndexStore && personnummer) {
          files = await migrationIndexStore.getFilesForPersonnummer(personnummer);
          files = files.filter((file) => file.fileType === 'journal_pdf');
        }
        const result = await journalStore.importHistoricalEntries({
          tenantId: actor.tenantId,
          patientId,
          personnummer,
          files,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await auditJournal(actor, 'cco.journal.import_historical', patientId);
        return res.json(result);
      })
  );

  router.post(
    '/cco-journal/photo',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res, next) => {
      photoUpload.single('photo')(req, res, (err) => {
        if (!err) {
          next();
          return;
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'Bilden är för stor (max 12 MB).' });
          return;
        }
        const statusCode = Number(err.statusCode || 415);
        res.status(statusCode).json({ error: err.message || 'Ogiltig bildfil.' });
      });
    },
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const patientId = normalizeText(req.body?.patientId);
        const entryId = normalizeText(req.body?.entryId);
        const label = normalizeText(req.body?.label);
        const photoPhase = normalizePhotoPhase(req.body?.photoPhase);
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
        await requirePatientJournalWritable(actor, patientId);
        if (!req.file?.buffer?.length) {
          return res.status(400).json({ error: 'Ingen bild mottagen.' });
        }

        let personnummer = normalizeText(req.body?.personnummer);
        if (!personnummer && patientMasterStore) {
          const patient = await patientMasterStore.getPatient({
            tenantId: actor.tenantId,
            patientId,
          });
          personnummer = patient?.personnummer || '';
        }

        const mimeType = String(req.file.mimetype || '').toLowerCase();
        let normalized;
        try {
          normalized = await normalizeJournalPhotoUpload({
            buffer: req.file.buffer,
            mimeType,
            originalName: req.file.originalname,
          });
        } catch (error) {
          const statusCode = Number(error?.statusCode || 415);
          return res.status(statusCode).json({ error: error.message || 'Ogiltig bildfil.' });
        }

        const stored = await journalPhotoStore.savePhoto({
          tenantId: actor.tenantId,
          patientId,
          buffer: normalized.buffer,
          mimeType: normalized.mimeType,
          originalName: normalized.fileName || req.file.originalname,
        });

        const photoActor = {
          userId: actor.userId,
          role: actor.role,
          displayName: actor.userId,
        };
        let entry = await journalStore.addConsultationPhotoAttachment({
          tenantId: actor.tenantId,
          patientId,
          personnummer,
          entryId,
          photo: {
            ...stored,
            label: label || normalized.fileName || 'Konsultationsbild',
            photoPhase,
          },
          actor: photoActor,
        });

        let encounter = null;
        if (treatmentEncounterStore) {
          const synced = await syncConsultationPhotoToEncounter({
            treatmentEncounterStore,
            journalStore,
            patientMasterStore,
            tenantId: actor.tenantId,
            planEntry: entry,
            photo: stored,
            actor: photoActor,
          });
          if (!synced.skipped) {
            entry = synced.plan;
            encounter = synced.encounter;
          }
        }

        const photoPayload = {
          ...stored,
          treatmentEncounterId: encounter?.encounterId || entry?.treatmentEncounterId || '',
        };

        await auditJournal(actor, 'cco.journal.photo.upload', stored.photoId);
        return res.json({
          entry,
          encounter,
          readout: journalStore.buildJournalReadout(entry),
          photo: photoPayload,
        });
      })
  );

  router.get(
    '/cco-journal/photo',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const photoId = normalizeText(req.query.photoId);
        const variant = normalizeText(req.query.variant);
        if (!patientId || !photoId) {
          return res.status(400).json({ error: 'patientId och photoId krävs.' });
        }
        const payload =
          variant === 'annotated'
            ? await journalPhotoStore.readAnnotatedPreview({
                tenantId: actor.tenantId,
                patientId,
                photoId,
              })
            : await journalPhotoStore.readPhoto({
                tenantId: actor.tenantId,
                patientId,
                photoId,
              });
        if (!payload?.buffer) {
          return res.status(404).json({ error: 'Bilden hittades inte.' });
        }
        res.setHeader('Content-Type', payload.mimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=120');
        return res.send(payload.buffer);
      })
  );

  router.post(
    '/cco-journal/plan-photos/clear',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore || !journalStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        if (!patientId || !entryId) {
          return res.status(400).json({ error: 'patientId och entryId krävs.' });
        }
        const smokeOnly = body.smokeOnly !== false;
        const routeActor = {
          userId: actor.userId,
          role: actor.role,
          displayName: actor.userId,
        };
        const { entry, removed } = await journalStore.clearConsultationPhotoAttachments({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          smokeOnly,
          actor: routeActor,
        });
        for (const item of removed) {
          if (!item.photoId) continue;
          await journalPhotoStore.deletePhoto({
            tenantId: actor.tenantId,
            patientId,
            photoId: item.photoId,
          });
        }
        await auditJournal(actor, 'cco.journal.plan_photos.clear', entryId);
        return res.json({
          ok: true,
          removedCount: removed.length,
          smokeOnly,
          entry,
          readout: journalStore.buildJournalReadout(entry),
        });
      })
  );

  router.delete(
    '/cco-journal/photo',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore || !journalStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        const attachmentId = normalizeText(body.attachmentId);
        const photoId = normalizeText(body.photoId);
        if (!patientId || !entryId || !attachmentId || !photoId) {
          return res
            .status(400)
            .json({ error: 'patientId, entryId, attachmentId och photoId krävs.' });
        }
        await requirePatientJournalWritable(actor, patientId);

        const entry = await journalStore.removeConsultationPhotoAttachment({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          attachmentId,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });
        await journalPhotoStore.deletePhoto({
          tenantId: actor.tenantId,
          patientId,
          photoId,
        });
        await auditJournal(actor, 'cco.journal.photo.delete', photoId);
        return res.json({ ok: true, entry });
      })
  );

  router.put(
    '/cco-journal/plan-annotation',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patientId = normalizeText(body.patientId);
        const entryId = normalizeText(body.entryId);
        const attachmentId = normalizeText(body.attachmentId);
        const photoId = normalizeText(body.photoId);
        if (!patientId || !entryId || !attachmentId || !photoId) {
          return res
            .status(400)
            .json({ error: 'patientId, entryId, attachmentId och photoId krävs.' });
        }
        await requirePatientJournalWritable(actor, patientId);

        const annotations =
          body.annotations && typeof body.annotations === 'object'
            ? body.annotations
            : { shapes: [] };
        const planSummary =
          body.planSummary && typeof body.planSummary === 'object' ? body.planSummary : {};

        await journalPhotoStore.saveAnnotations({
          tenantId: actor.tenantId,
          patientId,
          photoId,
          annotations,
          planSummary,
        });

        const previewBuffer = decodeDataUrl(body.previewDataUrl);
        if (previewBuffer) {
          await journalPhotoStore.saveAnnotatedPreview({
            tenantId: actor.tenantId,
            patientId,
            photoId,
            buffer: previewBuffer,
          });
        }

        let entry = await journalStore.updateConsultationPhotoAnnotation({
          tenantId: actor.tenantId,
          patientId,
          entryId,
          attachmentId,
          annotations,
          planSummary,
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });

        if (previewBuffer) {
          entry = await journalStore.markAttachmentAnnotatedPreview({
            tenantId: actor.tenantId,
            patientId,
            entryId,
            attachmentId,
            actor: {
              userId: actor.userId,
              role: actor.role,
              displayName: actor.userId,
            },
          });
        }

        await auditJournal(actor, 'cco.journal.plan_annotation.write', attachmentId);
        return res.json({
          entry,
          readout: journalStore.buildJournalReadout(entry),
        });
      })
  );

  router.get(
    '/cco-journal/plan-annotation',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!journalPhotoStore) {
          return res.status(503).json({ error: 'Journalbilder är inte konfigurerade.' });
        }
        const patientId = normalizeText(req.query.patientId);
        const photoId = normalizeText(req.query.photoId);
        if (!patientId || !photoId) {
          return res.status(400).json({ error: 'patientId och photoId krävs.' });
        }
        const payload = await journalPhotoStore.readAnnotations({
          tenantId: actor.tenantId,
          patientId,
          photoId,
        });
        return res.json({ annotation: payload });
      })
  );

  router.get(
    '/cco-journal/text-templates',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async () => {
        const journalType = normalizeText(req.query.journalType);
        const templates = await listJournalTextTemplates({ journalType });
        return res.json({ templates });
      })
  );

  router.get(
    '/cco-journal/before-after-photos',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patientId = normalizeText(req.query.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId krävs.' });
        }
        await requirePatientJournalWritable(actor, patientId);
        const gallery = await listBeforeAfterPhotos({
          journalStore,
          tenantId: actor.tenantId,
          patientId,
        });
        let publishConsent = null;
        if (patientMasterStore) {
          publishConsent = await getPhotoPublishConsent({
            patientMasterStore,
            tenantId: actor.tenantId,
            patientId,
          });
        }
        return res.json({ ...gallery, publishConsent });
      })
  );

  router.patch(
    '/cco-journal/photo-publish-consent',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        if (!patientMasterStore) {
          return res.status(503).json({ error: 'Patientmaster saknas.' });
        }
        const patientId = normalizeText(req.body?.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patientId krävs.' });
        }
        await requirePatientJournalWritable(actor, patientId);
        const result = await setPhotoPublishConsent({
          patientMasterStore,
          tenantId: actor.tenantId,
          patientId,
          granted: req.body?.granted === true,
          note: normalizeText(req.body?.note),
          actor: {
            userId: actor.userId,
            displayName: actor.userId,
            role: actor.role,
          },
        });
        await auditJournal(actor, 'cco.journal.photo_publish_consent', patientId);
        return res.json(result);
      })
  );

  return router;
}

module.exports = {
  createCcoJournalRouter,
};
