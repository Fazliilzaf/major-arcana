'use strict';

/**
 * Shared knowledge grounding for agent capabilities.
 *
 * Returns the most relevant docs from the unified knowledge layer as compact
 * citations ({ path, snippet }). Used by CAO, CMO, … so every agent grounds the
 * same way. Best-effort: degrades to keyword (and returns [] on any error), so a
 * capability never fails because of grounding. Citations are restricted to real
 * .md docs and exclude archive dumps; deduped by path.
 */

const { searchKnowledge } = require('./knowledgeAccessor');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function groundingReferences(query, { limit = 3 } = {}) {
  const q = normalizeText(query);
  if (!q) return [];
  try {
    const hits = await searchKnowledge(q, { limit: limit * 3 });
    const seen = new Set();
    const refs = [];
    for (const hit of hits) {
      const docPath = normalizeText(hit.path);
      if (!/\.md$/i.test(docPath) || docPath.startsWith('docs/archives/')) continue;
      if (seen.has(docPath)) continue;
      seen.add(docPath);
      refs.push({ path: docPath, snippet: normalizeText(hit.content).slice(0, 160) });
      if (refs.length >= limit) break;
    }
    return refs;
  } catch {
    return [];
  }
}

module.exports = { groundingReferences };
