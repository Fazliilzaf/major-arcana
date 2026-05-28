#!/usr/bin/env node
/**
 * scripts/check-require-paths.js
 *
 * Statisk kontroll: hittar relativa require()-/import-sökvägar i src/ (och
 * andra angivna rötter) som INTE resolvar till en faktisk fil. Fångar samma
 * klass av bugg som worklist-500 (PR #98) — där ccoMailIngestion/ bröts ut
 * till en undermapp men en relativ require behöll fel prefix. Sådana fel
 * syns bara vid runtime (ofta i lazy requires inne i funktioner), inte vid
 * boot, och maskeras av demo-fixtures.
 *
 * Parsar källtext (kör ingen kod) så även lazy requires fångas. Hoppar över
 * dynamiska sökvägar (require(variabel), template-literals) och icke-relativa
 * specifiers (node-builtins + node_modules).
 *
 * Användning:
 *   node scripts/check-require-paths.js            # 0 om allt resolvar, 1 annars
 *   node scripts/check-require-paths.js --json      # maskinläsbart
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['src', 'bin', 'scripts'];
const EXTRA_FILES = ['server.js'];
const FILE_EXT = /\.(c|m)?js$/;
// Resolutions-ordning enligt Node CommonJS.
const RESOLVE_SUFFIXES = ['', '.js', '.cjs', '.mjs', '.json', '.node'];
const INDEX_SUFFIXES = ['index.js', 'index.cjs', 'index.mjs', 'index.json'];

const JSON_OUT = process.argv.includes('--json');

function walk(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (FILE_EXT.test(entry.name)) acc.push(full);
  }
  return acc;
}

function collectFiles() {
  const files = [];
  for (const root of SCAN_ROOTS) {
    const abs = path.join(ROOT, root);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  for (const rel of EXTRA_FILES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) files.push(abs);
  }
  return files;
}

// Matchar relativa require/import-specifiers (enkla string-literaler, ej
// template/variabel). Self-scan-not: regexen nedan skrivs utan att innehålla
// en bokstavlig require-anrops-text i kommentaren (annars matchar scannern
// sin egen källa).
const REQUIRE_RE = /\brequire\(\s*(['"])(\.[^'"]*)\1\s*\)/g;
const IMPORT_RE = /\bfrom\s+(['"])(\.[^'"]*)\1/g;

function resolvesTo(fromFile, specifier) {
  const baseDir = path.dirname(fromFile);
  const target = path.resolve(baseDir, specifier);
  // 1) Exakt fil med suffix-varianter
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = suffix && !target.endsWith(suffix) ? target + suffix : target;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  }
  // 2) Katalog med index.*
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    for (const idx of INDEX_SUFFIXES) {
      if (fs.existsSync(path.join(target, idx))) return true;
    }
    // package.json med "main"
    const pkg = path.join(target, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const main = JSON.parse(fs.readFileSync(pkg, 'utf8')).main || 'index.js';
        if (fs.existsSync(path.join(target, main))) return true;
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function scanFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const broken = [];
  for (const re of [REQUIRE_RE, IMPORT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const specifier = m[2];
      if (!resolvesTo(file, specifier)) {
        broken.push({
          file: path.relative(ROOT, file),
          line: lineOf(content, m.index),
          specifier,
        });
      }
    }
  }
  return broken;
}

function main() {
  const files = collectFiles();
  const broken = [];
  for (const file of files) broken.push(...scanFile(file));

  if (JSON_OUT) {
    console.log(JSON.stringify({ scanned: files.length, broken }, null, 2));
  } else if (broken.length === 0) {
    console.log(
      `[check-require-paths] OK — ${files.length} filer skannade, inga trasiga relativa require/import.`
    );
  } else {
    console.error(
      `[check-require-paths] ${broken.length} TRASIGA require/import-sökväg(ar) (${files.length} filer skannade):\n`
    );
    for (const b of broken) {
      console.error(`  ${b.file}:${b.line}  →  '${b.specifier}'`);
    }
  }
  process.exit(broken.length === 0 ? 0 : 1);
}

main();
