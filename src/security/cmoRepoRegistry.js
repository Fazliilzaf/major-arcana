'use strict';

/**
 * cmoRepoRegistry.js — explicit allowlistad CMO-repo-registry (WP-009, DEL D).
 *
 * CMO-agenten får INGEN generell repository discovery. Den får bara arbeta mot
 * uttryckligen godkända repo-ID:n, var och en med sin canonical GitHub-källa,
 * verifierad default-branch/HEAD och en allowlist över preview/build-kommandon.
 *
 * Okänt/annat repo-ID → null (fail-closed). Detta är den enda repo-auktoriteten.
 */

const CMO_REPOS = Object.freeze({
  'hairtpclinic-web': Object.freeze({
    repoId: 'hairtpclinic-web',
    gitUrl: 'https://github.com/Fazliilzaf/hairtpclinic-web.git',
    defaultBranch: 'main',
    // WP-009 DEL C — verifierad READ-ONLY mot färsk GitHub canonical.
    canonicalHead: 'd8731111f8794959dc134b24e9beeb287163adc7',
    // DEL F — endast registrerade kommandon (argv-arrayer, INGEN shell-tolkning).
    // Modellen skickar ALDRIG eget kommando; adaptern väljer det registrerade.
    buildCommands: Object.freeze([Object.freeze(['npm', 'run', 'build'])]),
    previewCommands: Object.freeze([Object.freeze(['npm', 'run', 'build'])]),
  }),
});

function normalizeRepoId(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveRepo(repoId) {
  return CMO_REPOS[normalizeRepoId(repoId)] || null;
}

function sameCommand(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True om command (argv-array) finns i repots allowlist (exakt match). */
function isAllowedCommand(repo, command) {
  if (!repo || !Array.isArray(command) || command.length === 0) return false;
  const allowed = (repo.buildCommands || []).concat(repo.previewCommands || []);
  return allowed.some((c) => sameCommand(c, command));
}

module.exports = { CMO_REPOS, resolveRepo, normalizeRepoId, isAllowedCommand };
