#!/usr/bin/env node
/**
 * U-kolumn verify — alla poster i patient-document-u-pass-registry.json.
 * Batch 1: mail (C27–C30) + patientinfo (A12–A14)
 * Batch 2: journal MQ (B17–B21), staff (B23/B25/B26), auto/info (C32/C34/C35/C36)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  WORD_DIR,
  resolveWordFile,
  loadBundleEntry,
  readJson,
} = require('./patient-document-word-lib');

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

function repoExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

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

function addSharepointHits(item, hits) {
  if (!item.sharepoint?.length) return;
  for (const sp of item.sharepoint) {
    hits.push({ kind: 'MS_OK', detail: `${sp.relative}/${sp.name}` });
  }
}

function bundleHasMeridiqText(entry, apiIds = []) {
  if (!entry) return false;
  const content = entry.content || {};
  if (content.letterText?.trim()) return true;
  if (entry.meridiq?.letterText?.trim()) return true;
  if (entry.meridiq?.swe?.letterText?.trim() || entry.meridiq?.eng?.letterText?.trim()) return true;
  if (entry.meridiq?.questions?.length) return true;
  for (const id of apiIds) {
    if (entry.meridiq?.apiId === id || entry.meridiq?.questionaryApiId === id) return true;
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

function checkMeridiqSchema(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const schemaCatalog = readJson('migration/meridiq/journal-schema-catalog.json');
  const questionaryCatalog = readJson('migration/meridiq/questionary-catalog.json');
  const schema = schemaCatalog.schemas.find((s) => s.schemaId === item.schemaId);
  const form = questionaryCatalog.forms.find((f) => f.apiId === item.meridiqApiId);
  const hits = [];

  if (schema) hits.push({ kind: 'SCHEMA', detail: `${item.schemaId} (${schema.fieldCount} fält)` });
  if (form)
    hits.push({
      kind: 'MQ',
      detail: `Meridiq ${item.meridiqApiId} (${form.questionCount} frågor)`,
    });
  if (entry?.contentStatus === 'FULL') hits.push({ kind: 'BUNDLE', detail: 'bundle FULL' });
  if (bundleHasMeridiqText(entry, [item.meridiqApiId])) {
    hits.push({ kind: 'BUNDLE_MQ', detail: 'bundle↔MQ' });
  }

  const ok =
    Boolean(schema) &&
    Boolean(form) &&
    entry?.contentStatus === 'FULL' &&
    hits.some((h) => h.kind === 'MQ');

  return {
    ok,
    status: ok ? 'MQ_SCHEMA_FACIT' : 'MISSING',
    hits,
    note: item.uNote || 'Meridiq-driven journal — ingen Word/PDF underlag krävs',
  };
}

function checkBundleFull(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const hits = [];
  if (entry?.contentStatus === 'FULL') hits.push({ kind: 'BUNDLE', detail: 'contentStatus FULL' });

  for (const rel of item.repoPaths || []) {
    if (repoExists(rel)) hits.push({ kind: 'REPO', detail: rel });
  }

  if (item.journalTemplateId) {
    const templates = readJson('migration/journal-text-templates.json').templates || [];
    const tpl = templates.find((t) => t.id === item.journalTemplateId);
    if (tpl?.text?.trim()) {
      hits.push({ kind: 'JOURNAL_TEMPLATE', detail: item.journalTemplateId });
    }
  }

  if (item.requireBundleFields?.length && entry?.content) {
    const allPresent = item.requireBundleFields.every((key) => {
      const v = entry.content[key];
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === 'object') return Object.keys(v).length > 0;
      return Boolean(v);
    });
    if (allPresent)
      hits.push({ kind: 'BUNDLE_FIELDS', detail: item.requireBundleFields.join('+') });
  }

  addSharepointHits(item, hits);

  const repoOk =
    !item.repoPaths?.length || hits.some((h) => h.kind === 'REPO' || h.kind === 'JOURNAL_TEMPLATE');
  const fieldsOk =
    !item.requireBundleFields?.length || hits.some((h) => h.kind === 'BUNDLE_FIELDS');

  const ok =
    entry?.contentStatus === 'FULL' && hits.some((h) => h.kind === 'BUNDLE') && repoOk && fieldsOk;

  return { ok, status: ok ? 'BUNDLE_FACIT' : 'MISSING', hits, note: item.uNote || null };
}

function checkCcoNative(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const hits = [];
  if (entry?.contentStatus === 'FULL') hits.push({ kind: 'BUNDLE', detail: 'contentStatus FULL' });
  for (const rel of item.repoPaths || []) {
    if (repoExists(rel)) hits.push({ kind: 'REPO', detail: rel });
  }
  if (entry?.content?.note) hits.push({ kind: 'NATIVE', detail: 'CCO-native (ingen Word-mall)' });
  if (entry?.content?.operatorEmailSample?.text) {
    hits.push({ kind: 'SAMPLE', detail: 'operatorEmailSample' });
  }
  if (entry?.content?.reviewStages?.length) {
    hits.push({ kind: 'TAXONOMY', detail: `${entry.content.reviewStages.length} foto-steg` });
  }

  const ok = entry?.contentStatus === 'FULL' && hits.length >= 2;
  return {
    ok,
    status: ok ? 'CCO_NATIVE' : 'MISSING',
    hits,
    note: item.uNote || 'By design — ingen Word/PDF underlag',
  };
}

function checkLegalRepo(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const localPath = findLocalFile(item);
  const hits = [];

  if (item.legalRepoPath && repoExists(item.legalRepoPath)) {
    hits.push({ kind: 'LEGAL_REPO', detail: item.legalRepoPath });
  }
  if (localPath) hits.push({ kind: 'LOCAL', detail: path.basename(localPath) });
  addSharepointHits(item, hits);
  if (entry?.content?.text?.trim()) hits.push({ kind: 'BUNDLE', detail: 'PUB markdown i bundle' });

  const ok =
    hits.some((h) => h.kind === 'LEGAL_REPO') &&
    (hits.some((h) => h.kind === 'LOCAL' || h.kind === 'MS_OK') || item.allowMsOnly);

  return { ok, status: ok ? 'LEGAL_REPO_FACIT' : 'MISSING', hits, note: item.uNote || null };
}

function checkProcessFacit(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const hits = [];
  if (entry?.contentStatus === 'FULL') hits.push({ kind: 'BUNDLE', detail: 'contentStatus FULL' });
  for (const rel of item.repoPaths || []) {
    if (repoExists(rel)) hits.push({ kind: 'REPO', detail: rel });
  }
  if (entry?.content?.methods?.length) {
    hits.push({ kind: 'PROCESS', detail: `${entry.content.methods.length} ID-metoder` });
  }

  const ok =
    entry?.contentStatus === 'FULL' &&
    hits.some((h) => h.kind === 'REPO') &&
    hits.some((h) => h.kind === 'PROCESS' || h.kind === 'BUNDLE');

  return { ok, status: ok ? 'PROCESS_FACIT' : 'MISSING', hits, note: item.uNote || null };
}

function checkItem(item) {
  const mode = item.uMode || 'default';
  if (mode === 'meridiq_schema') return checkMeridiqSchema(item);
  if (mode === 'bundle_full') return checkBundleFull(item);
  if (mode === 'cco_native') return checkCcoNative(item);
  if (mode === 'legal_repo') return checkLegalRepo(item);
  if (mode === 'process_facit') return checkProcessFacit(item);

  const entry = item.bundleRegistryId ? loadBundleEntry(item.bundleRegistryId) : null;
  const localPath = findLocalFile(item);
  const hits = [];

  if (localPath) hits.push({ kind: 'LOCAL', detail: path.basename(localPath) });
  addSharepointHits(item, hits);
  if (item.meridiqApiId && bundleHasMeridiqText(entry, [item.meridiqApiId])) {
    hits.push({ kind: 'MQ', detail: `Meridiq ${item.meridiqApiId}` });
  }
  if (item.meridiqApiIds?.length && bundleHasMeridiqText(entry, item.meridiqApiIds)) {
    hits.push({ kind: 'MQ', detail: `Meridiq ${item.meridiqApiIds.join('+')}` });
  }
  if (item.ccoTemplateId && bundleHasCcoTemplate(entry, item.ccoTemplateId)) {
    hits.push({ kind: 'CCO_TEMPLATE', detail: item.ccoTemplateId });
  }
  if (mode === 'meridiq_mq_only' && hits.some((h) => h.kind === 'MQ')) {
    return { ok: true, status: 'MQ_FACIT', hits, note: item.uNote || null };
  }
  if (mode === 'cco_template' && hits.some((h) => h.kind === 'CCO_TEMPLATE')) {
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
    if (item.uPassRequired === false) continue;
    const result = checkItem(item);
    for (const registryId of item.registryIds || []) {
      checks.push({
        registryId,
        id: item.id,
        label: item.label,
        batch: item.batch || '1',
        ...result,
      });
    }
  }

  const ok = checks.filter((c) => c.ok);
  const failed = checks.filter((c) => !c.ok);
  const stamp = new Date().toISOString().slice(0, 10);
  const summary = {
    generatedAt: new Date().toISOString(),
    scope: REGISTRY.scope,
    wordDir: WORD_DIR,
    ok: ok.length,
    failed: failed.length,
    batch1: checks.filter((c) => c.batch === '1').length,
    batch2: checks.filter((c) => c.batch === '2').length,
    checks,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `U-PASS-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `U-PASS-${stamp}.md`);
  const legacyJsonPath = path.join(OUT_DIR, `U-PASS-MAIL-PATIENTINFO-${stamp}.json`);
  const legacyMdPath = path.join(OUT_DIR, `U-PASS-MAIL-PATIENTINFO-${stamp}.md`);

  const jsonBody = `${JSON.stringify(summary, null, 2)}\n`;
  fs.writeFileSync(jsonPath, jsonBody, 'utf8');
  fs.writeFileSync(legacyJsonPath, jsonBody, 'utf8');

  const md = `# U-pass · ${stamp}

**Genererad:** ${summary.generatedAt}  
**Scope:** ${summary.scope}  
**Word-dir:** \`${WORD_DIR}\`

| OK | FAIL | Batch 1 | Batch 2 |
|----|-----:|--------:|--------:|
| ${ok.length} | ${failed.length} | ${summary.batch1} | ${summary.batch2} |

| registryId | batch | status | källor |
|------------|------:|--------|--------|
${checks.map((c) => `| \`${c.registryId}\` | ${c.batch} | ${c.ok ? c.status : 'FAIL'} | ${c.hits.map((h) => h.detail).join(' · ') || '—'} |`).join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(legacyMdPath, md, 'utf8');

  console.log(`\n=== verify:patient-doc-u-pass ===\n`);
  for (const c of checks) {
    const src = c.hits.map((h) => `${h.kind}:${h.detail}`).join(' | ') || 'saknas';
    console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.registryId} — ${c.status} — ${src}`);
  }
  console.log(
    `\nU-pass: ${ok.length}/${checks.length} OK (batch1: ${summary.batch1}, batch2: ${summary.batch2})`
  );
  console.log(`→ ${mdPath}\n`);

  if (failed.length) process.exit(1);
}

main();
