#!/usr/bin/env node
/**
 * T-kolumn — Friskförsäkran: Word vs Meridiq 16413 vs demo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  loadMeridiqForm,
  compareDemoToMeridiq,
  resolveWordFile,
  extractDocxText,
  wordKeywordCoverage,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const DEMO = path.join(ROOT, 'public/major-arcana-preview/steg8-friskforsakran-final.html');

function main() {
  const form = loadMeridiqForm(16413);
  const demoHtml = fs.readFileSync(DEMO, 'utf8');
  const parity = compareDemoToMeridiq(demoHtml, form);

  const wordPath = resolveWordFile({
    localNames: ['5-friskforsakran-tp-2025.docx', '5. Friskförsäkran TP 2025.docx'],
    glob: 'friskf[oö]rs[aä]kran.*\\.docx$',
  });
  const wordText = wordPath ? extractDocxText(wordPath) : '';
  const wordCov = wordKeywordCoverage(
    wordText,
    form.questions.map((q) => ({ id: q.id, label: q.label }))
  );

  const report = {
    generatedAt: new Date().toISOString(),
    meridiqApiId: 16413,
    registryId: 'friskfoers_tp',
    demoMeridiqParity: parity,
    wordPath: wordPath || null,
    wordKeywordHits: wordPath ? `${wordCov.hits}/${wordCov.total}` : 'N/A',
    status:
      parity.status === 'PARITY_OK'
        ? wordPath && wordCov.hits >= Math.floor(wordCov.total * 0.6)
          ? 'PARITY_OK'
          : wordPath
            ? 'WORD_REVIEW'
            : 'PARITY_OK_NO_WORD'
        : 'NEEDS_REVIEW',
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `FC-16413-diff-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `FC-16413-diff-${stamp}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = `# FC-16413 diff · Friskförsäkran TP

**Generated:** ${report.generatedAt}  
**Status:** \`${report.status}\`  
**Demo↔Meridiq:** ${parity.demoQuestionCount}/${parity.meridiqQuestionCount} · ${parity.status}  
**Word keyword:** ${report.wordKeywordHits}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`✓ ${report.status} — skrev ${mdPath}`);
  if (report.status === 'NEEDS_REVIEW') process.exit(1);
}

main();
