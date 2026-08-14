'use strict';

/**
 * Granskningsyta för needs_review_for_naming — generisk över alla kategorier.
 *
 * GET  /api/v1/cco/naming-review/queue
 * GET  /api/v1/cco/naming-review/patients/:patientId/assets
 * POST /api/v1/cco/naming-review/assets/:assetId/resolve
 *
 * Beroende: PR #1381 (documentDate i patchAssetNamingMetadata-allowlist).
 */

const express = require('express');
const { buildNamingReviewQueue } = require('../ops/ccoAssetNaming/buildNamingReviewQueue');
const { buildAssetNamingMetadata } = require('../ops/ccoAssetNaming');

const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 500;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIsoDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function actorFromReq(req) {
  return {
    role: req.cco?.role || req.headers['x-cco-role'] || 'unknown',
    userId: req.headers['x-cco-user'] || req.auth?.userId || null,
    tenantId: req.headers['x-cco-tenant'] || req.auth?.tenantId || null,
  };
}

function requireReason(body) {
  const reason = normalizeText(body?.reason);
  if (!reason || reason.length < REASON_MIN_LENGTH) {
    const e = new Error(`reason krävs (minst ${REASON_MIN_LENGTH} tecken).`);
    e.statusCode = 400;
    throw e;
  }
  return reason.slice(0, REASON_MAX_LENGTH);
}

function requireDocumentDateOptional(body) {
  const raw = normalizeText(body?.documentDate);
  if (!raw) return null;
  const iso = parseIsoDate(raw);
  if (!iso) {
    const e = new Error('documentDate måste vara YYYY-MM-DD.');
    e.statusCode = 400;
    throw e;
  }
  return iso;
}

function buildReviewItem(asset, siblingAssets) {
  let computed;
  try {
    computed = buildAssetNamingMetadata(asset, { siblingAssets });
  } catch {
    computed = null;
  }
  return {
    assetId: asset.id,
    patientId: asset.patientId || null,
    currentStatus: asset.status,
    currentCategory: asset.category,
    currentDisplayName: asset.displayName || null,
    originalFileName: asset.originalFileName || null,
    originalDrivePath: asset.originalDrivePath || null,
    documentDate: asset.documentDate || null,
    importedAt: asset.importedAt || null,
    namingStatus: asset.namingStatus,
    namingConfidence: asset.namingConfidence,
    sessionNumber: asset.sessionNumber,
    computed: computed
      ? {
          displayName: computed.displayName,
          documentDate: computed.documentDate,
          namingConfidence: computed.namingConfidence,
          namingStatus: computed.namingStatus,
          sessionNumber: computed.sessionNumber,
          sessionNumberIsUnreliable: computed.sessionNumberIsUnreliable,
          visitLabel: computed.visitLabel,
          treatmentType: computed.treatmentType,
        }
      : null,
  };
}

function createCcoNamingReviewRouter({
  resolvePatientMasterStore,
  resolveAssetStore,
  requireCcoAuthenticated,
  attachRole,
  requirePermission,
  auditLog,
}) {
  if (typeof resolvePatientMasterStore !== 'function') {
    throw new Error('resolvePatientMasterStore krävs för ccoNamingReviewRouter');
  }
  if (typeof resolveAssetStore !== 'function') {
    throw new Error('resolveAssetStore krävs för ccoNamingReviewRouter');
  }
  if (typeof requireCcoAuthenticated !== 'function') {
    throw new Error('requireCcoAuthenticated krävs för ccoNamingReviewRouter');
  }
  if (typeof attachRole !== 'function') {
    throw new Error('attachRole krävs för ccoNamingReviewRouter');
  }
  if (typeof requirePermission !== 'function') {
    throw new Error('requirePermission krävs för ccoNamingReviewRouter');
  }

  const router = express.Router();
  router.use('/naming-review', requireCcoAuthenticated);

  router.get(
    '/naming-review/queue',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const patientStore = await resolvePatientMasterStore();
        const assetStore = await resolveAssetStore();
        const tenantId =
          normalizeText(req.query.tenant) ||
          normalizeText(req.headers['x-cco-tenant']) ||
          normalizeText(req.auth?.tenantId);
        const top = Math.min(Math.max(Number.parseInt(req.query.top, 10) || 30, 1), 200);
        const patientLimit = Math.min(
          Math.max(Number.parseInt(req.query.patientLimit, 10) || 20000, 1),
          50000
        );
        const maskIds = req.query.maskIds !== 'false';

        const report = await buildNamingReviewQueue(patientStore, assetStore, {
          tenantId,
          top,
          patientLimit,
          maskIds,
        });

        if (auditLog) {
          auditLog.append({
            action: 'naming_review.queue_read',
            actor: actorFromReq(req),
            target: { kind: 'naming_review', id: 'queue' },
            result: 'ok',
            detail: {
              tenantId,
              totalReviewQueueSize: report.totalReviewQueueSize,
              patientsAffected: report.patientsAffected,
            },
          });
        }

        res.json(report);
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.get(
    '/naming-review/patients/:patientId/assets',
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const patientStore = await resolvePatientMasterStore();
        const assetStore = await resolveAssetStore();
        const patientId = normalizeText(req.params.patientId);
        if (!patientId) {
          return res.status(400).json({ error: 'patient_id_required' });
        }

        const tenantId =
          normalizeText(req.query.tenant) ||
          normalizeText(req.headers['x-cco-tenant']) ||
          normalizeText(req.auth?.tenantId);

        let patientName = null;
        try {
          const patient = await patientStore.getPatient({ tenantId, patientId });
          if (patient) {
            patientName = patient.displayName || patient.name || null;
          }
        } catch {
          patientName = null;
        }

        const siblingAssets = assetStore.listAssetsForPatient(patientId);
        const items = siblingAssets
          .filter((a) => a.namingStatus === 'needs_review_for_naming')
          .map((a) => buildReviewItem(a, siblingAssets))
          .sort((a, b) => {
            const ad = a.documentDate || a.importedAt || '';
            const bd = b.documentDate || b.importedAt || '';
            return String(ad).localeCompare(String(bd));
          });

        if (auditLog) {
          auditLog.append({
            action: 'naming_review.patient_assets_read',
            actor: actorFromReq(req),
            target: { kind: 'patient', id: patientId },
            result: 'ok',
            detail: { tenantId, count: items.length },
          });
        }

        res.json({
          patientId,
          patientName,
          tenantId,
          count: items.length,
          readOnly: false,
          items,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  router.post(
    '/naming-review/assets/:assetId/resolve',
    express.json(),
    attachRole,
    requirePermission('asset.review'),
    async (req, res) => {
      try {
        const assetStore = await resolveAssetStore();
        const assetId = normalizeText(req.params.assetId);
        if (!assetId) {
          return res.status(400).json({ error: 'asset_id_required' });
        }

        const asset = assetStore.getAsset(assetId);
        if (!asset) {
          return res.status(404).json({ error: 'asset_not_found' });
        }
        if (asset.namingStatus !== 'needs_review_for_naming') {
          return res.status(409).json({ error: 'asset_not_in_review' });
        }

        const reason = requireReason(req.body);
        const documentDate = requireDocumentDateOptional(req.body);
        const actor = actorFromReq(req);
        const reviewer =
          normalizeText(req.body?.reviewer) || actor.userId || actor.role || 'unknown';

        const work = { ...asset };
        if (documentDate) {
          work.documentDate = documentDate;
          work.documentDateSource = 'manual_review';
        }

        const siblingAssets = assetStore.listAssetsForPatient(asset.patientId);
        const computed = buildAssetNamingMetadata(work, { siblingAssets });

        const patch = {
          ...computed,
          namingStatus: 'manual_resolved',
          uiStatus: 'visible',
          reviewedBy: reviewer,
          reviewedAt: new Date().toISOString(),
          reviewReason: reason,
        };

        const updated = await assetStore.patchAssetNamingMetadata(assetId, patch, {
          actor,
          reason,
        });

        if (auditLog) {
          auditLog.append({
            action: 'naming_review.asset_resolved',
            actor,
            target: { kind: 'patient_asset', id: assetId },
            result: 'ok',
            detail: {
              patientId: asset.patientId,
              oldNamingStatus: asset.namingStatus,
              newNamingStatus: patch.namingStatus,
              documentDateSet: documentDate || null,
              reviewer,
              reason,
            },
          });
        }

        res.json({
          assetId,
          patientId: asset.patientId,
          displayName: updated.displayName,
          namingStatus: updated.namingStatus,
          namingConfidence: updated.namingConfidence,
          sessionNumber: updated.sessionNumber,
          documentDate: updated.documentDate,
          reviewedBy: updated.reviewedBy,
          reviewedAt: updated.reviewedAt,
        });
      } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
      }
    }
  );

  return router;
}

module.exports = {
  createCcoNamingReviewRouter,
  normalizeText,
  parseIsoDate,
  requireReason,
  requireDocumentDateOptional,
  buildReviewItem,
};
