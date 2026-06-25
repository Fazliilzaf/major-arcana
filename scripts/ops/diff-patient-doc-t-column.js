#!/usr/bin/env node
/**
 * T-kolumn orchestrator — kör alla textfacit-diffar + matris per registryId.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, WORD_DIR, resolveWordFile } = require('./patient-document-word-lib');

const REGISTRY = JSON.parse(
  fs.readFileSync(
    path.join(
      ROOT,
      'docs/implementation/patient-documents-live/patient-document-word-registry.json'
    ),
    'utf8'
  )
);
const CATALOG = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src/ops/hairtp-document-types.catalog.json'), 'utf8')
);

const T_SCRIPTS = [
  {
    script: 'diff:patient-doc-hd-sve',
    registryIds: ['haelso_tp_sve'],
    passStatus: ['PARITY_OK', 'PARITY_OK_NO_WORD', 'WORD_REVIEW'],
  },
  { script: 'diff:patient-doc-hd-eng', registryIds: ['health_tp_eng'], passStatus: ['PARITY_OK'] },
  {
    script: 'diff:patient-doc-friskforsakran',
    registryIds: ['friskfoers_tp'],
    passStatus: ['PARITY_OK', 'PARITY_OK_NO_WORD', 'WORD_REVIEW'],
  },
];

const E6_REGISTRY_IDS = [
  'offert_tp',
  'offert_prp_hair',
  'offert_prp_skin',
  'offert_microneedling',
  'offert_prf',
  'offert_profilo',
  'samtycke_bokning_2d',
  'samtycke_angerratt',
  'ordination_tp',
  'auto_instruktion_formular',
  'foto_samtycke',
];

const E6_REPORT_PREFIXES = ['E6-OFFERT-SAMTYCKE-', 'E6-BATCH2-', 'E6-BATCH3-'];

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');

function expandHome(p) {
  return String(p || '').replace(/^~/, process.env.HOME);
}

function wordPresentForRegistry(registryId) {
  for (const item of REGISTRY.items) {
    if (!(item.registryIds || []).includes(registryId)) continue;
    if (item.localDir) {
      const dir = expandHome(item.localDir);
      if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.docx'))) return true;
    }
    if (resolveWordFile(item)) return true;
  }
  return false;
}

function runScript(name) {
  console.log(`\n--- npm run ${name} ---\n`);
  const result = spawnSync('npm', ['run', name], { stdio: 'inherit', cwd: ROOT, env: process.env });
  return result.status === 0;
}

function loadLatestE6Reports() {
  if (!fs.existsSync(OUT_DIR)) return [];
  const reports = [];
  for (const prefix of E6_REPORT_PREFIXES) {
    const files = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort();
    if (!files.length) continue;
    const data = JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.at(-1)), 'utf8'));
    if (data.reports) reports.push(...data.reports);
  }
  return reports;
}

function main() {
  const tByRegistry = new Map();
  for (const row of CATALOG.types || []) {
    if (row.id) tByRegistry.set(row.id, { registryId: row.id, status: 'PENDING', note: '' });
  }

  let allOk = true;
  for (const entry of T_SCRIPTS) {
    const ok = runScript(entry.script);
    if (!ok) allOk = false;
    for (const id of entry.registryIds) {
      tByRegistry.set(id, {
        registryId: id,
        status: ok ? 'PARITY_OK' : 'NEEDS_REVIEW',
        note: entry.script,
      });
    }
  }

  runScript('diff:patient-doc-e6-offert-samtycke');
  runScript('diff:patient-doc-e6-batch2');
  runScript('diff:patient-doc-e6-batch3');
  const e6Reports = loadLatestE6Reports();
  if (e6Reports.length) {
    for (const report of e6Reports) {
      const batchNote =
        report.registryId === 'foto_samtycke'
          ? 'diff:patient-doc-e6-batch3'
          : report.registryId === 'ordination_tp' ||
              report.registryId === 'auto_instruktion_formular'
            ? 'diff:patient-doc-e6-batch2'
            : 'diff:patient-doc-e6-offert-samtycke';
      tByRegistry.set(report.registryId, {
        registryId: report.registryId,
        status: report.status,
        note: batchNote,
      });
    }
  } else {
    for (const id of E6_REGISTRY_IDS) {
      tByRegistry.set(id, {
        registryId: id,
        status: 'NEEDS_REVIEW',
        note: 'E6 report saknas',
      });
      allOk = false;
    }
  }

  for (const row of tByRegistry.values()) {
    if (row.status !== 'PENDING') continue;
    if (wordPresentForRegistry(row.registryId)) {
      row.status = 'MS_OK_WORD_LOCAL';
      row.note = 'Word lokalt — full legal diff ej körd (E6)';
    } else {
      row.status = 'MQ_OR_TEMPLATE_ONLY';
      row.note = 'Ingen Word/T-diff i scope — Meridiq eller malltext';
    }
  }

  const matrix = [...tByRegistry.values()].sort((a, b) => a.registryId.localeCompare(b.registryId));
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `T-COLUMN-MATRIX-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `T-COLUMN-MATRIX-${stamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    wordDir: WORD_DIR,
    parityOk: matrix.filter((r) => r.status === 'PARITY_OK').length,
    e6Ok: matrix.filter((r) => r.status === 'E6_OK').length,
    e6Partial: matrix.filter((r) =>
      ['DEMO_BUNDLE_OK', 'VERSION_CONFLICT_OK', 'E6_PARTIAL'].includes(r.status)
    ).length,
    needsReview: matrix.filter((r) => r.status === 'NEEDS_REVIEW').length,
    msOkWordLocal: matrix.filter((r) => r.status === 'MS_OK_WORD_LOCAL').length,
    mqOrTemplate: matrix.filter((r) => r.status === 'MQ_OR_TEMPLATE_ONLY').length,
    rows: matrix,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# T-kolumn matris · ${stamp}

**Genererad:** ${summary.generatedAt}

| Status | Antal |
|--------|------:|
| PARITY_OK | ${summary.parityOk} |
| E6_OK | ${summary.e6Ok} |
| E6_PARTIAL | ${summary.e6Partial} |
| MS_OK_WORD_LOCAL | ${summary.msOkWordLocal} |
| MQ_OR_TEMPLATE_ONLY | ${summary.mqOrTemplate} |
| NEEDS_REVIEW | ${summary.needsReview} |

## Per registryId

| registryId | T-status | Anteckning |
|------------|----------|------------|
${matrix.map((r) => `| \`${r.registryId}\` | ${r.status} | ${r.note} |`).join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\n=== T-kolumn matris ===`);
  console.log(
    `PARITY_OK: ${summary.parityOk} · E6_OK: ${summary.e6Ok} · E6_PARTIAL: ${summary.e6Partial} · MS_OK_WORD_LOCAL: ${summary.msOkWordLocal} · MQ_ONLY: ${summary.mqOrTemplate}`
  );
  console.log(`→ ${mdPath}\n`);

  if (!allOk) process.exit(1);
}

main();
