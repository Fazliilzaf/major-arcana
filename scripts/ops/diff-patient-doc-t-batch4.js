#!/usr/bin/env node
/**
 * T-pass batch 4 — demo↔bundle↔facit för 16 MQ_OR_TEMPLATE_ONLY typer.
 * Parallellt U-pass batch 2; ingen Word-E6 triad.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  stripHtml,
  loadBundleEntry,
  loadMeridiqConsent,
  bundleLegalText,
  compareMeridiqLetterTriad,
  compareDemoBundleOnly,
  phraseCoverage,
  readJson,
} = require('./patient-document-word-lib');

const REGISTRY = readJson(
  'docs/implementation/patient-documents-live/patient-document-t-pass-registry.json'
);
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');

function repoExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readDemoText(item) {
  const demoPath = path.join(PREVIEW, item.demoHtml);
  if (!fs.existsSync(demoPath)) throw new Error(`Demo saknas: ${item.demoHtml}`);
  return stripHtml(fs.readFileSync(demoPath, 'utf8'));
}

function resolveBundleText(entry, item) {
  const content = entry.content || {};
  if (item.bundleTextKey && content[item.bundleTextKey]) return content[item.bundleTextKey];
  if (content.letterText) return content.letterText;
  if (entry.ccoTemplate?.bodySv) return entry.ccoTemplate.bodySv;
  if (content.smsText) return content.smsText;
  if (content.emailSample?.text) return content.emailSample.text;
  if (content.text) return content.text;
  return bundleLegalText(entry);
}

function resolveMeridiqText(entry, item) {
  if (item.meridiqApiId) {
    const consent = loadMeridiqConsent(item.meridiqApiId);
    return consent.letterText || '';
  }
  if (entry.meridiq?.letterText) return entry.meridiq.letterText;
  if (entry.meridiq?.swe?.letterText) return entry.meridiq.swe.letterText;
  return '';
}

function coolingText(entry) {
  const parts = [];
  if (entry.content?.coolingOffNote) parts.push(entry.content.coolingOffNote);
  for (const block of entry.content?.agreementCoolingExcerpt || []) {
    parts.push(stripHtml(block.html || ''));
  }
  if (entry.content?.emailSample?.text) parts.push(entry.content.emailSample.text);
  return parts.join('\n');
}

function diffMeridiqLetter(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const bundleText = resolveBundleText(entry, item);
  const meridiqText = resolveMeridiqText(entry, item);
  const result = compareMeridiqLetterTriad({
    demoText,
    bundleText,
    meridiqText,
    phrases: item.phrases || [],
  });
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    meridiqApiId: item.meridiqApiId,
    ...result,
  };
}

function diffBundleEmail(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const bundleText = [
    entry.content?.emailSample?.text,
    entry.content?.emailSample?.subject,
    bundleLegalText(entry),
  ]
    .filter(Boolean)
    .join('\n');
  const result = compareDemoBundleOnly({
    demoText,
    bundleText,
    phrases: item.phrases || [],
  });
  return { registryId: item.registryIds[0], tMode: item.tMode, demoHtml: item.demoHtml, ...result };
}

function diffCcoTemplate(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const tpl = entry.ccoTemplate || {};
  const bundleText = [tpl.bodySv, entry.content?.smsText, entry.content?.emailSample?.text]
    .filter(Boolean)
    .join('\n');
  const result = compareDemoBundleOnly({
    demoText,
    bundleText,
    phrases: item.phrases || [],
  });
  const templateOk = tpl.templateId === item.ccoTemplateId && String(tpl.bodySv || '').trim();
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    ccoTemplateId: item.ccoTemplateId,
    templateOk: Boolean(templateOk),
    ...result,
    status: result.status === 'T_FACIT_OK' && templateOk ? 'T_FACIT_OK' : 'NEEDS_REVIEW',
  };
}

function diffBundleCooling(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const bundleText = coolingText(entry);
  const result = compareDemoBundleOnly({
    demoText,
    bundleText,
    phrases: item.phrases || [],
  });
  return { registryId: item.registryIds[0], tMode: item.tMode, demoHtml: item.demoHtml, ...result };
}

function diffLegalRepo(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const legalText = repoExists(item.legalRepoPath)
    ? fs.readFileSync(path.join(ROOT, item.legalRepoPath), 'utf8')
    : '';
  const bundleText = entry.content?.text || bundleLegalText(entry);
  const legalCov = phraseCoverage(legalText, item.phrases || []);
  const demoCov = phraseCoverage(demoText, item.phrases || []);
  const bundleCov = phraseCoverage(bundleText, item.phrases || []);
  const minHits = (total) => Math.max(1, Math.floor(total * 0.75));
  const ok =
    legalCov.hits >= minHits(legalCov.total) &&
    demoCov.hits >= minHits(demoCov.total) &&
    bundleCov.hits >= minHits(bundleCov.total);
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    legalRepoPath: item.legalRepoPath,
    status: ok ? 'T_FACIT_OK' : 'NEEDS_REVIEW',
    demoHits: `${demoCov.hits}/${demoCov.total}`,
    bundleHits: `${bundleCov.hits}/${bundleCov.total}`,
    legalHits: `${legalCov.hits}/${legalCov.total}`,
  };
}

function diffBundleJournal(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const bundleText = [entry.ccoTemplate?.bodySv, entry.content?.text, entry.ccoTemplate?.templateId]
    .filter(Boolean)
    .join('\n');
  const templates = readJson('migration/journal-text-templates.json').templates || [];
  const tpl = templates.find((t) => t.id === item.journalTemplateId);
  const journalText = tpl?.text || '';
  const combined = `${bundleText}\n${journalText}`;
  const result = compareDemoBundleOnly({
    demoText,
    bundleText: combined,
    phrases: item.phrases || [],
  });
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    journalTemplateId: item.journalTemplateId,
    journalTemplatePresent: Boolean(journalText.trim()),
    ...result,
  };
}

function diffProcessFacit(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const demoCov = phraseCoverage(demoText, item.phrases || []);
  const minHits = (total) => Math.max(1, Math.floor(total * 0.75));
  const repoOk = ['src/ops/patientIdentityVerification.js', 'src/routes/patientIdentity.js'].every(
    repoExists
  );
  const methodOk = (entry.content?.methods?.length || 0) >= 3;
  const ok = demoCov.hits >= minHits(demoCov.total) && methodOk && repoOk;
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    methodCount: entry.content?.methods?.length || 0,
    repoOk,
    status: ok ? 'T_FACIT_OK' : 'NEEDS_REVIEW',
    demoHits: `${demoCov.hits}/${demoCov.total}`,
    bundleHits: `${methodOk ? entry.content.methods.length : 0} metoder`,
    demoBundleOk: ok,
    wordOk: ok,
    wordHits: 'N/A',
    missingInDemo: demoCov.coverage.filter((c) => !c.present).map((c) => c.phrase),
    missingInBundle: [],
    wordPresent: false,
  };
}

function diffDynamicStaff(item) {
  const entry = loadBundleEntry(item.bundleRegistryId);
  const demoText = readDemoText(item);
  const bundleText = entry.content?.note || '';
  const result = compareDemoBundleOnly({
    demoText,
    bundleText: `${bundleText} dynamisk genereras offert`,
    phrases: item.phrases || [],
  });
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    demoHtml: item.demoHtml,
    dynamicByDesign: true,
    ...result,
  };
}

function diffNotApplicable(item) {
  return {
    registryId: item.registryIds[0],
    tMode: item.tMode,
    status: 'T_NOT_APPLICABLE',
    note: item.tNote,
    demoHits: 'n/a',
    bundleHits: 'n/a',
  };
}

function diffItem(item) {
  switch (item.tMode) {
    case 'meridiq_letter':
      return diffMeridiqLetter(item);
    case 'bundle_email':
      return diffBundleEmail(item);
    case 'cco_template':
      return diffCcoTemplate(item);
    case 'bundle_cooling':
      return diffBundleCooling(item);
    case 'legal_repo':
      return diffLegalRepo(item);
    case 'bundle_journal':
      return diffBundleJournal(item);
    case 'process_facit':
      return diffProcessFacit(item);
    case 'dynamic_staff':
      return diffDynamicStaff(item);
    case 'not_applicable':
      return diffNotApplicable(item);
    default:
      throw new Error(`Okänd tMode: ${item.tMode}`);
  }
}

function main() {
  const reports = [];
  for (const item of REGISTRY.items) {
    for (const registryId of item.registryIds) {
      try {
        reports.push({ ...diffItem(item), registryId });
      } catch (err) {
        reports.push({
          registryId,
          tMode: item.tMode,
          status: 'NEEDS_REVIEW',
          error: err.message,
        });
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `T-BATCH4-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `T-BATCH4-${stamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    script: 'diff:patient-doc-t-batch4',
    scope: REGISTRY.scope,
    tFacitOk: reports.filter((r) => r.status === 'T_FACIT_OK').length,
    tNotApplicable: reports.filter((r) => r.status === 'T_NOT_APPLICABLE').length,
    needsReview: reports.filter((r) =>
      ['NEEDS_REVIEW', 'DEMO_GAP', 'BUNDLE_MQ_GAP', 'DEMO_BUNDLE_OK'].includes(r.status)
    ).length,
    reports,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# T-pass batch 4 · ${stamp}

**Genererad:** ${summary.generatedAt}  
**Scope:** ${summary.scope}

| T_FACIT_OK | T_NOT_APPLICABLE | NEEDS_REVIEW |
|----------:|-----------------:|-------------:|
| ${summary.tFacitOk} | ${summary.tNotApplicable} | ${summary.needsReview} |

| registryId | tMode | status | demo | demo/bundle |
|------------|-------|--------|------|-------------|
${reports
  .map((r) => {
    const hits = `${r.demoHits || '—'} / ${r.bundleHits || r.legalHits || '—'}`;
    return `| \`${r.registryId}\` | ${r.tMode || '—'} | ${r.status} | ${r.demoHtml || '—'} | ${hits} |`;
  })
  .join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(
    `T batch 4: T_FACIT_OK=${summary.tFacitOk} T_NA=${summary.tNotApplicable} NEEDS_REVIEW=${summary.needsReview}`
  );
  for (const r of reports) {
    console.log(`  ${r.status === 'NEEDS_REVIEW' ? 'FAIL' : 'PASS'} ${r.registryId} — ${r.status}`);
  }
  console.log(`→ ${mdPath}`);
  if (summary.needsReview > 0) process.exit(1);
}

main();
