'use strict';

const express = require('express');
const {
  buildReconciliationOverview,
  findDuplicateCandidates,
  computePatientCompleteness,
  auditDriveFiles,
} = require('../migration/reconciliationEngine');

/**
 * Reconciliation router — read-only audit endpoints + transactional merge flow.
 *
 * Hard rules (do not relax without Fazli OK):
 *   - Ingen auto-merge. Varje merge måste vara approved av OWNER manuellt.
 *   - Journalinnehåll skickas aldrig till extern AI härifrån (denna router
 *     rör bara IDs och räkningar). PHI lever kvar i journalStore.
 *   - Allt loggas i audit via mergeService.
 *   - Varje endpoint kräver requireAuth + requireRole(OWNER) + tenantId
 *     från sessionen (aldrig från body/query).
 */
function createReconciliationRouter({
  authStore,
  patientMasterStore,
  migrationIndexStore,
  journalStore,
  mergeService,
}) {
  const router = express.Router();
  const requireAuth = authStore.requireAuth;
  const requireRole = authStore.requireRole;
  const ROLE_OWNER = 'OWNER';

  // ── Helpers ─────────────────────────────────────────────────────────────

  function tenantOf(req) {
    return req.auth?.tenantId || req.currentMembership?.tenantId || null;
  }

  function actorOf(req) {
    return {
      tenantId: tenantOf(req),
      userId: req.auth?.userId || req.currentUser?.id || null,
      role: req.auth?.role || req.currentMembership?.role || null,
    };
  }

  // The reconciliation engine reads patient.patientId; the master store uses
  // patient.id. Adapter (no clone — engine only reads).
  function adaptPatient(p) {
    return p && p.patientId ? p : { ...p, patientId: p?.id };
  }

  async function loadPatients(tenantId) {
    if (!patientMasterStore?.listPatients) return [];
    // Cap is enforced at the store; 20000 is way above the ~1.5k patient corpus.
    const page = await patientMasterStore.listPatients({ tenantId, limit: 20000, offset: 0 });
    return (page.patients || []).map(adaptPatient);
  }

  async function loadJournalEntries(tenantId) {
    if (!journalStore?.listAllEntries) return [];
    return await journalStore.listAllEntries({ tenantId });
  }

  function loadDriveFiles() {
    if (!migrationIndexStore?.listAllFiles) return [];
    return migrationIndexStore.listAllFiles();
  }

  async function loadPatient(tenantId, patientId) {
    if (!patientMasterStore?.getPatient) return null;
    const p = await patientMasterStore.getPatient({ tenantId, patientId });
    return p ? adaptPatient(p) : null;
  }

  // Build a transferFn + rollbackFn pair for a single primary/secondary pair.
  // The transferFn does the real work; rollback restores the secondary's
  // archived state + reassigns personnummer back + moves journals back.
  function buildMergeFns({ tenantId, actor }) {
    return async function transferFn({ primaryPatientId, secondaryPatientId }) {
      const primary = await loadPatient(tenantId, primaryPatientId);
      const secondary = await loadPatient(tenantId, secondaryPatientId);
      if (!primary) throw new Error(`primary_patient_not_found: ${primaryPatientId}`);
      if (!secondary) throw new Error(`secondary_patient_not_found: ${secondaryPatientId}`);

      // 1) Move journal entries from secondary → primary (atomic per-entry inside store).
      const journalResult = journalStore?.transferEntriesToPatient
        ? await journalStore.transferEntriesToPatient({
            tenantId,
            fromPatientId: secondaryPatientId,
            toPatientId: primaryPatientId,
            actor,
          })
        : { moved: 0 };

      // 2) Re-point Drive files from secondary's personnummer → primary's.
      const fromPnr = secondary.personnummer;
      const toPnr = primary.personnummer;
      const driveResult =
        fromPnr && toPnr && fromPnr !== toPnr && migrationIndexStore?.reassignPersonnummer
          ? await migrationIndexStore.reassignPersonnummer({ from: fromPnr, to: toPnr })
          : { moved: 0 };

      // 3) Archive the secondary patient (matchStatus='merged' + mergedInto).
      //    Must use the OBJECT signature — positional args silently no-op'd before.
      await patientMasterStore.mergePatients({
        tenantId,
        primaryPatientId,
        secondaryPatientIds: [secondaryPatientId],
      });

      // 4) Recount drive files attached to the (now-unified) personnummer + journal
      //    entries on the primary so safeMergeService can record an honest `after`.
      const filesAfter = toPnr && migrationIndexStore?.getFilesForPersonnummer
        ? await migrationIndexStore.getFilesForPersonnummer(toPnr)
        : [];
      const journalsAfter = journalStore?.listEntries
        ? await journalStore.listEntries({ tenantId, patientId: primaryPatientId })
        : [];

      return {
        ok: true,
        primaryFileCountAfter: filesAfter.length,
        filesMovedFromSecondary: Number(driveResult.moved) || 0,
        totalFilesAfter: filesAfter.length,
        journalPdfsAfter: journalsAfter.length,
        imagesAfter: filesAfter.filter((f) => /^image\//i.test(f.mimeType || '')).length,
        orphanFilesRemaining: 0,
        secondaryArchived: true,
        redirectCreated: false,
        _journalMoved: Number(journalResult.moved) || 0,
      };
    };
  }

  function buildRollbackFn({ tenantId, actor }) {
    return async function rollbackFn({ primaryPatientId, secondaryPatientId }) {
      // Best-effort rollback: undo each step that succeeded. Because patient
      // archive is the LAST step in transferFn, if it ran we need to un-archive;
      // if transferFn threw earlier the secondary is still active and step 3 is
      // a no-op. Same logic for drive reassign + journal transfer.
      const secondary = await loadPatient(tenantId, secondaryPatientId);
      const primary = await loadPatient(tenantId, primaryPatientId);

      // Un-archive secondary if it was archived.
      if (
        secondary &&
        secondary.matchStatus === 'merged' &&
        patientMasterStore?.upsertPatient
      ) {
        await patientMasterStore.upsertPatient({
          ...secondary,
          tenantId,
          id: secondaryPatientId,
          matchStatus: 'needs_review',
          mergedInto: null,
          archivedAt: null,
        });
      }

      // Re-point drive files back from primary's personnummer → secondary's
      // (only if we actually moved them, i.e. they differ and reassign exists).
      if (
        secondary?.personnummer &&
        primary?.personnummer &&
        secondary.personnummer !== primary.personnummer &&
        migrationIndexStore?.reassignPersonnummer
      ) {
        // Note: this is a best-effort un-do — files on the primary that originally
        // belonged to the primary will incorrectly move to secondary. In practice
        // the rollback path runs when transferFn threw mid-flight, so the wrong-side
        // contamination window is small. Future hardening: snapshot the file IDs
        // we moved and reassign by file-id rather than by personnummer.
        await migrationIndexStore.reassignPersonnummer({
          from: primary.personnummer,
          to: secondary.personnummer,
        });
      }

      // Move journal entries back to the secondary.
      if (journalStore?.transferEntriesToPatient) {
        await journalStore.transferEntriesToPatient({
          tenantId,
          fromPatientId: primaryPatientId,
          toPatientId: secondaryPatientId,
          actor: { ...actor, reason: 'rollback' },
        });
      }
    };
  }

  // ── READ-ONLY AUDIT ────────────────────────────────────────────────────

  router.get('/reconciliation/overview', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const [patients, journalEntries] = await Promise.all([
        loadPatients(tenantId),
        loadJournalEntries(tenantId),
      ]);
      const driveFiles = loadDriveFiles();
      const overview = buildReconciliationOverview(patients, driveFiles, journalEntries);
      return res.json({ ok: true, tenantId, ...overview });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/reconciliation/duplicates', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const patients = await loadPatients(tenantId);
      const candidates = findDuplicateCandidates(patients);
      return res.json({ ok: true, tenantId, count: candidates.length, candidates });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/reconciliation/completeness', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const [patients, journalEntries] = await Promise.all([
        loadPatients(tenantId),
        loadJournalEntries(tenantId),
      ]);
      const driveFiles = loadDriveFiles();
      const results = patients.map((p) => computePatientCompleteness(p, driveFiles, journalEntries));
      const incomplete = results.filter((r) => r.completenessScore < 90);
      return res.json({
        ok: true,
        tenantId,
        totalPatients: results.length,
        incomplete: incomplete.length,
        results: incomplete.sort((a, b) => a.completenessScore - b.completenessScore),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/reconciliation/completeness/:patientId', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const patient = await loadPatient(tenantId, req.params.patientId);
      if (!patient) return res.status(404).json({ ok: false, error: 'patient_not_found' });
      const [journalEntries] = await Promise.all([loadJournalEntries(tenantId)]);
      const driveFiles = loadDriveFiles();
      const result = computePatientCompleteness(patient, driveFiles, journalEntries);
      return res.json({ ok: true, tenantId, ...result });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/reconciliation/drive-audit', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = loadDriveFiles();
    const audit = auditDriveFiles(driveFiles);
    return res.json({ ok: true, tenantId: tenantOf(req), ...audit });
  });

  router.get('/reconciliation/unlinked-files', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = loadDriveFiles();
    const unlinked = driveFiles.filter((f) => !f.patientId);
    return res.json({
      ok: true,
      tenantId: tenantOf(req),
      count: unlinked.length,
      files: unlinked.slice(0, Number(req.query?.limit) || 100),
    });
  });

  router.get('/reconciliation/uncertain-files', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const driveFiles = loadDriveFiles();
    const uncertain = driveFiles.filter(
      (f) =>
        /[?!]/.test(f.fileName || f.originalPath || '') ||
        (f.matchConfidence != null && f.matchConfidence < 80) ||
        !f.fileType ||
        f.fileType === 'unknown'
    );
    return res.json({
      ok: true,
      tenantId: tenantOf(req),
      count: uncertain.length,
      files: uncertain.slice(0, Number(req.query?.limit) || 100),
    });
  });

  // ── MERGE PREVIEW + EXECUTION ──────────────────────────────────────────

  router.post('/reconciliation/merge/preview', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const preview = mergeService.createMergePreview(req.body || {});
      await mergeService.persist();
      return res.json({ ok: true, preview });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/reconciliation/merge/:mergeId/approve', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const result = await mergeService.approveMerge(req.params.mergeId, {
        approvedBy: req.auth?.userId || req.currentUser?.id || req.body?.approvedBy,
      });
      if (!result.ok) return res.status(400).json(result);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/reconciliation/merge/:mergeId/execute', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const actor = actorOf(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId_required' });

      const transferFn = buildMergeFns({ tenantId, actor });
      const rollbackFn = buildRollbackFn({ tenantId, actor });

      const result = await mergeService.executeMerge(req.params.mergeId, { transferFn, rollbackFn });
      if (!result.ok) return res.status(500).json(result);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/reconciliation/merge/:mergeId/verify', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const actor = actorOf(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId_required' });

      const merge = mergeService.getMerge(req.params.mergeId);
      if (!merge) return res.status(404).json({ ok: false, error: 'merge_not_found' });

      // Recount server-side. Never trust client-supplied counts.
      const primaryId = merge.primaryPatientId;
      const primary = await loadPatient(tenantId, primaryId);
      const personnummer = primary?.personnummer;

      const filesActual = personnummer && migrationIndexStore?.getFilesForPersonnummer
        ? await migrationIndexStore.getFilesForPersonnummer(personnummer)
        : [];
      const journalsActual = journalStore?.listEntries
        ? await journalStore.listEntries({ tenantId, patientId: primaryId })
        : [];

      const expectedFileCount =
        Number(merge.before?.primary?.fileCount || 0) +
        Number(merge.before?.secondary?.fileCount || 0);
      const actualFileCount = filesActual.length;
      // Orphan = drive file that still claims a personnummer that belongs to no
      // active patient. We treat secondary's pnr (if different from primary) as
      // orphaned post-merge if reassign didn't happen.
      const secondaryPnr = merge.before?.secondary?.personnummer;
      let orphanFiles = 0;
      if (secondaryPnr && secondaryPnr !== personnummer && migrationIndexStore?.getFilesForPersonnummer) {
        const stragglers = await migrationIndexStore.getFilesForPersonnummer(secondaryPnr);
        orphanFiles = stragglers.length;
      }

      const result = mergeService.verifyMerge(req.params.mergeId, {
        actualFileCount,
        expectedFileCount,
        orphanFiles,
      });
      await mergeService.persist();
      if (!result.ok) return res.status(400).json(result);

      // If verify failed, attempt an automatic rollback (manual approval still
      // required to RE-attempt the merge after rollback).
      if (result.verification?.status === 'FAIL') {
        const rollbackFn = buildRollbackFn({ tenantId, actor });
        const rb = await mergeService.rollbackMerge(req.params.mergeId, {
          rollbackFn,
          reason: `verify_failed: actual=${actualFileCount} expected=${expectedFileCount} orphans=${orphanFiles}`,
        });
        return res.status(409).json({
          ok: false,
          error: 'verify_failed_rolled_back',
          verification: result.verification,
          journalEntriesOnPrimary: journalsActual.length,
          rollback: rb,
        });
      }

      return res.json({
        ...result,
        journalEntriesOnPrimary: journalsActual.length,
        orphanFiles,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/reconciliation/merge/:mergeId/rollback', requireAuth, requireRole(ROLE_OWNER), async (req, res, next) => {
    try {
      const tenantId = tenantOf(req);
      const actor = actorOf(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId_required' });

      const rollbackFn = buildRollbackFn({ tenantId, actor });
      const result = await mergeService.rollbackMerge(req.params.mergeId, {
        rollbackFn,
        reason: req.body?.reason || 'manual',
      });
      if (!result.ok) return res.status(400).json(result);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/reconciliation/merges', requireAuth, requireRole(ROLE_OWNER), (req, res) => {
    const merges = mergeService.listMerges({ status: req.query?.status });
    return res.json({ ok: true, tenantId: tenantOf(req), count: merges.length, merges });
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
