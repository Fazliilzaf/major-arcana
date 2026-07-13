#!/usr/bin/env node
'use strict';

/**
 * Fast merge of a pipedrive_import patch into cco-patient-assets.json.
 * Writes minified JSON (no pretty print) to reduce time on large stores.
 *
 * Usage:
 *   node scripts/merge-pipedrive-assets-patch-fast.js /var/data/cco-patient-assets.json /var/data/patch.json
 */

const fs = require('node:fs/promises');

async function main() {
  const assetsPath = process.argv[2];
  const patchPath = process.argv[3];
  if (!assetsPath || !patchPath) {
    console.error(
      'Usage: node scripts/merge-pipedrive-assets-patch-fast.js <assets.json> <patch.json>'
    );
    process.exit(1);
  }

  const store = JSON.parse(await fs.readFile(assetsPath, 'utf8'));
  const patch = JSON.parse(await fs.readFile(patchPath, 'utf8'));
  store.items = store.items && typeof store.items === 'object' ? store.items : {};

  let mergedCount = 0;
  for (const [id, asset] of Object.entries(patch.items || {})) {
    if (!asset || asset.sourceSystem !== 'pipedrive_import') continue;
    store.items[id] = asset;
    mergedCount += 1;
  }

  store.updatedAt = new Date().toISOString();
  const tmpPath = `${assetsPath}.tmp-pipedrive-fast`;
  await fs.writeFile(tmpPath, `${JSON.stringify(store)}\n`, 'utf8');
  await fs.rename(tmpPath, assetsPath);

  console.log(
    JSON.stringify({
      ok: true,
      assetsPath,
      patchPath,
      mergedCount,
      totalItems: Object.keys(store.items || {}).length,
    })
  );
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
