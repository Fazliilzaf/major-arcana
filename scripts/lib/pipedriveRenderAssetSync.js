'use strict';

const fs = require('node:fs/promises');

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function extractPipedriveItems(store = {}) {
  const items = {};
  for (const [id, asset] of Object.entries(store.items || {})) {
    if (asset?.sourceSystem === 'pipedrive_import') items[id] = asset;
  }
  return items;
}

async function buildPipedrivePatchPayload({ localAssetsPath } = {}) {
  const local = await readJson(localAssetsPath, null);
  if (!local?.items) throw new Error(`Ogiltig lokal asset store: ${localAssetsPath}`);

  const items = extractPipedriveItems(local);
  return {
    payload: {
      schemaVersion: local.schemaVersion,
      sourceSystem: 'pipedrive_import',
      updatedAt: new Date().toISOString(),
      items,
    },
    stats: {
      pipedriveCount: Object.keys(items).length,
      withStorage: Object.values(items).filter(
        (asset) => asset.storageKey && asset.storageKey !== 'pending-no-binary'
      ).length,
    },
  };
}

function mergePipedrivePatchIntoStore(store = {}, patch = {}) {
  const next = { ...store, items: { ...(store.items || {}) } };
  let merged = 0;
  for (const [id, asset] of Object.entries(patch.items || {})) {
    if (asset?.sourceSystem !== 'pipedrive_import') continue;
    next.items[id] = asset;
    merged += 1;
  }
  next.updatedAt = new Date().toISOString();
  return { store: next, merged };
}

module.exports = {
  buildPipedrivePatchPayload,
  extractPipedriveItems,
  mergePipedrivePatchIntoStore,
};
