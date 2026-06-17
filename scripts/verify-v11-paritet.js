#!/usr/bin/env node
/**
 * verify-v11-paritet.js
 * Auto-UAT för Cursor's port av v11 kundkort (ORD-25).
 * Körs efter varje deploy-fas: node scripts/verify-v11-paritet.js
 *
 * Exit-code: 0 = alla checks PASS, 1 = någon FAIL.
 *
 * Spec-referens: docs/handover/MOCKUPS/KUNDKORT-V11-LOCKED-2026-06-05.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CSS_PATH = path.join(REPO_ROOT, 'public/major-arcana-preview/cco-v9-customers.css');
const PARITY_JS = path.join(
  REPO_ROOT,
  'public/major-arcana-preview/app/cco-v9-customers-parity.js'
);
const PATIENT_UI_JS = path.join(REPO_ROOT, 'public/major-arcana-preview/app/patient-master-ui.js');

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

const results = [];
let passCount = 0;
let failCount = 0;

function check(label, ok, detail) {
  results.push({ label, ok, detail });
  if (ok) passCount++;
  else failCount++;
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Fas A: Design-tokens
// ─────────────────────────────────────────────────────────────

const css = readFileSafe(CSS_PATH);
if (!css) {
  check('CSS-fil läsbar', false, `Hittade inte ${CSS_PATH}`);
} else {
  check('CSS-fil läsbar', true, `${css.length} bytes`);

  const requiredTokens = [
    '--v11-ink',
    '--v11-ink-soft',
    '--v11-vellum',
    '--v11-vellum-border',
    '--v11-card-rule',
    '--v11-lila-strong',
    '--v11-lila-text',
    '--v11-lila-pill',
    '--v11-lila-wash',
    '--v11-gron-text',
    '--v11-gron-grad',
    '--v11-gron-pill',
    '--v11-gron-wash',
    '--v11-amber-text',
    '--v11-amber-grad',
    '--v11-amber-wash',
    '--v11-amber-border',
    '--v11-shadow-base',
    '--v11-shadow-lift',
  ];

  for (const token of requiredTokens) {
    const present = css.includes(token);
    check(`Token ${token}`, present, present ? 'definierad' : 'SAKNAS');
  }

  // Typografi-skala (5 sizes locked)
  const fsTokens = [
    '--v11-fs-label',
    '--v11-fs-fine',
    '--v11-fs-body',
    '--v11-fs-section',
    '--v11-fs-hero',
  ];
  for (const token of fsTokens) {
    const present = css.includes(token);
    check(`Typografi-token ${token}`, present, present ? 'definierad' : 'SAKNAS');
  }

  // Rytm-tokens (6/14/24)
  const rhythmTokens = ['--v11-gap-intra', '--v11-gap-card', '--v11-gap-zone'];
  for (const token of rhythmTokens) {
    const present = css.includes(token);
    check(`Rytm-token ${token}`, present, present ? 'definierad' : 'SAKNAS');
  }

  // Hairstrand-utility
  const hasHairstrand = css.includes('.v11-hairstrand') || css.includes('v11-hairstrand');
  check(
    'Hairstrand-utility class',
    hasHairstrand,
    hasHairstrand ? 'finns' : 'SAKNAS — behövs för zon-skarvar'
  );

  // ─────────────────────────────────────────────────────────────
  // Frusna designval (negativ-check)
  // ─────────────────────────────────────────────────────────────

  // Sök efter rosa-värden i v11-scoped CSS
  // Grov regex — leter efter pink-tonade hex som inte är legit (parchment/cream/vellum är OK)
  const rosaPatterns = [
    /#d4537e/i, // studio-rosa
    /#bb4779/i, // hot-pink
    /#f0c0d1/i, // soft-pink
    /rgba\s*\(\s*23[0-9]\s*,\s*1[0-9][0-9]\s*,\s*1[6-9][0-9]/i, // pink-rgba range
  ];
  const rosaFound = [];
  for (const pat of rosaPatterns) {
    if (pat.test(css)) {
      rosaFound.push(pat.source);
    }
  }
  check(
    'Ingen rosa-accent i CSS',
    rosaFound.length === 0,
    rosaFound.length === 0 ? 'rent' : `hittade: ${rosaFound.join(', ')}`
  );

  // Sök efter blue-stripe-användning (info-blå #4a7ba8 ska inte vara stripe-accent)
  // Vi varnar bara — info-blå får finnas för länkar etc.
  const blueStripeRegex = /border-left[^;]*#4a7ba8/i;
  const hasBlueStripe = blueStripeRegex.test(css);
  check(
    'Ingen blå border-left-stripe',
    !hasBlueStripe,
    !hasBlueStripe ? 'rent' : 'hittade blå stripe-accent'
  );

  // Sök efter brunt checkmark-grad (#e0c280 → #c4a040)
  const brownCheckRegex = /linear-gradient[^)]*#e0c280[^)]*#c4a040/i;
  const hasBrownCheck = brownCheckRegex.test(css);
  check(
    'Ingen brun checkmark-gradient',
    !hasBrownCheck,
    !hasBrownCheck ? 'rent' : 'hittade #e0c280→#c4a040 gradient'
  );

  // ─────────────────────────────────────────────────────────────
  // Typografi-disciplin: max 5 unika font-size-värden i v11-scoped
  // ─────────────────────────────────────────────────────────────

  // Hämta v11-blocket grovt (allt mellan första --v11- och nästa block utanför)
  const v11Block = (() => {
    const start = css.indexOf('--v11-');
    if (start === -1) return '';
    // Hitta closing brace för var-block
    const blockEnd = css.indexOf('}', start);
    return css.slice(start, Math.min(blockEnd + 1, start + 8000));
  })();

  const fsValuesInBlock = [...v11Block.matchAll(/--v11-fs-[a-z]+\s*:\s*(\d+)px/g)].map((m) => m[1]);
  const uniqueFs = [...new Set(fsValuesInBlock)];
  check(
    'Max 5 unika font-size-värden i v11-tokens',
    uniqueFs.length <= 5,
    `hittade ${uniqueFs.length}: [${uniqueFs.join(', ')}]`
  );

  // Verifiera exakta värden 10/11/13/16/22
  const expectedSizes = ['10', '11', '13', '16', '22'];
  const sizesMatch = expectedSizes.every((s) => uniqueFs.includes(s));
  check(
    'Typografi-skala = 10/11/13/16/22',
    sizesMatch,
    sizesMatch
      ? 'rätt skala'
      : `förväntade [${expectedSizes.join(', ')}], hittade [${uniqueFs.join(', ')}]`
  );
}

// ─────────────────────────────────────────────────────────────
// Fas B/C/D: Render-funktioner i parity.js
// ─────────────────────────────────────────────────────────────

const parityJs = readFileSafe(PARITY_JS);
if (!parityJs) {
  check('Parity-JS läsbar', false, `Hittade inte ${PARITY_JS}`);
} else {
  check('Parity-JS läsbar', true, `${parityJs.length} bytes`);

  // Förväntade nya render-funktioner per fas
  const expectedRenderFns = [
    { name: 'renderV11Hero', phase: 'B' },
    { name: 'renderV11MedicalBriefing', phase: 'B' },
    { name: 'renderV11StatRow', phase: 'B' },
    { name: 'renderV11DocumentSegments', phase: 'C' },
    { name: 'renderV11DocumentFilters', phase: 'C' },
    { name: 'renderV11InsightsStrip', phase: 'D' },
    { name: 'renderV11StickyActions', phase: 'D' },
    { name: 'renderV11Hairstrand', phase: 'A' },
  ];

  for (const fn of expectedRenderFns) {
    const present = parityJs.includes(fn.name);
    check(
      `Render-fn ${fn.name} (Fas ${fn.phase})`,
      present,
      present ? 'finns' : `SAKNAS — behövs i Fas ${fn.phase}`
    );
  }

  // V9 feature-flag intakt (regression-check)
  const flagIntact = parityJs.includes('v9-enabled') || parityJs.includes('data-v9-enabled');
  check('V9 feature-flag intakt', flagIntact, flagIntact ? 'kvar' : 'BORTTAGEN — regression!');

  const zonesFnMatch = parityJs.match(/function renderV11DossierZonesHtml\([\s\S]*?\n {2}\}/);
  const zonesFnBody = zonesFnMatch ? zonesFnMatch[0] : '';
  const noContextInDefault =
    zonesFnBody.length > 0 && !zonesFnBody.includes('renderV11ContextPanels');
  check(
    'v11-default utan context panels (journey/bokningar)',
    noContextInDefault,
    noContextInDefault
      ? 'renderV11ContextPanels ej i renderV11DossierZonesHtml'
      : 'renderV11ContextPanels kvar i default-zoner — bryter locked spec'
  );

  const zoneOrderOk =
    zonesFnBody.includes('renderV11DocumentSegments') &&
    zonesFnBody.includes('renderV11InsightsStrip') &&
    zonesFnBody.indexOf('renderV11DocumentSegments') <
      zonesFnBody.indexOf('renderV11InsightsStrip');
  check(
    'v11-zonordning dokument före insikter',
    zoneOrderOk,
    zoneOrderOk ? 'dokument → insikter' : 'fel ordning i renderV11DossierZonesHtml'
  );

  const cutoverRoute =
    parityJs.includes('usesV11DossierCutover()') &&
    /if \(usesV11DossierCutover\(\)\)/.test(parityJs);
  check(
    'v11-cutover routar intelligent bubbles → dossier-zoner',
    cutoverRoute,
    cutoverRoute
      ? 'parity cutover-gren finns'
      : 'saknar cutover-gren i renderIntelligentJourneyBubblesHtml'
  );

  const activeVisitFn = parityJs.includes('function renderV11ActiveVisit(');
  check(
    'Render-fn renderV11ActiveVisit (ORD-25E Fas 2)',
    activeVisitFn,
    activeVisitFn ? 'finns' : 'SAKNAS'
  );

  const zonesWithActive = /renderV11ActiveVisit\(dossierBundle/.test(parityJs);
  check(
    'Aktivt besök före dokument i v11-zoner',
    zonesWithActive,
    zonesWithActive ? 'mount ordning OK' : 'renderV11ActiveVisit saknas i renderV11DossierZonesHtml'
  );

  const selfHide = parityJs.includes('visit.visible !== true');
  check(
    'Aktivt besök self-hide (visible=false)',
    selfHide,
    selfHide ? 'resolveActiveVisitPayload' : 'saknar visible-gate'
  );

  const noFakeStates =
    !parityJs.includes("state: 'in_progress'") && !parityJs.includes('checked_in');
  check(
    'Ingen fejkad in_progress/checked_in i UI',
    noFakeStates,
    noFakeStates ? 'rent' : 'hårdkodad encounter-state i parity.js'
  );
}

// ─────────────────────────────────────────────────────────────
// Cutover: patient-master-ui routing
// ─────────────────────────────────────────────────────────────

const patientUiJs = readFileSafe(PATIENT_UI_JS);
if (!patientUiJs) {
  check('patient-master-ui läsbar', false, `Hittade inte ${PATIENT_UI_JS}`);
} else {
  check('patient-master-ui läsbar', true, `${patientUiJs.length} bytes`);

  const cutoverEnabled =
    patientUiJs.includes('function usesV11DossierCutover()') &&
    patientUiJs.includes('__ARCANA_V11_KUNDKORT') &&
    (patientUiJs.includes('isV9CustomersEnabled()') ||
      patientUiJs.includes('return isV9CustomersEnabled()'));
  check(
    'usesV11DossierCutover() aktiv (ej hårdkodad false)',
    cutoverEnabled,
    cutoverEnabled ? 'v9 → v11 default' : 'cutover fortfarande av'
  );

  const referensGated =
    patientUiJs.includes('v10Facit && !v11Cutover') && patientUiJs.includes('renderV11Hero');
  check(
    'referens/v10 default av när v11-cutover',
    referensGated,
    referensGated
      ? 'v10Facit && !v11Cutover + renderV11Hero'
      : 'saknar cutover-routing i renderV9MockupDetailShell'
  );
}

// ─────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────

console.log('');
console.log(`${ANSI.bold}v11-paritet check${ANSI.reset} ${ANSI.dim}(ORD-25 UAT)${ANSI.reset}`);
console.log('');

for (const r of results) {
  const tag = r.ok ? `${ANSI.green}PASS${ANSI.reset}` : `${ANSI.red}FAIL${ANSI.reset}`;
  const detail = r.detail ? ` ${ANSI.dim}— ${r.detail}${ANSI.reset}` : '';
  console.log(`  [${tag}] ${r.label}${detail}`);
}

console.log('');
const total = passCount + failCount;
const pct = total > 0 ? Math.round((passCount / total) * 100) : 0;
if (failCount === 0) {
  console.log(`${ANSI.green}${ANSI.bold}ALLA ${total} CHECKS PASS (${pct}%)${ANSI.reset}`);
  process.exit(0);
} else {
  console.log(
    `${ANSI.red}${ANSI.bold}${failCount} av ${total} FAIL${ANSI.reset} ${ANSI.dim}(${passCount} PASS, ${pct}%)${ANSI.reset}`
  );
  process.exit(1);
}
