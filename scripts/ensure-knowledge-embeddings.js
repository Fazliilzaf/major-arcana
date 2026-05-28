#!/usr/bin/env node
'use strict';

/**
 * Idempotent embeddings-grind. Bygger data/knowledge-embeddings.json ENDAST om
 * den saknas eller är inaktuell (en doc ändrad efter senaste bygget). Säker att
 * köra efter deploy: utan OPENAI_API_KEY hoppar den tyst (keyword-only).
 *
 *   npm run embeddings:ensure
 */

try {
  require('dotenv').config({ quiet: true });
} catch {
  /* dotenv optional — env vars may come straight from the shell/CI */
}

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { loadEmbeddingStore, isStoreStale } = require('../src/ops/knowledgeEmbeddings');

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('embeddings:ensure — OPENAI_API_KEY saknas, hoppar (sökning kör keyword-only).');
    return;
  }
  const storePath = path.resolve(process.cwd(), 'data', 'knowledge-embeddings.json');
  const store = await loadEmbeddingStore(storePath);
  if (store && !(await isStoreStale(store))) {
    console.log('embeddings:ensure — store färsk, ingen ombyggnad.');
    return;
  }
  console.log('embeddings:ensure — store saknas/inaktuell, bygger om…');
  execFileSync(process.execPath, [path.join(__dirname, 'build-knowledge-embeddings.js')], {
    stdio: 'inherit',
  });
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
