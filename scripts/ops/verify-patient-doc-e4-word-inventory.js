#!/usr/bin/env node
/**
 * E4 — verifiera Word-underlag i 01-word-original-lokalt (+ offert-zip dir).
 */
'use strict';

const fs = require('fs');
const path = require('path');
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

function expandHome(p) {
  return String(p || '').replace(/^~/, process.env.HOME);
}

function checkItem(item) {
  if (item.localDir) {
    const dir = expandHome(item.localDir);
    if (!fs.existsSync(dir)) return { ok: false, detail: `saknar mapp ${dir}` };
    const docx = [];
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.docx')) docx.push(p);
      }
    };
    walk(dir);
    if (item.id === 'offert_zip' && docx.length < 14) {
      return { ok: false, detail: `${docx.length}/14 docx i ${dir}` };
    }
    return { ok: docx.length > 0, detail: `${docx.length} docx` };
  }
  const wordPath = resolveWordFile(item);
  if (wordPath) return { ok: true, detail: path.basename(wordPath) };
  return { ok: false, detail: 'saknas lokalt' };
}

function main() {
  const checks = [];
  for (const item of REGISTRY.items) {
    if (!item.e4Required) continue;
    const result = checkItem(item);
    checks.push({ id: item.id, label: item.label, required: true, ...result });
  }
  for (const item of REGISTRY.items) {
    if (item.e4Required) continue;
    const result = checkItem(item);
    checks.push({ id: item.id, label: item.label, required: false, ...result });
  }

  const required = checks.filter((c) => c.required);
  const requiredOk = required.filter((c) => c.ok).length;
  const failed = required.filter((c) => !c.ok);

  console.log(`\n=== verify:patient-doc-e4-word (${WORD_DIR}) ===\n`);
  for (const c of checks) {
    const tag = c.required ? 'E4' : 'opt';
    console.log(`${c.ok ? 'PASS' : 'FAIL'} [${tag}] ${c.id} — ${c.detail}`);
  }
  console.log(`\nE4 required: ${requiredOk}/${required.length}\n`);

  if (failed.length) {
    console.log('Saknas (E4):');
    for (const f of failed) {
      console.log(`  - ${f.label} (${f.id})`);
      const item = REGISTRY.items.find((i) => i.id === f.id);
      if (item?.sharepoint) {
        console.log(`    SharePoint: ${item.sharepoint.relative}/${item.sharepoint.name}`);
      }
      if (item?.syncScript) console.log(`    Kör: npm run sync:offert-archive (OFFERT_ZIP_SRC=…)`);
    }
    console.log('');
    process.exit(1);
  }
}

main();
