#!/usr/bin/env node
/**
 * E4 batch — ladda ner saknade Word från SharePoint (Graph) enligt word-registry.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, WORD_DIR, resolveWordFile } = require('./patient-document-word-lib');

const REGISTRY = JSON.parse(
  fs.readFileSync(
    path.join(
      ROOT,
      'docs/implementation/patient-documents-live/patient-document-word-registry.json'
    ),
    'utf8'
  )
);

function main() {
  console.log(`\n=== download:patient-doc-word-e4 ===\n`);
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const item of REGISTRY.items) {
    if (!item.sharepoint) continue;
    if (resolveWordFile(item)) {
      console.log(`SKIP ${item.id} — redan lokalt`);
      skip += 1;
      continue;
    }
    const { name, relative } = item.sharepoint;
    console.log(`GET ${item.id}: ${name}`);
    const result = spawnSync(
      'node',
      [
        path.join(ROOT, 'scripts/ops/download-sharepoint-doc.js'),
        '--name',
        name,
        '--relative',
        relative,
        '--out',
        WORD_DIR,
        ...(item.localNames?.[0] ? ['--dest', item.localNames[0]] : []),
      ],
      { stdio: 'inherit', env: process.env }
    );
    if (result.status === 0) ok += 1;
    else fail += 1;
  }

  console.log(`\nKlart: ${ok} nedladdade, ${skip} fanns, ${fail} misslyckades\n`);
  if (fail) process.exit(1);
}

main();
