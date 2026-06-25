/**
 * V12 Customer Workspace · Block 2 — browserlös render av Aktivt besök-modulen
 * (+ Journal) i två-zon-shellen (Zon 1 = V11-rail, Zon 2 = V12-arbetsyta) i tre
 * iframes (390 / 820 / 1440). Beslutsunderlag / screenshot-referens.
 *
 * För raster-PNG: npm run shots:v12workspace:activevisit (kräver chromium).
 * Kör: node ./scripts/gen-v12-workspace-active-visit-preview.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

global.window = {};
require(join(root, 'public/major-arcana-preview/app/cco-kunder-smart-next-step.js'));
global.window.CcoKunderSmartNextStep =
  globalThis.CcoKunderSmartNextStep || global.CcoKunderSmartNextStep;

global.window.CcoKundkortKkx = {
  buildCanonicalJourneyLive: function () {
    return { activeStep: 5, nextLabel: 'Offert + behandlingsplan', steps: [] };
  },
  resolveReferensBookingExtras: function (card) {
    const up = (card && card.upcomingBookings) || [];
    const hist = (card && card.bookingHistory) || [];
    return {
      upcomingBookings: up,
      upcomingBookingCount: up.length,
      historyBookings: hist,
      historyBookingCount: hist.length,
    };
  },
};
require(join(root, 'public/major-arcana-preview/app/cco-v11-rail-adapters.js'));
require(join(root, 'public/major-arcana-preview/app/cco-v11-rail.js'));
require(join(root, 'public/major-arcana-preview/app/cco-v12-workspace-adapters.js'));
require(join(root, 'public/major-arcana-preview/app/cco-v12-workspace.js'));

const cssRail = readFileSync(join(root, 'public/major-arcana-preview/cco-v11-rail.css'), 'utf8');
const cssWs = readFileSync(join(root, 'public/major-arcana-preview/cco-v12-workspace.css'), 'utf8');

const bcard = {
  patientId: 'p-1001',
  displayName: 'Anna Karlsson',
  primaryPhone: '070-123 45 67',
  primaryEmail: 'anna.karlsson@example.se',
  vip: true,
  treatmentTypes: ['PRP-hår', 'Botox'],
  contact: { address: { street: 'Storgatan 1', zip: '111 22', city: 'Stockholm' } },
  visits: 7,
  visitCount: 7,
  lifetimeValue: 48000,
  outstandingBalance: '1 200 kr',
  healthDeclaration: { signedAt: '2026-05-10', source: 'halso@m365' },
  allergies: ['Penicillin', 'Lidokain'],
};
const card = Object.assign({}, bcard, { readyForTreatment: true });

// Aktivt besök — pågående, med blockerare (testar hela hero-modulen).
const dossierBundle = {
  activeVisit: {
    visible: true,
    state: 'in_progress',
    serviceLabel: 'PRP-behandling',
    practitionerLabel: 'Dr. Lind',
    checkedInAt: '2026-06-22T09:10:00Z',
    startedAt: '2026-06-22T09:25:00Z',
    journalStarted: true,
    blockers: [{ code: 'photo_consent', label: 'Foto-samtycke ej signerat' }],
    photoCaptureAvailable: true,
    notesAvailable: true,
  },
};

const journalEntries = [
  {
    title: 'PRP-behandling · session 3',
    journalType: 'tp_treatment',
    clinicalSummary: 'Tredje PRP-sessionen i hårbotten. Patienten tolererade behandlingen väl.',
    authorName: 'Dr. Lind',
    signedByName: 'Dr. Lind',
    signedAt: '2026-05-12T11:30:00Z',
    locked: true,
  },
];

const railCtx = { bcard, card, journalEntries, dossierBundle };
const railInner = global.window.CcoV11Rail.render(railCtx) || '';
const wsInner = global.window.CcoV12Workspace.render({ dossierBundle, journalEntries }) || '';

const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function frameDoc(width) {
  const shell =
    '<section class="patient-master-card v12-workspace" data-v12-workspace-shell="1">' +
    '<div class="v12-workspace__zones">' +
    '<div class="v12-workspace__zone1"><div class="v11-rail"><div class="v11-rail__scroll">' +
    railInner +
    '</div></div></div>' +
    '<div class="v12-workspace__zone2">' +
    wsInner +
    '</div></div></section>';
  const doc =
    '<!doctype html><html lang="sv" data-v9-enabled="on" data-v11-rail="on" data-v12-workspace="on"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=' +
    width +
    '"><style>body{margin:0;padding:12px;background:#efe7df;font-family:' +
    font +
    '}' +
    cssRail +
    cssWs +
    '</style></head><body>' +
    shell +
    '</body></html>';
  return doc.replace(/"/g, '&quot;');
}

const vps = [
  ['mobil 390×844 (V12 äger ytan, Zon 1 dold)', 390, 844],
  ['iPad 820×1180 (Zon 1 + Zon 2)', 820, 1180],
  ['webb 1440×1000 (Zon 1 + Zon 2)', 1440, 1000],
];

const frames = vps
  .map(
    ([label, w, h]) =>
      '<figure><figcaption>' +
      label +
      '</figcaption><iframe width="' +
      w +
      '" height="' +
      h +
      '" srcdoc="' +
      frameDoc(w) +
      '" title="' +
      label +
      '"></iframe></figure>'
  )
  .join('\n');

const page =
  '<!doctype html><html lang="sv"><head><meta charset="UTF-8">' +
  '<title>V12 Customer Workspace · Aktivt besök — viewport-preview</title>' +
  '<style>body{margin:0;padding:24px;background:#222;color:#eee;font-family:' +
  font +
  '}h1{font-size:16px}p{color:#bbb;font-size:13px;max-width:78ch}' +
  '.row{display:flex;gap:24px;align-items:flex-start;overflow:auto;padding-bottom:16px}' +
  'figure{margin:0}figcaption{font-size:12px;color:#ccc;margin-bottom:6px}' +
  'iframe{border:1px solid #444;background:#efe7df;max-width:none}code{color:#e8c07d}</style></head><body>' +
  '<h1>V12 Customer Workspace · Block 2 — Aktivt besök (hero) + Journal</h1>' +
  '<p>Browserlös render bakom <code>?v12workspace=on</code>. Aktivt besök återanvänder ' +
  'V11-adaptern + befintliga <code>data-v11-active-visit-action</code>-handlers. ' +
  'Raster-PNG: <code>npm run shots:v12workspace:activevisit</code>.</p>' +
  '<div class="row">' +
  frames +
  '</div></body></html>';

const outDir = join(root, 'docs/handover/MOCKUPS/v12-workspace-active-visit');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'viewport-preview.html');
writeFileSync(out, page);
console.log('wrote ' + out + ' (' + page.length + ' bytes), 3 frames @ 390/820/1440');
