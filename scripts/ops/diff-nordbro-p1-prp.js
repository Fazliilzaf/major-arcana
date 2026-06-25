#!/usr/bin/env node
'use strict';

/**
 * P1 — Nordbro legal diff: PRP facit ↔ Nordbro 251203 PRP Word ↔ 170944/170945.
 *
 * Usage:
 *   npm run diff:nordbro-p1
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  ROOT,
  extractDocxText,
  resolveAvtalWord,
  compareLegalTriad,
  AVTAL_ANCHORS,
  phraseCoverage,
  normalizeCompactText,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const FACIT_PATH = path.join(ROOT, 'migration/meridiq/prp-behandling-agreement-facit.json');
const BINDINGS_PATH = path.join(ROOT, 'migration/meridiq/nordbro-p1-source-bindings.json');
const FACIT_SET_PATH = path.join(ROOT, 'config/nordbro-insatt-facit-set.json');
const CCO_TEMPLATES_PATH = path.join(ROOT, 'data/cco-templates.json');

const PRP_ANCHORS = Object.freeze([...AVTAL_ANCHORS, 'PRP-behandling', 'contact@hairtpclinic.com']);

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function facitToPlain(facit) {
  return (facit.blocks || []).map((b) => stripHtml(b.html)).join('\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadSharePointNordbroText() {
  const catalog = JSON.parse(fs.readFileSync(CCO_TEMPLATES_PATH, 'utf8'));
  const tpl = (catalog.templates || []).find(
    (t) => t.templateId === 'meridiq_consent_behandlingsavtal_prp_hud_170944'
  );
  if (!tpl?.body?.sv) return null;
  return {
    text: tpl.body.sv,
    source: 'data/cco-templates.json#meridiq_consent_behandlingsavtal_prp_hud_170944',
    sharePointMeta: tpl.sharePointMeta || null,
    updatedBy: tpl.updatedBy || null,
  };
}

function loadNordbroReference() {
  const wordPath = resolveAvtalWord('offert_prp_skin');
  if (wordPath) {
    return {
      mode: 'word',
      path: wordPath,
      text: extractDocxText(wordPath),
    };
  }
  const sp = loadSharePointNordbroText();
  if (sp) {
    return {
      mode: 'sharepoint_import_fallback',
      path: sp.source,
      text: sp.text,
      sharePointMeta: sp.sharePointMeta,
      note: 'Word saknas lokalt — jämför mot SharePoint-import (sharepoint_import_step3)',
    };
  }
  return null;
}

function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const facit = JSON.parse(fs.readFileSync(FACIT_PATH, 'utf8'));
  const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, 'utf8'));
  const facitSet = JSON.parse(fs.readFileSync(FACIT_SET_PATH, 'utf8'));

  const nordbro = loadNordbroReference();
  if (!nordbro) {
    console.error('BLOCKER: varken PRP Word eller SharePoint-import finns');
    process.exit(2);
  }

  const facitText = facitToPlain(facit);
  const nordbroText = nordbro.text;
  const facitNorm = normalizeCompactText(
    facitText.replace(/\{\{[^}]+\}\}/g, '').replace(/\{\#[^}]+\}\}/g, '')
  );
  const nordbroNorm = normalizeCompactText(
    nordbroText.replace(/\{\{[^}]+\}\}/g, '').replace(/\{\#[^}]+\}\}/g, '')
  );
  const textMatch = facitNorm === nordbroNorm;

  const triad = compareLegalTriad({
    wordText: nordbroText,
    bundleText: facitText,
    demoText: facitText,
    phrases: PRP_ANCHORS,
  });

  const brandFlags = [];
  if (facitText.includes('contact@curatiio.com')) {
    brandFlags.push({
      code: 'NEEDS_BRAND_REVIEW',
      detail: 'ångerrätt hänvisar contact@curatiio.com i Nordbro 251203 PRP — Hair TP avtal',
      action: 'legal_review_with_nordbro',
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    batch: 'P1',
    ownerFacitSet: facitSet.p1Scope,
    nordbroReference: {
      mode: nordbro.mode,
      path: nordbro.path,
      note: nordbro.note || null,
      sharePointMeta: nordbro.sharePointMeta || null,
    },
    facitSha256: sha256(facitText).slice(0, 12),
    nordbroSha256: sha256(nordbroText).slice(0, 12),
    textMatch,
    bindings: bindings.bindings,
    agreement: {
      meridiqApiIds: [170944, 170945],
      templateRef: 'agreement_hair_tp_prp_nordbro',
      ...triad,
      textMatch,
      brandFlags,
    },
    overall:
      textMatch && triad.demoBundleOk
        ? brandFlags.length
          ? 'P1_PASS_WITH_BRAND_REVIEW'
          : 'P1_PASS'
        : triad.demoBundleOk
          ? 'P1_PASS_WITH_DRIFT'
          : 'P1_NEEDS_REVIEW',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `NORDINSATT-P1-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `NORDINSATT-P1-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const md = `# Nordbro/Insatt P1 — PRP facit diff · ${stamp}

## Facit-set (owner)

- Canonical: **251203 PRP** (\`251203-behandlingsavtal-prp.docx\`)
- Meridiq bind: **170944** (PRP hud) + **170945** (PRP hår) — samma Nordbro-avtal
- Källa: \`config/nordbro-insatt-facit-set.json\`

## Nordbro-referens

- Mode: **${payload.nordbroReference.mode}**
- Path: \`${payload.nordbroReference.path}\`
${payload.nordbroReference.note ? `- Notering: ${payload.nordbroReference.note}` : ''}

## Resultat

| Del | Status | Text match | Ankare facit | Anteckning |
|-----|--------|------------|--------------|------------|
| PRP 170944/170945 | **${payload.agreement.status}** | **${textMatch ? 'JA' : 'NEJ'}** | ${payload.agreement.facitAnchorHits || payload.agreement.bundleHits} | \`agreement_hair_tp_prp_nordbro\` |
| **Overall** | **${payload.overall}** | | | |

## Brand review

${brandFlags.length ? brandFlags.map((f) => `- **${f.code}**: ${f.detail} → ${f.action}`).join('\n') : '- Inga brand-flaggor'}

## Metadata uppdaterad

- \`migration/meridiq/prp-behandling-agreement-facit.json\` — legalSource nordbro 251203
- \`migration/meridiq/nordbro-p1-source-bindings.json\` — 170944 + 170945
- \`config/nordbro-insatt-facit-set.json\` — p1Scope

## Nästa

- Ladda PRP Word lokalt: \`npm run download:patient-doc-word-e4\` (avtal_prp) eller symlink Juridik-GDPR
- Curatiio avtal — väntar Nordbro/Insatt PDF

---

\`npm run diff:nordbro-p1\`
`;

  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`P1 overall: ${payload.overall}`);
  console.log(`PRP 170944/170945: ${payload.agreement.status} textMatch=${textMatch}`);
  console.log(`Nordbro ref: ${nordbro.mode} (${nordbro.path})`);
  if (brandFlags.length) console.log(`Brand flags: ${brandFlags.length}`);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);

  if (payload.overall === 'P1_NEEDS_REVIEW') process.exit(1);
}

main();
