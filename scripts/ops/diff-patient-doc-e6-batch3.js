#!/usr/bin/env node
/**
 * E6/T batch 3 — foto_samtycke (A15 / ORD-24 patient-doc facit).
 * Scope-samtycke demo ↔ bundle ↔ journey-facit (ingen Word lokalt).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  FOTO_SAMTYCKE_ANCHORS,
  FOTO_FACIT_REL,
  stripHtml,
  loadBundleEntry,
  bundleLegalText,
  compareLegalTriad,
  loadFotoScopeFacitText,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

function diffFotoSamtycke() {
  const entry = loadBundleEntry('foto_samtycke');
  const demoHtml = fs.readFileSync(
    path.join(PREVIEW, 'steg9-foto-samtycke-final-demo.html'),
    'utf8'
  );
  const demoText = stripHtml(demoHtml);
  const bundleText = bundleLegalText(entry);
  const facitText = loadFotoScopeFacitText();
  const triad = compareLegalTriad({
    wordText: facitText,
    bundleText,
    demoText,
    phrases: FOTO_SAMTYCKE_ANCHORS,
  });

  const notes = [
    'SCOPE_FACIT: steg 9 hårlinje/krona — ej full Nordbro publish-mall',
    'ORD-24 backend (document instances) fortfarande PENDING — separat spår',
  ];
  if (!entry.content?.internalText && !entry.content?.publishText) {
    notes.push('Nordbro consent_photo_* body = placeholder i bundle (OK för scope)');
  }

  return {
    registryId: 'foto_samtycke',
    kind: 'foto_samtycke',
    demoHtml: 'steg9-foto-samtycke-final-demo.html',
    facitDoc: FOTO_FACIT_REL,
    blockers: entry.blockers || [],
    notes,
    ...triad,
  };
}

function main() {
  const reports = [diffFotoSamtycke()];
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `E6-BATCH3-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `E6-BATCH3-${stamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    e6Ok: reports.filter((r) => r.status === 'E6_OK').length,
    needsReview: reports.filter((r) => r.status === 'NEEDS_REVIEW').length,
    reports,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# E6 legal diff · batch 3 (foto) · ${stamp}

**Genererad:** ${summary.generatedAt}

| registryId | status | demo | bundle | facit | anteckning |
|------------|--------|------|--------|-------|------------|
${reports
  .map((r) => {
    const note = (r.notes || []).join('; ') || '—';
    return `| \`${r.registryId}\` | ${r.status} | ${r.demoHits} | ${r.bundleHits} | ${r.wordHits} | ${note} |`;
  })
  .join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`E6 batch 3: E6_OK=${summary.e6Ok} NEEDS_REVIEW=${summary.needsReview}`);
  console.log(`→ ${mdPath}`);
  if (summary.needsReview > 0) process.exit(1);
}

main();
