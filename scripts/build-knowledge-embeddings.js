#!/usr/bin/env node
'use strict';

/**
 * Fas 3 — bygg embeddings för kunskapsbasen (semantisk RAG).
 *
 * Skannar docs/, chunkar varje dokument, embeddar via OpenAI och skriver
 * data/knowledge-embeddings.json. searchKnowledge() plockar automatiskt upp
 * storen och kör hybrid (keyword + semantisk). Utan store/nyckel = keyword-only.
 *
 * Kräver OPENAI_API_KEY. Körs i prod / med nyckel:
 *   OPENAI_API_KEY=... node scripts/build-knowledge-embeddings.js
 *   npm run build:knowledge-embeddings
 */

try {
  require('dotenv').config({ quiet: true });
} catch {
  /* dotenv optional — env vars may come straight from the shell/CI */
}

const fs = require('node:fs/promises');
const path = require('node:path');

const { getDocumentLibrary, getDocContent } = require('../src/ops/contextualDocs');
const { chunkText } = require('../src/knowledge/retriever');
const { embedTexts } = require('../src/ops/knowledgeEmbeddings');

const MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const BATCH = 96;
const OUT = path.resolve(process.cwd(), 'data', 'knowledge-embeddings.json');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!dryRun && !process.env.OPENAI_API_KEY) {
    console.error(
      '❌ OPENAI_API_KEY saknas — kan inte bygga embeddings. (Sökning kör keyword-only utan store.)'
    );
    process.exit(1);
  }

  const library = await getDocumentLibrary();
  const pending = [];
  for (const segment of library.segments) {
    for (const doc of segment.documents) {
      const res = await getDocContent(doc.path);
      if (!res.ok) continue;
      chunkText(res.content).forEach((chunk, chunkIndex) => {
        pending.push({ path: doc.path, chunkIndex, content: chunk });
      });
    }
  }

  if (dryRun) {
    const chars = pending.reduce((sum, c) => sum + c.content.length, 0);
    console.log(
      `DRY-RUN: ${library.totalDocuments} dokument → ${pending.length} chunks, ` +
        `~${Math.round(chars / 4).toLocaleString('sv-SE')} tokens (est, ${MODEL}). ` +
        'Inget OpenAI-anrop, ingen store skriven.'
    );
    return;
  }

  console.log(
    `Dokument: ${library.totalDocuments} → ${pending.length} chunks. Embeddar (${MODEL})…`
  );

  const entries = [];
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const vectors = await embedTexts(
      batch.map((c) => c.content),
      { model: MODEL }
    );
    batch.forEach((c, j) => entries.push({ ...c, vector: vectors[j] }));
    console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
  }

  const store = {
    model: MODEL,
    dim: entries[0] ? entries[0].vector.length : 0,
    generatedAt: new Date().toISOString(),
    documentCount: library.totalDocuments,
    chunkCount: entries.length,
    entries,
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(store)}\n`, 'utf8');
  console.log(`✅ Skrev ${entries.length} vektorer (dim ${store.dim}) → ${OUT}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
