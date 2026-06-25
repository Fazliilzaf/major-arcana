#!/usr/bin/env node
/**
 * E6/T — legal triad diff för offert (A4–A9) + samtycken (A10–A11).
 * Word ↔ bundle ↔ demo med juridiska ankare.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  AVTAL_ANCHORS,
  SAMTYCKE_BOKNING_ANCHORS,
  SAMTYCKE_ANGERRATT_ANCHORS,
  OFFERT_DEMO_BY_REGISTRY,
  extractDocxText,
  stripHtml,
  extractDemoSection,
  loadBundleEntry,
  loadMeridiqConsent,
  bundleLegalText,
  compareLegalTriad,
  resolveOffertDocx,
  resolveAvtalWord,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const PREVIEW = path.join(ROOT, 'public/major-arcana-preview');
const SAMTYCKE_DEMO = path.join(PREVIEW, 'steg6-betanketid-samtycke-final-demo.html');

const OFFERT_IDS = Object.keys(OFFERT_DEMO_BY_REGISTRY);

function diffOffert(registryId) {
  const entry = loadBundleEntry(registryId);
  const demos = OFFERT_DEMO_BY_REGISTRY[registryId];
  const demoPhase7 = fs.readFileSync(path.join(PREVIEW, demos.phase7), 'utf8');
  const bundleText = bundleLegalText(entry);
  const avtalPath = resolveAvtalWord(registryId);
  const offertPath = resolveOffertDocx(registryId);
  const wordParts = [];
  if (avtalPath) wordParts.push(extractDocxText(avtalPath));
  if (offertPath) wordParts.push(extractDocxText(offertPath));
  const wordText = wordParts.join('\n');
  const triad = compareLegalTriad({
    wordText,
    bundleText,
    demoText: stripHtml(demoPhase7),
    phrases: AVTAL_ANCHORS,
  });
  return {
    registryId,
    kind: 'offert',
    meridiqApiId: entry.meridiq?.apiId || null,
    demoHtml: demos.phase7,
    avtalWord: avtalPath,
    offertWord: offertPath,
    blockers: entry.blockers || [],
    ...triad,
  };
}

function diffSamtycke(registryId, anchors) {
  const entry = loadBundleEntry(registryId);
  const demoHtml = fs.readFileSync(SAMTYCKE_DEMO, 'utf8');
  const sectionHtml = extractDemoSection(demoHtml, registryId);
  const bundleText = bundleLegalText(entry);
  const avtalPath = resolveAvtalWord('offert_tp');
  const wordText = avtalPath ? extractDocxText(avtalPath) : '';
  const triad = compareLegalTriad({
    wordText,
    bundleText,
    demoText: stripHtml(sectionHtml),
    phrases: anchors,
  });
  const consent = entry.meridiq?.apiId ? loadMeridiqConsent(entry.meridiq.apiId) : null;
  let status = triad.status;
  if ((entry.blockers || []).some((b) => /VERSION_CONFLICT/i.test(b))) {
    status = triad.demoBundleOk ? 'VERSION_CONFLICT_OK' : 'VERSION_CONFLICT';
  }
  return {
    registryId,
    kind: 'samtycke',
    meridiqApiId: entry.meridiq?.apiId || null,
    meridiqTitle: consent?.title || entry.meridiq?.title || null,
    demoHtml: 'steg6-betanketid-samtycke-final-demo.html',
    avtalWord: avtalPath,
    blockers: entry.blockers || [],
    ...triad,
    status,
  };
}

function main() {
  const reports = [
    ...OFFERT_IDS.map((id) => diffOffert(id)),
    diffSamtycke('samtycke_bokning_2d', SAMTYCKE_BOKNING_ANCHORS),
    diffSamtycke('samtycke_angerratt', SAMTYCKE_ANGERRATT_ANCHORS),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUT_DIR, `E6-OFFERT-SAMTYCKE-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `E6-OFFERT-SAMTYCKE-${stamp}.md`);

  const summary = {
    generatedAt: new Date().toISOString(),
    e6Ok: reports.filter((r) => r.status === 'E6_OK').length,
    demoBundleOk: reports.filter((r) =>
      ['E6_OK', 'DEMO_BUNDLE_OK', 'VERSION_CONFLICT_OK'].includes(r.status)
    ).length,
    needsReview: reports.filter((r) =>
      ['NEEDS_REVIEW', 'DEMO_GAP', 'VERSION_CONFLICT'].includes(r.status)
    ).length,
    reports,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = `# E6 legal diff · offert + samtycken · ${stamp}

**Genererad:** ${summary.generatedAt}

| Status | Antal |
|--------|------:|
| E6_OK | ${summary.e6Ok} |
| demo↔bundle OK | ${summary.demoBundleOk} |
| NEEDS_REVIEW | ${summary.needsReview} |

## Per registryId

| registryId | status | demo | bundle | word | blockers |
|------------|--------|------|--------|------|----------|
${reports
  .map(
    (r) =>
      `| \`${r.registryId}\` | ${r.status} | ${r.demoHits} | ${r.bundleHits} | ${r.wordHits} | ${(r.blockers || []).join('; ') || '—'} |`
  )
  .join('\n')}

Rådata: \`${path.relative(ROOT, jsonPath)}\`
`;
  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`\n=== diff:patient-doc-e6-offert-samtycke ===\n`);
  for (const r of reports) {
    console.log(
      `${r.status === 'E6_OK' || r.status === 'VERSION_CONFLICT_OK' ? 'PASS' : 'WARN'} ${r.registryId} — ${r.status} · demo ${r.demoHits} · bundle ${r.bundleHits} · word ${r.wordHits}`
    );
  }
  console.log(`\n→ ${mdPath}\n`);

  const hardFail = reports.some((r) =>
    ['NEEDS_REVIEW', 'DEMO_GAP', 'VERSION_CONFLICT'].includes(r.status)
  );
  if (hardFail) process.exit(1);
}

main();
