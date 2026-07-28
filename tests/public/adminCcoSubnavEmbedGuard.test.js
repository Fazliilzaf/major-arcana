'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const ADMIN_HTML = path.join(ROOT, 'public', 'admin.html');
const SUBNAV_JS = path.join(ROOT, 'public', 'admin', 'cco-subnav.js');
const SHELL_CSS = path.join(ROOT, 'public', 'admin', 'cco-shell.css');
const CONVERSATIONS_HTML = path.join(ROOT, 'public', 'konversationer.html');
const INDEX_HTML = path.join(ROOT, 'public', 'major-arcana-preview', 'index.html');
const CALENDAR_SHELL = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'app',
  'cco-calendar-v8-shell.js'
);
const ADMIN_EMBED_CONTRACT = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'app',
  'cco-admin-embed-contract.js'
);
const SHELL_OVERRIDES = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'cco-v9-shell-overrides.css'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    },
  };
}

function createElement(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  const listeners = new Map();
  return {
    classList: createClassList(),
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    emit(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) {
        listener({
          target: this,
          preventDefault() {},
          ...event,
        });
      }
    },
  };
}

function runSubnavHarness({ saved = '', src = 'about:blank', liveUrl = 'about:blank' } = {}) {
  const sectionKeys = ['konversationer', 'kunder', 'kalender', 'automatisering', 'analys'];
  const buttons = sectionKeys.map((key) => {
    const button = createElement({ 'data-cco-section': key, 'aria-selected': 'false' });
    button.classList = createClassList(key === 'konversationer' ? ['is-active'] : []);
    button.closest = (selector) => (selector === '[data-cco-section]' ? button : null);
    return button;
  });
  const workspace = createElement({ id: 'ccoWorkspaceSection' });
  const frame = createElement({
    id: 'ccoPreviewEmbedFrame',
    src,
    'data-src': '/konversationer.html?v=test&embed=admin',
    'data-conversations-src': '/konversationer.html?v=test&embed=admin',
  });
  frame.contentWindow = { location: { href: liveUrl } };

  const nav = createElement({ 'data-cco-subnav': '', 'data-default-section': 'konversationer' });
  const moreToggle = createElement({ 'data-cco-more-toggle': '', 'aria-selected': 'false' });
  const moreMenu = createElement({ 'data-cco-more-menu': '' });
  moreMenu.hidden = true;
  const v2PreviewItem = createElement({ 'data-cco-more': 'konversationer_v2_preview' });
  v2PreviewItem.closest = (selector) =>
    selector === '[data-cco-more]' ? v2PreviewItem : null;
  nav.querySelectorAll = (selector) => (selector === '[data-cco-section]' ? buttons : []);
  nav.querySelector = (selector) => {
    if (selector === '[data-cco-more-toggle]') return moreToggle;
    if (selector === '[data-cco-more-menu]') return moreMenu;
    return null;
  };
  nav.closest = (selector) => (selector === '#ccoWorkspaceSection' ? workspace : null);
  nav.contains = () => true;

  const stored = new Map(saved ? [['arcana.cco.subsection', saved]] : []);
  const windowListeners = new Map();
  const document = {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'ccoPreviewEmbedFrame') return frame;
      if (id === 'ccoWorkspaceSection') return workspace;
      return null;
    },
    querySelector(selector) {
      return selector === '[data-cco-subnav]' ? nav : null;
    },
    addEventListener() {},
  };

  const window = {
    location: {
      href: 'https://arcana.hairtpclinic.com/admin#cco',
      origin: 'https://arcana.hairtpclinic.com',
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
  };

  vm.runInNewContext(read(SUBNAV_JS), {
    URL,
    document,
    sessionStorage: {
      getItem(key) {
        return stored.get(key) || null;
      },
      setItem(key, value) {
        stored.set(key, String(value));
      },
    },
    window,
  });

  return {
    buttons,
    frame,
    nav,
    v2PreviewItem,
    stored,
    window,
    workspace,
    emitWindow(type, event) {
      windowListeners.get(type)?.(event);
    },
  };
}

function activeSection(harness) {
  const active = harness.buttons.find((button) => button.classList.contains('is-active'));
  return active ? active.getAttribute('data-cco-section') : '';
}

function runAdminEmbedContract(search) {
  const documentElement = createElement();
  const body = createElement();
  const canvas = createElement({
    'data-app-shell-view': 'conversations',
    'data-app-view': 'conversations',
  });
  const sections = {
    conversations: createElement({ 'data-shell-view': 'conversations' }),
    customers: createElement({ 'data-shell-view': 'customers' }),
    calendar: createElement({ 'data-shell-view': 'calendar' }),
  };
  sections.customers.hidden = true;
  const legacyNodes = [createElement(), createElement(), createElement()];
  const document = {
    readyState: 'complete',
    documentElement,
    body,
    querySelector(selector) {
      return selector === '.preview-canvas' ? canvas : null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-shell-view]') return Object.values(sections);
      if (selector.includes('.preview-shell') && selector.includes('#studio-shell')) {
        return legacyNodes;
      }
      return [];
    },
    addEventListener() {},
  };
  const window = { location: { search } };

  vm.runInNewContext(read(ADMIN_EMBED_CONTRACT), {
    URLSearchParams,
    document,
    window,
  });

  return { body, canvas, documentElement, legacyNodes, sections, window };
}

test('admin#cco kundlänk pekar på live customers-vyn utan demo/UAT-flaggor', () => {
  const subnav = read(SUBNAV_JS);

  assert.match(
    subnav,
    /kunder:\s*'\/staff\?view=customers&' \+ CUSTOMER_FLAGS,/,
    'Kunder-länken ska använda den kanoniska skarpa staff-routen'
  );
  assert.match(
    subnav,
    /var CUSTOMER_FLAGS = 'v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on';/,
    'customers-vyn ska nollställa sticky demo-state och använda admin embed'
  );
  assert.doesNotMatch(subnav, /demoOpDay/);
  assert.doesNotMatch(subnav, /demo=on/);
});

test('admin#cco använder ett neutralt skal utan att byta befintliga målunderlag', () => {
  const html = read(ADMIN_HTML);
  const subnav = read(SUBNAV_JS);
  const css = read(SHELL_CSS);

  assert.equal((html.match(/data-cco-subnav/g) || []).length, 1, 'exakt ett CCO-nav ska finnas');
  assert.equal(
    (html.match(/id="ccoPreviewEmbedFrame"/g) || []).length,
    1,
    'exakt en aktiv innehålls-iframe ska finnas'
  );
  assert.match(html, /\/admin\/cco-shell\.css\?v=__ARCANA_UI_BUILD__/);
  assert.match(html, /data-default-section="konversationer"/);
  // Cutover: Konversationer-fliken pekar på V2, inte på konversationer.html.
  // Legacy nås via kill-switchen ?cco=legacy, se testet längre ned.
  assert.match(
    html,
    /data-src="\/major-arcana-preview\/\?v=__ARCANA_UI_BUILD__&amp;embed=admin&amp;conversations=v2&amp;view=conversations"/
  );
  assert.match(
    html,
    /data-conversations-src="\/major-arcana-preview\/\?v=__ARCANA_UI_BUILD__&amp;embed=admin&amp;conversations=v2&amp;view=conversations"/,
    'Konversationer ska finnas som build-stämplat, navlöst mål'
  );
  assert.match(subnav, /kalender:\s*'\/kalender\.html\?embed=1'/);
  assert.match(subnav, /automatisering:\s*PREVIEW \+ 'cco-automatisering-v3\.html'/);
  assert.match(subnav, /analys:\s*PREVIEW \+ 'cco-analytics-v3\.html'/);
  assert.match(subnav, /integrationer:\s*PREVIEW \+ 'cco-integrationer-v3\.html'/);
  assert.match(subnav, /makron:\s*PREVIEW \+ 'cco-makron-v3\.html'/);
  assert.match(subnav, /installningar:\s*PREVIEW \+ 'cco-installningar-v3-2\.html'/);
  assert.match(subnav, /notiser:\s*PREVIEW \+ 'cco-notiser-v3\.html'/);
  assert.match(subnav, /signaturer:\s*PREVIEW \+ 'cco-signaturer-v3\.html'/);
  assert.match(subnav, /revisor:\s*PREVIEW \+ 'cco-revisor-v3\.html'/);
  assert.match(subnav, /showcase:\s*PREVIEW \+ 'cco-showcase-v3\.html'/);
  // V2 är inte längre en Mer-post: den ÄR Konversationer sedan #1228, och
  // posten pekade på samma URL som huvudfliken. Se testet längre ned.
  assert.doesNotMatch(
    html,
    /data-cco-more="konversationer_v2_preview"/,
    'v2-förhandsvisningen ska vara borta ur Mer-menyn'
  );

  assert.match(css, /body\.cco-preview-embed-route \.cco-subnav \{/);
  assert.match(css, /background:\s*transparent;/);
  assert.match(css, /body\.cco-preview-embed-route \.cco-subnav-btn\.is-active \{/);
  assert.match(css, /#fce9f0/);
  assert.match(css, /#f1cfdc/);
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.cco-subnav \{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?overflow:\s*visible;/,
    'mobilnav ska visa alla kategorier och inte klippa Mer-menyn'
  );
  assert.match(
    css,
    /data-cco-active-section="konversationer"[\s\S]*?position:\s*absolute;[\s\S]*?height:\s*100dvh;/,
    'Konversationer ska dela sin befintliga topprad med det kanoniska skalet på desktop'
  );
});

test('sparad Kunder eller Automatisering återställer både flik och redan startad iframe', () => {
  const cases = [
    {
      key: 'kunder',
      expected:
        /\/staff\?view=customers&v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on/,
    },
    {
      key: 'automatisering',
      expected: /\/major-arcana-preview\/cco-automatisering-v3\.html$/,
    },
  ];

  for (const item of cases) {
    const harness = runSubnavHarness({
      saved: item.key,
      src: '/konversationer.html?v=test&embed=admin',
      liveUrl: 'https://arcana.hairtpclinic.com/konversationer.html?v=test&embed=admin',
    });

    assert.match(harness.frame.getAttribute('src'), item.expected);
    assert.match(harness.frame.getAttribute('data-src'), item.expected);
    assert.equal(activeSection(harness), item.key);
    assert.equal(harness.nav.getAttribute('data-active-section'), item.key);
    assert.equal(harness.workspace.getAttribute('data-cco-active-section'), item.key);
  }
});

test('ny CCO-session startar på live-Konversationer och alla huvudkategorier är klickbara', () => {
  const harness = runSubnavHarness();
  assert.equal(activeSection(harness), 'konversationer');
  assert.equal(
    harness.frame.getAttribute('data-src'),
    '/konversationer.html?v=test&embed=admin'
  );

  const expectedRoutes = {
    konversationer: /\/konversationer\.html\?v=test&embed=admin$/,
    kunder: /\/staff\?view=customers&v9=on&demo=off&embed=admin/,
    kalender: /\/kalender\.html\?embed=1$/,
    automatisering: /\/major-arcana-preview\/cco-automatisering-v3\.html$/,
    analys: /\/major-arcana-preview\/cco-analytics-v3\.html$/,
  };

  for (const button of harness.buttons) {
    const key = button.getAttribute('data-cco-section');
    harness.nav.emit('click', { target: button });
    assert.match(harness.frame.getAttribute('src'), expectedRoutes[key]);
    assert.equal(activeSection(harness), key);
  }
});

test('v2-konversationsytan ÄR Konversationer — inte ett Mer-val', () => {
  // Före cutovern (#1228) var V2 en valbar förhandsvisning under "Mer", och
  // urlToKey returnerade 'mer:konversationer_v2_preview' för dess URL.
  //
  // När Konversationer-fliken pekades om till samma URL började huvudflikens
  // EGEN adress klassificeras som ett Mer-val. Följden syntes direkt för
  // operatören: "Mer" bar den rosa aktiv-pillen medan Konversationer stod
  // omarkerad — trots att konversationsytan var det som renderades.
  //
  // Två saker håller det borta: grenen returnerar 'konversationer', och
  // Mer-posten är borttagen. Kvar bara den ena hade gett samma dubblering igen.
  const subnav = read(SUBNAV_JS);
  const contract = read(ADMIN_EMBED_CONTRACT);
  const app = read(path.join(ROOT, 'public', 'major-arcana-preview', 'app.js'));
  const adminHtml = read(ADMIN_HTML);

  assert.doesNotMatch(
    subnav,
    /konversationer_v2_preview:/,
    'v2 får inte ligga kvar som egen Mer-rutt — den pekar på samma URL som fliken'
  );
  assert.doesNotMatch(
    subnav,
    /return 'mer:konversationer_v2_preview';/,
    'v2-URL:en ska klassificeras som konversationer, inte som ett Mer-val'
  );
  assert.doesNotMatch(
    adminHtml,
    /data-cco-more="konversationer_v2_preview"/,
    'menyposten ska vara borta ur admin.html'
  );

  // Grenen ska finnas kvar och peka rätt — utan den känns URL:en inte igen alls
  // och navet markerar ingenting.
  assert.match(
    subnav,
    /parsed\.searchParams\.get\('conversations'\) === 'v2'[\s\S]{0,120}return 'konversationer';/,
    'v2-URL:en ska mappa till Konversationer-fliken'
  );

  // Cutover: legacy är inte längre iframens mål — den är kill-switchens mål.
  const adminJs = read(path.join(ROOT, 'public', 'admin.js'));
  assert.match(
    adminJs,
    /const CCO_LEGACY_PREVIEW_PATH = '\/konversationer\.html';/,
    'legacy destination ska ligga kvar som kill-switchens mål'
  );
  assert.match(
    adminJs,
    /if \(ccoLegacyRequested\(\)\) return CCO_LEGACY_PREVIEW_PATH;/,
    'kill-switchen ska kollas före iframens data-src'
  );
  assert.doesNotMatch(
    adminHtml,
    /data-conversations-src="\/konversationer\.html/,
    'Konversationer-fliken ska inte längre peka på legacy'
  );
  assert.match(contract, /requestedView === 'customers' \|\| requestedView === 'conversations'/);
  assert.match(app, /const localToken = readTokenFromStorage\(window\.localStorage\)/);
  assert.match(app, /Authorization: `Bearer \$\{authToken\}`/);
  assert.match(app, /getQueueScopedRuntimeThreads\(\)\.filter/);
});

test('blank iframe behåller lazy-load men får rätt sparad route innan admin.js laddar', () => {
  const harness = runSubnavHarness({ saved: 'kunder' });

  assert.equal(harness.frame.getAttribute('src'), 'about:blank');
  assert.match(harness.frame.getAttribute('data-src'), /view=customers/);
  assert.equal(activeSection(harness), 'kunder');
  assert.equal(harness.workspace.getAttribute('data-cco-active-section'), 'kunder');
});

test('ett sent load-event från default-vyn får inte skriva över ett nyare segmentval', () => {
  const harness = runSubnavHarness({
    saved: 'kunder',
    src: '/kalender.html?embed=1',
    liveUrl: 'https://arcana.hairtpclinic.com/kalender.html?embed=1',
  });

  harness.frame.emit('load');
  assert.equal(activeSection(harness), 'kunder');
  assert.equal(harness.workspace.getAttribute('data-cco-active-section'), 'kunder');

  harness.frame.contentWindow.location.href =
    'https://arcana.hairtpclinic.com/staff?view=customers&v9=on&embed=admin';
  harness.frame.emit('load');
  assert.equal(activeSection(harness), 'kunder');
});

test('CCO-skalet behåller canonical patientId när Konversationer öppnar Kunddossiér', () => {
  const harness = runSubnavHarness({
    src: '/konversationer.html?v=test&embed=admin',
    liveUrl: 'https://arcana.hairtpclinic.com/konversationer.html?v=test&embed=admin',
  });

  harness.emitWindow('message', {
    origin: 'https://arcana.hairtpclinic.com',
    source: harness.frame.contentWindow,
    data: {
      type: 'arcana:cco-open-customer-dossier',
      patientId: 'f0086a8f-2133-4a5e-aa64-44bdbb3bf0a6',
    },
  });

  const expected =
    /\/staff\?view=customers&v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on&patientId=f0086a8f-2133-4a5e-aa64-44bdbb3bf0a6/;
  assert.match(harness.frame.getAttribute('src'), expected);
  assert.match(harness.frame.getAttribute('data-src'), expected);
  assert.equal(activeSection(harness), 'kunder');
  assert.equal(harness.nav.getAttribute('data-active-section'), 'kunder');
});

test('CCO-skalet ignorerar externa eller ogiltiga patientdjuplänkar', () => {
  const harness = runSubnavHarness();
  const before = harness.frame.getAttribute('src');

  harness.emitWindow('message', {
    origin: 'https://example.invalid',
    data: { type: 'arcana:cco-open-customer-dossier', patientId: 'patient-1' },
  });
  harness.emitWindow('message', {
    origin: 'https://arcana.hairtpclinic.com',
    source: harness.frame.contentWindow,
    data: { type: 'arcana:cco-open-customer-dossier', patientId: 'not a patient id' },
  });
  harness.emitWindow('message', {
    origin: 'https://arcana.hairtpclinic.com',
    source: {},
    data: { type: 'arcana:cco-open-customer-dossier', patientId: 'patient-1' },
  });

  assert.equal(harness.frame.getAttribute('src'), before);
});

test('Kalenderklick stannar i admin#cco och öppnar samma canonical patient i V11/V12', () => {
  const calendar = read(CALENDAR_SHELL);
  const harness = runSubnavHarness({
    saved: 'kalender',
    src: '/kalender.html?embed=1',
    liveUrl: 'https://arcana.hairtpclinic.com/kalender.html?embed=1',
  });
  const patientId = 'patient-canonical-42';
  const adminUrl = harness.window.location.href;

  assert.match(calendar, /window\.parent\.postMessage\(/);
  assert.match(calendar, /window\.location\.origin/);
  harness.emitWindow('message', {
    origin: harness.window.location.origin,
    source: harness.frame.contentWindow,
    data: { type: 'arcana:cco-open-customer-dossier', patientId },
  });

  assert.equal(harness.window.location.href, adminUrl);
  assert.equal(activeSection(harness), 'kunder');
  assert.match(
    harness.frame.getAttribute('src'),
    /\/staff\?view=customers&v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on&patientId=patient-canonical-42/
  );
  assert.equal(harness.frame.getAttribute('data-src'), harness.frame.getAttribute('src'));
});

test('same-origin Kalender fallback öppnar canonical patient utan att ge okopplade rader handoff', () => {
  const harness = runSubnavHarness({
    saved: 'kalender',
    src: '/kalender.html?embed=1',
    liveUrl: 'https://arcana.hairtpclinic.com/kalender.html?embed=1',
  });
  const adminUrl = harness.window.location.href;

  assert.equal(
    harness.window.ArcanaCcoOpenCustomerDossier({ patientId: 'patient-canonical-42' }),
    true
  );
  assert.equal(harness.window.location.href, adminUrl);
  assert.equal(activeSection(harness), 'kunder');
  assert.match(
    harness.frame.getAttribute('src'),
    /\/staff\?view=customers&v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on&patientId=patient-canonical-42/
  );

  const before = harness.frame.getAttribute('src');
  assert.equal(harness.window.ArcanaCcoOpenCustomerDossier({ patientId: '' }), false);
  assert.equal(harness.window.ArcanaCcoOpenCustomerDossier({ patientId: '../not-canonical' }), false);
  assert.equal(harness.frame.getAttribute('src'), before);
});

test('konversationer embed gömmer bara dublettnav och bevarar sök samt riskkontroller', () => {
  const html = read(CONVERSATIONS_HTML);

  assert.match(html, /get\('embed'\) === 'admin'/);
  assert.match(
    html,
    /html\.is-admin-cco-content \.top-nav > \.brand,\s*html\.is-admin-cco-content \.top-nav > a \{\s*display:\s*none;/s
  );
  assert.doesNotMatch(
    html,
    /html\.is-admin-cco-content \.top-nav \{\s*display:\s*none;/s,
    'hela top-nav får inte döljas eftersom den också bär notiser, riskstatus och sök'
  );
  assert.match(html, /class="risk-badge-row" id="risk-badge-row"/);
  assert.match(html, /class="global-search"/);
  assert.match(
    html,
    /html\.is-admin-cco-content \.top-nav \{[\s\S]*?padding-left:\s*660px;/,
    'status och sök ska reservera plats för samma kanoniska topprad på desktop'
  );
});

test('admin embed markeras i customers-sidan så demo-chrome kan gömmas', () => {
  const html = read(INDEX_HTML);

  assert.match(html, /document\.documentElement\.classList\.add\('is-admin-embed'\)/);
  assert.match(html, /document\.body\.classList\.add\('is-admin-embed'\)/);
  assert.match(
    html,
    /cco-v9-shell-overrides\.css\?v=admin-content-contract-v1/,
    'admin-embed CSS måste cache-bustas så den nya toppbar-gömningen laddas om'
  );
  assert.match(
    html,
    /cco-admin-embed-contract\.js\?v=customer-full-product-contract-v1/
  );
});

test('customers admin embed har ett hårt content-only-kontrakt före app-boot', () => {
  const contract = read(ADMIN_EMBED_CONTRACT);
  const css = read(SHELL_OVERRIDES);

  assert.match(contract, /requestedView === 'customers'/);
  assert.match(contract, /data-admin-embed-view/);
  assert.match(contract, /\.preview-shell, \.focus-shell, \[data-resize-handle\]/);
  assert.match(contract, /#studio-shell/);
  assert.match(contract, /#note-shell/);
  assert.match(contract, /#booking-shell/);
  assert.match(contract, /document\.querySelectorAll\('\[data-shell-view\]'\)/);
  assert.match(
    css,
    /html\[data-admin-embed-view="customers"\] \.preview-shell,[\s\S]*?display:\s*none !important;/,
    'legacy Conversations ska vara deklarativt omöjlig att visa i customers embed'
  );
  assert.match(css, /html\[data-admin-embed-view="customers"\] #studio-shell/);
  assert.match(
    css,
    /html\[data-admin-embed-view="customers"\] \[data-shell-view="customers"\] \{[\s\S]*?display:\s*block !important;/,
    'customers-innehållet ska förbli synligt även innan async bootstrap är klar'
  );
});

test('customers content-lock döljer legacy Conversations och visar bara kundregistret', () => {
  const harness = runAdminEmbedContract('?view=customers&demo=off&embed=admin');

  assert.equal(harness.documentElement.getAttribute('data-admin-embed-view'), 'customers');
  assert.equal(harness.documentElement.getAttribute('data-customer-product-contract'), 'full');
  assert.equal(harness.documentElement.getAttribute('data-v9-enabled'), 'on');
  assert.equal(harness.documentElement.getAttribute('data-v9-demo'), 'off');
  assert.equal(harness.documentElement.getAttribute('data-v11-rail'), 'on');
  assert.equal(harness.documentElement.getAttribute('data-v12-workspace'), 'on');
  assert.equal(harness.canvas.getAttribute('data-app-shell-view'), 'customers');
  assert.equal(harness.canvas.getAttribute('data-app-view'), 'customers');
  assert.equal(harness.sections.customers.hidden, false);
  assert.equal(harness.sections.conversations.hidden, true);
  assert.equal(harness.sections.calendar.hidden, true);
  assert.ok(harness.legacyNodes.every((node) => node.hidden === true));
  assert.equal(harness.window.CcoAdminEmbedContract.view, 'customers');
  assert.equal(harness.window.__ARCANA_V9_ENABLED__, true);
  assert.equal(harness.window.__ARCANA_V11_RAIL_ENABLED__, true);
  assert.equal(harness.window.__ARCANA_V12_WORKSPACE_ENABLED__, true);
});

test('conversations v2 admin embed låser endast vyn och behåller v2:s egna legacy-overlayvägar', () => {
  const harness = runAdminEmbedContract('?view=conversations&embed=admin&conversations=v2');

  assert.equal(harness.documentElement.getAttribute('data-admin-embed-view'), 'conversations');
  assert.equal(harness.documentElement.getAttribute('data-customer-product-contract'), '');
  assert.equal(harness.canvas.getAttribute('data-app-shell-view'), 'conversations');
  assert.equal(harness.canvas.getAttribute('data-app-view'), 'conversations');
  assert.equal(harness.sections.conversations.hidden, false);
  assert.equal(harness.sections.customers.hidden, true);
  assert.equal(harness.sections.calendar.hidden, true);
  assert.ok(harness.legacyNodes.every((node) => node.hidden !== true));
  assert.equal(harness.window.CcoAdminEmbedContract.view, 'conversations');
});

test('content-lock påverkar inte fristående eller andra Major Arcana-vyer', () => {
  const harness = runAdminEmbedContract('?view=customers&demo=off');

  assert.equal(harness.documentElement.getAttribute('data-admin-embed-view'), '');
  assert.equal(harness.canvas.getAttribute('data-app-shell-view'), 'conversations');
  assert.equal(harness.sections.customers.hidden, true);
  assert.equal(harness.window.CcoAdminEmbedContract, undefined);
});

test('admin embed gömmer watch chrome i customers-vyn', () => {
  const css = read(SHELL_OVERRIDES);

  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \{\s*--topbar-height:\s*0px;\s*--workspace-top-clearance:\s*0px;/s,
    'admin-embed ska nollställa topbar-måtten'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.preview-topbar \{\s*display:\s*none !important;/s,
    'preview-topbar ska döljas i admin-embed'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.v9-watch-widget/,
    'watch-widget ska döljas i admin-embed'
  );
  assert.match(
    css,
    /html\.is-admin-embed\[data-v9-enabled="on"\] \.v9-watch-wrap/,
    'watch-wrap ska döljas i admin-embed'
  );
});
