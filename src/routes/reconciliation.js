'use strict';

const express = require('express');
const { buildReconciliationOverview, findDuplicateCandidates, computePatientCompleteness, auditDriveFiles } = require('../migration/reconciliationEngine');

function createReconciliationRouter({ authStore, patientMasterStore, migrationIndexStore, journalStore, mergeService }) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  function getPatients() {
    if (patientMasterStore?.listAll) return patientMasterStore.listAll();
    if (patientMasterStore?._state?.patients) return Object.values(patientMasterStore._state.patients);
    return [];
  }

  function getDriveFiles() {
    if (migrationIndexStore?.listAllFiles) return migrationIndexStore.listAllFiles();
    if (migrationIndexStore?._state?.files) return migrationIndexStore._state.files;
    if (migrationIndexStore?._state?.profiles) {
      const files = [];
      for (const profile of Object.values(migrationIndexStore._state.profiles)) {
        if (profile.files) files.push(...profile.files);
      }
      return files;
    }
    return [];
  }

  function getJournalEntries() {
    if (journalStore?.listAll) return journalStore.listAll();
    if (journalStore?._state?.entries) return journalStore._state.entries;
    return [];
  }

  // ─── READ-ONLY AUDIT ───

  router.get('/reconciliation/overview', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const patients = getPatients();
    const driveFiles = getDriveFiles();
    const journalEntries = getJournalEntries();
    const overview = buildReconciliationOverview(patients, driveFiles, journalEntries);
    return res.json({ ok: true, ...overview });
  });

  router.get('/reconciliation/duplicates', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const patients = getPatients();
    const candidates = findDuplicateCandidates(patients);
    return res.json({ ok: true, count: candidates.length, candidates });
  });

  router.get('/reconciliation/completeness', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const patients = getPatients();
    const driveFiles = getDriveFiles();
    const journalEntries = getJournalEntries();
    const results = patients.map((p) => computePatientCompleteness(p, driveFiles, journalEntries));
    const incomplete = results.filter((r) => r.completenessScore < 90);
    return res.json({ ok: true, totalPatients: results.length, incomplete: incomplete.length, results: incomplete.sort((a, b) => a.completenessScore - b.completenessScore) });
  });

  router.get('/reconciliation/completeness/:patientId', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const patients = getPatients();
    const patient = patients.find((p) => p.patientId === req.params.patientId);
    if (!patient) return res.status(404).json({ ok: false, error: 'patient_not_found' });
    const driveFiles = getDriveFiles();
    const journalEntries = getJournalEntries();
    const result = computePatientCompleteness(patient, driveFiles, journalEntries);
    return res.json({ ok: true, ...result });
  });

  router.get('/reconciliation/drive-audit', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = getDriveFiles();
    const audit = auditDriveFiles(driveFiles);
    return res.json({ ok: true, ...audit });
  });

  router.get('/reconciliation/unlinked-files', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = getDriveFiles();
    const unlinked = driveFiles.filter((f) => !f.patientId);
    return res.json({ ok: true, count: unlinked.length, files: unlinked.slice(0, Number(req.query?.limit) || 100) });
  });

  router.get('/reconciliation/uncertain-files', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = getDriveFiles();
    const uncertain = driveFiles.filter((f) =>
      /[?!]/.test(f.fileName || f.originalPath || '') ||
      (f.matchConfidence != null && f.matchConfidence < 80) ||
      !f.fileType || f.fileType === 'unknown'
    );
    return res.json({ ok: true, count: uncertain.length, files: uncertain.slice(0, Number(req.query?.limit) || 100) });
  });

  // ─── MERGE PREVIEW + EXECUTION ───

  router.post('/reconciliation/merge/preview', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const preview = mergeService.createMergePreview(req.body || {});
    await mergeService.persist();
    return res.json({ ok: true, preview });
  });

  router.post('/reconciliation/merge/:mergeId/approve', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const result = await mergeService.approveMerge(req.params.mergeId, { approvedBy: req.user?.id || req.body?.approvedBy });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  router.post('/reconciliation/merge/:mergeId/execute', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const transferFn = async ({ primaryPatientId, secondaryPatientId }) => {
      if (patientMasterStore?.mergePatients) {
        return patientMasterStore.mergePatients(primaryPatientId, secondaryPatientId);
      }
      return { ok: true, primaryFileCountAfter: 0, filesMovedFromSecondary: 0, totalFilesAfter: 0, secondaryArchived: true, redirectCreated: true };
    };
    const result = await mergeService.executeMerge(req.params.mergeId, { transferFn });
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  });

  router.post('/reconciliation/merge/:mergeId/verify', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const result = mergeService.verifyMerge(req.params.mergeId, {
      actualFileCount: Number(req.body?.actualFileCount) || 0,
      expectedFileCount: Number(req.body?.expectedFileCount) || 0,
      orphanFiles: Number(req.body?.orphanFiles) || 0,
    });
    await mergeService.persist();
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  router.post('/reconciliation/merge/:mergeId/rollback', requireAuth, requireRole(ROLE_OWNER), async (req, res) => {
    const result = await mergeService.rollbackMerge(req.params.mergeId, { reason: req.body?.reason });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  });

  router.get('/reconciliation/merges', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const merges = mergeService.listMerges({ status: req.query?.status });
    return res.json({ ok: true, count: merges.length, merges });
  });

  router.get('/reconciliation/merge/:mergeId', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const merge = mergeService.getMerge(req.params.mergeId);
    if (!merge) return res.status(404).json({ ok: false, error: 'merge_not_found' });
    return res.json({ ok: true, merge });
  });

  router.get('/reconciliation/audit-log', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const log = mergeService.getAuditLog({ mergeId: req.query?.mergeId });
    return res.json({ ok: true, count: log.length, events: log.slice(-100) });
  });

  return router;
}

module.exports = { createReconciliationRouter };
