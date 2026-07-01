'use strict';

const express = require('express');
const path = require('node:path');
const { loadSummary, listQueue } = require('../ops/ccoDriveImportReviewReadService');
const {
  applyDriveImportReviewDecision,
  CANARY_TRACK,
} = require('../ops/ccoDriveImportReviewWriteService');
const { getTrackSummary, loadState } = require('../ops/ccoOperatorCanary');

function createCcoDriveImportReviewReadRouter({
  projectRoot,
  config = null,
  resolveStores = null,
  resolvePatientExists = null,
  auditLog = null,
  requireCcoAuthenticated,
  attachRole,
  requirePermission,
} = {}) {
  if (typeof requireCcoAuthenticated !== 'function') {
    throw new Error('requireCcoAuthenticated krävs för ccoDriveImportReviewReadRouter');
  }
  if (typeof attachRole !== 'function') {
    throw new Error('attachRole krävs för ccoDriveImportReviewReadRouter');
  }
  if (typeof requirePermission !== 'function') {
    throw new Error('requirePermission krävs för ccoDriveImportReviewReadRouter');
  }

  const router = express.Router();
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = path.join(root, 'data');
  const writeEnabled = config?.enableDriveImportReviewWrite === true;

  router.use(requireCcoAuthenticated, attachRole, requirePermission('asset.review'));

  router.get('/cco/drive-import-review/summary', (req, res) => {
    try {
      const summary = loadSummary(dataDir, { writeEnabled });
      const canaryPayload = writeEnabled
        ? (() => {
            const { state } = loadState(root);
            return {
              canaryMode: true,
              canary: getTrackSummary(
                state,
                CANARY_TRACK,
                config?.driveImportReviewCanaryMax ?? 25
              ),
            };
          })()
        : { canaryMode: false, canary: null };
      return res.json({ ...summary, ...canaryPayload });
    } catch (err) {
      console.error('[cco/drive-import-review/summary]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda drive-import-review summary.' });
    }
  });

  router.get('/cco/drive-import-review/queue', (req, res) => {
    try {
      const body = listQueue(
        dataDir,
        {
          year: String(req.query.year || 'all'),
          mediaKind: String(req.query.mediaKind || 'all'),
          fileType: String(req.query.fileType || 'all'),
          confidence: String(req.query.confidence || 'all'),
          matchGround: String(req.query.matchGround || 'all'),
          patientId: String(req.query.patientId || '').trim(),
          q: String(req.query.q || '').trim(),
          limit: Number(req.query.limit) || 50,
          offset: Number(req.query.offset) || 0,
        },
        { writeEnabled }
      );
      return res.json(body);
    } catch (err) {
      console.error('[cco/drive-import-review/queue]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda drive-import-review queue.' });
    }
  });

  if (writeEnabled && config && typeof resolveStores === 'function') {
    router.post(
      '/cco/drive-import-review/assets/:assetId/decide',
      express.json(),
      async (req, res) => {
        try {
          const { assetStore } = await resolveStores();
          if (!assetStore) {
            return res.status(503).json({ error: 'asset_store_unavailable' });
          }
          const result = await applyDriveImportReviewDecision({
            assetStore,
            projectRoot: root,
            config,
            auditLog,
            resolvePatientExists,
            assetId: String(req.params.assetId || '').trim(),
            body: req.body || {},
            actor: {
              role: req.headers['x-cco-role'] || 'operator',
              userId:
                String(req.body?.reviewer || req.headers['x-cco-user'] || '').trim() ||
                req.headers['x-cco-role'] ||
                'operator',
            },
          });
          return res.json(result);
        } catch (err) {
          console.error('[cco/drive-import-review/decide]', err);
          return res.status(err.statusCode || 500).json({
            error: err.message,
            detail: err.detail || null,
          });
        }
      }
    );
  }

  router.get('/cco/drive-import-review/canary-status', (req, res) => {
    try {
      const { state } = loadState(root);
      return res.json({
        writeEnabled,
        canary: writeEnabled
          ? getTrackSummary(state, CANARY_TRACK, config?.driveImportReviewCanaryMax ?? 25)
          : null,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCcoDriveImportReviewReadRouter };
