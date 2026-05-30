'use strict';

const express = require('express');
const multer = require('multer');
const {
  WORKSPACE_ID,
  normalizeText,
  resolveCcoRouteActor,
  buildCcoRouteContext,
} = require('./ccoRouteShared');
const { requirePermission } = require('../security/ccoRbac');
const {
  localizeSessionSummary,
  localizeMetric,
  PATIENT_VIEW_DISCLAIMER,
} = require('../ops/aisiaTerminology');
const {
  BASELINE_ZONES,
  VALID_MAGNIFICATIONS,
  VALID_SPECTRUMS,
} = require('../ops/ccoScalpAnalysisStore');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});

function photoCategoryForSessionType(sessionType) {
  const t = normalizeText(sessionType).toLowerCase();
  if (t === 'pre_op' || t === 'post_op') return 'photo_during';
  if (t === 'follow_up') return 'photo_after';
  return 'photo_before';
}

async function ingestFileAsAsset({
  buffer,
  mimeType,
  originalFileName,
  patientId,
  encounterId,
  category,
  documentDate,
  secureStorage,
  assetStore,
  actor,
}) {
  if (!buffer || !buffer.length) {
    const e = new Error('Tom fil.');
    e.statusCode = 400;
    throw e;
  }
  const put = await secureStorage.putObject({
    body: buffer,
    contentType: mimeType || 'application/octet-stream',
    metadata: {
      patientId,
      category,
      originalFileName,
      documentDate,
      importedAt: new Date().toISOString(),
    },
  });

  let thumbnailKey = null;
  if (mimeType && mimeType.startsWith('image/')) {
    thumbnailKey = await secureStorage.generateThumbnailIfImage(put.storageKey, mimeType);
  }

  const asset = await assetStore.addAsset(
    {
      patientId,
      encounterId: encounterId || null,
      sourceSystem: 'aisia_ds3',
      category,
      storageProvider: 'local',
      storageKey: put.storageKey,
      thumbnailKey,
      checksum: put.checksum,
      fileSize: put.size || buffer.length,
      mimeType: mimeType || 'application/octet-stream',
      originalFileName: originalFileName || null,
      documentDate: documentDate || null,
      status: 'IMPORTED_TO_CCO',
      confidence: 'high',
      isJournalRelevant: category === 'aisia_report',
      isPatientVisible: category !== 'aisia_report',
      importedBy: actor?.userId || null,
    },
    { actor }
  );

  await assetStore.transitionStatus(asset.id, 'VERIFIED_IN_CCO', {
    actor,
    reason: 'scalp_manual_import',
  });
  await assetStore.markAsVisibleOnPatientCard(asset.id, { actor });
  return assetStore.getAsset(asset.id);
}

function createCcoScalpAnalysisRouter({ resolveStores, authStore, config, attachRole }) {
  const router = express.Router();

  function getDeps() {
    if (typeof resolveStores !== 'function') {
      throw new Error('resolveStores krävs för ccoScalpAnalysisRouter');
    }
    return resolveStores();
  }

  async function handle(req, res, run) {
    try {
      const effectiveAuthStore = authStore || req.app?.locals?.authStore || null;
      const actor = await resolveCcoRouteActor(req, { authStore: effectiveAuthStore, config });
      const context = buildCcoRouteContext(req, actor);
      return await run(context, actor);
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res
          .status(statusCode)
          .json({ error: error.message, metadata: error.metadata || null });
      }
      console.error('[cco-scalp-analysis]', error);
      return res.status(500).json({ error: 'Kunde inte hantera hår-/scalpanalys.' });
    }
  }

  router.get(
    '/cco/scalp-analysis/patient/:patientId',
    attachRole,
    requirePermission('scalp.read'),
    (req, res) =>
      handle(req, res, async (context) => {
        const { scalpStore } = getDeps();
        const patientId = normalizeText(req.params.patientId);
        const bundle = scalpStore.getPatientBundle(patientId, { tenantId: context.tenantId });
        const sessions = bundle.sessions.map((session) => ({
          ...session,
          protocol: scalpStore.checkCaptureProtocolCompleteness(session.id),
          imageCount: scalpStore.listImagesForSession(session.id).length,
          metricCount: scalpStore.listMetricsForSession(session.id).length,
        }));
        return res.json({
          ...bundle,
          sessions,
          zones: BASELINE_ZONES,
          evaluatedAt: new Date().toISOString(),
        });
      })
  );

  router.get(
    '/cco/scalp-analysis/patient/:patientId/protocol-status',
    attachRole,
    requirePermission('scalp.read'),
    (req, res) =>
      handle(req, res, async (context) => {
        const { scalpStore } = getDeps();
        const patientId = normalizeText(req.params.patientId);
        const sessions = scalpStore.listSessionsForPatient(patientId, {
          tenantId: context.tenantId,
        });
        const baseline = sessions.find(
          (s) => s.sessionType === 'consultation' && s.status === 'verified'
        );
        const latest = sessions[0] || null;
        const protocol = latest ? scalpStore.checkCaptureProtocolCompleteness(latest.id) : null;
        return res.json({
          patientId,
          baselineExists: !!baseline,
          baselineSessionId: baseline?.id || null,
          latestSessionId: latest?.id || null,
          protocol,
          imagingChecklist: {
            baselineComplete: !!baseline,
            donorLeft: protocol ? !protocol.missingDonorLeft : false,
            donorRight: protocol ? !protocol.missingDonorRight : false,
            analysisVerified: latest?.status === 'verified',
          },
        });
      })
  );

  router.get(
    '/cco/scalp-analysis/patient/:patientId/patient-view',
    attachRole,
    requirePermission('scalp.read'),
    (req, res) =>
      handle(req, res, async (context) => {
        const { scalpStore } = getDeps();
        const patientId = normalizeText(req.params.patientId);
        const sessions = scalpStore
          .listSessionsForPatient(patientId, { tenantId: context.tenantId })
          .filter((s) => s.status === 'verified');
        const summaries = sessions.map((session) =>
          localizeSessionSummary(session, scalpStore.listMetricsForSession(session.id))
        );
        return res.json({
          patientId,
          disclaimer: PATIENT_VIEW_DISCLAIMER,
          sessions: summaries,
        });
      })
  );

  router.get(
    '/cco/scalp-analysis/sessions/:sessionId',
    attachRole,
    requirePermission('scalp.read'),
    (req, res) =>
      handle(req, res, async () => {
        const { scalpStore } = getDeps();
        const bundle = scalpStore.getSessionBundle(normalizeText(req.params.sessionId));
        if (!bundle) return res.status(404).json({ error: 'Session hittades inte.' });
        return res.json({
          ...bundle,
          metrics: bundle.metrics.map((m) => localizeMetric(m)),
        });
      })
  );

  router.post(
    '/cco/scalp-analysis/sessions',
    attachRole,
    requirePermission('scalp.write'),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore } = getDeps();
        const body = req.body || {};
        const session = await scalpStore.createSession(
          {
            tenantId: context.tenantId || config.defaultTenantId,
            patientId: normalizeText(body.patientId || context.customerId),
            encounterId: normalizeText(body.encounterId) || null,
            source: normalizeText(body.source) || 'aisia_ds3',
            sessionType: normalizeText(body.sessionType) || 'consultation',
            date: normalizeText(body.date) || new Date().toISOString().slice(0, 10),
            operatorId: normalizeText(body.operatorId) || actor.userId || null,
            deviceId: normalizeText(body.deviceId) || null,
            softwareVersion: normalizeText(body.softwareVersion) || null,
            clinicianNotes: normalizeText(body.clinicianNotes) || null,
            status: 'draft',
          },
          { actor: { ...actor, role: req.cco?.role } }
        );
        return res.status(201).json({ session });
      })
  );

  router.post(
    '/cco/scalp-analysis/sessions/:sessionId/import-report',
    attachRole,
    requirePermission('scalp.write'),
    upload.single('file'),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore, assetStore, secureStorage } = getDeps();
        const sessionId = normalizeText(req.params.sessionId);
        const session = scalpStore.getSession(sessionId);
        if (!session) return res.status(404).json({ error: 'Session hittades inte.' });
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'PDF-fil krävs (field: file).' });

        const asset = await ingestFileAsAsset({
          buffer: file.buffer,
          mimeType: file.mimetype || 'application/pdf',
          originalFileName: file.originalname,
          patientId: session.patientId,
          encounterId: session.encounterId,
          category: 'aisia_report',
          documentDate: session.date,
          secureStorage,
          assetStore,
          actor: { ...actor, role: req.cco?.role },
        });

        const updated = await scalpStore.attachReport(sessionId, asset.id, {
          actor: { ...actor, role: req.cco?.role },
        });
        return res.json({
          session: updated,
          reportAsset: { id: asset.id, mimeType: asset.mimeType },
        });
      })
  );

  router.post(
    '/cco/scalp-analysis/sessions/:sessionId/import-images',
    attachRole,
    requirePermission('scalp.write'),
    upload.array('files', 20),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore, assetStore, secureStorage } = getDeps();
        const sessionId = normalizeText(req.params.sessionId);
        const session = scalpStore.getSession(sessionId);
        if (!session) return res.status(404).json({ error: 'Session hittades inte.' });

        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length)
          return res.status(400).json({ error: 'Minst en bild krävs (field: files).' });

        let zones = [];
        try {
          zones = JSON.parse(req.body?.zonesJson || '[]');
        } catch {
          zones = [];
        }
        const defaultZone = normalizeText(req.body?.zone) || 'problem_area';
        const magnification = normalizeText(req.body?.magnification) || null;
        const spectrum = normalizeText(req.body?.spectrum) || null;
        const category = photoCategoryForSessionType(session.sessionType);

        const images = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const zone = normalizeText(zones[i]?.zone || zones[i]) || defaultZone;
          const asset = await ingestFileAsAsset({
            buffer: file.buffer,
            mimeType: file.mimetype || 'image/jpeg',
            originalFileName: file.originalname,
            patientId: session.patientId,
            encounterId: session.encounterId,
            category,
            documentDate: session.date,
            secureStorage,
            assetStore,
            actor: { ...actor, role: req.cco?.role },
          });
          const image = await scalpStore.addImage(
            {
              sessionId,
              patientId: session.patientId,
              encounterId: session.encounterId,
              zone,
              magnification: magnification || zones[i]?.magnification || null,
              spectrum: spectrum || zones[i]?.spectrum || null,
              assetId: asset.id,
              thumbnailAssetId: asset.thumbnailKey ? asset.id : null,
              captureTime: session.date,
            },
            { actor: { ...actor, role: req.cco?.role } }
          );
          images.push({ image, assetId: asset.id });
        }
        return res.json({ sessionId, images, count: images.length });
      })
  );

  router.post(
    '/cco/scalp-analysis/sessions/:sessionId/metrics',
    attachRole,
    requirePermission('scalp.write'),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore } = getDeps();
        const sessionId = normalizeText(req.params.sessionId);
        const metrics = await scalpStore.addMetrics(
          sessionId,
          req.body?.metrics || req.body || [],
          {
            actor: { ...actor, role: req.cco?.role },
          }
        );
        return res.status(201).json({
          metrics: metrics.map((m) => localizeMetric(m)),
        });
      })
  );

  router.post(
    '/cco/scalp-analysis/sessions/:sessionId/verify',
    attachRole,
    requirePermission('scalp.verify'),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore } = getDeps();
        const sessionId = normalizeText(req.params.sessionId);
        const session = await scalpStore.verifySession(sessionId, {
          verifiedBy: actor.userId,
          clinicianNotes: normalizeText(req.body?.clinicianNotes),
          actor: { ...actor, role: req.cco?.role },
        });
        return res.json({ session });
      })
  );

  router.post(
    '/cco/scalp-analysis/comparisons',
    attachRole,
    requirePermission('scalp.write'),
    (req, res) =>
      handle(req, res, async (context, actor) => {
        const { scalpStore } = getDeps();
        const body = req.body || {};
        const comparison = await scalpStore.createComparison(
          {
            patientId: normalizeText(body.patientId),
            baselineSessionId: normalizeText(body.baselineSessionId),
            comparisonSessionId: normalizeText(body.comparisonSessionId),
            zone: normalizeText(body.zone) || null,
            metricChanges: body.metricChanges || null,
            imageComparison: body.imageComparison || null,
            clinicianConclusion: normalizeText(body.clinicianConclusion) || null,
          },
          { actor: { ...actor, role: req.cco?.role } }
        );
        return res.status(201).json({ comparison });
      })
  );

  router.get(
    '/cco/scalp-analysis/meta/enums',
    attachRole,
    requirePermission('scalp.read'),
    (req, res) =>
      res.json({
        zones: BASELINE_ZONES,
        magnifications: VALID_MAGNIFICATIONS,
        spectrums: VALID_SPECTRUMS,
        workspaceId: WORKSPACE_ID,
      })
  );

  return router;
}

module.exports = { createCcoScalpAnalysisRouter, ingestFileAsAsset, photoCategoryForSessionType };
