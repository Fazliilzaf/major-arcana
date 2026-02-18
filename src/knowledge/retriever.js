const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_MAX_CHUNK_CHARS = 1200;

const STOP_WORDS = new Set(
  [
    'och',
    'att',
    'det',
    'som',
    'är',
    'på',
    'i',
    'en',
    'ett',
    'för',
    'med',
    'till',
    'av',
    'de',
    'du',
    'vi',
    'ni',
    'jag',
    'man',
    'om',
    'har',
    'kan',
    'ska',
    'inte',
    'eller',
    'så',
    'då',
    'the',
    'and',
    'or',
    'to',
    'of',
    'in',
    'a',
    'an',
    'is',
    'are',
    'for',
    'with',
    'on',
    'this',
    'that',
  ].map((w) => w.toLowerCase())
);

function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTerms(query) {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  const terms = normalized
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !STOP_WORDS.has(t));
  return Array.from(new Set(terms));
}

async function listFilesRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function chunkText(text, maxChars = DEFAULT_MAX_CHUNK_CHARS) {
  const paragraphs = String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  for (const p of paragraphs) {
    if (!current) {
      current = p;
      continue;
    }
    if ((current.length + 2 + p.length) <= maxChars) {
      current = `${current}\n\n${p}`;
      continue;
    }
    chunks.push(current);
    current = p;
  }
  if (current) chunks.push(current);
  return chunks;
}

function scoreChunk(terms, normalizedChunk) {
  let score = 0;
  for (const term of terms) {
    const idx = normalizedChunk.indexOf(term);
    if (idx === -1) continue;
    let count = 1;
    let pos = idx + term.length;
    while (pos < normalizedChunk.length) {
      const next = normalizedChunk.indexOf(term, pos);
      if (next === -1) break;
      count += 1;
      pos = next + term.length;
    }
    score += count;
  }
  return score;
}

async function createKnowledgeRetriever({ knowledgeDir }) {
  const absoluteDir = path.resolve(knowledgeDir);
  let chunks = [];

  function extractAttribution(rawText) {
    const match = String(rawText ?? '').match(/Källa:\s*(https?:\/\/\S+)/i);
    return match?.[1]?.trim() || '';
  }

  async function buildIndex() {
    try {
      const files = await listFilesRecursive(absoluteDir);
      const textFiles = files.filter((f) => /\.(md|txt)$/i.test(f));
      const loaded = [];
      for (const filePath of textFiles) {
        const raw = await fs.readFile(filePath, 'utf8');
        const rel = path.relative(absoluteDir, filePath);
        const attribution = extractAttribution(raw);
        for (const [i, chunk] of chunkText(raw).entries()) {
          loaded.push({
            id: `${rel}#${i + 1}`,
            source: rel,
            attribution,
            content: chunk,
            normalized: normalizeText(chunk),
          });
        }
      }
      chunks = loaded;
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        chunks = [];
        return;
      }
      throw error;
    }
  }

  await buildIndex();

  async function search(query, { limit = 6 } = {}) {
    const terms = extractTerms(query);
    if (terms.length === 0 || chunks.length === 0) return [];

    const scored = [];
    for (const chunk of chunks) {
      const score = scoreChunk(terms, chunk.normalized);
      if (score <= 0) continue;
      scored.push({ chunk, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => ({
      id: s.chunk.id,
      source: s.chunk.source,
      attribution: s.chunk.attribution,
      content: s.chunk.content,
      score: s.score,
    }));
  }

  return {
    knowledgeDir: absoluteDir,
    rebuild: buildIndex,
    search,
  };
}

module.exports = { createKnowledgeRetriever };
