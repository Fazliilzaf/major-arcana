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
const { JOURNAL_TYPES } = require('../ops/ccoJournalStore');
const {
  isAllowedJournalPhotoMime,
  normalizeJournalPhotoUpload,
} = require('../ops/ccoJournalPhotoProcess');

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
        const patientRecord = await syncJournalPatient360(actor, entry);
        await auditJournal(actor, 'cco.journal.entry.write', entry.entryId);
        return res.json({
          entry,
          readout: journalStore.buildJournalReadout(entry),
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
        if (!patientId) return res.status(400).json({ error: 'patientId saknas.' });
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

        const entry = await journalStore.addConsultationPhotoAttachment({
          tenantId: actor.tenantId,
          patientId,
          personnummer,
          entryId,
          photo: { ...stored, label: label || normalized.fileName || 'Konsultationsbild' },
          actor: {
            userId: actor.userId,
            role: actor.role,
            displayName: actor.userId,
          },
        });

        await auditJournal(actor, 'cco.journal.photo.upload', stored.photoId);
        return res.json({
          entry,
          readout: journalStore.buildJournalReadout(entry),
          photo: stored,
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

  return router;
}

module.exports = {
  createCcoJournalRouter,
};
