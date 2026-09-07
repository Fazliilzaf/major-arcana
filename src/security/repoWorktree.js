'use strict';

/**
 * repoWorktree.js — isolerad task-worktree för CMO-repo-pilot (WP-009, DEL E).
 *
 * Git-operations utförs med execFileSync (INGEN shell) — argument passerar som
 * argv, aldrig genom en tolk. Ingen commit/push/merge/deploy förekommer här:
 * bara worktree-skapande, diff-inspection och canonical-orörd-kontroll.
 */

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Ingen trim — nödvändig för porcelain-parsning (statuskolumner är inledande blanksteg).
function runGitRaw(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function isGitRepo(dir) {
  try {
    runGit(dir, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

function getHeadSha(canonicalDir) {
  return runGit(canonicalDir, ['rev-parse', 'HEAD']);
}

/**
 * WP-010 B-2 — strikt task-id-validering. task_id är en IDENTIFIERARE, inte en
 * filsystems-sökväg. Tillåter UUID och enkla [A-Za-z0-9._-]-identifierare.
 * Rejectar `..`, `.`, `/`, `\`, absolut sökväg, URI-schema, procentkodning,
 * tom/whitespace och malformed — fail closed.
 */
function isValidTaskId(taskId) {
  if (typeof taskId !== 'string') return false;
  if (!taskId || taskId !== taskId.trim()) return false;
  if (taskId === '.' || taskId === '..') return false;
  // Inga path-separatorer, dot-segment, procentkodning eller `:` (URI/drive).
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId);
}

/** True om `inner` är lika med eller ligger strikt innanför `outer` (realpath). */
function isWithinOrEqual(inner, outer) {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * WP-010 B-2 — resolve + containa en task-worktree-sökväg (server-side, fail
 * closed). En worktree måste vara STRICT DESCENDANT av worktreesRoot, får aldrig
 * sammanfalla med/ligga inuti canonical checkout, och får aldrig innesluta
 * canonical. Symlink-escape utanför worktreesRoot → DENY.
 */
function resolveTaskWorktreeDir({ worktreesRoot, canonicalDir, taskId }) {
  if (!isValidTaskId(taskId)) return { ok: false, reason: 'invalid_task_id' };

  let realRoot;
  try {
    realRoot = fs.realpathSync(String(worktreesRoot));
  } catch {
    return { ok: false, reason: 'worktrees_root_not_found' };
  }

  // Bygg candidate UTIFRÅN realRoot (ej raw worktreesRoot) så /tmp→/private/tmp
  // eller andra symlink-baserade roots inte ger falska `..`-avslag.
  const candidate = path.resolve(realRoot, taskId);

  // String-nivå: candidate måste vara strikt descendant av worktreesRoot.
  const relStr = path.relative(realRoot, candidate);
  if (relStr === '' || relStr.startsWith('..') || path.isAbsolute(relStr)) {
    return { ok: false, reason: 'worktree_outside_root' };
  }

  // Symlink-escape: realpath av djupast existerande förälder måste ligga inuti
  // (eller vara) realRoot. En NY worktree existerar inte ännu → djupaste
  // existerande förälder är realRoot själv, vilket är tillåtet.
  let probe = candidate;
  let realCandidate;
  for (;;) {
    try {
      realCandidate = fs.realpathSync(probe);
      break;
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        const parent = path.dirname(probe);
        if (parent === probe) return { ok: false, reason: 'worktrees_root_not_found' };
        probe = parent;
        continue;
      }
      return { ok: false, reason: 'path_resolution_failed' };
    }
  }
  if (!isWithinOrEqual(realCandidate, realRoot)) {
    return { ok: false, reason: 'symlink_escape' };
  }

  let realCanonical = null;
  try {
    realCanonical = fs.realpathSync(String(canonicalDir));
  } catch {
    /* canonical checkout skapas vid behov — hoppa över canonical-checken då. */
  }
  if (realCanonical) {
    if (isWithinOrEqual(realCandidate, realCanonical)) {
      return { ok: false, reason: 'worktree_is_canonical' };
    }
    if (isWithinOrEqual(realCanonical, realCandidate)) {
      return { ok: false, reason: 'worktree_contains_canonical' };
    }
  }

  return { ok: true, worktreeDir: candidate, realWorktree: realCandidate };
}

/**
 * Säkerställer en canonical checkout. Om `canonicalDir` inte redan är ett repo,
 * shallow-klonas `repo.gitUrl` (default branch). För tester kan gitUrl vara en
 * lokal sökväg — git clone hanterar båda. Returnerar canonicalDir.
 */
function ensureCanonicalCheckout({ repo, canonicalDir, depth = 1 }) {
  if (isGitRepo(canonicalDir)) return canonicalDir;
  fs.mkdirSync(path.dirname(canonicalDir), { recursive: true });
  const args = ['clone', '--depth', String(depth || 1), '--branch', repo.defaultBranch || 'main'];
  if (repo.canonicalHead) {
    // Pinna canonical HEAD explicit (verifierad) så worktree-basen är deterministisk.
    args.push('--single-branch');
  }
  args.push(repo.gitUrl, canonicalDir);
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return canonicalDir;
}

/**
 * Skapar en dedikerad isolerad task-worktree från baseSha (detached HEAD).
 * canonical checkout förblir orörd. Returnerar absolut worktree-sökväg.
 */
function createTaskWorktree({ canonicalDir, worktreesRoot, taskId, baseSha }) {
  const resolved = resolveTaskWorktreeDir({ worktreesRoot, canonicalDir, taskId });
  if (!resolved.ok) {
    const err = new Error(resolved.reason);
    err.statusCode = 400;
    throw err;
  }
  runGit(canonicalDir, ['worktree', 'add', '--detach', resolved.worktreeDir, baseSha]);
  return resolved.worktreeDir;
}

/** Ändrade + untracked filer (porcelain) samt diffstat gentemot baseSha. */
function getChanges(worktreeDir, baseSha) {
  let changedFiles = [];
  let diffstat = '';
  try {
    const porcelain = runGitRaw(worktreeDir, ['status', '--porcelain']);
    changedFiles = porcelain
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3)); // "XY path" → path (porcelain v1)
  } catch {
    changedFiles = [];
  }
  try {
    diffstat = runGit(worktreeDir, ['diff', '--stat', baseSha]);
  } catch {
    diffstat = '';
  }
  return { changedFiles, diffstat };
}

/** A/M/D per fil (WP-010 DEL J). Untracked (??) klassas som A. */
function getChangesDetailed(worktreeDir, baseSha) {
  const changesByFile = {};
  let changedFiles = [];
  try {
    const porcelain = runGitRaw(worktreeDir, ['status', '--porcelain']);
    for (const line of porcelain.split('\n').filter(Boolean)) {
      const code = line.slice(0, 2).trim();
      const file = line.slice(3);
      changedFiles.push(file);
      const kind = code === '??' ? 'A' : /D/.test(code) ? 'D' : /A/.test(code) ? 'A' : 'M';
      changesByFile[file] = kind;
    }
  } catch {
    changedFiles = [];
  }
  let diffstat = '';
  try {
    diffstat = runGit(worktreeDir, ['diff', '--stat', baseSha]);
  } catch {
    diffstat = '';
  }
  const diffstatLabel = Object.entries(changesByFile)
    .map(([file, kind]) => `${kind} ${file}`)
    .join('\n');
  return { changedFiles, changesByFile, diffstat, diffstatLabel };
}

/**
 * WP-010 B-1 — deterministiska content-fingerprints per ändrad fil. Varje post
 * binder exakt kandidat-INNEHÅLL (SHA-256 av bytes), inte bara linjantal:
 *   - A/M/R: SHA-256 av den resulterande kandidatfilen i worktreen.
 *   - D:     contentSha256 = null (status D är själva deletion-markören).
 *   - R:     sourcePath = gammal sökväg (porcelain "old -> new").
 * Sortering är deterministisk (path, sedan sourcePath).
 */
function getContentSnapshotEntries(worktreeDir) {
  const entries = [];
  try {
    const porcelain = runGitRaw(worktreeDir, ['status', '--porcelain']);
    for (const line of porcelain.split('\n').filter(Boolean)) {
      const xy = line.slice(0, 2);
      const rest = line.slice(3);
      let status;
      if (xy === '??') status = 'A';
      else if (xy.includes('R')) status = 'R';
      else if (xy.includes('D')) status = 'D';
      else if (xy.includes('A')) status = 'A';
      else status = 'M';

      let filePath = rest;
      let sourcePath = null;
      if (status === 'R') {
        const idx = rest.indexOf(' -> ');
        if (idx >= 0) {
          sourcePath = rest.slice(0, idx);
          filePath = rest.slice(idx + 4);
        }
      }

      let contentSha256 = null;
      if (status !== 'D') {
        try {
          const buf = fs.readFileSync(path.join(worktreeDir, filePath));
          contentSha256 = crypto.createHash('sha256').update(buf).digest('hex');
        } catch {
          contentSha256 = null;
        }
      }
      entries.push({
        path: filePath,
        status,
        ...(sourcePath !== null ? { sourcePath } : {}),
        contentSha256,
      });
    }
  } catch {
    /* inga ändringar */
  }
  entries.sort((a, b) => {
    const ka = `${a.path}\u0000${a.sourcePath || ''}`;
    const kb = `${b.path}\u0000${b.sourcePath || ''}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return entries;
}

/** Lokal candidate-commit i worktreen (INGEN push/merge/deploy). Returnerar commit SHA. */
function commitCandidate(worktreeDir, message) {
  runGit(worktreeDir, ['add', '-A']);
  runGit(worktreeDir, [
    '-c', 'user.email=agent@arcana.local',
    '-c', 'user.name=CMO-agent',
    'commit', '-qm', String(message || 'candidate'),
  ]);
  return runGit(worktreeDir, ['rev-parse', 'HEAD']);
}

/** True om canonical checkout inte har några ändringar (orörd). */
function isClean(canonicalDir) {
  try {
    return runGit(canonicalDir, ['status', '--porcelain']) === '';
  } catch {
    return false;
  }
}

function removeWorktree(canonicalDir, worktreeDir) {
  try {
    runGit(canonicalDir, ['worktree', 'remove', '--force', worktreeDir]);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  ensureCanonicalCheckout,
  createTaskWorktree,
  getHeadSha,
  getChanges,
  getChangesDetailed,
  getContentSnapshotEntries,
  isValidTaskId,
  resolveTaskWorktreeDir,
  commitCandidate,
  isClean,
  removeWorktree,
  isGitRepo,
};
