'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '../..');

const WORD_DIR =
  process.env.CCO_PATIENT_DOCS_WORD_DIR ||
  path.join(
    process.env.HOME,
    'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/01-word-original-lokalt'
  );

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!,;:()]/g, '')
    .trim();
}

function extractDocxText(docxPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-docx-'));
  try {
    execSync(`unzip -qo ${JSON.stringify(docxPath)} -d ${JSON.stringify(tmp)}`, {
      stdio: 'pipe',
    });
    const xmlPath = path.join(tmp, 'word', 'document.xml');
    if (!fs.existsSync(xmlPath)) return '';
    const xml = fs.readFileSync(xmlPath, 'utf8');
    return xml
      .replace(/<w:tab[^/]*\/>/g, '\t')
      .replace(/<w:br[^/]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function resolveWordFile({ localNames = [], glob = null } = {}) {
  for (const name of localNames) {
    const p = path.join(WORD_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  if (glob && fs.existsSync(WORD_DIR)) {
    const re = new RegExp(glob, 'i');
    const hit = fs.readdirSync(WORD_DIR).find((f) => re.test(f) && f.endsWith('.docx'));
    if (hit) return path.join(WORD_DIR, hit);
  }
  return null;
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

function loadMeridiqForm(apiId) {
  const catalog = readJson('migration/meridiq/questionary-catalog.json');
  const form = catalog.forms.find((f) => f.apiId === apiId);
  if (!form) throw new Error(`Meridiq ${apiId} saknas`);
  return form;
}

function compareDemoToMeridiq(demoHtml, form) {
  const demoBlockCount = (demoHtml.match(/data-meridiq-id="/g) || []).length;
  const demoById = new Map(extractDemoLabels(demoHtml).map((d) => [d.id, d.label]));
  const missingInDemo = [];
  const labelMismatch = [];
  const extraInDemo = [];

  for (const q of form.questions) {
    if (!demoHasQuestionId(demoHtml, q.id)) missingInDemo.push(q.id);
    const demoLabel = demoById.get(q.id);
    if (demoLabel && normalizeLabel(demoLabel) !== normalizeLabel(q.label)) {
      labelMismatch.push({ id: q.id, meridiq: q.label, demo: demoLabel });
    }
  }
  for (const d of extractDemoLabels(demoHtml)) {
    if (!form.questions.some((q) => q.id === d.id)) extraInDemo.push(d.id);
  }

  const status =
    missingInDemo.length === 0 &&
    extraInDemo.length === 0 &&
    labelMismatch.length === 0 &&
    demoBlockCount === form.questions.length
      ? 'PARITY_OK'
      : 'NEEDS_REVIEW';

  return {
    status,
    meridiqQuestionCount: form.questions.length,
    demoQuestionCount: demoBlockCount,
    missingInDemo,
    extraInDemo,
    labelMismatch,
  };
}

function keywordPresent(text, keywords) {
  const n = normalizeLabel(text);
  return keywords.every((k) => n.includes(normalizeLabel(k)));
}

function wordKeywordCoverage(wordText, questions) {
  if (!wordText)
    return {
      hits: 0,
      total: questions.length,
      coverage: questions.map((q) => ({ ...q, inWord: false })),
    };
  const coverage = questions.map((q) => {
    const keywords = normalizeLabel(q.label)
      .split(' ')
      .filter((w) => w.length > 4)
      .slice(0, 4);
    const found =
      wordText.length > 0 &&
      keywordPresent(wordText, keywords.length ? keywords : [normalizeLabel(q.label).slice(0, 20)]);
    return { id: q.id, label: q.label, inWord: found };
  });
  const hits = coverage.filter((c) => c.inWord).length;
  return { hits, total: questions.length, coverage };
}

module.exports = {
  ROOT,
  WORD_DIR,
  readJson,
  normalizeLabel,
  extractDocxText,
  resolveWordFile,
  extractDemoLabels,
  demoHasQuestionId,
  loadMeridiqForm,
  compareDemoToMeridiq,
  wordKeywordCoverage,
};
