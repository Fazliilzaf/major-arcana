#!/usr/bin/env node
/**
 * E6/T batch 2 — ordination_tp + auto_instruktion_formular.
 * Ordination: stub demo↔bundle + klinisk Word↔demo.
 * Auto-instruktion: demo↔bundle (Word-underbilaga är DPA, ej HD/FC-instruktion).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  ORDINATION_STUB_ANCHORS,
  ORDINATION_CLINICAL_ANCHORS,
  AUTO_INSTRUKTION_ANCHORS,
  extractDocxText,
  stripHtml,
  loadBundleEntry,
  bundleLegalText,
  compareDemoBundleOnly,
  compareWordDemoClinical,
  isDpaUnderbilagaWord,
  resolveOrdinationWord,
  resolveUnderbilagaWord,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

function diffOrdination() {
  const entry = loadBundleEntry('ordination_tp');
  const demoHtml = fs.readFileSync(
    path.join(PREVIEW, 'steg8-ordination-tp-final-demo.html'),
    'utf8'
  );
  const demoText = stripHtml(demoHtml);
  const bundleText = bundleLegalText(entry);
  const wordPath = resolveOrdinationWord();
  const wordText = wordPath ? extractDocxText(wordPath) : '';

  const stub = compareDemoBundleOnly({
    bundleText,
    demoText,
    phrases: ORDINATION_STUB_ANCHORS,
  });
  const clinical = wordText
    ? compareWordDemoClinical({ wordText, demoText, phrases: ORDINATION_CLINICAL_ANCHORS })
    : { ok: false, demoHits: 'N/A', wordHits: 'N/A', missingInDemo: [], missingInWord: [] };

  const drift = [];
  if (/xylocain/i.test(wordText) && /carbocain/i.test(demoText)) {
    drift.push(
      'WORD_DEMO_DRIFT: Word=Xylocain, demo=Carbocain (klinikuppdatering ej synkad i Word)'
    );
  }

  let status = 'NEEDS_REVIEW';
  if (stub.status === 'E6_OK' && clinical.ok) status = 'E6_OK';
  else if (stub.demoBundleOk && clinical.ok) status = 'E6_PARTIAL';
  else if (stub.demoBundleOk) status = 'DEMO_BUNDLE_OK';

  return {
    registryId: 'ordination_tp',
    kind: 'ordination',
    demoHtml: 'steg8-ordination-tp-final-demo.html',
    wordPath,
    blockers: entry.blockers || [],
    stubTriad: stub,
    clinicalWordDemo: clinical,
    drift,
    status,
    bundleHits: stub.bundleHits,
    demoHits: stub.demoHits,
    wordHits: clinical.wordHits,
  };
}

function diffAutoInstruktion() {
  const entry = loadBundleEntry('auto_instruktion_formular');
  const demoHtml = fs.readFileSync(
    path.join(PREVIEW, 'steg3-auto-instruktion-formular-final-demo.html'),
    'utf8'
  );
  const demoText = stripHtml(demoHtml);
  const bundleText = bundleLegalText(entry);
  const wordPath = resolveUnderbilagaWord();
  const wordText = wordPath ? extractDocxText(wordPath) : '';
  const wordWrongScope = isDpaUnderbilagaWord(wordText);

  const triad = compareDemoBundleOnly({
    bundleText,
    demoText,
    phrases: AUTO_INSTRUKTION_ANCHORS,
  });

  let status = triad.status;
  const notes = [];
  if (wordWrongScope) {
    notes.push(
      'WORD_WRONG_SCOPE: underbilaga-1-instruktion.docx = Personuppgiftsbiträdesavtal (Juridik-GDPR), ej HD/FC-kundinstruktion'
    );
    if (triad.demoBundleOk) status = 'E6_OK';
  }

  return {
    registryId: 'auto_instruktion_formular',
    kind: 'auto_instruktion',
    demoHtml: 'steg3-auto-instruktion-formular-final-demo.html',
    wordPath,
    wordWrongScope,
    blockers: entry.blockers || [],
    notes,
    ...triad,
  };
}

function main() {
  const reports = [diffOrdination(), diffAutoInstruktion()];
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `E6-BATCH2-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `E6-BATCH2-${stamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    e6Ok: reports.filter((r) => r.status === 'E6_OK').length,
    e6Partial: reports.filter((r) => r.status === 'E6_PARTIAL').length,
    demoBundleOk: reports.filter((r) =>
      ['E6_OK', 'E6_PARTIAL', 'DEMO_BUNDLE_OK'].includes(r.status)
    ).length,
    needsReview: reports.filter((r) => r.status === 'NEEDS_REVIEW').length,
    reports,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# E6 legal diff · batch 2 · ${stamp}

**Genererad:** ${summary.generatedAt}

| Status | Antal |
|--------|------:|
| E6_OK | ${summary.e6Ok} |
| E6_PARTIAL | ${summary.e6Partial} |
| DEMO_BUNDLE_OK | ${summary.demoBundleOk - summary.e6Ok - summary.e6Partial} |
| NEEDS_REVIEW | ${summary.needsReview} |

## Per registryId

| registryId | status | demo/bundle | word | anteckning |
|------------|--------|-------------|------|------------|
${reports
  .map((r) => {
    const note = [...(r.drift || []), ...(r.notes || [])].join('; ') || '—';
    return `| \`${r.registryId}\` | ${r.status} | ${r.demoHits || r.stubTriad?.demoHits || '—'} | ${r.wordHits || 'N/A'} | ${note} |`;
  })
  .join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(
    `E6 batch 2: E6_OK=${summary.e6Ok} E6_PARTIAL=${summary.e6Partial} NEEDS_REVIEW=${summary.needsReview}`
  );
  console.log(`→ ${mdPath}`);
  if (summary.needsReview > 0) process.exit(1);
}

main();
