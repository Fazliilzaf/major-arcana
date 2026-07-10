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
    emit(type) {
      const listener = listeners.get(type);
      if (listener) listener({ target: this });
    },
  };
}

function runSubnavHarness({ saved = '', src = 'about:blank', liveUrl = 'about:blank' } = {}) {
  const sectionKeys = ['konversationer', 'kunder', 'kalender', 'automatisering', 'analys'];
  const buttons = sectionKeys.map((key) => {
    const button = createElement({ 'data-cco-section': key, 'aria-selected': 'false' });
    button.classList = createClassList(key === 'konversationer' ? ['is-active'] : []);
    return button;
  });
  const workspace = createElement({ id: 'ccoWorkspaceSection' });
  const frame = createElement({
    id: 'ccoPreviewEmbedFrame',
    src,
    'data-src': '/konversationer.html?v=test&embed=admin',
  });
  frame.contentWindow = { location: { href: liveUrl } };

  const nav = createElement({ 'data-cco-subnav': '' });
  nav.querySelectorAll = (selector) => (selector === '[data-cco-section]' ? buttons : []);
  nav.querySelector = () => null;
  nav.closest = (selector) => (selector === '#ccoWorkspaceSection' ? workspace : null);
  nav.contains = () => true;

  const stored = new Map(saved ? [['arcana.cco.subsection', saved]] : []);
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
    window: { location: { href: 'https://arcana.hairtpclinic.com/admin#cco' } },
  });

  return { buttons, frame, nav, stored, workspace };
}

function activeSection(harness) {
  const active = harness.buttons.find((button) => button.classList.contains('is-active'));
  return active ? active.getAttribute('data-cco-section') : '';
}

test('admin#cco kundlänk fortsätter peka på customers-vyn med alla v9/v11/v12-flaggor', () => {
  const subnav = read(SUBNAV_JS);

  assert.match(
    subnav,
    /kunder:\s*PREVIEW \+ '\?view=customers&' \+ SPA_FLAGS \+ '&v11rail=on&v12workspace=on',/,
    'Kunder-länken ska fortsätta återbruka den befintliga customers-vyn'
  );
  assert.match(
    subnav,
    /var SPA_FLAGS = 'v9=on&demo=on&demoOpDay=1&embed=admin';/,
    'embed=admin måste fortsätta följa med in i customers-vyn'
  );
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
  assert.match(
    html,
    /data-src="\/konversationer\.html\?v=__ARCANA_UI_BUILD__&amp;embed=admin"/,
    'Konversationer ska laddas navlöst i admin-skalet'
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
      expected: /\/major-arcana-preview\/\?view=customers&v9=on&demo=on&demoOpDay=1&embed=admin/,
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
    src: '/konversationer.html?v=test&embed=admin',
    liveUrl: 'https://arcana.hairtpclinic.com/konversationer.html?v=test&embed=admin',
  });

  harness.frame.emit('load');
  assert.equal(activeSection(harness), 'kunder');
  assert.equal(harness.workspace.getAttribute('data-cco-active-section'), 'kunder');

  harness.frame.contentWindow.location.href =
    'https://arcana.hairtpclinic.com/major-arcana-preview/?view=customers&v9=on&embed=admin';
  harness.frame.emit('load');
  assert.equal(activeSection(harness), 'kunder');
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
    /cco-v9-shell-overrides\.css\?v=admin-embed-single-shell-v1/,
    'admin-embed CSS måste cache-bustas så den nya toppbar-gömningen laddas om'
  );
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
