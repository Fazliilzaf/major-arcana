#!/usr/bin/env node
'use strict';

const path = require('node:path');

const { buildFileRecord, walkFolderEntries } = require('./lib/migrationUtils');
const { writeMigrationIndex } = require('./lib/migrationIndexWriter');

function parseArgs(argv) {
  const args = { folderRoot: '', out: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') args.folderRoot = argv[++i];
    else if (token === '--out') args.out = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const folderRoot =
    args.folderRoot ||
    process.env.ARCANA_DRIVE_MIRROR_ROOT ||
    process.env.ARCANA_MIGRATION_DRIVE_ROOT ||
    '';
  if (!folderRoot) {
    throw new Error(
      'Ange Drive-mirror med --root eller ARCANA_DRIVE_MIRROR_ROOT. Exempel: ~/Major-Arcana-Migration/drive-mirror'
    );
  }

  const outPath =
    args.out ||
    process.env.ARCANA_MIGRATION_INDEX_PATH ||
    path.join(process.cwd(), 'data', 'migration-index.json');

  const startedAt = new Date().toISOString();
  const resolvedRoot = path.resolve(folderRoot);
  console.log(`Skannar lokal Drive-mirror: ${resolvedRoot}`);

  const listing = walkFolderEntries(resolvedRoot);
  if (!listing.ok) {
    throw new Error(listing.error || 'Kunde inte läsa mappen.');
  }

  const files = listing.entries.map((relativePath) =>
    buildFileRecord({
      source: 'folder',
      folderRoot: resolvedRoot,
      relativePath,
    })
  );

  const scanMeta = {
    startedAt,
    completedAt: new Date().toISOString(),
    source: 'folder',
    folderRoot: resolvedRoot,
    fileCount: files.length,
  };

  const payload = writeMigrationIndex({ outPath, scanMeta, files });

  console.log('\n=== KLAR (LOKAL MAPP) ===');
  console.log(`Filer indexerade: ${payload.stats.totalFiles}`);
  console.log(`Profiler (personnummer): ${payload.stats.totalProfiles}`);
  console.log(`Journal-PDF: ${payload.stats.journalPdfs}`);
  console.log(`Bilder: ${payload.stats.images}`);
  console.log(`Index sparat: ${outPath}`);
  console.log('\nKör sedan: npm run migration:import');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
