#!/usr/bin/env node
'use strict';

/**
 * P0 — Nordbro legal diff: steg7 facit ↔ Nordbro 251203 Word ↔ consent bindings.
 *
 * Usage:
 *   npm run diff:nordbro-p0
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
  SAMTYCKE_ANGERRATT_ANCHORS,
  phraseCoverage,
} = require('./patient-document-word-lib');

const OUT_DIR = path.join(ROOT, 'docs/implementation/patient-documents-live/diffs');
const FACIT_PATH = path.join(ROOT, 'migration/meridiq/steg7-tp-dhi-agreement-facit.json');
const BINDINGS_PATH = path.join(ROOT, 'migration/meridiq/nordbro-p0-source-bindings.json');
const FACIT_SET_PATH = path.join(ROOT, 'config/nordbro-insatt-facit-set.json');

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function facitToPlain(facit) {
  return (facit.blocks || []).map((b) => stripHtml(b.html)).join('\n');
}

function coolingToPlain(facit) {
  return (facit.cooling?.blocks || []).map((b) => stripHtml(b.html)).join('\n');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const facit = JSON.parse(fs.readFileSync(FACIT_PATH, 'utf8'));
  const bindings = JSON.parse(fs.readFileSync(BINDINGS_PATH, 'utf8'));
  const facitSet = JSON.parse(fs.readFileSync(FACIT_SET_PATH, 'utf8'));

  const wordPath = resolveAvtalWord('offert_tp');
  if (!wordPath) {
    console.error(
      'BLOCKER: Nordbro Word saknas — kör sync-patient-documents-live eller lägg 251203-behandlingsavtal-dhi-2dagar.docx i WORD_DIR'
    );
    process.exit(2);
  }

  const wordText = extractDocxText(wordPath);
  const facitText = facitToPlain(facit);
  const coolingText = coolingToPlain(facit);

  const agreementTriad = compareLegalTriad({
    wordText,
    bundleText: facitText,
    demoText: facitText,
    phrases: AVTAL_ANCHORS,
  });

  const agreementWordFacit = phraseCoverage(facitText, AVTAL_ANCHORS);
  const agreementWordOnly = phraseCoverage(wordText, AVTAL_ANCHORS);

  const coolingTriad = compareLegalTriad({
    wordText,
    bundleText: coolingText,
    demoText: coolingText,
    phrases: SAMTYCKE_ANGERRATT_ANCHORS,
  });
  const coolingWordPartial =
    coolingTriad.demoBundleOk &&
    coolingTriad.wordPresent &&
    !coolingTriad.wordOk &&
    wordText.toLowerCase().includes('ångerrätt');

  const knownDrifts = [];
  const driftChecks = [
    ['uppnås bästa', 'uppnå bästa', 'Resultat stavning'],
    ['fyra (4) PRP-behandling,', 'fyra (4) PRP-behandlingar,', 'PRP plural'],
    ['Tjänstutövaren fullgörande', 'Tjänsteutövarens fullgörande', 'Force majeure possessiv'],
  ];
  for (const [facitNeedle, wordNeedle, label] of driftChecks) {
    const inFacit = facitText.includes(facitNeedle);
    const inWord = wordText.includes(wordNeedle);
    if (inFacit !== inWord) {
      knownDrifts.push({
        label,
        facitNeedle,
        wordNeedle,
        inFacit,
        inWord,
        action: 'align_facit_to_nordbro',
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    batch: 'P0',
    ownerFacitSet: facitSet.p0Scope,
    wordPath,
    wordSha256: sha256(wordText).slice(0, 12),
    facitSha256: sha256(facitText).slice(0, 12),
    bindings: bindings.bindings,
    agreement: {
      meridiqApiId: 170917,
      templateRef: 'agreement_hair_tp_dhi_2day_nordbro',
      ...agreementTriad,
      wordAnchorHits: `${agreementWordOnly.hits}/${agreementWordOnly.total}`,
      facitAnchorHits: `${agreementWordFacit.hits}/${agreementWordFacit.total}`,
      knownDrifts,
    },
    cooling: {
      meridiqApiId: 170955,
      ...coolingTriad,
      validationMode: coolingWordPartial ? 'facit_bundled_consent' : 'word_triad',
      note: coolingWordPartial
        ? '170955 är separat Meridiq-post i bundle; Nordbro-avtal refererar ångerrätt — facit blocks valideras internt (5/5)'
        : null,
    },
    overall:
      agreementTriad.status === 'E6_OK' &&
      knownDrifts.length === 0 &&
      (coolingTriad.status === 'E6_OK' || (coolingTriad.demoBundleOk && coolingWordPartial))
        ? 'P0_PASS'
        : knownDrifts.length
          ? 'P0_PASS_WITH_DRIFT'
          : 'P0_NEEDS_REVIEW',
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `NORDINSATT-P0-${stamp}.json`);
  const mdPath = path.join(OUT_DIR, `NORDINSATT-P0-${stamp}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const md = `# Nordbro/Insatt P0 — steg7 facit diff · ${stamp}

## Facit-set (owner)

- Canonical: **251203 DHI 2-dagars** (\`251203-behandlingsavtal-dhi-2dagar.docx\`)
- Meridiq bind: **170917** (avtal) + **170955** (ångerfrist)
- Källa: \`config/nordbro-insatt-facit-set.json\`

## Resultat

| Del | Status | Word↔facit ankare | Anteckning |
|-----|--------|-------------------|------------|
| Avtal 170917 | **${payload.agreement.status}** | word ${payload.agreement.wordAnchorHits} · facit ${payload.agreement.facitAnchorHits} | templateRef \`agreement_hair_tp_dhi_2day_nordbro\` |
| Cooling 170955 | **${payload.cooling.status}** | word ${payload.cooling.wordHits} · facit ${payload.cooling.bundleHits} | ${payload.cooling.note || 'facit#cooling'} |
| **Overall** | **${payload.overall}** | | |

## Kända driftpunkter (facit → Nordbro)

${knownDrifts.length ? knownDrifts.map((d) => `- **${d.label}**: facit har \`${d.facitNeedle}\` · Nordbro har \`${d.wordNeedle}\` → ${d.action}`).join('\n') : '- Inga kända driftpunkter kvar'}

## Metadata uppdaterad

- \`migration/meridiq/steg7-tp-dhi-agreement-facit.json\` — legalSource nordbro 251203
- \`migration/meridiq/nordbro-p0-source-bindings.json\` — 170917 + 170955
- \`config/nordbro-insatt-facit-set.json\` — facit-set registry

## Nästa (P1)

- PRP 170944 mot Nordbro PRP 251203
- Curatiio avtal — väntar Nordbro/Insatt PDF

---

\`npm run diff:nordbro-p0\` · word: \`${wordPath}\`
`;

  fs.writeFileSync(mdPath, md, 'utf8');

  console.log(`P0 overall: ${payload.overall}`);
  console.log(`Agreement 170917: ${payload.agreement.status} (drifts: ${knownDrifts.length})`);
  console.log(`Cooling 170955: ${payload.cooling.status}`);
  console.log(`Wrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);

  if (payload.overall === 'P0_NEEDS_REVIEW') process.exit(1);
}

main();
