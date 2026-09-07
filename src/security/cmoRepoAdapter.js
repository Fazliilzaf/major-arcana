'use strict';

/**
 * cmoRepoAdapter.js — repo-aware CMO-tool-execution + Receipt v2 (WP-009, DEL D/E/J).
 *
 * Ersätter den syntetiska stateRoot/cmo-content-piloten med en explicit allowlistad
 * repo-adapter: CMO → explicit approved repo ID → canonical GitHub source → isolerad
 * task-worktree. toolExecutor körs med readRoot=canonical, scratchRoot=worktree, så
 * canonical checkout förblir byte-identisk medan alla ändringar sker i worktreen.
 *
 * Ingen generell repo-discovery, ingen generisk shell, ingen commit/push/merge/deploy.
 */

const crypto = require('node:crypto');
const path = require('node:path');
const { resolveRepo: defaultResolveRepo, isAllowedCommand } = require('./cmoRepoRegistry');
const {
  ensureCanonicalCheckout,
  createTaskWorktree,
  getHeadSha,
  getChanges,
  getChangesDetailed,
  commitCandidate,
  isClean,
  isGitRepo,
} = require('./repoWorktree');
const { executeCmoTool } = require('./toolExecutor');
const { evaluateAction } = require('./actionGate');

/** Deterministisk snapshot-hash av candidate-tillståndet (TOCTOU-skydd). */
function computeSnapshotHash({ baseSha, changedFiles, diffstat }) {
  const canonical = JSON.stringify({
    baseSha,
    changedFiles: [...(changedFiles || [])].sort(),
    diffstat,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// Säker preview-körning: exakt allowlist-match (argv-array) + execFile (INGEN shell).
function defaultPreviewRunner({ repo, worktreeDir, command }) {
  if (!isAllowedCommand(repo, command)) {
    return { ok: false, reason: 'command_not_allowed' };
  }
  try {
    const { execFileSync } = require('node:child_process');
    const [bin, ...cmdArgs] = command;
    const stdout = execFileSync(bin, cmdArgs, {
      cwd: worktreeDir,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, command: command.join(' '), artifact: stdout.slice(0, 4000) };
  } catch (error) {
    return { ok: false, reason: 'preview_failed', detail: error?.message || 'okänt fel' };
  }
}

function createCmoRepoAdapter({
  canonicalRoot,
  worktreesRoot,
  resolveRepoFn = defaultResolveRepo,
  previewRunner = defaultPreviewRunner,
} = {}) {
  if (!canonicalRoot || !worktreesRoot) {
    throw new Error('canonicalRoot och worktreesRoot krävs för cmoRepoAdapter.');
  }

  function newTaskId() {
    return crypto.randomUUID();
  }

  const _tasks = new Map(); // taskId → { worktreeDir, baseSha, canonicalDir }

  /**
   * Kör ett repo-pilotjobb: resolve → canonical checkout → worktree → toolExecutor
   * → diffstat → Receipt v2. Returnerar receipt (ej HTTP) — routen ansvarar för svar.
   * Samma taskId återanvänder samma worktree (READ→DRAFT→PREVIEW i ett jobb).
   */
  function executeRepoTask({ repoId, tool, args = {}, actor = {}, tenantId = '', taskId = null } = {}) {
    const repo = resolveRepoFn(repoId);
    if (!repo) {
      return { ok: false, reason: 'unknown_repo', repoId: String(repoId || '') };
    }

    const canonicalDir = path.join(canonicalRoot, repo.repoId);
    ensureCanonicalCheckout({ repo, canonicalDir });
    const baseSha = getHeadSha(canonicalDir);
    if (repo.canonicalHead && repo.canonicalHead !== baseSha) {
      // Fail-closed: canonical checkout har drivit från den verifierade HEAD:en.
      return { ok: false, reason: 'canonical_drift', repoId: repo.repoId, baseSha, expected: repo.canonicalHead };
    }

    const id = String(taskId || newTaskId());
    let worktreeDir = _tasks.get(id)?.worktreeDir || null;
    if (!worktreeDir) {
      worktreeDir = createTaskWorktree({ canonicalDir, worktreesRoot, taskId: id, baseSha });
      _tasks.set(id, { worktreeDir, baseSha, canonicalDir });
    }

    const toolReceipt = executeCmoTool({
      context: {
        userId: actor.userId,
        tenantId,
        role: actor.role,
        agent: 'CMO',
        hasEntitlement: true,
        isDisabled: false,
      },
      tool,
      args,
      roots: { readRoot: canonicalDir, scratchRoot: worktreeDir },
    });

    let preview = toolReceipt.preview;
    if (tool === 'cmo.website.preview') {
      preview = previewRunner({ repo, worktreeDir, command: repo.previewCommands?.[0] || '' });
    }

    const changes = getChanges(worktreeDir, baseSha);
    const canonicalPristine = isClean(canonicalDir);
    const ok = toolReceipt.result?.ok !== false;

    return {
      ok,
      actor: actor.userId || null,
      tenant: tenantId || null,
      agent: 'CMO',
      repo: { repoId: repo.repoId, baseSha, canonicalHead: repo.canonicalHead || baseSha },
      taskId: id,
      worktree: worktreeDir,
      tools: toolReceipt.tools_requested,
      gateDecisions: toolReceipt.gate_decisions,
      filesRead: toolReceipt.resources_read,
      filesChanged: changes.changedFiles,
      diffstat: changes.diffstat,
      testsBuild: preview && preview.ok ? preview : null,
      preview,
      approvals: toolReceipt.approvals_requested,
      canonicalIntegrity: canonicalPristine ? 'PRISTINE' : 'MODIFIED',
      result: toolReceipt.result,
      status: !ok ? 'denied' : canonicalPristine ? 'ok' : 'canonical_modified',
    };
  }

  /** Resolver repo + worktree (återanvänder _tasks, fallback till disk). */
  function _resolveWorktree({ repoId, taskId }) {
    const repo = resolveRepoFn(repoId);
    if (!repo) return { error: 'unknown_repo' };
    const canonicalDir = path.join(canonicalRoot, repo.repoId);
    ensureCanonicalCheckout({ repo, canonicalDir });
    const baseSha = getHeadSha(canonicalDir);
    if (repo.canonicalHead && repo.canonicalHead !== baseSha) {
      return { error: 'canonical_drift', baseSha, expected: repo.canonicalHead };
    }
    const id = String(taskId || newTaskId());
    let worktreeDir = _tasks.get(id)?.worktreeDir || null;
    if (!worktreeDir) {
      const diskCandidate = path.join(worktreesRoot, id);
      if (isGitRepo(diskCandidate)) {
        worktreeDir = diskCandidate;
        _tasks.set(id, { worktreeDir, baseSha, canonicalDir });
      } else {
        worktreeDir = createTaskWorktree({ canonicalDir, worktreesRoot, taskId: id, baseSha });
        _tasks.set(id, { worktreeDir, baseSha, canonicalDir });
      }
    }
    return { repo, canonicalDir, baseSha, worktreeDir, taskId: id };
  }

  /**
   * WP-010 (DEL D/E): föreslå WRITE-candidate. Action Gate → REQUIRE_APPROVAL,
   * skapar en PENDING approval-request bunden till snapshot. Ingen execution här.
   */
  async function proposeWriteCandidate({ repoId, taskId, args = {}, actor = {}, tenantId = '', approvalStore = null } = {}) {
    const rt = _resolveWorktree({ repoId, taskId });
    if (rt.error) return { ok: false, reason: rt.error };

    const gate = evaluateAction({
      userId: actor.userId, tenantId, role: actor.role, agent: 'CMO',
      action: 'cmo.content.write_candidate', resource: args.path,
      hasEntitlement: true, isDisabled: false,
    });
    if (gate.decision !== 'REQUIRE_APPROVAL') {
      return { ok: false, reason: 'gate_not_require_approval', gate };
    }

    const changes = getChangesDetailed(rt.worktreeDir, rt.baseSha);
    const snapshotHash = computeSnapshotHash({ baseSha: rt.baseSha, changedFiles: changes.changedFiles, diffstat: changes.diffstat });

    let approvalId = null;
    if (approvalStore && typeof approvalStore.create === 'function') {
      const approval = await approvalStore.create({
        taskId: rt.taskId,
        actor: actor.userId,
        tenant: tenantId,
        agent: 'CMO',
        action: 'cmo.content.write_candidate',
        actionLevel: 'WRITE',
        repoId: rt.repo.repoId,
        resource: args.path,
        baseSha: rt.baseSha,
        worktreeTaskId: rt.taskId,
        summary: args.summary || 'Candidate draft redo för godkännande.',
        changedFiles: changes.changedFiles,
        diffstat: changes.diffstatLabel || changes.diffstat,
        approvalClass: gate.approval,
        snapshotHash,
      });
      approvalId = approval.id;
    }

    return {
      ok: false,
      status: 'pending_approval',
      approvalId,
      approvalClass: gate.approval,
      gate,
      repo: { repoId: rt.repo.repoId, baseSha: rt.baseSha },
      taskId: rt.taskId,
      changedFiles: changes.changedFiles,
      diffstat: changes.diffstat,
      diffstatLabel: changes.diffstatLabel,
      snapshotHash,
    };
  }

  /** Kärnkontroll: base SHA + snapshot-hash + changed files + canonical clean. */
  function checkCandidateSnapshot(approval) {
    const rt = _resolveWorktree({ repoId: approval.repoId, taskId: approval.worktreeTaskId });
    if (rt.error) return { ok: false, reason: rt.error };
    if (rt.baseSha !== approval.baseSha) return { ok: false, reason: 'base_sha_changed' };
    const changes = getChangesDetailed(rt.worktreeDir, rt.baseSha);
    const snapshotHash = computeSnapshotHash({ baseSha: rt.baseSha, changedFiles: changes.changedFiles, diffstat: changes.diffstat });
    if (snapshotHash !== approval.snapshotHash) return { ok: false, reason: 'snapshot_mismatch' };
    if (JSON.stringify([...changes.changedFiles].sort()) !== JSON.stringify([...approval.changedFiles].sort())) {
      return { ok: false, reason: 'changed_files_mismatch' };
    }
    if (!isClean(rt.canonicalDir)) return { ok: false, reason: 'canonical_not_clean' };
    return { ok: true, rt, changes };
  }

  /**
   * WP-010 (DEL F/G): verifiera att ett APPROVED write_candidate fortfarande är
   * giltigt (TOCTOU). Returnerar {ok, reason, context} utan att mutera något.
   */
  async function verifyWriteSnapshot(approvalId, approvalStore = null) {
    if (!approvalStore || typeof approvalStore.get !== 'function') {
      return { ok: false, reason: 'approval_store_unavailable' };
    }
    const approval = await approvalStore.get(approvalId);
    if (!approval) return { ok: false, reason: 'approval_not_found' };
    if (approval.status !== 'APPROVED') return { ok: false, reason: `approval_status_${String(approval.status).toLowerCase()}` };
    if (approval.action !== 'cmo.content.write_candidate') return { ok: false, reason: 'not_write_candidate' };

    const check = checkCandidateSnapshot(approval);
    if (!check.ok) return check;
    return { ok: true, approval, rt: check.rt, changes: check.changes };
  }

  /**
   * WP-010 (DEL F): exekvera ett APPROVED write_candidate — endast om snapshot
   * fortfarande matchar (TOCTOU), canonical clean, och base SHA oförändrad.
   * Promote = lokal candidate-commit i worktreen (INGEN push/merge/deploy).
   */
  async function executeApprovedWrite({ approvalId, approvalStore = null }) {
    const verified = await verifyWriteSnapshot(approvalId, approvalStore);
    if (!verified.ok) return verified;
    const { approval, rt, changes } = verified;

    const candidateCommit = commitCandidate(rt.worktreeDir, `candidate ${approval.worktreeTaskId} approved by ${approval.approvedBy || 'owner'}`);
    await approvalStore.execute(approvalId);

    return {
      ok: true,
      status: 'executed',
      approvalId: approval.id,
      approvalDecision: 'APPROVED',
      approver: approval.approvedBy,
      approvedSnapshotHash: approval.snapshotHash,
      executedAction: approval.action,
      executedAt: new Date().toISOString(),
      candidateCommit,
      repo: { repoId: rt.repo.repoId, baseSha: rt.baseSha },
      taskId: approval.worktreeTaskId,
      changedFiles: changes.changedFiles,
      diffstat: changes.diffstat,
      diffstatLabel: changes.diffstatLabel,
      canonicalIntegrity: 'PRISTINE',
    };
  }

  return { executeRepoTask, proposeWriteCandidate, checkCandidateSnapshot, verifyWriteSnapshot, executeApprovedWrite, newTaskId };
}

module.exports = { createCmoRepoAdapter, defaultPreviewRunner };
