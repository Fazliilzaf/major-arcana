/**
 * V11-RAIL Fas 3 · SLUTPASS — helhets-render av HELA V11 Rail (browserlös).
 * Renderar de RIKTIGA komponenterna i tre iframes (390 / 820 / 1440) med data
 * för alla sektioner D → A → V → B → C → E → F → G → H → I → J → K → L → M → N →
 * O → P → Q → R → S. Cutover-granskning / beslutsunderlag.
 *
 * För raster-PNG: npm run shots:v11rail:full (kräver chromium).
 * Kör: node ./scripts/gen-v11-rail-full-preview.mjs
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

function thumb(label, c1, c2) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' +
    c1 +
    '"/><stop offset="1" stop-color="' +
    c2 +
    '"/></linearGradient></defs>' +
    '<rect width="160" height="160" fill="url(#g)"/>' +
    '<text x="80" y="88" font-size="18" fill="#fff" text-anchor="middle" ' +
    'font-family="sans-serif" font-weight="700">' +
    label +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

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
  visitCount: 7,
  lifetimeValue: 48000,
  outstandingBalance: '1 200 kr',
  healthDeclaration: { signedAt: '2026-05-10', source: 'halso@m365' },
  allergies: ['Penicillin', 'Lidokain'],
};
const card = Object.assign({}, bcard, {
  readyForTreatment: true,
  importantNote: 'Föredrar förmiddagstider. Ring inte före kl 10.',
  upcomingBookings: [
    {
      iso: '2026-06-25T09:30:00Z',
      title: 'PRP-behandling',
      sub: 'Hårbotten · Fazli',
      area: 'Hårbotten',
      state: 'ready',
      stateLabel: '✓ Redo',
    },
    {
      iso: '2026-07-09T13:00:00Z',
      title: 'Uppföljning',
      sub: 'PRP-hår · Egzona',
      area: 'PRP-hår',
      state: 'warn',
      stateLabel: 'Planerad',
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
  ],
  automationSignals: [
    {
      ruleId: 'customer.missing_agreement_consent_bundle',
      status: 'active',
      what: 'Avtal + samtycke saknas',
      why: 'Steg 7 — krävs före behandling, samma transaktion.',
      risk: 'legal_blocker',
    },
    {
      ruleId: 'customer.retention_followup',
      status: 'active',
      what: 'Hög lojalitet — 7 besök',
      why: 'Återkommer regelbundet; föreslå PRP-underhåll var 3:e månad.',
      risk: 'needs_review',
    },
  ],
});
const journalEntries = [
  {
    title: 'PRP-behandling',
    journalType: 'tp_treatment',
    summary: 'Tredje PRP-sessionen. Patienten tolererade behandlingen väl.',
    authorName: 'Dr. Lind',
    signedAt: '2026-05-12T11:30:00Z',
    locked: true,
  },
  {
    title: 'Uppföljningsanteckning',
    journalType: 'follow',
    summary: 'Utkast — väntar på komplettering efter nästa besök.',
    authorName: 'Egzona',
    updatedAt: '2026-06-18T09:15:00Z',
    status: 'draft',
  },
];
const driveFiles = [
  {
    id: 'f1',
    fileType: 'image',
    viewUrl: thumb('FÖRE', '#7a5a32', '#b9842f'),
    originalFileName: '2026-05-12 · före · hårlinje.jpg',
  },
  {
    id: 'f2',
    fileType: 'image',
    viewUrl: thumb('EFTER', '#3c6b4a', '#6fae74'),
    originalFileName: '2026-05-12 · efter · hårlinje.jpg',
  },
  { id: 'f3', mimeType: 'video/mp4', originalFileName: 'PRP-session · film.mp4' },
  { id: 'd1', fileType: 'journal_pdf', originalFileName: 'Journalutskrift PRP.pdf' },
  { id: 'd2', ccoNative: true, originalFileName: 'Behandlingsavtal.pdf' },
  { id: 'd3', originalFileName: 'Remiss · hudläkare.docx' },
];
const occasionTimeline = [
  {
    kind: 'mail',
    title: 'Bokningsbekräftelse skickad',
    detail: { subject: 'Din tid 25 juni 09:30' },
    occurredAt: '2026-06-18',
  },
  {
    kind: 'sms',
    title: 'Påminnelse-SMS',
    summary: 'Skickat 2 dagar före besök',
    occurredAt: '2026-06-23',
  },
  {
    kind: 'call',
    title: 'Inkommande samtal',
    summary: 'Frågor om eftervård · 4 min',
    occurredAt: '2026-05-13',
  },
];
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
  allergies: [
    { name: 'Penicillin', severity: 'svår', source: 'Hälsodeklaration 2026-05-10' },
    { name: 'Lidokain', severity: 'mild', source: 'Konsult' },
  ],
  recentEvents: [
    { kind: 'note', subject: 'Kund ringde om ombokning — löst, ny tid 25 juni.', at: '2026-06-18' },
  ],
  documents: {
    offers: [
      {
        registryId: 'offert_prp_har',
        title: 'PRP-hår · 3 sessioner',
        amount: '14 400 kr',
        status: 'sent',
        journeyStep: 5,
      },
      {
        registryId: 'offert_botox',
        title: 'Botox · panna',
        amount: '3 200 kr',
        status: 'signed',
        journeyStep: 5,
      },
    ],
    autoDocs: [
      {
        registryId: 'auto_bekraftelse_mail',
        title: 'Bokningsbekräftelse',
        filler: 'auto',
        status: 'sent',
        journeyStep: 2,
      },
      {
        registryId: 'auto_eftervardsblad',
        title: 'Eftervårdsblad PRP',
        filler: 'auto',
        status: 'planned',
        journeyStep: 8,
      },
    ],
  },
};
const inner = global.window.CcoV11Rail.render({
  bcard,
  card,
  dossierBundle,
  journalEntries,
  driveFiles,
  occasionTimeline,
});

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
  '<title>V11 Rail · SLUTPASS · hela railen — viewport-preview</title>' +
  '<style>body{margin:0;padding:24px;background:#222;color:#eee;font-family:' +
  font +
  '}h1{font-size:16px}p{color:#bbb;font-size:13px;max-width:78ch}' +
  '.row{display:flex;gap:24px;align-items:flex-start;overflow:auto;padding-bottom:16px}' +
  'figure{margin:0}figcaption{font-size:12px;color:#ccc;margin-bottom:6px}' +
  'iframe{border:1px solid #444;background:#efe7df;max-width:none}code{color:#e8c07d}</style></head><body>' +
  '<h1>V11 Rail · SLUTPASS — hela railen i ett svep (alla sektioner)</h1>' +
  '<p>Riktiga komponenterna i tre iframes. Ordning D → A → V → B → C → E → F → G → H → I → J → K → L → M → N → O → P → Q → R → S. ' +
  'Cutover-granskning / beslutsunderlag. Raster-PNG: <code>npm run shots:v11rail:full</code>.</p>' +
  '<div class="row">' +
  frames +
  '</div></body></html>';

const outDir = join(root, 'docs/handover/MOCKUPS/v11-rail-full');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'viewport-preview.html');
writeFileSync(out, page);
console.log('wrote ' + out + ' (' + page.length + ' bytes), 3 frames @ 390/820/1440');
