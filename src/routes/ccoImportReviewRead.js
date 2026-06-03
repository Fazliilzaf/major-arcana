'use strict';

const express = require('express');
const path = require('node:path');
const { loadSummary, listQueue } = require('../ops/ccoImportReviewReadService');
const { applyImportReviewDecision } = require('../ops/ccoImportReviewWriteService');
const { getTrackSummary, loadState } = require('../ops/ccoOperatorCanary');

function createCcoImportReviewReadRouter({ projectRoot, config = null, auditLog = null } = {}) {
  const router = express.Router();
  const root = projectRoot || path.join(__dirname, '../..');
  const dataDir = path.join(root, 'data');
  const writeEnabled = config?.enableImportReviewWrite === true;

  router.get('/cco/import-review/summary', (req, res) => {
    try {
      const summary = loadSummary(dataDir, root);
      const { state } = loadState(root);
      const canary = getTrackSummary(state, 'import', config?.importReviewCanaryMax ?? 25);
      return res.json({
        ...summary,
        writeEnabled,
        canaryMode: writeEnabled,
        canary,
        rules: [
          'Canary max 25 beslut',
          'Endast stark kundmatch (ett suggestedPatientId)',
          'Ingen ny kund',
          'Ingen auto-import',
        ],
      });
    } catch (err) {
      console.error('[cco/import-review/summary]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda import-review summary.' });
    }
  });

  router.get('/cco/import-review/queue', (req, res) => {
    try {
      const source = String(req.query.source || 'all');
      const status = String(req.query.status || 'pending');
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const eligibleOnly = String(req.query.eligible || '') === 'strong';
      const body = listQueue(dataDir, {
        source,
        status,
        limit,
        offset,
        eligibleOnly,
        writeEnabled,
      });
      return res.json({ ...body, writeEnabled, canaryMode: writeEnabled });
    } catch (err) {
      console.error('[cco/import-review/queue]', err);
      return res
        .status(500)
        .json({ error: err.message || 'Kunde inte ladda import-review queue.' });
    }
  });

  if (writeEnabled && config) {
    router.post('/cco/import-review/decide', express.json(), async (req, res) => {
      try {
        const result = await applyImportReviewDecision({
          projectRoot: root,
          config,
          auditLog,
          itemId: String(req.body?.itemId || '').trim(),
          action: String(req.body?.action || '').trim(),
          reason: String(req.body?.reason || '').trim(),
          reviewer: String(req.body?.reviewer || req.headers['x-cco-user'] || '').trim(),
          actor: {
            role: req.headers['x-cco-role'] || 'operator',
            userId: req.headers['x-cco-user'] || null,
          },
        });
        return res.json(result);
      } catch (err) {
        console.error('[cco/import-review/decide]', err);
        return res.status(err.statusCode || 500).json({
          error: err.message,
          detail: err.detail || null,
        });
      }
    });
  }

  router.get('/cco/import-review/canary-status', (req, res) => {
    try {
      const { state } = loadState(root);
      return res.json({
        writeEnabled,
        canary: getTrackSummary(state, 'import', config?.importReviewCanaryMax ?? 25),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCcoImportReviewReadRouter };
