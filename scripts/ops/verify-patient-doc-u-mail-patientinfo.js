#!/usr/bin/env node
/**
 * U-pass — mailmallar (C27–C30) + patientinfo (A12–A14).
 * PASS om lokalt underlag, MS-OK SharePoint (inventory), Meridiq MQ eller CCO template i bundle.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT, WORD_DIR, resolveWordFile, loadBundleEntry } = require('./patient-document-word-lib');

const REGISTRY = JSON.parse(
  fs.readFileSync(
    path.join(
      ROOT,
      'docs/implementation/patient-documents-live/patient-document-u-pass-registry.json'
    ),
    'utf8'
  )
);
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');

function findLocalFile(item) {
  if (item.localNames?.length) {
    const hit = resolveWordFile({ localNames: item.localNames });
    if (hit) return hit;
  }
  if (!item.localGlobs?.length || !fs.existsSync(WORD_DIR)) return null;
  for (const glob of item.localGlobs) {
    const hit = resolveWordFile({ glob });
    if (hit) return hit;
  }
  return null;
}

function bundleHasMeridiqText(entry, apiIds = []) {
  if (!entry) return false;
  const content = entry.content || {};
  if (content.letterText?.trim()) return true;
  if (entry.meridiq?.letterText?.trim()) return true;
  if (entry.meridiq?.swe?.letterText?.trim() || entry.meridiq?.eng?.letterText?.trim()) return true;
  for (const id of apiIds) {
    if (entry.meridiq?.apiId === id) return true;
  }
  return false;
}

function bundleHasCcoTemplate(entry, templateId) {
  if (!entry || !templateId) return false;
  const tpl = entry.ccoTemplate || {};
  if (tpl.templateId === templateId && String(tpl.bodySv || '').trim()) return true;
  const content = entry.content || {};
  if (content.smsText?.trim() || content.emailSample?.text) return true;
  return entry.contentStatus === 'FULL';
}

function checkItem(item) {
  const entry = item.bundleRegistryId ? loadBundleEntry(item.bundleRegistryId) : null;
  const localPath = findLocalFile(item);
  const hits = [];

  if (localPath) hits.push({ kind: 'LOCAL', detail: path.basename(localPath) });
  if (item.sharepoint?.length) {
    for (const sp of item.sharepoint) {
      hits.push({ kind: 'MS_OK', detail: `${sp.relative}/${sp.name}` });
    }
  }
  if (item.meridiqApiId && bundleHasMeridiqText(entry, [item.meridiqApiId])) {
    hits.push({ kind: 'MQ', detail: `Meridiq ${item.meridiqApiId}` });
  }
  if (item.meridiqApiIds?.length && bundleHasMeridiqText(entry, item.meridiqApiIds)) {
    hits.push({ kind: 'MQ', detail: `Meridiq ${item.meridiqApiIds.join('+')}` });
  }
  if (item.ccoTemplateId && bundleHasCcoTemplate(entry, item.ccoTemplateId)) {
    hits.push({ kind: 'CCO_TEMPLATE', detail: item.ccoTemplateId });
  }
  if (item.uMode === 'meridiq_mq_only' && hits.some((h) => h.kind === 'MQ')) {
    return { ok: true, status: 'MQ_FACIT', hits, note: item.uNote || null };
  }
  if (item.uMode === 'cco_template' && hits.some((h) => h.kind === 'CCO_TEMPLATE')) {
    return { ok: true, status: 'CCO_TEMPLATE', hits, note: item.uNote || null };
  }
  if (
    hits.some((h) => h.kind === 'LOCAL' || h.kind === 'MS_OK') &&
    hits.some((h) => h.kind === 'MQ' || h.kind === 'CCO_TEMPLATE' || h.kind === 'MS_OK')
  ) {
    return {
      ok: true,
      status: hits.some((h) => h.kind === 'LOCAL') ? 'LOCAL+FACIT' : 'MS_OK+FACIT',
      hits,
      note: null,
    };
  }
  if (hits.length) {
    return { ok: true, status: hits[0].kind, hits, note: item.uNote || null };
  }
  return { ok: false, status: 'MISSING', hits: [], note: item.uNote || null };
}

function main() {
  const checks = [];
  for (const item of REGISTRY.items) {
    if (!item.uPassRequired) continue;
    const result = checkItem(item);
    for (const registryId of item.registryIds || []) {
      checks.push({
        registryId,
        id: item.id,
        label: item.label,
        ...result,
      });
    }
  }

  const ok = checks.filter((c) => c.ok);
  const failed = checks.filter((c) => !c.ok);
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `U-PASS-MAIL-PATIENTINFO-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `U-PASS-MAIL-PATIENTINFO-${stamp}.md`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), wordDir: WORD_DIR, ok: ok.length, failed: failed.length, checks }, null, 2)}\n`,
    'utf8'
  );

  const md = `# U-pass · mail + patientinfo · ${stamp}

**Genererad:** ${new Date().toISOString()}  
**Word-dir:** \`${WORD_DIR}\`

| OK | FAIL |
|----|-----:|
| ${ok.length} | ${failed.length} |

| registryId | status | källor |
|------------|--------|--------|
${checks.map((c) => `| \`${c.registryId}\` | ${c.ok ? c.status : 'FAIL'} | ${c.hits.map((h) => h.detail).join(' · ') || '—'} |`).join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\n=== verify:patient-doc-u-mail-patientinfo ===\n`);
  for (const c of checks) {
    const src = c.hits.map((h) => `${h.kind}:${h.detail}`).join(' | ') || 'saknas';
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.registryId} — ${c.status} — ${src}`);
  }
  console.log(`\nU-pass: ${ok.length}/${checks.length} OK`);
  console.log(`→ ${mdPath}\n`);

  if (failed.length) process.exit(1);
}

main();
