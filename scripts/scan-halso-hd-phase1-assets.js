#!/usr/bin/env node
'use strict';

/**
 * Bygger Phase 1-katalog (m365_halso PDF) till gitignored JSONL-index.
 *
 * Usage:
 *   npm run scan:halso-hd-phase1-assets
 *   npm run scan:halso-hd-phase1-assets -- --assets-path /path/to/cco-patient-assets.json
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');
const { buildPhase1Catalog } = require('./lib/halsoHdPhase1Catalog');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ASSETS = path.join(ROOT, 'data/cco-patient-assets.json');
const DEFAULT_OUT = path.join(ROOT, 'data/reports/halso-hd-phase1-index.jsonl');
const DEFAULT_CHECKPOINT = path.join(ROOT, 'data/reports/halso-hd-phase1.checkpoint.json');

function parseArgs(argv) {
  const args = { assetsPath: DEFAULT_ASSETS, out: DEFAULT_OUT, checkpoint: DEFAULT_CHECKPOINT };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--assets-path') args.assetsPath = path.resolve(argv[++i] || '');
    else if (token === '--out') args.out = path.resolve(argv[++i] || '');
    else if (token === '--checkpoint') args.checkpoint = path.resolve(argv[++i] || '');
    else if (token === '--help' || token === '-h') {
      console.log('Usage: node scripts/scan-halso-hd-phase1-assets.js [--assets-path PATH]');
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  console.error('== Phase 1 m365_halso PDF-katalog ==');

  const catalog = await buildPhase1Catalog({ assetsPath: args.assetsPath });
  console.error(`Asset store: ${catalog.assetsPath}`);
  console.error(
    `Totalt i store: ${catalog.totalAssetsInStore} · Phase 1 HD-PDF: ${catalog.phase1Count}`
  );

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  const lines = catalog.entries.map((entry) => JSON.stringify(entry));
  await fs.writeFile(args.out, `${lines.join('\n')}\n`, 'utf8');

  const checkpoint = {
    version: 'halso-hd-phase1-v1',
    complete: true,
    assetsPath: catalog.assetsPath,
    phase1Count: catalog.phase1Count,
    indexPath: args.out,
    generatedAt: new Date().toISOString(),
  };
  await fs.writeFile(args.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');

  console.error(`Index (PII): ${args.out} — committa INTE`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        phase1Count: catalog.phase1Count,
        totalAssetsInStore: catalog.totalAssetsInStore,
        indexPath: args.out,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
