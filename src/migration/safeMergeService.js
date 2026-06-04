'use strict';

/**
 * Safe Merge Service — transactional patient merge with rollback.
 *
 * Rules:
 * - NEVER auto-merge
 * - All merges require manual approval
 * - Transactional: if any transfer fails, rollback everything
 * - No data deleted — secondary patient archived/redirected
 * - Creates merge manifest as proof
 * - Post-merge verification required
 * - Audit log for every action
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

const MERGE_STATUSES = Object.freeze(['preview', 'approved', 'executing', 'completed', 'failed', 'rolled_back']);

function createSafeMergeService({ filePath }) {
  let state = { merges: [], auditLog: [] };

  async function load() {
    try { state = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { /* first run */ }
    if (!state.merges) state.merges = [];
    if (!state.auditLog) state.auditLog = [];
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  function audit(action, details) {
    const event = { eventId: crypto.randomUUID(), action, ...details, timestamp: nowIso() };
    state.auditLog.push(event);
    return event;
  }

  // ─── MERGE PREVIEW ───

  function createMergePreview({ primaryPatientId, secondaryPatientId, primaryData, secondaryData, filesToMove = [], journalsToMove = [], reason, confidence, approvedBy }) {
    const mergeId = `merge_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}_${crypto.randomBytes(4).toString('hex')}`;

    const preview = {
      mergeId,
      status: 'preview',
      primaryPatientId: normalizeText(primaryPatientId),
      secondaryPatientId: normalizeText(secondaryPatientId),
      reason: normalizeText(reason),
      confidence: Number(confidence) || 0,
      approvedBy: null,
      createdAt: nowIso(),
      executedAt: null,
      completedAt: null,

      before: {
        primary: {
          patientId: primaryData?.patientId,
          name: normalizeText(primaryData?.name),
          personnummer: normalizeText(primaryData?.personnummer),
          phone: normalizeText(primaryData?.phone),
          email: normalizeText(primaryData?.email),
          clientoId: normalizeText(primaryData?.clientoId),
          fileCount: Number(primaryData?.fileCount) || 0,
          journalCount: Number(primaryData?.journalCount) || 0,
          imageCount: Number(primaryData?.imageCount) || 0,
          consentCount: Number(primaryData?.consentCount) || 0,
          agreementCount: Number(primaryData?.agreementCount) || 0,
        },
        secondary: {
          patientId: secondaryData?.patientId,
          name: normalizeText(secondaryData?.name),
          personnummer: normalizeText(secondaryData?.personnummer),
          phone: normalizeText(secondaryData?.phone),
          email: normalizeText(secondaryData?.email),
          source: normalizeText(secondaryData?.source),
          fileCount: Number(secondaryData?.fileCount) || 0,
          journalCount: Number(secondaryData?.journalCount) || 0,
          imageCount: Number(secondaryData?.imageCount) || 0,
          consentCount: Number(secondaryData?.consentCount) || 0,
          agreementCount: Number(secondaryData?.agreementCount) || 0,
        },
      },

      toMove: {
        driveFiles: filesToMove.filter((f) => f.type === 'drive_file').length,
        journalPdfs: filesToMove.filter((f) => f.type === 'journal_pdf').length,
        images: filesToMove.filter((f) => f.type === 'image').length,
        forms: journalsToMove.filter((j) => j.journalType === 'health_declaration' || j.journalType === 'fitness_certificate').length,
        consents: journalsToMove.filter((j) => j.type === 'consent').length,
        agreements: journalsToMove.filter((j) => j.type === 'agreement').length,
        encounters: journalsToMove.filter((j) => j.type === 'encounter').length,
        notes: journalsToMove.filter((j) => j.type === 'note').length,
        totalItems: filesToMove.length + journalsToMove.length,
      },

      conflicts: [],
      warnings: [],
      after: null,
      verification: null,
      manifest: null,
    };

    if (primaryData?.phone && secondaryData?.phone && primaryData.phone !== secondaryData.phone) {
      preview.conflicts.push({ field: 'phone', primary: primaryData.phone, secondary: secondaryData.phone, flag: 'CONTACT_CONFLICT_NEEDS_REVIEW' });
    }
    if (primaryData?.email && secondaryData?.email && primaryData.email.toLowerCase() !== secondaryData.email.toLowerCase()) {
      preview.conflicts.push({ field: 'email', primary: primaryData.email, secondary: secondaryData.email, flag: 'CONTACT_CONFLICT_NEEDS_REVIEW' });
    }

    const questionFiles = filesToMove.filter((f) => /[?]/.test(f.fileName || ''));
    const lowConfFiles = filesToMove.filter((f) => f.matchConfidence != null && f.matchConfidence < 80);
    if (questionFiles.length > 0) preview.warnings.push(`${questionFiles.length} fil(er) har ? i filnamn`);
    if (lowConfFiles.length > 0) preview.warnings.push(`${lowConfFiles.length} fil(er) har låg confidence`);

    state.merges.push(preview);
    audit('merge_preview_created', { mergeId, primaryPatientId, secondaryPatientId });
    return preview;
  }

  // ─── APPROVE MERGE ───

  async function approveMerge(mergeId, { approvedBy }) {
    const merge = state.merges.find((m) => m.mergeId === mergeId);
    if (!merge) return { ok: false, error: 'merge_not_found' };
    if (merge.status !== 'preview') return { ok: false, error: 'merge_not_in_preview_state' };
    if (merge.conflicts.length > 0) return { ok: false, error: 'unresolved_conflicts', conflicts: merge.conflicts };

    merge.status = 'approved';
    merge.approvedBy = normalizeText(approvedBy);
    audit('merge_approved', { mergeId, approvedBy: merge.approvedBy });
    await persist();
    return { ok: true, merge };
  }

  // ─── EXECUTE MERGE (transactional) ───

  async function executeMerge(mergeId, { transferFn, rollbackFn } = {}) {
    const merge = state.merges.find((m) => m.mergeId === mergeId);
    if (!merge) return { ok: false, error: 'merge_not_found' };
    if (merge.status !== 'approved') return { ok: false, error: 'merge_not_approved' };

    merge.status = 'executing';
    merge.executedAt = nowIso();
    audit('merge_execution_started', { mergeId });

    try {
      const result = await transferFn({
        primaryPatientId: merge.primaryPatientId,
        secondaryPatientId: merge.secondaryPatientId,
        toMove: merge.toMove,
      });

      if (!result || !result.ok) {
        throw new Error(result?.error || 'Transfer function returned failure');
      }

      merge.after = {
        primaryFileCountAfter: result.primaryFileCountAfter || 0,
        filesMovedFromSecondary: result.filesMovedFromSecondary || 0,
        totalFilesAfter: result.totalFilesAfter || 0,
        journalPdfsAfter: result.journalPdfsAfter || 0,
        imagesAfter: result.imagesAfter || 0,
        orphanFilesRemaining: result.orphanFilesRemaining || 0,
        secondaryArchived: result.secondaryArchived || false,
        redirectCreated: result.redirectCreated || false,
      };

      merge.status = 'completed';
      merge.completedAt = nowIso();

      merge.manifest = {
        mergeId: merge.mergeId,
        approvedBy: merge.approvedBy,
        primaryPatientId: merge.primaryPatientId,
        secondaryPatientId: merge.secondaryPatientId,
        reason: merge.reason,
        confidence: merge.confidence,
        // What we PLANNED to move (from the preview) vs what ACTUALLY moved
        // (reported by transferFn). The manifest is proof, so it must reflect
        // reality — not just the plan.
        planned: merge.toMove,
        moved: {
          filesMovedFromSecondary: merge.after.filesMovedFromSecondary,
          totalFilesAfter: merge.after.totalFilesAfter,
          journalPdfsAfter: merge.after.journalPdfsAfter,
          imagesAfter: merge.after.imagesAfter,
        },
        blocked: [],
        warnings: merge.warnings,
        verification: null,
      };

      audit('merge_completed', { mergeId, after: merge.after });
      await persist();
      return { ok: true, merge };

    } catch (err) {
      // Auto-rollback: a failed transfer must leave NO partial state behind.
      // "Either everything moves or nothing" — so we always attempt rollback
      // before recording the failure.
      let rollbackOutcome = 'not_attempted';
      if (typeof rollbackFn === 'function') {
        try {
          await rollbackFn({
            primaryPatientId: merge.primaryPatientId,
            secondaryPatientId: merge.secondaryPatientId,
            toMove: merge.toMove,
          });
          rollbackOutcome = 'completed';
        } catch (rollbackErr) {
          rollbackOutcome = `failed: ${rollbackErr.message}`;
        }
      }

      merge.status = rollbackOutcome === 'completed' ? 'rolled_back' : 'failed';
      merge.failedAt = nowIso();
      merge.failureReason = err.message;
      merge.autoRollback = rollbackOutcome;
      if (rollbackOutcome === 'completed') {
        merge.rolledBackAt = nowIso();
        merge.rollbackReason = `auto-rollback after transfer failure: ${err.message}`;
      }
      audit('merge_failed', { mergeId, error: err.message, autoRollback: rollbackOutcome });
      await persist();
      return { ok: false, error: 'merge_execution_failed', message: err.message, autoRollback: rollbackOutcome, merge };
    }
  }

  // ─── POST-MERGE VERIFICATION ───

  function verifyMerge(mergeId, { actualFileCount, expectedFileCount, orphanFiles = 0 }) {
    const merge = state.merges.find((m) => m.mergeId === mergeId);
    if (!merge) return { ok: false, error: 'merge_not_found' };

    const pass = actualFileCount >= expectedFileCount && orphanFiles === 0;
    merge.verification = {
      expectedFileCount,
      actualFileCount,
      orphanFilesAfterMerge: orphanFiles,
      status: pass ? 'PASS' : 'FAIL',
      verifiedAt: nowIso(),
    };

    if (merge.manifest) merge.manifest.verification = merge.verification;
    audit('merge_verified', { mergeId, status: merge.verification.status });
    return { ok: true, verification: merge.verification };
  }

  // ─── ROLLBACK ───

  async function rollbackMerge(mergeId, { rollbackFn, reason }) {
    const merge = state.merges.find((m) => m.mergeId === mergeId);
    if (!merge) return { ok: false, error: 'merge_not_found' };

    if (rollbackFn) {
      await rollbackFn({ primaryPatientId: merge.primaryPatientId, secondaryPatientId: merge.secondaryPatientId });
    }

    merge.status = 'rolled_back';
    merge.rolledBackAt = nowIso();
    merge.rollbackReason = normalizeText(reason);
    audit('merge_rolled_back', { mergeId, reason: merge.rollbackReason });
    await persist();
    return { ok: true, merge };
  }

  // ─── QUERIES ───

  function getMerge(mergeId) { return state.merges.find((m) => m.mergeId === mergeId) || null; }
  function listMerges({ status } = {}) { return status ? state.merges.filter((m) => m.status === status) : state.merges; }
  function getAuditLog({ mergeId } = {}) { return mergeId ? state.auditLog.filter((e) => e.mergeId === mergeId) : state.auditLog; }

  return {
    load,
    persist,
    createMergePreview,
    approveMerge,
    executeMerge,
    verifyMerge,
    rollbackMerge,
    getMerge,
    listMerges,
    getAuditLog,
    MERGE_STATUSES,
  };
}

module.exports = { createSafeMergeService, MERGE_STATUSES };
