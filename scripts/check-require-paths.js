#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ALLOWLIST = path.join(ROOT, 'config', 'require-path-allowlist.json');
const SCAN_ROOTS = ['src', 'bin', 'scripts'];
const EXTRA_FILES = ['server.js'];
const FILE_EXT = /\.(c|m)?js$/;
const RESOLVE_SUFFIXES = ['', '.js', '.cjs', '.mjs', '.json', '.node'];
const INDEX_SUFFIXES = ['index.js', 'index.cjs', 'index.mjs', 'index.json'];

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has('--json');
const STRICT = args.has('--strict');

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

function loadAllowlist() {
  if (STRICT || !fs.existsSync(DEFAULT_ALLOWLIST)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(DEFAULT_ALLOWLIST, 'utf8'));
  return new Set(Array.isArray(parsed.allow) ? parsed.allow : []);
}

const REQUIRE_RE = /\brequire\(\s*(['"])(\.[^'"]*)\1\s*\)/g;
const IMPORT_RE = /\bfrom\s+(['"])(\.[^'"]*)\1/g;

function resolvesTo(fromFile, specifier) {
  const target = path.resolve(path.dirname(fromFile), specifier);
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = suffix && !target.endsWith(suffix) ? target + suffix : target;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    for (const idx of INDEX_SUFFIXES) {
      if (fs.existsSync(path.join(target, idx))) return true;
    }
    const pkg = path.join(target, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        const main = JSON.parse(fs.readFileSync(pkg, 'utf8')).main || 'index.js';
        if (fs.existsSync(path.join(target, main))) return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function blankPreserveNewlines(value) {
  return String(value).replace(/[^\n]/g, ' ');
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, blankPreserveNewlines)
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (match, prefix) => `${prefix}${blankPreserveNewlines(match.slice(prefix.length))}`
    );
}

function scanFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const content = stripComments(raw);
  const broken = [];
  for (const re of [REQUIRE_RE, IMPORT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const specifier = match[2];
      if (!resolvesTo(file, specifier)) {
        broken.push({
          file: path.relative(ROOT, file),
          line: lineOf(content, match.index),
          specifier,
        });
      }
    }
  }
  return broken;
}

function main() {
  const allowlist = loadAllowlist();
  const files = collectFiles();
  const broken = files.flatMap(scanFile);
  const allowed = broken.filter((item) => allowlist.has(item.specifier));
  const unexpected = broken.filter((item) => !allowlist.has(item.specifier));
  const staleAllowlist = [...allowlist].filter(
    (specifier) => !broken.some((item) => item.specifier === specifier)
  );

  if (JSON_OUT) {
    console.log(
      JSON.stringify({ scanned: files.length, unexpected, allowed, staleAllowlist }, null, 2)
    );
  } else {
    console.log(`[check-require-paths] scanned=${files.length}`);
    console.log(`[check-require-paths] allowedKnownMissing=${allowed.length}`);
    if (staleAllowlist.length) {
      console.log(`[check-require-paths] staleAllowlist=${staleAllowlist.length}`);
      for (const specifier of staleAllowlist) console.log(`  stale: ${specifier}`);
    }
    if (unexpected.length) {
      console.error(`[check-require-paths] unexpected broken require/import=${unexpected.length}`);
      for (const item of unexpected) {
        console.error(`  ${item.file}:${item.line} -> ${item.specifier}`);
      }
    } else {
      console.log('[check-require-paths] OK: no unexpected broken require/import paths.');
    }
  }

  process.exit(unexpected.length === 0 ? 0 : 1);
}

main();
