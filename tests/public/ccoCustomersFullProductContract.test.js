'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const PATIENT_UI = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js');
const V11_RK = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v11-rk.js');
const V10_SKIN = path.join(ROOT, 'public', 'major-arcana-preview', 'cco-v10-skin.css');
const SUBNAV = path.join(ROOT, 'public', 'admin', 'cco-subnav.js');

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const ui = fs.readFileSync(PATIENT_UI, 'utf8');
const v11 = fs.readFileSync(V11_RK, 'utf8');
const v10Skin = fs.readFileSync(V10_SKIN, 'utf8');
const subnav = fs.readFileSync(SUBNAV, 'utf8');

test('admin#cco Kunder monterar hela skarpa kundprodukten', () => {
  assert.match(subnav, /CUSTOMER_FLAGS = 'v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on'/);
  assert.doesNotMatch(subnav, /demoOpDay|demo=on/);
  assert.match(html, /data-shell-view="customers"/);
  assert.match(html, /data-customer-list/);
  assert.match(html, /data-patient-master-rail/);
});

test('hela kundpopulationen använder patient-master med fortsatt paginering', () => {
  assert.match(ui, /const PAGE_SIZE = 60/);
  assert.match(ui, /initialParams\.set\('phase', 'list'\)/);
  assert.match(ui, /runtime\.offset \+= PAGE_SIZE/);
  assert.match(ui, /data-patient-load-more/);
  assert.match(ui, /runtime\.total/);
});

test('Kunder visar och återanvänder den befintliga V9-sökningen', () => {
  assert.match(html, /data-v9-global-search-input/);
  assert.match(
    ui,
    /bindCustomerSearchInput\(document\.querySelector\('\[data-v9-global-search-input\]'\)\)/
  );
  assert.match(ui, /params\.set\('q', runtime\.query\)/);
  assert.doesNotMatch(
    v10Skin,
    /\.customers-v9-header \.v9-global-search\s*\{[^}]*display:\s*none/s
  );
});

test('kundrad öppnar V11-dossier och V11-sektion öppnar V12 Content Canon', () => {
  assert.match(ui, /window\.CcoV11RailKomplett\.render\(railCtx\)/);
  assert.match(ui, /data-v11-rail-shell="1"/);
  assert.match(ui, /bindV12WorkspaceRailLauncher\(root, ctx\)/);
  assert.match(ui, /openV12WorkspaceFromRail\(root, ctx, moduleName\)/);
  assert.match(ui, /window\.CcoV12Canon\.render\(ctx\)/);
  assert.match(ui, /data-v12-workspace-shell="1"/);
  assert.match(ui, /data-customer-product-loading="v11"/);
});

test('sena V11/V12-renderare ersätter laddningsläget utan legacy-fallback', () => {
  const adaptersIndex = html.indexOf('src="./app/cco-v11-rail-adapters.js');
  const railIndex = html.indexOf('src="./app/cco-v11-rk.js');
  const canonIndex = html.indexOf('src="./app/cco-v12-canon.js');

  assert.ok(adaptersIndex !== -1 && adaptersIndex < railIndex);
  assert.ok(railIndex < canonIndex);
  assert.match(html, /arcana:customer-product-renderers-ready/);
  assert.match(ui, /addEventListener\('arcana:customer-product-renderers-ready'/);
  assert.match(ui, /refreshFullCustomerProductWhenReady/);
  assert.doesNotMatch(ui, /Scaffold aktiv \(\?v11rail=on\)/);
});

test('patientId-djuplänk bevarar admin-, V11- och V12-kontraktet', () => {
  assert.match(ui, /url\.searchParams\.set\('view', 'customers'\)/);
  assert.match(ui, /\['v9', 'demo', 'embed', 'v11rail', 'v12workspace', 'flags', 'segment'\]/);
  assert.match(ui, /url\.searchParams\.set\('patientId', patientId\)/);
  assert.match(ui, /syncSelectedPatientDeepLink\(key\)/);
  assert.match(ui, /ccoCustomerPatient: id/);
  assert.match(ui, /rail\.querySelector\('\[data-v11-rail-shell="1"\]'\)/);
  assert.match(ui, /rail\.querySelector\('\[data-v12-workspace-shell="1"\]'\)/);
});

test('enriched customers-shell uppdaterar V11/V12-rail för vald kund', () => {
  assert.match(ui, /function refreshSelectedCustomerRailFromShell\(\)/);
  assert.match(ui, /renderDetailPanel\(\{ preserveRailScroll: true \}\)/);
  assert.match(ui, /reconcileSelectedPatientWithFilteredList\(\)/);
  assert.match(ui, /isPatientExcludedFromActiveFilter\(deepLinkId\)/);
  assert.match(ui, /function reconcileSelectedPatientWithFilteredList\(/);
  assert.match(ui, /function isPatientExcludedFromActiveFilter\(/);
  assert.match(ui, /function clearSelectedPatientForFilterMismatch\(/);
  assert.match(ui, /closeV12WorkspaceOverlayIfOpen\(\)/);
  assert.match(ui, /Kunden finns inte i aktuellt urval/);
  assert.match(ui, /Djuplänkad kund finns inte i aktuellt urval/);
});

test('V12 Content Canon snabbknappar använder tel/sms/mailto och ord48-kalender', () => {
  const canonPath = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js');
  const canon = fs.readFileSync(canonPath, 'utf8');
  assert.match(canon, /function s1QuickActions\(card\)/);
  assert.match(canon, /href="tel:/);
  assert.match(canon, /href="sms:/);
  assert.match(canon, /href="mailto:/);
  assert.match(canon, /data-kk-ord48-open-calendar data-patient-id="/);
  assert.match(ui, /data-kk-ord48-open-calendar/);
});

test('V12 canon-actions använder befintliga handlers och saknar tomma kontrollknappar', () => {
  const canon = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js'),
    'utf8'
  );
  assert.match(canon, /data-v12-visit-journal/);
  assert.match(canon, /data-v11-active-visit-action="photo"/);
  assert.match(canon, /data-v12-compare-photos/);
  assert.match(canon, /data-kk-ord48-open-calendar/);
  assert.match(canon, /data-v12-doc-add=/);
  assert.match(canon, /data-v12-doc-input=/);
  assert.match(canon, /data-v12-fortnox-sync/);
  assert.match(canon, /href="mailto:/);
  assert.doesNotMatch(canon, /<button class="sec-link">\+ Svara/);
  assert.doesNotMatch(canon, /<button class="warn-action">Påminn senare/);
  assert.match(ui, /const activeVisitAction = event\.target\.closest/);
  assert.match(ui, /const comparePhotos = event\.target\.closest/);
});

test('V12 visar okänd hälsodata ärligt och inte som NEJ', () => {
  const canon = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js'),
    'utf8'
  );
  assert.match(canon, /chip\('neutral', 'Ej registrerat'\)/);
  assert.doesNotMatch(canon, /chip\('ok', 'NEJ'\)/);
});

test('V12 använder befintliga sektioner som dragspel och jump öppnar rätt sektion', () => {
  const canonPath = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js');
  const canon = fs.readFileSync(canonPath, 'utf8');
  const canonCss = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'cco-v12-canon.css'),
    'utf8'
  );
  assert.match(ui, /function setupV12CanonAccordion\(body\)/);
  assert.match(ui, /function expandV12CanonSection\(scope, targetSection\)/);
  assert.match(ui, /data-v12-section-toggle/);
  assert.match(ui, /expandV12CanonSection\(scope, module\)/);
  assert.match(canonCss, /data-v12-collapsed="true"/);
  assert.doesNotMatch(canon, /v12-canon-visit-segment" open/);
});

test('V12 visar befintliga visit-segments med bilder och dokument per tillfälle', () => {
  const canonPath = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js');
  const canon = fs.readFileSync(canonPath, 'utf8');
  assert.match(ui, /visitSegments: asArray\(runtime\.detail\?\.visitSegments\)/);
  assert.match(canon, /function visitSegmentsBlock\(visitSegments, patientId\)/);
  assert.match(canon, /data-v12-visit-segments="1"/);
  assert.match(canon, /data-patient-file-id=/);
  assert.match(canon, /data-v12-photo-edit/);
  assert.match(canon, /data-encounter-id=/);
  assert.match(
    canon,
    /function s7\(photos, visitSegments, patientId\)[\s\S]*data-patient-file-id=/
  );
  assert.match(canon, /function s7\(photos, visitSegments, patientId\)/);
  assert.match(canon, /Foto- och besöksdokumentation/);
  assert.match(canon, /function s8\(bundle, patientId\)/);
  assert.match(canon, /'Besök · tillfällen'/);
  assert.match(canon, /b\.durationLabel \|\| b\.duration/);
  assert.match(canon, /bookingMeta\.join\(' · '\)/);
  assert.doesNotMatch(canon, /function s8\(bundle, visitSegments/);
  assert.doesNotMatch(canon, /fotoDok\(photos\) \+/);
  assert.doesNotMatch(canon, /uppfoljning\(insights\) \+/);
  assert.doesNotMatch(canon, /histSection\(bundle\) \+/);
  assert.match(v11, /data-v11-photo-edit/);
  assert.match(v11, /label\('Besök · tillfällen'\)/);
  assert.match(v11, /bundle && bundle\.historyBookings/);
  assert.match(v11, /data-patient-file-id=/);
  assert.match(v11, /__ccoHydratePatientFileImages/);
  assert.match(ui, /window\.__ccoHydratePatientFileImages/);
  assert.match(ui, /const encounterId = o\.encounterId/);
  assert.match(ui, /encounterId,\n\s+documentDate: docDate/);
});

test('V11/V12 visar journal och film inom samma besökstillfälle', () => {
  const visits = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-kundkort-visit-segments.js'),
    'utf8'
  );
  const canon = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js'),
    'utf8'
  );

  assert.match(visits, /segment\.videos/);
  assert.match(visits, /segment\.journals/);
  assert.match(visits, /Starta journal/);
  assert.match(canon, /data-v12-visit-journal/);
  assert.match(canon, /v12-canon-visit-video/);
  assert.match(canon, /video controls preload="metadata" data-patient-file-id/);
  assert.match(
    ui,
    /function renderV12WorkspaceDetailShell[\s\S]*?visitSegments: asArray\(runtime\.detail\?\.visitSegments\)/
  );
  assert.match(ui, /video\[data-patient-file-id\]/);
  assert.match(canon, /data-journal-photo-id/);
  assert.match(ui, /Journal öppnad för valt besök/);
  assert.match(canon, /data-v12-visit-document/);
  assert.match(canon, /data-v12-visit-video/);
  assert.match(ui, /formData\.append\('encounterId', encounterId\)/);
  assert.match(ui, /cco-journal-quick\/visit-media/);
  assert.match(ui, /durationSeconds/);
  assert.match(canon, /data-v12-archive-asset/);
  assert.match(ui, /Filen är arkiverad\. Den fysiska filen är bevarad/);
  assert.match(ui, /runtime\.pendingVisitEncounterId/);
  assert.match(canon, /Journal saknas/);
  assert.match(canon, /Journal signerad/);
  assert.match(canon, /Journalutkast/);
  assert.match(canon, /function journalStateForSegment\(segment\)/);
  assert.match(canon, /counts\.push\(journalStateForSegment\(segment\)\)/);
  assert.match(canon, /Journal signerad och låst/);
  assert.doesNotMatch(canon, /counts\.push\(journalState\);/);
  assert.match(canon, /data-v12-link-encounter/);
  assert.match(ui, /assets\/link-encounter/);
  assert.match(ui, /Bilden är kopplad till besöket/);
});

test('besöksrum skapas från encounter, bokning och journal utan filer', () => {
  const visits = fs.readFileSync(
    path.join(ROOT, 'src', 'ops', 'ccoPatientVisitSegments.js'),
    'utf8'
  );
  const canon = fs.readFileSync(
    path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js'),
    'utf8'
  );

  assert.match(visits, /function seedEncounterRooms\(/);
  assert.match(visits, /function seedBookingRooms\(/);
  assert.match(visits, /createEmptyVisitRoom/);
  assert.match(visits, /attachJournalsToSegments/);
  assert.match(canon, /function visitRoomStatus\(/);
  assert.match(canon, /Ingen journalanteckning för detta tillfälle/);
});

test('visit photo grids prefer thumbnails for HEIF-safe display', () => {
  assert.match(
    ui,
    /fetchPatientFileObjectUrl\(fileId, \{\s*preferThumbnail: img\.tagName === 'IMG',\s*\}\)/
  );
});

test('foto-editorn hämtar native asset via auth blob utan direkt URL-fallback', () => {
  assert.match(ui, /fetchPatientFileObjectUrl\(sourceAssetId, \{ preferThumbnail: true \}\)/);
  assert.match(ui, /\/api\/v1\/cco\/assets\/\$\{encodeURIComponent\(normalizedId\)\}\/thumbnail/);
  assert.match(
    ui,
    /\/api\/v1\/cco\/assets\/\$\{encodeURIComponent\(normalizedId\)\}\/download\?inline=1/
  );
  assert.match(ui, /Kunde inte öppna bilden för redigering/);
  assert.doesNotMatch(ui, /image\.src = objUrl \|\| src/);
});

test('listfas visar segment/insikts-placeholder tills enriched customers-shell landar', () => {
  assert.match(ui, /function isCustomerShellEnrichmentPending\(\)/);
  assert.match(ui, /function isCustomerSegmentEnrichmentPending\(segmentStats\)/);
  assert.match(ui, /payload\.enrichmentPending === true/);
  assert.match(ui, /data-v9-segment-enrichment-loading/);
  assert.match(ui, /Uppdaterar segment och insikter/);
  assert.match(ui, /Uppdaterar insikter/);
  assert.match(ui, /isCustomerSegmentEnrichmentPending\(segmentStats\)/);
});
