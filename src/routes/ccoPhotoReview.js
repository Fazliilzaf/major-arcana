'use strict';

const express = require('express');
const path = require('node:path');

const PHOTO_REVIEW_REPO_ROOT = path.join(__dirname, '../..');
const fs = require('node:fs');
const { classify, isPhotoCategory } = require('../ops/ccoAssetImportPipeline');
const {
  filterPatientsForPilot,
  pilotSummary,
  aggregateDecisionStats,
  isPilotRestricted,
} = require('../ops/ccoPhotoReviewPilot');

const PHOTO_CATS = new Set(['photo_before', 'photo_during', 'photo_after']);
const VALID_DECISIONS = new Set(['approve', 'reject', 'mark_duplicate']);
const VALID_PHOTO_CATEGORIES = ['photo_before', 'photo_during', 'photo_after'];
const REPO_ROOT = path.resolve(__dirname, '../..');

const BATCH_MANIFESTS = [
  'data/p0m1-prod-batch1-patient-list.json',
  'data/p0m3-prod-batch2-patient-list.json',
  'data/p0m4-prod-batch3-patient-list.json',
  'data/p0m5-prod-batch4-patient-list.json',
  'data/p0m5-prod-batch5-patient-list.json',
];

let batchLabelByPatient = null;

function loadBatchLabelByPatient() {
  if (batchLabelByPatient) return batchLabelByPatient;
  batchLabelByPatient = {};
  for (const rel of BATCH_MANIFESTS) {
    const p = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(p)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const pt of j.patients || []) {
        if (pt.ccoPatientId && pt.batchLabel) {
          batchLabelByPatient[pt.ccoPatientId] = pt.batchLabel;
        }
      }
    } catch {
      /* skip */
    }
  }
  return batchLabelByPatient;
}

function redactFileName(name) {
  if (!name) return 'FILE-[REDACTED]';
  const lower = String(name).toLowerCase();
  if (/^photo-/.test(lower) || /\.jpe?g$/i.test(lower)) return 'PHOTO-[REDACTED].jpg';
  if (/^img_/.test(lower)) return 'IMG_[REDACTED]';
  return 'FILE-[REDACTED]';
}

function reviewPriority(classification) {
  if (classification.confidence === 'high') return 1;
  if (classification.confidence === 'medium') return 2;
  return 3;
}

function isPhotoReviewAsset(asset) {
  if (!asset || asset.status !== 'NEEDS_REVIEW') return false;
  if (PHOTO_CATS.has(asset.category)) return true;
  const classification = classify({
    mimeType: asset.mimeType,
    fileName: asset.originalFileName,
    sourceFolder: asset.originalDrivePath,
  });
  return (
    isPhotoCategory(classification.category) || String(asset.mimeType || '').startsWith('image/')
  );
}

function buildUncertaintyReason(classification, asset) {
  const parts = [];
  if (classification.confidence === 'low') {
    parts.push('Låg confidence från filnamn/mapp-heuristik');
  } else if (classification.confidence === 'medium') {
    parts.push('Medium confidence — manuell bekräftelse krävs');
  }
  if (asset.category && classification.category && asset.category !== classification.category) {
    parts.push('Nuvarande kategori skiljer från förslag');
  }
  parts.push('Migreringspolicy: foton förblir NEEDS_REVIEW tills manuellt godkända (Fas 2)');
  return parts.join(' · ');
}

function patientDocSummary(allAssets, patientId) {
  let journalVisibleCount = 0;
  let formVisibleCount = 0;
  for (const a of allAssets) {
    if (a.patientId !== patientId || a.status !== 'VISIBLE_ON_PATIENT_CARD') continue;
    if (a.category === 'journal' || a.category === 'cco_journal_sign') journalVisibleCount += 1;
    if (a.category === 'form') formVisibleCount += 1;
  }
  return {
    journalVisibleCount,
    formVisibleCount,
    hasVisibleJournalOrForm: journalVisibleCount + formVisibleCount > 0,
  };
}

function serializeReviewItem(asset, batchLabels, { writeEnabled = false } = {}) {
  const classification = classify({
    mimeType: asset.mimeType,
    fileName: asset.originalFileName,
    sourceFolder: asset.originalDrivePath,
  });
  const hasStorageKey = !!(asset.storageKey && asset.storageKey !== 'pending-no-binary');
  const hasChecksum = !!asset.checksum;
  const previewAvailable = hasStorageKey && hasChecksum;
  return {
    assetId: asset.id,
    patientId: asset.patientId,
    currentStatus: asset.status,
    currentCategory: asset.category,
    suggestedCategory: classification.category,
    confidence: classification.confidence,
    reason: classification.reason || 'folder_or_filename_heuristic',
    uncertaintyReason: buildUncertaintyReason(classification, asset),
    requiresManualReview: true,
    notApprovedWarning: writeEnabled
      ? 'Bilden är inte godkänd och syns inte på patientkort. Ett beslut i taget — reason krävs.'
      : 'Bilden är inte godkänd och syns inte på patientkort. Read-only — ingen statusändring.',
    priority: reviewPriority(classification),
    mimeType: asset.mimeType,
    fileName: redactFileName(asset.originalFileName),
    importedAt: asset.importedAt || null,
    importRunId: asset.importRunId || null,
    batchLabel: batchLabels[asset.patientId] || null,
    hasStorageKey,
    hasChecksum,
    previewAvailable,
    previewUrl: previewAvailable ? `/api/v1/cco/assets/${asset.id}/download?inline=1` : null,
    thumbnailUrl: asset.thumbnailKey ? `/api/v1/cco/assets/${asset.id}/thumbnail` : null,
  };
}

function reviewPhase(writeEnabled, pilotConfig) {
  if (!writeEnabled) return 'fas1_readonly';
  if (pilotConfig?.fullCohort) return 'fas2_full_manual_review';
  if (isPilotRestricted(pilotConfig)) return 'fas2_single_decision_pilot';
  return 'fas2_single_decision';
}

function buildProgressPayload({ assetStore, auditLog, pilotConfig }) {
  const allAssets = Object.values(assetStore._state().items || {});
  const pending = allAssets.filter(isPhotoReviewAsset);
  const visiblePhotos = allAssets.filter(
    (a) => PHOTO_CATS.has(a.category) && a.status === 'VISIBLE_ON_PATIENT_CARD'
  ).length;
  const decisions = aggregateDecisionStats(auditLog);
  const milestones = Math.floor(decisions.total / 100);
  return {
    pendingPhotos: pending.length,
    patientsWithPendingPhotos: new Set(pending.map((a) => a.patientId)).size,
    visiblePhotosAfterReview: visiblePhotos,
    decisions,
    milestonesCompleted: milestones,
    nextMilestoneAt: (milestones + 1) * 100,
    fullCohort: !!pilotConfig?.fullCohort,
  };
}

function actorFromReq(req) {
  return {
    role: req.cco?.role || 'unknown',
    userId: req.headers['x-cco-user'] || null,
    tenantId: req.headers['x-cco-tenant'] || null,
  };
}

function createCcoPhotoReviewRouter({
  resolveStores,
  requireCcoAuthenticated,
  attachRole,
  requirePermission,
  auditLog,
  writeEnabled = false,
  pilotConfig = null,
  onMutation = null,
}) {
  if (typeof requireCcoAuthenticated !== 'function') {
    throw new Error(
      'createCcoPhotoReviewRouter kräver requireCcoAuthenticated (auth) — foto-review får inte serveras oautentiserat.'
    );
  }
  const router = express.Router();
  // Patientfoton → kräver INLOGGAD operatör på alla foto-review-routes (anonym defaultar
  // annars till operator-rollen). Router-nivå-grind före all per-route attachRole/permission.
  router.use(requireCcoAuthenticated);
  const batchLabels = loadBatchLabelByPatient();
  const enrichedPilotConfig = pilotConfig
    ? { ...pilotConfig, projectRoot: pilotConfig.projectRoot || PHOTO_REVIEW_REPO_ROOT }
    : null;

  router.get(
    '/photo-review/summary',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const { assetStore } = await resolveStores();
        const allAssets = Object.values(assetStore._state().items || {});
        const items = allAssets.filter(isPhotoReviewAsset);

        const byConfidence = { high: 0, medium: 0, low: 0 };
        let oldestAt = null;
        let missingStorageKey = 0;
        let missingChecksum = 0;
        let photosVisible = 0;

        for (const asset of allAssets) {
          if (PHOTO_CATS.has(asset.category) && asset.status === 'VISIBLE_ON_PATIENT_CARD') {
            photosVisible += 1;
          }
        }

        for (const asset of items) {
          const row = serializeReviewItem(asset, batchLabels, { writeEnabled });
          byConfidence[row.confidence] = (byConfidence[row.confidence] || 0) + 1;
          if (!row.hasStorageKey) missingStorageKey += 1;
          if (!row.hasChecksum) missingChecksum += 1;
          const at = asset.importedAt || null;
          if (at && (!oldestAt || at < oldestAt)) oldestAt = at;
        }

        if (auditLog) {
          auditLog.append({
            action: 'photo_review.summary_read',
            actor: actorFromReq(req),
            target: { kind: 'photo_review', id: 'summary' },
            result: 'ok',
            detail: { pendingPhotos: items.length, phase: reviewPhase(writeEnabled, pilotConfig) },
          });
        }

        const pilot = writeEnabled
          ? pilotSummary(enrichedPilotConfig || {}, auditLog)
          : { active: false };
        const scopedItems =
          pilot.active && pilot.patientIds?.length
            ? items.filter((a) => pilot.patientIds.includes(a.patientId))
            : items;
        const progress = buildProgressPayload({
          assetStore,
          auditLog,
          pilotConfig: enrichedPilotConfig || {},
        });

        res.json({
          pendingPhotos: scopedItems.length,
          patientsWithPendingPhotos: new Set(scopedItems.map((a) => a.patientId)).size,
          pendingPhotosAll: items.length,
          byConfidence,
          oldestImportedAt: oldestAt,
          missingStorageKey,
          missingChecksum,
          photosVisibleCount: photosVisible,
          readOnly: !writeEnabled,
          writeEnabled: !!writeEnabled,
          phase: reviewPhase(writeEnabled, pilotConfig),
          pilot,
          progress,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/photo-review/patients',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const { assetStore } = await resolveStores();
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
        const q = String(req.query.q || '')
          .trim()
          .toLowerCase();

        const allAssets = Object.values(assetStore._state().items || {});
        const items = allAssets.filter(isPhotoReviewAsset);
        const groups = new Map();

        for (const asset of items) {
          if (!groups.has(asset.patientId)) {
            const doc = patientDocSummary(allAssets, asset.patientId);
            groups.set(asset.patientId, {
              patientId: asset.patientId,
              batchLabel: batchLabels[asset.patientId] || null,
              pendingCount: 0,
              highConfidenceCount: 0,
              oldestAt: null,
              ...doc,
            });
          }
          const g = groups.get(asset.patientId);
          g.pendingCount += 1;
          const row = serializeReviewItem(asset, batchLabels, { writeEnabled });
          if (row.confidence === 'high') g.highConfidenceCount += 1;
          const at = asset.importedAt || null;
          if (at && (!g.oldestAt || at < g.oldestAt)) g.oldestAt = at;
        }

        let sorted = [...groups.values()].sort((a, b) => {
          if (b.highConfidenceCount !== a.highConfidenceCount) {
            return b.highConfidenceCount - a.highConfidenceCount;
          }
          return b.pendingCount - a.pendingCount;
        });

        sorted =
          writeEnabled && isPilotRestricted(enrichedPilotConfig || {})
            ? filterPatientsForPilot(sorted, enrichedPilotConfig || {})
            : sorted;

        if (q) {
          sorted = sorted.filter(
            (p) =>
              p.patientId.toLowerCase().includes(q) ||
              String(p.batchLabel || '')
                .toLowerCase()
                .includes(q)
          );
        }

        res.json({
          total: sorted.length,
          offset,
          limit,
          readOnly: !writeEnabled,
          writeEnabled: !!writeEnabled,
          phase: reviewPhase(writeEnabled, pilotConfig),
          pilot: writeEnabled
            ? pilotSummary(enrichedPilotConfig || {}, auditLog)
            : { active: false },
          patients: sorted.slice(offset, offset + limit),
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/photo-review/patients/:patientId',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const patientId = String(req.params.patientId || '').trim();
        if (!patientId) return res.status(400).json({ error: 'patient_id_required' });

        const { assetStore } = await resolveStores();
        const allAssets = Object.values(assetStore._state().items || {});
        const items = allAssets
          .filter((a) => a.patientId === patientId && isPhotoReviewAsset(a))
          .map((a) => serializeReviewItem(a, batchLabels, { writeEnabled }))
          .sort((a, b) => a.priority - b.priority);

        const pilot = writeEnabled
          ? pilotSummary(enrichedPilotConfig || {}, auditLog)
          : { active: false };
        if (
          isPilotRestricted(enrichedPilotConfig || {}) &&
          pilot.patientIds.length &&
          !pilot.patientIds.includes(patientId)
        ) {
          return res.status(403).json({ error: 'pilot_patient_not_allowed' });
        }

        const patientSummary = {
          patientId,
          batchLabel: batchLabels[patientId] || null,
          pendingPhotos: items.length,
          ...patientDocSummary(allAssets, patientId),
        };

        if (auditLog) {
          auditLog.append({
            action: 'photo_review.patient_read',
            actor: actorFromReq(req),
            target: { kind: 'patient', id: patientId },
            result: 'ok',
            detail: { pendingPhotos: items.length, phase: reviewPhase(writeEnabled, pilotConfig) },
          });
        }

        res.json({
          ...patientSummary,
          items,
          readOnly: !writeEnabled,
          writeEnabled: !!writeEnabled,
          phase: reviewPhase(writeEnabled, pilotConfig),
          pilot,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/photo-review/queue',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const { assetStore } = await resolveStores();
        const allAssets = Object.values(assetStore._state().items || {});
        let items = allAssets
          .filter(isPhotoReviewAsset)
          .map((a) => serializeReviewItem(a, batchLabels, { writeEnabled }))
          .sort((a, b) => {
            const pc = a.patientId.localeCompare(b.patientId);
            if (pc !== 0) return pc;
            return a.priority - b.priority;
          });

        const pilot = writeEnabled
          ? pilotSummary(enrichedPilotConfig || {}, auditLog)
          : { active: false };
        if (pilot.active && pilot.patientIds?.length) {
          items = items.filter((i) => pilot.patientIds.includes(i.patientId));
        }

        res.json({
          total: items.length,
          phase: reviewPhase(writeEnabled, pilotConfig),
          writeEnabled: !!writeEnabled,
          items,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/photo-review/progress',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const { assetStore } = await resolveStores();
        const progress = buildProgressPayload({
          assetStore,
          auditLog,
          pilotConfig: enrichedPilotConfig || {},
        });
        if (auditLog) {
          auditLog.append({
            action: 'photo_review.progress_read',
            actor: actorFromReq(req),
            target: { kind: 'photo_review', id: 'progress' },
            result: 'ok',
            detail: progress,
          });
        }
        res.json({
          phase: reviewPhase(writeEnabled, pilotConfig),
          ...progress,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/photo-review/canary-status',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const { loadState, getTrackSummary } = require('../ops/ccoOperatorCanary');
        const { state } = loadState(PHOTO_REVIEW_REPO_ROOT);
        const canary = getTrackSummary(state, 'photo', enrichedPilotConfig?.maxDecisions ?? 25);
        return res.json({
          writeEnabled: !!writeEnabled,
          canaryMode: !!enrichedPilotConfig?.canaryMode,
          canary,
          rules: [
            'Max 25 beslut per canary',
            'Ett beslut per bild',
            'reviewer + reason + imageStage + bodyArea + approvedCategory',
            'storageKey/checksum/originalFileName oförändrade',
            '0 massapproval · 0 AI-autoapproval',
          ],
        });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
  );

  if (writeEnabled) {
    const { applyPhotoReviewDecision, applyPhotoReviewReassign } = require('./ccoPhotoReviewWrite');

    router.post(
      '/photo-review/assets/:assetId/reassign',
      express.json(),
      attachRole,
      requirePermission('asset.review'),
      async (req, res) => {
        try {
          const assetId = String(req.params.assetId || '').trim();
          const { assetStore } = await resolveStores();
          const result = await applyPhotoReviewReassign(assetStore, assetId, req.body || {}, {
            actor: actorFromReq(req),
            auditLog,
            pilotConfig: enrichedPilotConfig || {},
          });
          if (typeof onMutation === 'function') onMutation();
          const { assetStore: storeAfter } = await resolveStores();
          res.json({
            decision: result.decision,
            asset: result.asset,
            progress: buildProgressPayload({
              assetStore: storeAfter,
              auditLog,
              pilotConfig: enrichedPilotConfig || {},
            }),
          });
        } catch (err) {
          res
            .status(err.statusCode || 500)
            .json({ error: err.message, detail: err.detail || null });
        }
      }
    );

    router.post(
      '/photo-review/assets/:assetId/decide',
      express.json(),
      attachRole,
      requirePermission('asset.review'),
      async (req, res) => {
        try {
          const assetId = String(req.params.assetId || '').trim();
          const { assetStore } = await resolveStores();
          const result = await applyPhotoReviewDecision(assetStore, assetId, req.body || {}, {
            actor: actorFromReq(req),
            auditLog,
            pilotConfig: enrichedPilotConfig || {},
          });
          if (typeof onMutation === 'function') onMutation();
          const { assetStore: storeAfter } = await resolveStores();
          res.json({
            decision: result.decision,
            asset: result.asset,
            visibleOnPatientCard: result.listAssetsForPatient
              ? result.listAssetsForPatient.filter(
                  (a) => a.id === result.asset.assetId && a.status === 'VISIBLE_ON_PATIENT_CARD'
                ).length > 0
              : undefined,
            progress: buildProgressPayload({
              assetStore: storeAfter,
              auditLog,
              pilotConfig: enrichedPilotConfig || {},
            }),
          });
        } catch (err) {
          res
            .status(err.statusCode || 500)
            .json({ error: err.message, detail: err.detail || null });
        }
      }
    );
  }

  return router;
}

module.exports = {
  createCcoPhotoReviewRouter,
  isPhotoReviewAsset,
  serializeReviewItem,
  loadBatchLabelByPatient,
  patientDocSummary,
  buildUncertaintyReason,
  reviewPhase,
  buildProgressPayload,
};
