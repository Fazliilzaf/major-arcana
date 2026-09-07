'use strict';

/**
 * toolPathGuard.js — filesystem-säkerhet för agent-tools (WP-008).
 *
 * Förhindrar path traversal, symlink-escape, absolute-path-escape och åtkomst
 * till hemliga/hidden filer. All read/draft via agent-tools MÅSTE passera här.
 */

const fs = require('node:fs');
const path = require('node:path');

const FORBIDDEN_SEGMENTS = new Set([
  '.env', '.env.local', '.env.production', 'credentials', 'secrets',
  '.git-credentials', '.npmrc', 'id_rsa', 'id_ed25519', '.pem',
]);

function isForbiddenSegment(name) {
  const n = String(name || '').toLowerCase();
  return FORBIDDEN_SEGMENTS.has(n) || /(secret|credential|token|password|privatekey|\.key$|\.pem$)/.test(n);
}

function isForbiddenPath(p) {
  const parts = p.split(path.sep).filter(Boolean);
  return parts.some(isForbiddenSegment);
}

/**
 * Returnerar `{ ok: true, resolved }` om p ligger under root (efter symlink-
 * och ..-upplösning), annars `{ ok:false, reason }`. Fail-closed.
 */
function resolveSafePath(root, target) {
  const r = path.resolve(String(root || ''));
  const t = path.resolve(r, String(target || ''));
  // Snabb ..-kontroll före realpath.
  const rel = path.relative(r, t);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: 'path_escape' };
  }
  // Symlink-upplösning: gå uppåt till djupast existerande förälder (ny draft-fil
  // eller djup katalog behöver inte finnas ännu). Fail-closed på escape.
  let realRoot;
  try {
    realRoot = fs.realpathSync(r);
  } catch {
    return { ok: false, reason: 'root_not_found' };
  }
  let candidate = t;
  let realTarget;
  for (;;) {
    try {
      realTarget = fs.realpathSync(candidate);
      break;
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        const parent = path.dirname(candidate);
        if (parent === candidate) return { ok: false, reason: 'root_not_found' };
        candidate = parent;
        continue;
      }
      throw e;
    }
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    return { ok: false, reason: 'symlink_escape' };
  }
  return { ok: true, resolved: t, realRoot, realTarget };
}

/** Läsning: allowlist-root + path-guard + ingen hemlig/hidden path. */
function safeRead({ root, target }) {
  if (!root) return { ok: false, reason: 'no_root' };
  if (isForbiddenPath(target)) return { ok: false, reason: 'forbidden_path' };
  const guard = resolveSafePath(root, target);
  if (!guard.ok) return guard;
  try {
    const data = fs.readFileSync(guard.resolved, 'utf8');
    return { ok: true, resolved: guard.resolved, content: data };
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
}

/** Draft-skrivning: endast i isolerad scratch-root (aldrig canonical). */
function safeDraftWrite({ root, target, content }) {
  if (!root) return { ok: false, reason: 'no_root' };
  if (isForbiddenPath(target)) return { ok: false, reason: 'forbidden_path' };
  const guard = resolveSafePath(root, target);
  if (!guard.ok) return guard;
  try {
    fs.mkdirSync(path.dirname(guard.resolved), { recursive: true });
    fs.writeFileSync(guard.resolved, String(content ?? ''), 'utf8');
    return { ok: true, resolved: guard.resolved };
  } catch {
    return { ok: false, reason: 'write_failed' };
  }
}

module.exports = { resolveSafePath, safeRead, safeDraftWrite, isForbiddenPath };
