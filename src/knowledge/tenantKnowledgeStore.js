'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const VALID_CATEGORIES = Object.freeze([
  'treatment', 'pricing', 'faq', 'aftercare', 'policy', 'general',
]);

function normalizeCategory(value) {
  const safe = normalizeText(value).toLowerCase();
  return VALID_CATEGORIES.includes(safe) ? safe : 'general';
}

function chunkText(text, maxChunkChars = 1200) {
  const paragraphs = normalizeText(text).split(/\n{2,}/);
  const chunks = [];
  let current = '';
  let position = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 > maxChunkChars && current) {
      chunks.push({
        chunkId: `kc_${crypto.randomUUID()}`,
        text: current.trim(),
        tokenCount: Math.ceil(current.trim().length / 4),
        position,
      });
      position += 1;
      current = '';
    }
    current += (current ? '\n\n' : '') + trimmed;
  }

  if (current.trim()) {
    chunks.push({
      chunkId: `kc_${crypto.randomUUID()}`,
      text: current.trim(),
      tokenCount: Math.ceil(current.trim().length / 4),
      position,
    });
  }

  return chunks;
}

function contentHash(text) {
  return `sha256:${crypto.createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 16)}`;
}

function scoreMatch(query, text) {
  const queryWords = normalizeText(query).toLowerCase().split(/\s+/).filter(Boolean);
  const normalizedText = normalizeText(text).toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (word.length < 2) continue;
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = normalizedText.match(regex);
    if (matches) score += matches.length;
  }
  return score;
}

function createTenantKnowledgeStore({ storePath = './data/knowledge.json' } = {}) {
  let state = {
    version: '1.0',
    documents: {},
    updatedAt: new Date().toISOString(),
  };

  async function load() {
    try {
      const raw = await fs.readFile(storePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.documents) {
        state = parsed;
      }
    } catch (_error) {
      // File doesn't exist yet
    }
  }

  async function save() {
    state.updatedAt = new Date().toISOString();
    const dir = path.dirname(storePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(state, null, 2), 'utf8');
  }

  function listDocuments({ tenantId, category, limit = 50 } = {}) {
    const safeTenant = normalizeText(tenantId).toLowerCase();
    const safeCategory = category ? normalizeCategory(category) : null;
    return Object.values(state.documents)
      .filter((doc) => {
        if (safeTenant && doc.tenantId !== safeTenant) return false;
        if (safeCategory && doc.category !== safeCategory) return false;
        return true;
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, Math.max(1, Math.min(200, limit)))
      .map((doc) => ({
        documentId: doc.documentId,
        tenantId: doc.tenantId,
        title: doc.title,
        category: doc.category,
        language: doc.language,
        source: doc.source,
        chunkCount: asArray(doc.chunks).length,
        contentHash: doc.contentHash,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        version: doc.version,
      }));
  }

  function getDocument({ tenantId, documentId } = {}) {
    const doc = state.documents[documentId];
    if (!doc) return null;
    if (tenantId && doc.tenantId !== normalizeText(tenantId).toLowerCase()) return null;
    return { ...doc };
  }

  async function upsertDocument({ tenantId, document } = {}) {
    const safeTenant = normalizeText(tenantId).toLowerCase();
    if (!safeTenant) throw new Error('tenantId krävs.');
    const safeDoc = document && typeof document === 'object' ? document : {};
    const existingId = normalizeText(safeDoc.documentId);
    const documentId = existingId || `kd_${crypto.randomUUID()}`;
    const existing = state.documents[documentId];
    const content = normalizeText(safeDoc.content);
    if (!content) throw new Error('content krävs.');

    const now = new Date().toISOString();
    const chunks = chunkText(content);

    const newDoc = {
      documentId,
      tenantId: safeTenant,
      source: normalizeText(safeDoc.source) || 'manual',
      category: normalizeCategory(safeDoc.category),
      title: normalizeText(safeDoc.title) || 'Utan titel',
      content,
      contentHash: contentHash(content),
      language: normalizeText(safeDoc.language) || 'sv',
      metadata: safeDoc.metadata && typeof safeDoc.metadata === 'object' ? safeDoc.metadata : {},
      chunks,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };

    state.documents[documentId] = newDoc;
    await save();
    return newDoc;
  }

  async function deleteDocument({ tenantId, documentId } = {}) {
    const doc = state.documents[documentId];
    if (!doc) return false;
    if (tenantId && doc.tenantId !== normalizeText(tenantId).toLowerCase()) return false;
    delete state.documents[documentId];
    await save();
    return true;
  }

  function search({ tenantId, query, maxResults = 5, category } = {}) {
    const safeTenant = normalizeText(tenantId).toLowerCase();
    const safeQuery = normalizeText(query);
    const safeCategory = category ? normalizeCategory(category) : null;
    if (!safeQuery) return [];

    const candidates = [];
    for (const doc of Object.values(state.documents)) {
      if (safeTenant && doc.tenantId !== safeTenant) continue;
      if (safeCategory && doc.category !== safeCategory) continue;

      for (const chunk of asArray(doc.chunks)) {
        const score = scoreMatch(safeQuery, chunk.text) +
          scoreMatch(safeQuery, doc.title) * 2;
        if (score > 0) {
          candidates.push({
            documentId: doc.documentId,
            chunkId: chunk.chunkId,
            title: doc.title,
            category: doc.category,
            text: chunk.text,
            score,
            tokenCount: chunk.tokenCount,
            position: chunk.position,
            updatedAt: doc.updatedAt,
          });
        }
      }
    }

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, maxResults)));
  }

  function getStats({ tenantId } = {}) {
    const safeTenant = tenantId ? normalizeText(tenantId).toLowerCase() : null;
    const docs = Object.values(state.documents).filter(
      (doc) => !safeTenant || doc.tenantId === safeTenant
    );
    const totalChunks = docs.reduce((sum, doc) => sum + asArray(doc.chunks).length, 0);
    const totalTokens = docs.reduce(
      (sum, doc) => sum + asArray(doc.chunks).reduce((s, c) => s + (c.tokenCount || 0), 0),
      0
    );
    const categories = {};
    for (const doc of docs) {
      categories[doc.category] = (categories[doc.category] || 0) + 1;
    }
    return {
      documentCount: docs.length,
      chunkCount: totalChunks,
      estimatedTokens: totalTokens,
      categories,
      updatedAt: state.updatedAt,
    };
  }

  return {
    load,
    listDocuments,
    getDocument,
    upsertDocument,
    deleteDocument,
    search,
    getStats,
  };
}

module.exports = {
  createTenantKnowledgeStore,
};
