/**
 * V12 Customer Workspace · Block 8 — browserlös render av Kundresa / steg-modulen
 * i två-zon-shellen i tre iframes (390 / 820 / 1440).
 *
 * För raster-PNG: npm run shots:v12workspace:journey-steps (kräver chromium).
 * Kör: node ./scripts/gen-v12-workspace-journey-preview.mjs
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
    return {
      activeStep: 4,
      nextLabel: 'Offert + behandlingsplan',
      steps: [
        { step: 1, label: 'Första kontakt', meta: 'Inkommande förfrågan', status: 'done' },
        { step: 2, label: 'Konsultation', meta: 'Genomförd 2026-06-18', status: 'done' },
        { step: 3, label: 'Hälsodeklaration', meta: 'Signerad', status: 'done' },
        { step: 4, label: 'Offert + behandlingsplan', meta: 'Pågår', status: 'active' },
        { step: 5, label: 'Bokning + bekräftelse', meta: 'Kommande', status: 'todo' },
        { step: 6, label: 'Behandling', meta: 'Kommande', status: 'todo' },
        { step: 7, label: 'Uppföljning', meta: 'Kommande', status: 'todo' },
      ],
    };
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
  visits: 7,
  lifetimeValue: 48000,
};
const card = Object.assign({}, bcard, { readyForTreatment: true });

const journalEntries = [
  {
    title: 'Konsultation',
    journalType: 'consult',
    note: 'Inledande konsultation.',
    authorName: 'Dr. Lind',
    updatedAt: '2026-06-18T09:15:00Z',
  },
];

const railCtx = { bcard, card, journalEntries, dossierBundle: null };
const railInner = global.window.CcoV11Rail.render(railCtx) || '';
const wsInner =
  global.window.CcoV12Workspace.render({ card, bcard, journalEntries, dossierBundle: null }) || '';

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
  '<title>V12 Customer Workspace · Kundresa / steg — viewport-preview</title>' +
  '<style>body{margin:0;padding:24px;background:#222;color:#eee;font-family:' +
  font +
  '}h1{font-size:16px}p{color:#bbb;font-size:13px;max-width:78ch}' +
  '.row{display:flex;gap:24px;align-items:flex-start;overflow:auto;padding-bottom:16px}' +
  'figure{margin:0}figcaption{font-size:12px;color:#ccc;margin-bottom:6px}' +
  'iframe{border:1px solid #444;background:#efe7df;max-width:none}code{color:#e8c07d}</style></head><body>' +
  '<h1>V12 Customer Workspace · Block 8 — Kundresa / steg (sektion 5)</h1>' +
  '<p>Browserlös render bakom <code>?v12workspace=on</code>. Återanvänder V11-adaptern ' +
  'buildJourneyFromState (samma CcoKundkortKkx.buildCanonicalJourneyLive som legacy) + ' +
  'befintliga deep-link-attribut (<code>data-kk-jump</code> / <code>data-kk-med-form</code>), ' +
  'ingen ny handler. Saknad journey → explicit empty-state. ' +
  'Raster-PNG: <code>npm run shots:v12workspace:journey-steps</code>.</p>' +
  '<div class="row">' +
  frames +
  '</div></body></html>';

const outDir = join(root, 'docs/handover/MOCKUPS/v12-workspace-journey-steps');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'viewport-preview.html');
writeFileSync(out, page);
console.log('wrote ' + out + ' (' + page.length + ' bytes), 3 frames @ 390/820/1440');
