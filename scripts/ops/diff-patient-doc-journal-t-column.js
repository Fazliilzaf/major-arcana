#!/usr/bin/env node
/**
 * T-kolumn — journal B16–B21: demo ↔ journal-schema-catalog (canonical) ↔ Meridiq.
 * B16 jämför 52 aktiva fält (ej 59 rå-MQ inkl. sektion-headers) — se TP-JOURNAL-PARITY doc.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  loadMeridiqForm,
  loadJournalSchema,
  compareJournalDemoToSchema,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');

const JOURNALS = [
  {
    registryId: 'journal_tp',
    schemaId: 'tp_treatment:hair_tp',
    meridiqApiId: 16411,
    demo: 'steg8-journal-tp-final-demo.html',
  },
  {
    registryId: 'journal_tp_post_prp',
    schemaId: 'prp_treatment:tp_post_op',
    meridiqApiId: 16412,
    demo: 'steg8-journal-tp-post-prp-final-demo.html',
  },
  {
    registryId: 'journal_tp_follow_4',
    schemaId: 'follow_up:4_manader',
    meridiqApiId: 16407,
    demo: 'steg8-journal-tp-follow-4-final-demo.html',
  },
  {
    registryId: 'journal_tp_follow_6',
    schemaId: 'follow_up:6_manader',
    meridiqApiId: 16409,
    demo: 'steg8-journal-tp-follow-6-final-demo.html',
  },
  {
    registryId: 'journal_tp_follow_12',
    schemaId: 'follow_up:12_manader',
    meridiqApiId: 16390,
    demo: 'steg8-journal-tp-follow-12-final-demo.html',
  },
  {
    registryId: 'journal_prp_multi',
    schemaId: 'prp_treatment:prp_skin',
    meridiqApiId: 14988,
    demo: 'steg8-journal-prp-multi-final-demo.html',
  },
];

function diffJournal(entry) {
  const demoPath = path.join(PREVIEW, entry.demo);
  const demoHtml = fs.readFileSync(demoPath, 'utf8');
  const schema = loadJournalSchema(entry.schemaId);
  const form = loadMeridiqForm(entry.meridiqApiId);
  const parity = compareJournalDemoToSchema(demoHtml, schema, form);

  return {
    registryId: entry.registryId,
    schemaId: entry.schemaId,
    meridiqApiId: entry.meridiqApiId,
    demoHtml: entry.demo,
    status: parity.status,
    parity,
  };
}

function main() {
  const reports = JOURNALS.map(diffJournal);
  const stamp = new Date().toISOString().slice(0, 10);
  const summary = {
    generatedAt: new Date().toISOString(),
    script: 'diff:patient-doc-journal-t-column',
    parityOk: reports.filter((r) => r.status === 'PARITY_OK').length,
    needsReview: reports.filter((r) => r.status === 'NEEDS_REVIEW').length,
    reports,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `JOURNAL-T-COLUMN-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `JOURNAL-T-COLUMN-${stamp}.md`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# Journal T-kolumn · B16–B21 · ${stamp}

**Genererad:** ${summary.generatedAt}

Canonical: \`journal-schema-catalog.json\` (aktiva fält) — ej rå-MQ sektion-headers.

| Status | Antal |
|--------|------:|
| PARITY_OK | ${summary.parityOk} |
| NEEDS_REVIEW | ${summary.needsReview} |

## Per registryId

| registryId | MQ | schema | demo | T-status | excluded MQ |
|------------|---:|-------:|-----:|----------|------------:|
${reports
  .map(
    (r) =>
      `| \`${r.registryId}\` | ${r.meridiqApiId} | ${r.parity.schemaFieldCount} | ${r.parity.demoFieldCount} | ${r.status} | ${r.parity.excludedMeridiqCount} |`
  )
  .join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\n=== Journal T B16–B21 ===`);
  for (const r of reports) {
    const p = r.parity;
    console.log(
      `${r.status === 'PARITY_OK' ? '✓' : '✗'} ${r.registryId} — ${p.demoFieldCount}/${p.schemaFieldCount} schema · MQ raw ${p.meridiqQuestionCount} (excluded ${p.excludedMeridiqCount})`
    );
  }
  console.log(`→ ${mdPath}\n`);

  if (summary.needsReview > 0) process.exit(1);
}

main();
