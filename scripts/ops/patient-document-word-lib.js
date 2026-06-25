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

function loadJournalSchema(schemaId) {
  const catalog = readJson('migration/meridiq/journal-schema-catalog.json');
  const schema = catalog.schemas.find((s) => s.schemaId === schemaId);
  if (!schema) throw new Error(`Journal schema saknas: ${schemaId}`);
  return schema;
}

function flattenJournalSchemaFields(schema) {
  const fields = [];
  for (const section of schema.sections || []) {
    for (const field of section.fields || []) {
      fields.push(field);
    }
  }
  return fields;
}

function extractJournalDemoFields(html) {
  const fields = [];
  const openRe =
    /class="journal-field"[\s\S]*?data-field-key="([^"]+)"[\s\S]*?data-meridiq-id="(\d+)"[^>]*>/g;
  const matches = [...String(html || '').matchAll(openRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const body = html.slice(bodyStart, bodyEnd);
    const strongMatch = body.match(/<strong[^>]*>([\s\S]*?)<\/strong\s*>/);
    const labelMatch = body.match(/<label[\s\S]*?>([\s\S]*?)<\/label\s*>/);
    const raw = (strongMatch || labelMatch)?.[1] || '';
    fields.push({
      key: m[1],
      id: Number(m[2]),
      label: stripHtml(raw),
    });
  }
  return fields;
}

function compareJournalDemoToSchema(demoHtml, schema, form) {
  const schemaFields = flattenJournalSchemaFields(schema);
  const demoFields = extractJournalDemoFields(demoHtml);
  const demoById = new Map(demoFields.map((d) => [d.id, d]));
  const schemaIds = new Set(schemaFields.map((f) => f.meridiqQuestionId));

  const missingInDemo = [];
  const labelMismatch = [];
  const excludedMeridiqIds = [];

  if (form) {
    for (const q of form.questions) {
      if (!schemaIds.has(q.id)) {
        excludedMeridiqIds.push({
          id: q.id,
          label: q.label,
          reason: 'inactive_or_section_header',
        });
      }
    }
  }

  for (const field of schemaFields) {
    const id = field.meridiqQuestionId;
    if (!demoHtml.includes(`data-meridiq-id="${id}"`)) {
      missingInDemo.push({ key: field.key, id });
    }
    const demo = demoById.get(id);
    if (demo && normalizeLabel(demo.label) !== normalizeLabel(field.label)) {
      labelMismatch.push({
        id,
        key: field.key,
        schema: field.label,
        demo: demo.label,
      });
    }
  }

  const extraInDemo = demoFields
    .filter((d) => !schemaIds.has(d.id))
    .map((d) => ({ id: d.id, key: d.key }));

  const status =
    missingInDemo.length === 0 &&
    extraInDemo.length === 0 &&
    labelMismatch.length === 0 &&
    demoFields.length === schemaFields.length
      ? 'PARITY_OK'
      : 'NEEDS_REVIEW';

  return {
    status,
    schemaId: schema.schemaId,
    schemaFieldCount: schemaFields.length,
    demoFieldCount: demoFields.length,
    meridiqQuestionCount: form?.questions?.length ?? null,
    excludedMeridiqCount: excludedMeridiqIds.length,
    excludedMeridiqIds,
    missingInDemo,
    extraInDemo,
    labelMismatch,
    canonicalSource: 'migration/meridiq/journal-schema-catalog.json',
    reconciliationRef:
      schema.schemaId === 'tp_treatment:hair_tp'
        ? 'docs/strategy/TP-JOURNAL-PARITY-RECONCILIATION-2026-05-30.md'
        : null,
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

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDemoSection(html, registryId) {
  const marker = `data-registry-id="${registryId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const blockStart = html.lastIndexOf('<div class="section-block"', start);
  if (blockStart < 0) return html.slice(start);
  const nextBlock = html.indexOf('<div class="section-block"', start + marker.length);
  return html.slice(blockStart, nextBlock > 0 ? nextBlock : html.length);
}

function loadBundleEntry(registryId) {
  const bundle = readJson('public/major-arcana-preview/data/hairtp-document-content-bundle.json');
  for (const pool of ['customerFilled', 'staffFilled', 'information']) {
    const items = bundle[pool];
    if (!items) continue;
    const list = Array.isArray(items) ? items : Object.values(items);
    const hit = list.find((d) => d && d.registryId === registryId);
    if (hit) return hit;
  }
  throw new Error(`bundle registryId saknas: ${registryId}`);
}

function loadMeridiqConsent(apiId) {
  const catalog = readJson('migration/meridiq/consent-catalog.json');
  const consent = (catalog.consents || []).find((c) => c.apiId === apiId);
  if (!consent) throw new Error(`Meridiq consent ${apiId} saknas`);
  return consent;
}

function bundleLegalText(entry) {
  const content = entry.content || {};
  const nested = [];
  if (content.health_declaration?.text) nested.push(content.health_declaration.text);
  if (content.fitness_certificate?.text) nested.push(content.fitness_certificate.text);
  if (content.internalText) nested.push(content.internalText);
  if (content.publishText) nested.push(content.publishText);
  if (content.scope?.summary) nested.push(content.scope.summary);
  if (Array.isArray(content.scope?.bullets)) nested.push(...content.scope.bullets);
  if (content.ackLabel) nested.push(content.ackLabel);
  if (content.subtitle) nested.push(content.subtitle);
  return (
    content.agreementText ||
    content.letterText ||
    content.text ||
    (Array.isArray(content.agreementBlocks)
      ? content.agreementBlocks.map((b) => stripHtml(b.html || '')).join('\n')
      : '') ||
    nested.join('\n') ||
    ''
  );
}

function phraseCoverage(text, phrases) {
  const normalized = normalizeLabel(text);
  const coverage = (phrases || []).map((phrase) => ({
    phrase,
    present: normalized.includes(normalizeLabel(phrase)),
  }));
  const hits = coverage.filter((c) => c.present).length;
  return { hits, total: coverage.length, coverage };
}

function compareLegalTriad({ wordText = '', bundleText = '', demoText = '', phrases = [] }) {
  const bundleCov = phraseCoverage(bundleText, phrases);
  const demoCov = phraseCoverage(demoText, phrases);
  const wordCov = wordText ? phraseCoverage(wordText, phrases) : null;
  const minHits = (total) => Math.max(1, Math.floor(total * 0.85));
  const wordMinHits = (total) => Math.max(1, Math.floor(total * 0.7));

  const demoBundleOk =
    bundleCov.total > 0 &&
    demoCov.hits >= minHits(demoCov.total) &&
    bundleCov.hits >= minHits(bundleCov.total);
  const wordOk = wordCov
    ? wordCov.hits >= wordMinHits(wordCov.total) && demoBundleOk
    : demoBundleOk;

  const missingInDemo = demoCov.coverage.filter((c) => !c.present).map((c) => c.phrase);
  const missingInBundle = bundleCov.coverage.filter((c) => !c.present).map((c) => c.phrase);

  let status = 'NEEDS_REVIEW';
  if (demoBundleOk && wordOk) status = 'E6_OK';
  else if (demoBundleOk) status = 'DEMO_BUNDLE_OK';
  else if (bundleCov.hits >= minHits(bundleCov.total) && !demoBundleOk) status = 'DEMO_GAP';

  return {
    status,
    demoBundleOk,
    wordOk,
    bundleHits: `${bundleCov.hits}/${bundleCov.total}`,
    demoHits: `${demoCov.hits}/${demoCov.total}`,
    wordHits: wordCov ? `${wordCov.hits}/${wordCov.total}` : 'N/A',
    missingInDemo,
    missingInBundle,
    wordPresent: Boolean(wordText),
  };
}

const OFFERT_DOCX_BY_REGISTRY = Object.freeze({
  offert_tp: 'Offertmall TP SV.docx',
  offert_prp_hair: 'Offertmall PRP SV.docx',
  offert_prp_skin: 'Offertmall PRP SV.docx',
  offert_microneedling: 'Offertmall PRP SV.docx',
  offert_prf: 'Offertmall PRP SV.docx',
  offert_profilo: 'Offertmall PRP SV.docx',
});

const OFFERT_DEMO_BY_REGISTRY = Object.freeze({
  offert_tp: {
    phase5: 'steg5-offert-tp-final-demo.html',
    phase7: 'steg7-v6-kundkort-final-demo.html',
  },
  offert_prp_hair: {
    phase5: 'steg5-offert-prp-hair-final-demo.html',
    phase7: 'steg7-offert-prp-hair-final-demo.html',
  },
  offert_prp_skin: {
    phase5: 'steg5-offert-prp-skin-final-demo.html',
    phase7: 'steg7-offert-prp-skin-final-demo.html',
  },
  offert_microneedling: {
    phase5: 'steg5-offert-microneedling-final-demo.html',
    phase7: 'steg7-offert-microneedling-final-demo.html',
  },
  offert_prf: {
    phase5: 'steg5-offert-prf-final-demo.html',
    phase7: 'steg7-offert-prf-final-demo.html',
  },
  offert_profilo: {
    phase5: 'steg5-offert-profilo-final-demo.html',
    phase7: 'steg7-offert-profilo-final-demo.html',
  },
});

const AVTAL_ANCHORS = Object.freeze([
  'Giltighetstid och betänketid',
  'Betalningsvillkor',
  'Av- och ombokning',
  'Ångerrätt',
  'Distansavtalslagen',
  'Information & samtycke',
  'Göteborgs tingsrätt',
]);

const SAMTYCKE_BOKNING_ANCHORS = Object.freeze([
  'Samtycke vid bokning',
  'distansavtalslagen',
  'ångerrätten därmed upphör',
  'contact@hairtpclinic.com',
  '20 %',
]);

const SAMTYCKE_ANGERRATT_ANCHORS = Object.freeze([
  'distansavtal och avtal utanför affärslokal',
  '14 dagar',
  'ångerfristen',
  'lämnar mitt samtycke',
  'Hair TP Clinic AB',
]);

const ORDINATION_STUB_ANCHORS = Object.freeze([
  'Ordination enligt behandlingsplan',
  'Patient informerad',
]);

const ORDINATION_CLINICAL_ANCHORS = Object.freeze(['lokalbedövning', 'Marcain', 'adrenalin']);

const AUTO_INSTRUKTION_ANCHORS = Object.freeze([
  'hälsodeklaration',
  'friskförsäkran',
  'hairtpclinic.com/screen',
  'hairtpclinic.com/friskforsakran',
]);

const FOTO_SAMTYCKE_ANCHORS = Object.freeze([
  'hårlinje och krona',
  'aldrig ansikte',
  'patientjournalen',
  'marknadsföring',
  'Hair TP Clinic',
  'före/efter-bilder',
]);

const FOTO_FACIT_REL =
  'docs/implementation/patient-documents-live/ORD-24-FOTO-SAMTYCKE-FACIT-2026-06-25.md';

function loadFotoScopeFacitText() {
  const journeyPath = path.join(ROOT, 'docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md');
  const facitPath = path.join(ROOT, FOTO_FACIT_REL);
  const parts = [];
  if (fs.existsSync(journeyPath)) parts.push(fs.readFileSync(journeyPath, 'utf8'));
  if (fs.existsSync(facitPath)) parts.push(fs.readFileSync(facitPath, 'utf8'));
  return parts.join('\n');
}

function isDpaUnderbilagaWord(text) {
  return /personuppgiftsbitr/i.test(String(text || ''));
}

function normalizeCompactText(s) {
  return normalizeLabel(String(s || '').replace(/\\'/g, "'"));
}

function textPrefixMatch(a, b, minLen = 80) {
  const na = normalizeCompactText(a);
  const nb = normalizeCompactText(b);
  if (!na || !nb) return false;
  const slice = Math.min(minLen, na.length, nb.length);
  return na.slice(0, slice) === nb.slice(0, slice);
}

function compareMeridiqLetterTriad({
  demoText = '',
  bundleText = '',
  meridiqText = '',
  phrases = [],
}) {
  const bundleMqOk =
    textPrefixMatch(bundleText, meridiqText) ||
    normalizeCompactText(bundleText) === normalizeCompactText(meridiqText);
  const triad = compareLegalTriad({ wordText: meridiqText, bundleText, demoText, phrases });
  let status = triad.status;
  if (bundleMqOk && triad.demoBundleOk) status = 'T_FACIT_OK';
  else if (triad.demoBundleOk && !bundleMqOk) status = 'BUNDLE_MQ_GAP';
  return { ...triad, bundleMqOk, status };
}

function compareDemoBundleOnly({ bundleText = '', demoText = '', phrases = [] }) {
  const triad = compareLegalTriad({ wordText: '', bundleText, demoText, phrases });
  const status = triad.demoBundleOk ? 'T_FACIT_OK' : triad.status;
  return { ...triad, status, wordPresent: false, wordHits: 'N/A', wordOk: triad.demoBundleOk };
}

function compareWordDemoClinical({ wordText = '', demoText = '', phrases = [] }) {
  const demoCov = phraseCoverage(demoText, phrases);
  const wordCov = phraseCoverage(wordText, phrases);
  const minHits = (total) => Math.max(1, Math.floor(total * 0.7));
  const ok =
    wordCov.total > 0 &&
    demoCov.total > 0 &&
    wordCov.hits >= minHits(wordCov.total) &&
    demoCov.hits >= minHits(demoCov.total);
  return {
    ok,
    demoHits: `${demoCov.hits}/${demoCov.total}`,
    wordHits: `${wordCov.hits}/${wordCov.total}`,
    missingInDemo: demoCov.coverage.filter((c) => !c.present).map((c) => c.phrase),
    missingInWord: wordCov.coverage.filter((c) => !c.present).map((c) => c.phrase),
  };
}

function resolveOrdinationWord() {
  return resolveWordFile({
    localNames: ['ordination-lokalbedovning-tp.docx'],
    glob: 'ordination.*\\.docx$',
  });
}

function resolveUnderbilagaWord() {
  return resolveWordFile({ localNames: ['underbilaga-1-instruktion.docx'] });
}

function expandHome(p) {
  return String(p || '').replace(/^~/, process.env.HOME);
}

function walkDocx(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walkDocx(p));
    else if (name.endsWith('.docx')) out.push(p);
  }
  return out;
}

function resolveOffertDocx(registryId) {
  const target = OFFERT_DOCX_BY_REGISTRY[registryId];
  if (!target) return null;
  const dir = expandHome('~/Code/MA-Archive/offert-word/Offertmallar');
  const hit = walkDocx(dir).find((p) => path.basename(p) === target);
  return hit || null;
}

function resolveAvtalWord(registryId) {
  if (registryId === 'offert_tp') {
    return resolveWordFile({
      localNames: ['251203-behandlingsavtal-dhi-2dagar.docx'],
      glob: '251203.*2 dagar.*\\.docx$',
    });
  }
  return resolveWordFile({
    localNames: ['251203-behandlingsavtal-dhi-2dagar.docx', '251010-behandlingsavtal-dhi.docx'],
    glob: '251203.*\\.docx$',
  });
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
  loadJournalSchema,
  flattenJournalSchemaFields,
  extractJournalDemoFields,
  compareJournalDemoToSchema,
  wordKeywordCoverage,
  stripHtml,
  extractDemoSection,
  loadBundleEntry,
  loadMeridiqConsent,
  bundleLegalText,
  phraseCoverage,
  compareLegalTriad,
  normalizeCompactText,
  textPrefixMatch,
  compareMeridiqLetterTriad,
  OFFERT_DOCX_BY_REGISTRY,
  OFFERT_DEMO_BY_REGISTRY,
  AVTAL_ANCHORS,
  SAMTYCKE_BOKNING_ANCHORS,
  SAMTYCKE_ANGERRATT_ANCHORS,
  ORDINATION_STUB_ANCHORS,
  ORDINATION_CLINICAL_ANCHORS,
  AUTO_INSTRUKTION_ANCHORS,
  FOTO_SAMTYCKE_ANCHORS,
  FOTO_FACIT_REL,
  loadFotoScopeFacitText,
  isDpaUnderbilagaWord,
  compareDemoBundleOnly,
  compareWordDemoClinical,
  resolveOrdinationWord,
  resolveUnderbilagaWord,
  expandHome,
  walkDocx,
  resolveOffertDocx,
  resolveAvtalWord,
};
