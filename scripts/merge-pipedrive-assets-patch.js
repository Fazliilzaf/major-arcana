#!/usr/bin/env node
'use strict';

/**
 * Merge pipedrive_import patch into prod cco-patient-assets.json (körs lokalt eller via Render SSH).
 *
 * Usage:
 *   node scripts/merge-pipedrive-assets-patch.js /var/data/cco-patient-assets.json /tmp/pipedrive-assets-patch.json
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { mergePipedrivePatchIntoStore } = require('./lib/pipedriveRenderAssetSync');

async function main() {
  const assetsPath = process.argv[2];
  const patchPath = process.argv[3];
  if (!assetsPath || !patchPath) {
    console.error('Usage: node scripts/merge-pipedrive-assets-patch.js <assets.json> <patch.json>');
    process.exit(1);
  }

  const store = JSON.parse(await fs.readFile(assetsPath, 'utf8'));
  const patch = JSON.parse(await fs.readFile(patchPath, 'utf8'));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const backupPath = `${assetsPath}.bak-pipedrive-${stamp}`;

  await fs.copyFile(assetsPath, backupPath);
  const { store: merged, merged: mergedCount } = mergePipedrivePatchIntoStore(store, patch);
  const tmpPath = `${assetsPath}.tmp-pipedrive-${stamp}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, assetsPath);

  console.log(
    JSON.stringify({
      ok: true,
      assetsPath,
      patchPath,
      backupPath,
      mergedCount,
      totalItems: Object.keys(merged.items || {}).length,
    })
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
