#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { buildClientoLinkProposedPack } = require('../src/ops/clientoLinkProposedPack');

function checksum(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const args = { manifestPath: '', limit: 3 };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--manifest') args.manifestPath = path.resolve(argv[++index] || '');
    else if (value === '--limit') args.limit = Number(argv[++index]);
    else throw new Error(`Okänt argument: ${value}`);
  }
  if (!args.manifestPath || !fs.existsSync(args.manifestPath)) {
    throw new Error('--manifest <explicit fil> krävs.');
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const before = checksum(args.manifestPath);
  const manifest = JSON.parse(fs.readFileSync(args.manifestPath, 'utf8'));
  const pack = buildClientoLinkProposedPack({ candidateManifest: manifest, limit: args.limit });
  const after = checksum(args.manifestPath);
  if (before !== after) throw new Error('Kandidatmanifestet ändrades under read-only-körningen.');
  pack.verification.inputFileChecksumBefore = before;
  pack.verification.inputFileChecksumAfter = after;
  pack.verification.inputFileUnchanged = true;
  process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
}

if (require.main === module || process.argv[1] === '-') {
  try {
    main();
  } catch (error) {
    process.stderr.write(`FEL: ${error?.message || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs };
