'use strict';

const express = require('express');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function createPatientIdentityRouter({ authStore, identityStore }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';
  const ROLE_STAFF = 'STAFF';

  router.get(
    '/patient-identity/methods',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      return res.json({ ok: true, methods: identityStore.listAvailableMethods() });
    }
  );

  router.get(
    '/patient-identity/:patientId/status',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const status = identityStore.getPatientVerificationStatus(req.params.patientId);
      return res.json({ ok: true, ...status });
    }
  );

  router.post(
    '/patient-identity/:patientId/initiate',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const record = await identityStore.initiate({
        patientId: req.params.patientId,
        tenantId: req.body?.tenantId || 'default',
        method: req.body?.method || 'manual_id_upload',
        documentType: req.body?.documentType,
        documentCountry: req.body?.documentCountry,
      });
      return res.json({ ok: true, verification: record });
    }
  );

  router.post(
    '/patient-identity/:verificationId/upload-id',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const photoPath = normalizeText(req.body?.photoPath);
      if (!photoPath) return res.status(400).json({ ok: false, error: 'missing_photo_path' });
      const record = await identityStore.uploadIdPhoto(req.params.verificationId, photoPath);
      if (!record) return res.status(404).json({ ok: false, error: 'verification_not_found' });
      return res.json({ ok: true, verification: record });
    }
  );

  router.post(
    '/patient-identity/:verificationId/upload-selfie',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const selfiePhotoPath = normalizeText(req.body?.selfiePhotoPath);
      if (!selfiePhotoPath)
        return res.status(400).json({ ok: false, error: 'missing_selfie_path' });
      const record = await identityStore.uploadSelfie(req.params.verificationId, selfiePhotoPath);
      if (!record) return res.status(404).json({ ok: false, error: 'verification_not_found' });
      return res.json({ ok: true, verification: record });
    }
  );

  router.post(
    '/patient-identity/:verificationId/approve',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record = await identityStore.approve(req.params.verificationId, {
        reviewedBy: req.user?.id || req.body?.reviewedBy || 'owner',
        expiresInMonths: Number(req.body?.expiresInMonths) || 24,
      });
      if (!record) return res.status(404).json({ ok: false, error: 'verification_not_found' });
      return res.json({ ok: true, verification: record });
    }
  );

  router.post(
    '/patient-identity/:verificationId/reject',
    requireAuth,
    requireRole(ROLE_OWNER),
    async (req, res) => {
      const record = await identityStore.reject(req.params.verificationId, {
        reviewedBy: req.user?.id || req.body?.reviewedBy || 'owner',
        reason: req.body?.reason,
      });
      if (!record) return res.status(404).json({ ok: false, error: 'verification_not_found' });
      return res.json({ ok: true, verification: record });
    }
  );

  router.post(
    '/patient-identity/:patientId/verify-in-person',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    async (req, res) => {
      const record = await identityStore.markInPerson(req.params.patientId, {
        verifiedBy: req.user?.id || req.body?.verifiedBy || 'staff',
        tenantId: req.body?.tenantId || 'default',
      });
      return res.json({ ok: true, verification: record });
    }
  );

  router.get(
    '/patient-identity/pending-reviews',
    requireAuth,
    requireRole(ROLE_OWNER, ROLE_STAFF),
    (req, res) => {
      const reviews = identityStore.listPendingReviews(req.query?.tenantId);
      return res.json({ ok: true, reviews });
    }
  );

  return router;
}

module.exports = { createPatientIdentityRouter };
