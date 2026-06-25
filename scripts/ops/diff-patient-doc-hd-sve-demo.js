#!/usr/bin/env node
/**
 * T-kolumn — SV HD demo vs Meridiq 16414 (label parity).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  readJson,
  loadMeridiqForm,
  compareDemoToMeridiq,
  resolveWordFile,
  extractDocxText,
  wordKeywordCoverage,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const DEMO = path.join(ROOT, 'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html');

function main() {
  const form = loadMeridiqForm(16414);
  const demoHtml = fs.readFileSync(DEMO, 'utf8');
  const parity = compareDemoToMeridiq(demoHtml, form);

  const wordPath = resolveWordFile({
    localNames: [
      '1.-Hälsodeklaration-TP_-PRP_-Microneedling-PRF.docx',
      '1. Hälsodeklaration TP, PRP, Microneedling PRF.docx',
    ],
    glob: 'h[aä]lsodeklaration.*\\.docx$',
  });
  const wordText = wordPath ? extractDocxText(wordPath) : '';
  const wordCov = wordKeywordCoverage(
    wordText,
    form.questions.map((q) => ({ id: q.id, label: q.label }))
  );

  const report = {
    generatedAt: new Date().toISOString(),
    meridiqApiId: 16414,
    registryId: 'haelso_tp_sve',
    demoMeridiqParity: parity,
    wordPath: wordPath || null,
    wordKeywordHits: wordPath ? `${wordCov.hits}/${wordCov.total}` : 'N/A',
    status:
      parity.status === 'PARITY_OK'
        ? wordPath && wordCov.hits >= wordCov.total * 0.8
          ? 'PARITY_OK'
          : wordPath
            ? 'WORD_REVIEW'
            : 'PARITY_OK_NO_WORD'
        : 'NEEDS_REVIEW',
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `HD-16414-demo-parity-${stamp}.json`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    `✓ ${report.status} — demo ${parity.demoQuestionCount}/${parity.meridiqQuestionCount} · Word ${report.wordKeywordHits}`
  );
  console.log(`  → ${jsonPath}`);
  if (report.status === 'NEEDS_REVIEW') process.exit(1);
}

main();
