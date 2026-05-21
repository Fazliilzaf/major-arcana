'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Minimal YAML frontmatter parser for docs/ metadata (owner, status, next_step).
 */
function parseSimpleFrontmatter(raw = '') {
  const text = String(raw || '');
  if (!text.startsWith('---')) {
    return { attributes: {}, body: text };
  }
  const end = text.indexOf('\n---', 3);
  if (end < 0) {
    return { attributes: {}, body: text };
  }
  const block = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n/, '');
  const attributes = {};
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!match) continue;
    const key = normalizeText(match[1]).toLowerCase();
    attributes[key] = normalizeText(match[2]).replace(/^['"]|['"]$/g, '');
  }
  return { attributes, body };
}

module.exports = {
  parseSimpleFrontmatter,
};
