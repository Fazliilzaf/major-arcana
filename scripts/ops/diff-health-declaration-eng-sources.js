#!/usr/bin/env node
/**
 * T-kolumn diff: Meridiq 14865 vs CCO ENG demo (label parity).
 * source: migration/meridiq/questionary-catalog.json#14865
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const DEMO = path.join(
  ROOT,
  'public/major-arcana-preview/steg3-health-questionnaire-eng-final-demo.html'
);
const FACIT = path.join(ROOT, 'migration/meridiq/steg3-health-declaration-eng-facit.json');

function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!,;:()]/g, '')
    .trim();
}

function extractDemoLabels(html) {
  const labels = [];
  const re =
    /<div class="section-block question-block" data-meridiq-id="(\d+)">[\s\S]*?<strong\s*>([\s\S]*?)<\/strong\s*>/g;
  let m;
  while ((m = re.exec(html))) {
    labels.push({ id: Number(m[1]), label: m[2].replace(/\s+/g, ' ').trim() });
  }
  return labels;
}

function demoHasQuestionId(html, id) {
  return html.includes(`data-meridiq-id="${id}"`);
}

function main() {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'migration/meridiq/questionary-catalog.json'), 'utf8')
  );
  const form = catalog.forms.find((f) => f.apiId === 14865);
  if (!form) throw new Error('Meridiq 14865 saknas');

  const facit = JSON.parse(fs.readFileSync(FACIT, 'utf8'));
  const demoHtml = fs.readFileSync(DEMO, 'utf8');
  const demoBlockCount = (demoHtml.match(/data-meridiq-id="/g) || []).length;

  const mqById = new Map(form.questions.map((q) => [q.id, q.label]));
  const demoById = new Map(extractDemoLabels(demoHtml).map((d) => [d.id, d.label]));
  const facitById = new Map(facit.questions.map((q) => [q.id, q.label]));

  const missingInDemo = [];
  const labelMismatch = [];
  const extraInDemo = [];

  for (const q of form.questions) {
    if (!demoHasQuestionId(demoHtml, q.id)) missingInDemo.push(q.id);
    else if (normalizeLabel(facitById.get(q.id)) !== normalizeLabel(q.label)) {
      labelMismatch.push({
        id: q.id,
        meridiq: q.label,
        facit: facitById.get(q.id),
      });
    }
    const demoLabel = demoById.get(q.id);
    if (demoLabel && normalizeLabel(demoLabel) !== normalizeLabel(q.label)) {
      labelMismatch.push({
        id: q.id,
        meridiq: q.label,
        demo: demoLabel,
        kind: 'demo-label',
      });
    }
  }

  for (const d of extractDemoLabels(demoHtml)) {
    if (!mqById.has(d.id)) extraInDemo.push(d.id);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    meridiqApiId: 14865,
    registryId: 'health_tp_eng',
    meridiqQuestionCount: form.questions.length,
    demoQuestionCount: demoBlockCount,
    facitQuestionCount: facit.questions.length,
    missingInDemo,
    extraInDemo,
    labelMismatch,
    status:
      missingInDemo.length === 0 &&
      extraInDemo.length === 0 &&
      labelMismatch.length === 0 &&
      facit.questions.length === 29 &&
      demoBlockCount === 29
        ? 'PARITY_OK'
        : 'NEEDS_REVIEW',
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `HD-14865-diff-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `HD-14865-diff-${stamp}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = `# HD-14865 diff · ENG Health Questionnaire

**Generated:** ${report.generatedAt}  
**Status:** \`${report.status}\`  
**Meridiq:** 14865 (${report.meridiqQuestionCount} frågor)  
**Demo:** ${report.demoQuestionCount} frågor · **Facit JSON:** ${report.facitQuestionCount}

## Resultat

| Check | Antal |
|-------|------:|
| Saknas i demo | ${missingInDemo.length} |
| Extra i demo | ${extraInDemo.length} |
| Label mismatch | ${labelMismatch.length} |

${labelMismatch.length ? `## Label mismatch\n\n${labelMismatch.map((r) => `- **${r.id}** MQ: ${r.meridiq}\n  Demo: ${r.demo}`).join('\n\n')}\n` : ''}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;

  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`✓ ${report.status} — skrev ${mdPath}`);
  if (report.status !== 'PARITY_OK') process.exit(1);
}

main();
