#!/usr/bin/env node
'use strict';

const path = require('node:path');

const {
  buildFileRecord,
  discoverMigrationZips,
  listZipEntries,
} = require('./lib/migrationUtils');
const { writeMigrationIndex } = require('./lib/migrationIndexWriter');

function parseArgs(argv) {
  const args = { migrationRoot: '', out: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') args.migrationRoot = argv[++i];
    else if (token === '--out') args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const migrationRoot =
    args.migrationRoot ||
    process.env.ARCANA_MIGRATION_ROOT ||
    path.resolve(process.cwd(), '..');
  const outPath =
    args.out ||
    process.env.ARCANA_MIGRATION_INDEX_PATH ||
    path.join(process.cwd(), 'data', 'migration-index.json');

  const zips = discoverMigrationZips(migrationRoot);
  const files = [];
  const badZips = [];
  const startedAt = new Date().toISOString();

  console.log(`Skannar ${zips.length} zip i ${migrationRoot}`);

  for (const zipPath of zips) {
    const zipName = path.basename(zipPath);
    const listing = listZipEntries(zipPath);
    if (!listing.ok) {
      badZips.push({ zipName, error: listing.error });
      console.warn(`⚠️  ${zipName}: ${listing.error}`);
      continue;
    }
    for (const relativePath of listing.entries) {
      files.push(buildFileRecord({ source: 'zip', zipName, relativePath }));
    }
    console.log(`✓ ${zipName}: ${listing.entries.length} filer`);
  }

  const scanMeta = {
    startedAt,
    completedAt: new Date().toISOString(),
    source: 'zip',
    migrationRoot,
    zipCount: zips.length,
    badZipCount: badZips.length,
    badZips,
  };

  const payload = writeMigrationIndex({ outPath, scanMeta, files });

  console.log('\n=== KLAR (ZIP) ===');
  console.log(`Filer indexerade: ${payload.stats.totalFiles}`);
  console.log(`Profiler (personnummer): ${payload.stats.totalProfiles}`);
  console.log(`Journal-PDF: ${payload.stats.journalPdfs}`);
  console.log(`Bilder: ${payload.stats.images}`);
  console.log(`Trasiga zip: ${payload.stats.badZipCount}`);
  console.log(`Index sparat: ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
