'use strict';

/**
 * repoWorktree.js — isolerad task-worktree för CMO-repo-pilot (WP-009, DEL E).
 *
 * Git-operations utförs med execFileSync (INGEN shell) — argument passerar som
 * argv, aldrig genom en tolk. Ingen commit/push/merge/deploy förekommer här:
 * bara worktree-skapande, diff-inspection och canonical-orörd-kontroll.
 */

const { execFileSync } = require('node:child_process');
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
  const worktreeDir = path.join(worktreesRoot, String(taskId));
  runGit(canonicalDir, ['worktree', 'add', '--detach', worktreeDir, baseSha]);
  return worktreeDir;
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
  commitCandidate,
  isClean,
  removeWorktree,
  isGitRepo,
};
