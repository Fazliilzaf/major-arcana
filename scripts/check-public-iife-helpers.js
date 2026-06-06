#!/usr/bin/env node
'use strict';

/**
 * Guard against ReferenceError in public IIFE modules (cco-kundkort-*).
 * Catches helpers copied from parity/patient-master without local definition.
 *
 * Usage: node scripts/check-public-iife-helpers.js
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET_GLOB_DIR = path.join(ROOT, 'public/major-arcana-preview/app');
const TARGET_PREFIX = 'cco-kundkort-';

/** Helpers that must be defined in-file if called (prod crash pattern 2026-06). */
const LOCAL_HELPERS = ['A', 'asArray', 'normalizeText', 'normalizeKey', 'escapeHtml', 'esc', 'su'];

function listTargetFiles() {
  return fs
    .readdirSync(TARGET_GLOB_DIR)
    .filter((name) => name.startsWith(TARGET_PREFIX) && name.endsWith('.js'))
    .map((name) => path.join(TARGET_GLOB_DIR, name))
    .sort();
}

function helperCallPattern(name) {
  return new RegExp(`\\b${name}\\s*\\(`, 'g');
}

function helperDefPattern(name) {
  return new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:var|let|const)\\s+${name}\\s*=\\s*(?:function|\\())`,
    'm'
  );
}

function checkFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const src = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  for (const helper of LOCAL_HELPERS) {
    if (!helperCallPattern(helper).test(src)) continue;
    if (!helperDefPattern(helper).test(src)) {
      issues.push(`${rel}: anropar ${helper}() utan lokal definition`);
    }
  }

  return issues;
}

function main() {
  const files = listTargetFiles();
  if (!files.length) {
    console.error('[public-iife-helpers] inga cco-kundkort-*.js hittades');
    process.exit(1);
  }

  const allIssues = [];
  for (const file of files) {
    allIssues.push(...checkFile(file));
  }

  if (allIssues.length) {
    console.error('[public-iife-helpers] FAIL');
    for (const line of allIssues) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(
    `[public-iife-helpers] ok: ${files.length} fil(er), helpers ${LOCAL_HELPERS.join(', ')}`
  );
}

main();
