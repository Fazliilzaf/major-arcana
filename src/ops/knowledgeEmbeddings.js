'use strict';

/**
 * Knowledge Embeddings (Fas 3 — semantisk RAG).
 *
 * Pure, testbar vektor-logik + en pluggbar embed-funktion (OpenAI när nyckel
 * finns). Allt degraderar tyst till keyword-sökning när embeddings saknas:
 *  - ingen OPENAI_API_KEY / aiProvider != openai  → ingen embedding
 *  - ingen embeddings-store på disk                → keyword-only
 *
 * Store-format (data/knowledge-embeddings.json):
 *   { model, dim, generatedAt, entries: [{ path, chunkIndex, content, vector:[…] }] }
 */

const fs = require('node:fs/promises');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function loadEmbeddingStore(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Top-N chunks by cosine similarity to the query vector.
function semanticSearch(queryVector, store, { limit = 6 } = {}) {
  if (!queryVector || !store || !Array.isArray(store.entries)) return [];
  return store.entries
    .map((entry) => ({
      path: entry.path,
      content: entry.content,
      chunkIndex: entry.chunkIndex,
      score: cosineSimilarity(queryVector, entry.vector),
    }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

// Merge keyword + semantic hits, dedupe by path (best score wins), keep order
// by combined relevance. Each input hit must have { path, score }.
function mergeHybrid(keywordHits = [], semanticHits = [], { limit = 6 } = {}) {
  const byPath = new Map();
  const add = (hit, weight, kind) => {
    const path = hit && hit.path;
    if (!path) return;
    const prev = byPath.get(path);
    const contribution = (Number(hit.score) || 0) * weight;
    if (!prev) {
      byPath.set(path, { ...hit, score: contribution, sources: [kind] });
    } else {
      prev.score += contribution;
      if (!prev.sources.includes(kind)) prev.sources.push(kind);
      if (!prev.content && hit.content) prev.content = hit.content;
    }
  };
  // Normalize keyword scores (they can be large integers) vs semantic (0..1).
  const maxKw = Math.max(1, ...keywordHits.map((h) => Number(h.score) || 0));
  keywordHits.forEach((h) => add({ ...h, score: (Number(h.score) || 0) / maxKw }, 1, 'keyword'));
  semanticHits.forEach((h) => add(h, 1.2, 'semantic'));
  return [...byPath.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}

function isEmbeddingsConfigured(config = {}) {
  return config.aiProvider === 'openai' && Boolean(config.openaiApiKey);
}

// Embed via OpenAI when configured; throws otherwise (callers fall back).
async function embedTexts(texts, { model = 'text-embedding-3-small' } = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || ''));
  if (!list.length) return [];
  const { openai } = require('../openai/client');
  const res = await openai.embeddings.create({ model, input: list });
  return res.data.map((d) => d.embedding);
}

async function embedQuery(query, options = {}) {
  const [vector] = await embedTexts([String(query || '')], options);
  return vector || null;
}

// Newest mtime (ms) across every indexed doc — used to tell if the embeddings
// store has fallen behind the docs it was built from.
async function newestDocMtime(repoRoot = process.cwd()) {
  const path = require('node:path');
  const { getDocumentLibrary } = require('./contextualDocs');
  const library = await getDocumentLibrary(repoRoot);
  let newest = 0;
  for (const segment of library.segments) {
    for (const doc of segment.documents) {
      try {
        const stat = await fs.stat(path.join(repoRoot, doc.path));
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        /* ignore unreadable doc */
      }
    }
  }
  return newest;
}

// Stale = no store, unparsable timestamp, or a doc changed after it was built.
async function isStoreStale(store, repoRoot = process.cwd()) {
  if (!store || !store.generatedAt) return true;
  const generated = Date.parse(store.generatedAt);
  if (Number.isNaN(generated)) return true;
  const newest = await newestDocMtime(repoRoot);
  return newest > generated;
}

module.exports = {
  cosineSimilarity,
  loadEmbeddingStore,
  semanticSearch,
  mergeHybrid,
  isEmbeddingsConfigured,
  embedTexts,
  embedQuery,
  newestDocMtime,
  isStoreStale,
};
