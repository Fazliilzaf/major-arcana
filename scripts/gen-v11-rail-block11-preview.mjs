/**
 * V11-RAIL Fas 3 · Block 11 — … + I History (KEEP) viewport-preview (browserlös).
 * Renderar de RIKTIGA komponenterna i tre iframes (390 / 820 / 1440).
 * Journey- och booking/history-logiken stubbas deterministiskt; adapterns
 * mappning och I:s historiklista (tidigare besök) körs på riktigt.
 *
 * För raster-PNG: npm run shots:v11rail:block11 (kräver chromium).
 * Kör: node ./scripts/gen-v11-rail-block11-preview.mjs
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
// Deterministiska stubbar (kanoniska 9 steg + booking/history-lagret).
global.window.CcoKundkortKkx = {
  buildCanonicalJourneyLive: function () {
    return {
      activeStep: 5,
      nextLabel: 'Offert + behandlingsplan',
      steps: [
        { step: 1, label: 'Bokning konsultation', status: 'done', meta: '' },
        { step: 2, label: 'Bokningsbekräftelse-mail', status: 'done', meta: '' },
        { step: 3, label: 'Hälsodeklaration', status: 'done', meta: 'Signerad' },
        { step: 4, label: 'Konsultation', status: 'done', meta: '' },
        { step: 5, label: 'Offert + behandlingsplan', status: 'active', meta: '' },
        { step: 6, label: 'Betänketid 2 dagar', status: 'future', meta: '' },
        { step: 7, label: 'Avtal + behandlingssamtycke', status: 'future', meta: '' },
        { step: 8, label: 'Friskförsäkran', status: 'future', meta: '' },
        { step: 9, label: 'Foto-samtycke', status: 'future', meta: '' },
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

const css = readFileSync(join(root, 'public/major-arcana-preview/cco-v11-rail.css'), 'utf8');

const bcard = {
  patientId: 'p-1001',
  displayName: 'Anna Karlsson',
  primaryPhone: '070-123 45 67',
  primaryEmail: 'anna.karlsson@example.se',
  vip: true,
  treatmentTypes: ['PRP-hår', 'Botox'],
  contact: { address: { street: 'Storgatan 1', zip: '111 22', city: 'Stockholm' } },
  visits: 7,
  lifetimeValue: 48000,
  outstandingBalance: '1 200 kr',
  healthDeclaration: { signedAt: '2026-05-10', source: 'halso@m365' },
  allergies: ['Penicillin', 'Lidokain'],
};
const card = Object.assign({}, bcard, {
  readyForTreatment: true,
  upcomingBookings: [
    {
      iso: '2026-06-25T09:30:00Z',
      title: 'PRP-behandling',
      sub: 'Hårbotten · Fazli',
      area: 'Hårbotten',
      state: 'ready',
      stateLabel: '✓ Redo',
    },
  ],
  bookingHistory: [
    {
      iso: '2026-05-12T10:00:00Z',
      title: 'PRP-behandling',
      sub: 'Hårbotten · Fazli',
      area: 'Hårbotten',
      state: 'done',
      stateLabel: 'Klar',
    },
    {
      iso: '2026-04-02T13:30:00Z',
      title: 'Konsultation',
      sub: 'PRP-hår · Egzona',
      area: 'PRP-hår',
      state: 'done',
      stateLabel: 'Klar',
    },
    {
      iso: '2026-02-18T09:00:00Z',
      title: 'Första besök',
      sub: 'Bedömning · Fazli',
      area: 'Bedömning',
      state: 'done',
      stateLabel: 'Klar',
    },
  ],
  automationSignals: [
    {
      ruleId: 'customer.missing_agreement_consent_bundle',
      status: 'active',
      what: 'Avtal + samtycke saknas',
      why: 'Steg 7 — samma transaktion.',
      risk: 'legal_blocker',
    },
  ],
});
const dossierBundle = {
  activeVisit: {
    visible: true,
    state: 'in_progress',
    serviceLabel: 'PRP-behandling',
    practitionerLabel: 'Dr. Lind',
    checkedInAt: '2026-06-21T09:10:00Z',
    startedAt: '2026-06-21T09:25:00Z',
    journalStarted: true,
    blockers: [{ code: 'photo_consent', label: 'Foto-samtycke ej signerat' }],
    photoCaptureAvailable: true,
    notesAvailable: true,
  },
};
const inner = global.window.CcoV11Rail.render({ bcard, card, dossierBundle });

const railMax =
  '.v11-rail{width:100%;margin:0 auto}@media(min-width:1024px){.v11-rail{max-width:424px}}';
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

function frameDoc(width) {
  const doc =
    '<!doctype html><html lang="sv" data-v9-enabled="on" data-v11-rail="on"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=' +
    width +
    '"><style>body{margin:0;background:#efe7df;font-family:' +
    font +
    '}' +
    css +
    railMax +
    '</style></head><body>' +
    '<section class="patient-master-card v11-rail" data-v11-rail-shell="1">' +
    '<div class="v11-rail__scroll">' +
    inner +
    '</div></section></body></html>';
  return doc.replace(/"/g, '&quot;');
}

const vps = [
  ['mobile 390×844', 390, 844],
  ['tablet 820×1180', 820, 1180],
  ['desktop 1440×1000 (rail 424px)', 1440, 1000],
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
  '<title>V11 Rail · Block 11 · I History (KEEP) — viewport-preview</title>' +
  '<style>body{margin:0;padding:24px;background:#222;color:#eee;font-family:' +
  font +
  '}h1{font-size:16px}p{color:#bbb;font-size:13px;max-width:72ch}' +
  '.row{display:flex;gap:24px;align-items:flex-start;overflow:auto;padding-bottom:16px}' +
  'figure{margin:0}figcaption{font-size:12px;color:#ccc;margin-bottom:6px}' +
  'iframe{border:1px solid #444;background:#efe7df;max-width:none}code{color:#e8c07d}</style></head><body>' +
  '<h1>V11 Rail · Fas 3 · Block 11 — I History (KEEP)</h1>' +
  '<p>Riktiga komponenterna i tre iframes (ordning D → A → V → B → C → E → F → G → H → I → S). I = tidigare ' +
  'besök ovanpå befintlig historik-logik: varje rad bär data-v9-section-link=&quot;historik&quot; (öppnar ' +
  'tidslinjen) — befintlig handler, ingen ny, historik-workflow bevaras. ' +
  'Raster-PNG: <code>npm run shots:v11rail:block11</code>.</p>' +
  '<div class="row">' +
  frames +
  '</div></body></html>';

const outDir = join(root, 'docs/handover/MOCKUPS/v11-rail-block11-I-history');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'viewport-preview.html');
writeFileSync(out, page);
console.log('wrote ' + out + ' (' + page.length + ' bytes), 3 frames @ 390/820/1440');
