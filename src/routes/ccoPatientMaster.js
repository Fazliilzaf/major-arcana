const express = require('express');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { resolveCcoRouteActor } = require('./ccoRouteShared');
const {
  contentTypeForPath,
  openZipEntryStream,
  resolveZipPath,
} = require('../../scripts/migration/lib/migrationZipReader');
const {
  buildOccasionTimeline,
  extractFileOccasionContext,
} = require('../../scripts/migration/lib/migrationUtils');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createCcoPatientMasterRouter({
  patientMasterStore,
  journalStore = null,
  migrationIndexStore = null,
  patientSystemStore = null,
  authStore,
  config,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  async function auditRead(req, actor, targetId, action) {
    await authStore.addAuditEvent({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      outcome: 'success',
      targetType: 'cco_patient_master',
      targetId: targetId || actor.tenantId,
    });
  }

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
      return res.status(500).json({ error: 'Kunde inte hantera patientmaster.' });
    }
  }

  router.get(
    '/cco-patient-master/stats',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const stats = await patientMasterStore.getTenantStats({ tenantId: actor.tenantId });
        await auditRead(req, actor, actor.tenantId, 'cco.patient_master.stats.read');
        return res.json({ stats });
      })
  );

  router.get(
    '/cco-patient-master/patients',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const result = await patientMasterStore.listPatients({
          tenantId: actor.tenantId,
          query: normalizeText(req.query.q || req.query.query),
          flags: String(req.query.flags || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          limit: req.query.limit,
          offset: req.query.offset,
        });
        await auditRead(req, actor, actor.tenantId, 'cco.patient_master.list.read');
        return res.json({
          ...result,
          patients: result.patients.map((patient) =>
            patientMasterStore.buildPatientCardReadout(patient)
          ),
        });
      })
  );

  router.get(
    '/cco-patient-master/patient',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const patient = await patientMasterStore.getPatient({
          tenantId: actor.tenantId,
          patientId: normalizeText(req.query.patientId),
          personnummer: normalizeText(req.query.personnummer),
        });
        if (!patient) {
          return res.status(404).json({ error: 'Patienten hittades inte.' });
        }
        await auditRead(req, actor, patient.id, 'cco.patient_master.patient.read');

        let journalEntries = [];
        if (journalStore) {
          journalEntries = await journalStore.listEntries({
            tenantId: actor.tenantId,
            patientId: patient.id,
          });
        }

        let driveFiles = [];
        if (migrationIndexStore && patient.personnummer) {
          driveFiles = await migrationIndexStore.getFilesForPersonnummer(patient.personnummer);
        }
        const enrichedDriveFiles = driveFiles.map((file) => {
          const occasionContext = extractFileOccasionContext(file);
          return {
            ...file,
            occasionContext,
            viewUrl: `/api/v1/cco-patient-master/file?fileId=${encodeURIComponent(file.id)}`,
          };
        });

        return res.json({
          patient,
          card: patientMasterStore.buildPatientCardReadout(patient),
          journalEntries: journalEntries.map((entry) => journalStore.buildJournalReadout(entry)),
          driveFiles: enrichedDriveFiles,
          occasionTimeline: buildOccasionTimeline(enrichedDriveFiles),
        });
      })
  );

  router.get(
    '/cco-patient-master/file',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const fileId = normalizeText(req.query.fileId);
        if (!fileId || !migrationIndexStore) {
          return res.status(400).json({ error: 'fileId saknas.' });
        }
        const file = await migrationIndexStore.getFileById(fileId);
        if (!file) {
          return res.status(404).json({ error: 'Filen hittades inte i migration-index.' });
        }
        if (file.source === 'folder' && file.folderRoot) {
          const absPath = path.join(file.folderRoot, file.relativePath);
          await auditRead(req, actor, fileId, 'cco.patient_master.file.read');
          res.type(contentTypeForPath(file.relativePath));
          res.setHeader('Cache-Control', 'private, max-age=3600');
          return res.sendFile(absPath);
        }
        const zipPath = resolveZipPath(config.migrationDataRoot, file.zipName);
        const stream = openZipEntryStream({ zipPath, relativePath: file.relativePath });
        res.setHeader('Content-Type', contentTypeForPath(file.relativePath));
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${path.basename(file.relativePath).replace(/"/g, '')}"`
        );
        void auditRead(req, actor, fileId, 'cco.patient_master.file.read');
        const exitCodePromise = new Promise((resolve, reject) => {
          stream.once('close', resolve);
          stream.once('error', reject);
        });
        try {
          await pipeline(stream.stdout, res);
        } catch (error) {
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Kunde inte streama filen.' });
          }
          return;
        }
        const exitCode = await exitCodePromise;
        if (Number(exitCode) !== 0 && !res.headersSent) {
          return res.status(404).json({ error: 'Kunde inte läsa filen från zip.' });
        }
      })
  );

  router.put(
    '/cco-patient-master/patient',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) =>
      handle(req, res, async (actor) => {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patient = await patientMasterStore.upsertPatient({
          ...body,
          tenantId: actor.tenantId,
        });
        await authStore.addAuditEvent({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: 'cco.patient_master.patient.write',
          outcome: 'success',
          targetType: 'cco_patient_master',
          targetId: patient.id,
        });
        return res.json({
          patient,
          card: patientMasterStore.buildPatientCardReadout(patient),
        });
      })
  );

  return router;
}

module.exports = {
  createCcoPatientMasterRouter,
};
