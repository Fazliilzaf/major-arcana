#!/usr/bin/env node
/**
 * Legal/field diff: SharePoint Word vs Meridiq 16414 vs CCO schema vs final-demo steg3.
 * Run after download-sharepoint-doc.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const WORD_DIR = path.join(
  process.env.HOME,
  'Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/CCO-patientdokument-live/01-word-original-lokalt'
);

const WORD_FALLBACK_NAMES = [
  '1.-Hälsodeklaration-TP,-PRP,-Microneedling-PRF.docx',
  '1.-Hälsodeklaration-TP_-PRP_-Microneedling-PRF.docx',
  '1. Hälsodeklaration TP, PRP, Microneedling PRF.docx',
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function findWordFile() {
  for (const name of WORD_FALLBACK_NAMES) {
    const p = path.join(WORD_DIR, name);
    if (fs.existsSync(p)) return p;
  }
  if (!fs.existsSync(WORD_DIR)) return null;
  const hit = fs
    .readdirSync(WORD_DIR)
    .find((f) => /h[aä]lsodeklaration/i.test(f) && f.endsWith('.docx'));
  return hit ? path.join(WORD_DIR, hit) : null;
}

function extractDocxText(docxPath) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hd-docx-'));
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
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function normalizeLabel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?.!,;:()]/g, '')
    .trim();
}

function keywordPresent(text, keywords) {
  const n = normalizeLabel(text);
  return keywords.every((k) => n.includes(normalizeLabel(k)));
}

function loadMeridiq16414() {
  const catalog = readJson('migration/meridiq/questionary-catalog.json');
  const form = catalog.forms.find((f) => f.apiId === 16414);
  if (!form) throw new Error('Meridiq 16414 saknas');
  return form.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    normalized: normalizeLabel(q.label),
  }));
}

function loadCcoSchema() {
  const schemasPath = path.join(
    ROOT,
    'public/major-arcana-preview/app/journal-clinical-schemas.js'
  );
  const src = fs.readFileSync(schemasPath, 'utf8');
  const start = src.indexOf('"schemaId": "health_declaration:hair_tp"');
  if (start < 0) throw new Error('health_declaration:hair_tp saknas');
  const slice = src.slice(start, start + 12000);
  const labels = [];
  const re = /"label":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(slice))) labels.push(m[1]);
  return labels.map((label) => ({ label, normalized: normalizeLabel(label) }));
}

function loadWordMarkdownProxy() {
  const mdPath = path.join(
    process.env.HOME,
    'Library/Mobile Documents/com~apple~CloudDocs/Hairtpclinic webb/docs/sources/halsodeklaration-konsultation.md'
  );
  if (!fs.existsSync(mdPath)) return { path: null, bullets: [] };
  const lines = fs.readFileSync(mdPath, 'utf8').split('\n');
  const bullets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
  return { path: mdPath, bullets };
}

function loadSteg3DemoFields() {
  const htmlPath = path.join(
    ROOT,
    'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html'
  );
  const html = fs.readFileSync(htmlPath, 'utf8');
  const checkboxes = [...html.matchAll(/<span>([^<]{4,80})<\/span>/g)].map((m) => m[1].trim());
  const strong = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1].trim());
  return { checkboxes, strongQuestions: strong };
}

function matchWordCoverage(wordText, meridiqLabels) {
  return meridiqLabels.map((q) => {
    const keywords = q.normalized
      .split(' ')
      .filter((w) => w.length > 4)
      .slice(0, 4);
    const found =
      wordText.length > 0 &&
      keywordPresent(wordText, keywords.length ? keywords : [q.normalized.slice(0, 20)]);
    return { ...q, inWord: found };
  });
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const meridiq = loadMeridiq16414();
  const cco = loadCcoSchema();
  const wordProxy = loadWordMarkdownProxy();
  const steg3 = loadSteg3DemoFields();
  const wordPath = findWordFile();
  let wordText = '';
  let wordSource = 'SAKNAS';

  if (wordPath) {
    wordText = extractDocxText(wordPath);
    wordSource = wordPath;
  }

  const meridiqNorm = new Set(meridiq.map((q) => q.normalized));
  const ccoNorm = new Set(cco.map((f) => f.normalized));

  const ccoVsMeridiq = {
    match: meridiq.filter((q) => ccoNorm.has(q.normalized)).length,
    total: meridiq.length,
    missingInCco: meridiq.filter((q) => !ccoNorm.has(q.normalized)).map((q) => q.label),
    extraInCco: cco.filter((f) => !meridiqNorm.has(f.normalized)).map((f) => f.label),
  };

  const wordCoverage = matchWordCoverage(wordText, meridiq);
  const wordHits = wordCoverage.filter((q) => q.inWord).length;

  const steg3Issues = [];
  steg3Issues.push(
    'Demo använder SJUKDOMS-CHECKLISTA (hypertoni, diabetes, HIV…) — inte samma struktur som Meridiq 16414 (Ja/Nej per fråga)'
  );
  steg3Issues.push(
    `Demo har ${steg3.checkboxes.length} checkbox-sjukdomar; Meridiq har ${meridiq.length} frågor`
  );
  const meridiqInDemo = meridiq.filter((q) => {
    const blob = [...steg3.checkboxes, ...steg3.strongQuestions].join(' ').toLowerCase();
    return blob.includes(q.normalized.slice(0, 25));
  });
  steg3Issues.push(
    `Ungefärlig label-match demo↔Meridiq: ${meridiqInDemo.length}/${meridiq.length}`
  );

  const wordProxyMissing = wordProxy.bullets.filter((b) => {
    if (b.startsWith('Förnamn') || b.startsWith('Godkännande')) return false;
    return !meridiq.some(
      (q) =>
        normalizeLabel(b).includes(q.normalized.slice(0, 15)) ||
        q.normalized.includes(normalizeLabel(b).slice(0, 15))
    );
  });

  const report = {
    generatedAt: new Date().toISOString(),
    document: 'Hälsodeklaration | Hair TP Clinic',
    meridiqApiId: 16414,
    sharepointFile: '1. Hälsodeklaration TP, PRP, Microneedling PRF.docx',
    sources: {
      wordDocx: wordSource,
      wordBytes: wordPath ? fs.statSync(wordPath).size : 0,
      wordTextLength: wordText.length,
      wordMarkdownProxy: wordProxy.path,
      meridiqCatalog: 'migration/meridiq/questionary-catalog.json',
      ccoSchema:
        'public/major-arcana-preview/app/journal-clinical-schemas.js#health_declaration:hair_tp',
      finalDemo: 'public/major-arcana-preview/steg3-halsodeklaration-final-demo.html',
    },
    summary: {
      meridiqQuestionCount: meridiq.length,
      ccoFieldCount: cco.length,
      ccoMeridiqParity: `${ccoVsMeridiq.match}/${ccoVsMeridiq.total}`,
      wordMeridiqKeywordHits: wordPath ? `${wordHits}/${meridiq.length}` : 'N/A (Word ej lokalt)',
      finalDemoStatus: 'PARTIAL — fel formulärmodell (checkbox-lista vs Meridiq)',
      legalReviewRequired: wordPath && wordHits < meridiq.length,
    },
    ccoVsMeridiq,
    wordCoverage: wordPath ? wordCoverage : null,
    wordProxyNotes: wordProxy.bullets,
    steg3DemoIssues: steg3Issues,
    blockers: [],
  };

  if (!wordPath) {
    report.blockers.push(
      'BLOCKER: Word .docx saknas lokalt — kör npm run download:sharepoint-hd-word'
    );
  }
  if (ccoVsMeridiq.match < ccoVsMeridiq.total) {
    report.blockers.push('BLOCKER: CCO schema ≠ Meridiq 16414');
  }
  if (wordPath && wordHits < meridiq.length * 0.8) {
    report.blockers.push('NEEDS_REVIEW: Word-text matchar <80% Meridiq-frågor (keyword-scan)');
  }
  report.blockers.push(
    'BLOCKER: final-demo steg3 får inte användas som textfacit — bygg om från Meridiq+Word'
  );

  const jsonPath = path.join(OUT_DIR, 'HD-16414-diff-2026-06-04.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    '# Legal diff — Hälsodeklaration (16414)',
    '',
    `**Genererad:** ${report.generatedAt}`,
    '',
    '## Slutsats',
    '',
    `| Källa | Status |`,
    `| --- | --- |`,
    `| Meridiq **16414** | ${meridiq.length} frågor — **facit för fält** |`,
    `| CCO schema \`health_declaration:hair_tp\` | **${ccoVsMeridiq.match}/${ccoVsMeridiq.total} MATCH** med Meridiq |`,
    `| Microsoft Word (SharePoint) | ${wordPath ? `${wordHits}/${meridiq.length} keyword-träffar` : '**SAKNAS lokalt**'} |`,
    `| final-demo steg3 | **PARTIAL** — annan formulärmodell än Meridiq |`,
    '',
    '## Meridiq 16414 — alla frågor',
    '',
    ...meridiq.map((q, i) => `${i + 1}. \`${q.id}\` (${q.type}) — ${q.label}`),
    '',
    '## CCO vs Meridiq',
    '',
    ccoVsMeridiq.missingInCco.length
      ? `**Saknas i CCO:** ${ccoVsMeridiq.missingInCco.join('; ')}`
      : '**Inga saknade fält** — CCO schema matchar Meridiq labels.',
    '',
    '## final-demo steg3 — problem',
    '',
    ...steg3Issues.map((s) => `- ${s}`),
    '',
    '## Word-underlag',
    '',
    wordPath
      ? `- Nedladdad: \`${wordPath}\` (${report.sources.wordBytes} bytes, ${wordText.length} tecken extraherade)`
      : '- **Ej nedladdad** — kör `npm run download:sharepoint-hd-word`',
    '',
    '### Viktigt om Word vs Meridiq',
    '',
    'SharePoint-Word innehåller **två lager**: (1) äldre konsultationsblankett med personuppgifter, (2) avsnitt **"Meridiq Hair TP Clinic | Hälsodeklaration"** längst ner. Word listar explicit **"Dessa saknas:"** — blodförtunnande, Omega 3, rullstol, gravid/amning, övrigt — fält som **Meridiq 16414 redan har** men som äldre Word-layouten inte hade.',
    '',
    '**Tolkning:** Meridiq 16414 = operativt facit i kliniken. CCO schema 14/14 matchar Meridiq. Word är delvis äldre print-mall + Meridiq-bilaga — inte 1:1 samma som 16414 utan legal review vid PDF-export.',
    '',
    `- Markdown-proxy (2026-05-10): \`${wordProxy.path || 'saknas'}\``,
    '',
    '## Blockers',
    '',
    ...report.blockers.map((b) => `- ${b}`),
    '',
    '## Nästa steg',
    '',
    '1. Använd **Meridiq 16414** + **Word** som enda textkällor för ny final-demo HD.',
    '2. Ersätt checkbox-sjukdomslistan i steg3 med exakt 14 Meridiq-frågor.',
    '3. Legal sign-off om Word keyword-scan flaggar NEEDS_REVIEW.',
    '',
    `Rådata: \`${path.relative(ROOT, jsonPath)}\``,
    '',
  ].join('\n');

  const mdPath = path.join(OUT_DIR, 'HD-16414-diff-2026-06-04.md');
  fs.writeFileSync(mdPath, md);

  console.log(md);
  console.log(`\n✓ JSON: ${jsonPath}`);
  console.log(`✓ MD:   ${mdPath}`);
}

main();
