'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SETTINGS_HTML = path.join(
  ROOT,
  'public',
  'major-arcana-preview',
  'cco-installningar-v3-2.html'
);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

const EXPECTED_SETTINGS = [
  // Kanoniska värden, inte etiketter — se testet längst ned om varför.
  { selector: 'data-setting="theme" data-value="mist"', type: 'choice' },
  { selector: 'data-setting="theme" data-value="ink"', type: 'choice' },
  { selector: 'data-setting="theme" data-value="auto"', type: 'choice' },
  { selector: 'data-setting="density" data-value="compact"', type: 'choice' },
  { selector: 'data-setting="density" data-value="balanced"', type: 'choice' },
  { selector: 'data-setting="density" data-value="airy"', type: 'choice' },
  { setting: 'sidebarSections.ai-prediction', type: 'checkbox' },
  { setting: 'sidebarSections.metrics', type: 'checkbox' },
  { setting: 'sidebarSections.templates', type: 'checkbox' },
  { setting: 'sidebarSections.scheduling', type: 'checkbox' },
  { setting: 'sidebarSections.upsell', type: 'checkbox' },
  { setting: 'sidebarSections.assignment', type: 'checkbox' },
  { setting: 'toggles.googleCalendarSync', type: 'checkbox' },
  { setting: 'toggles.outlookIntegration', type: 'checkbox' },
  { setting: 'toggles.automaticBookingConfirmation', type: 'checkbox' },
  { setting: 'toggles.paymentReminders', type: 'checkbox' },
  { setting: 'toggles.stripeIntegration', type: 'checkbox' },
  { setting: 'toggles.swishPayments', type: 'checkbox' },
  { setting: 'toggles.emailSignature', type: 'checkbox' },
  { setting: 'toggles.readReceipts', type: 'checkbox' },
  { setting: 'toggles.outOfOfficeAutoReplies', type: 'checkbox' },
  { setting: 'toggles.weeklySummary', type: 'checkbox' },
  { setting: 'toggles.customerBehaviorTracking', type: 'checkbox' },
  { setting: 'toggles.exportToExcel', type: 'checkbox' },
  { setting: 'toggles.smartReplySuggestions', type: 'checkbox' },
  { setting: 'toggles.automaticPrioritization', type: 'checkbox' },
  { setting: 'toggles.churnPrediction', type: 'checkbox' },
  { setting: 'toggles.desktopNotifications', type: 'checkbox' },
  { setting: 'toggles.soundAlerts', type: 'checkbox' },
  { setting: 'toggles.slaAlerts', type: 'checkbox' },
  { setting: 'toggles.teamMentions', type: 'checkbox' },
  { setting: 'toggles.twoFactorAuth', type: 'checkbox' },
  { setting: 'toggles.activityLogging', type: 'checkbox' },
  { setting: 'toggles.compactConversationView', type: 'checkbox' },
  { setting: 'toggles.colorCodedPriorities', type: 'checkbox' },
  { setting: 'toggles.advancedFilters', type: 'checkbox' },
  { setting: 'profileName', type: 'text' },
  { setting: 'profileEmail', type: 'email' },
  { setting: 'requestDeleteAccount', type: 'button' },
];

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
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

function kebabToCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function createElement(tag = 'div', initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  const listeners = new Map();
  const children = [];
  const dataset = {};

  function syncDataset() {
    for (const [name, value] of attributes.entries()) {
      if (name.startsWith('data-')) {
        const key = kebabToCamel(name.slice(5));
        if (!(key in dataset)) {
          Object.defineProperty(dataset, key, {
            get() {
              return attributes.get(name) || '';
            },
            set(v) {
              attributes.set(name, String(v));
            },
            enumerable: true,
            configurable: true,
          });
        }
      }
    }
  }
  syncDataset();

  const initialClasses = String(initialAttributes.class || '')
    .split(/\s+/)
    .filter(Boolean);
  const el = {
    tagName: String(tag).toUpperCase(),
    type: initialAttributes.type || '',
    classList: createClassList(initialClasses),
    dataset,
    checked: Boolean(initialAttributes.checked),
    value: initialAttributes.value != null ? String(initialAttributes.value) : '',
    textContent: '',
    style: {},
    hidden: false,
    children,
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
      if (name.startsWith('data-')) syncDataset();
    },
    closest(selector) {
      if (selector === '.row' && initialAttributes['data-row']) return el;
      if (selector === '.choices' && initialAttributes['data-choices']) return el;
      if (el.matches(selector)) return el;
      return null;
    },
    querySelector(selector) {
      return children.find((c) => c.matches?.(selector)) || null;
    },
    querySelectorAll(selector) {
      return children.filter((c) => c.matches?.(selector));
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    emit(type, event = {}) {
      const listener = listeners.get(type);
      if (listener) listener({ target: el, preventDefault() {}, ...event });
    },
    matches(selector) {
      const parts = selector.split(/\s*,\s*/);
      return parts.some((part) => {
        const trimmed = part.trim();
        if (trimmed.startsWith('[data-setting=')) {
          const match = trimmed.match(/\[data-setting="([^"]+)"\]/);
          return match && el.getAttribute('data-setting') === match[1];
        }
        if (trimmed.startsWith('[data-setting^=')) {
          const match = trimmed.match(/\[data-setting\^="([^"]+)"\]/);
          return match && el.getAttribute('data-setting')?.startsWith(match[1]);
        }
        if (trimmed.startsWith('.')) {
          return el.classList.contains(trimmed.slice(1));
        }
        if (trimmed.startsWith('#')) {
          return el.getAttribute('id') === trimmed.slice(1);
        }
        return el.tagName.toLowerCase() === trimmed;
      });
    },
  };
  return el;
}

function buildDom() {
  const bySetting = {};
  const choicesGroups = [];

  function makeToggle(setting, checked = false) {
    const row = createElement('div', { 'data-row': '1' });
    const main = createElement('div');
    const label = createElement('label');
    const input = createElement('input', {
      type: 'checkbox',
      'data-setting': setting,
      checked: checked ? 'true' : undefined,
    });
    bySetting[setting] = input;
    row.appendChild(main);
    row.appendChild(label);
    label.appendChild(input);
    return input;
  }

  function makeChoiceGroup(setting, values, selectedValue) {
    const group = createElement('div', { 'data-choices': '1', 'data-group': setting });
    const buttons = values.map((value) => {
      const btn = createElement('button', {
        class: 'choice',
        'data-setting': setting,
        'data-value': value,
        'aria-pressed': value === selectedValue ? 'true' : 'false',
      });
      bySetting[`${setting}:${value}`] = btn;
      group.appendChild(btn);
      return btn;
    });
    choicesGroups.push({ group, buttons });
    return group;
  }

  function makeTextInput(setting, value) {
    const input = createElement('input', {
      type: setting === 'profileEmail' ? 'email' : 'text',
      'data-setting': setting,
      value,
    });
    bySetting[setting] = input;
    return input;
  }

  const panels = createElement('section', { class: 'panels' });
  const status = createElement('div', { id: 'settingsStatus' });

  // Theme & density
  makeChoiceGroup('theme', ['light', 'dark', 'auto'], 'light');
  makeChoiceGroup('density', ['compact', 'comfortable', 'spacious'], 'compact');

  // Sidebar sections
  for (const id of [
    'ai-prediction',
    'metrics',
    'templates',
    'scheduling',
    'upsell',
    'assignment',
  ]) {
    makeToggle(`sidebarSections.${id}`, id !== 'upsell');
  }

  // Toggles
  for (const item of EXPECTED_SETTINGS.filter((s) => s.setting?.startsWith('toggles.'))) {
    makeToggle(
      item.setting,
      ![
        'toggles.outlookIntegration',
        'toggles.swishPayments',
        'toggles.readReceipts',
        'toggles.soundAlerts',
        'toggles.twoFactorAuth',
        'toggles.advancedFilters',
      ].includes(item.setting)
    );
  }

  // Profile
  makeTextInput('profileName', 'Ditt namn');
  makeTextInput('profileEmail', 'din.email@hairtp.com');

  // Delete account
  const deleteBtn = createElement('button', {
    class: 'btn btn--danger',
    'data-setting': 'requestDeleteAccount',
  });
  bySetting.requestDeleteAccount = deleteBtn;

  const summaryValue = createElement('span', { class: 's-val' });

  const document = {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'settingsStatus') return status;
      return null;
    },
    querySelector(selector) {
      if (selector === '.panels') return panels;
      if (selector === '.summary .s-val') return summaryValue;
      if (selector === '.botnav') return null;
      const all = document.querySelectorAll(selector);
      return all[0] || null;
    },
    querySelectorAll(selector) {
      const result = [];
      if (selector === '[data-setting]') {
        for (const el of Object.values(bySetting)) result.push(el);
        return result;
      }
      if (selector === '.choices') {
        return choicesGroups.map((g) => g.group);
      }
      if (selector === '[data-setting^="toggles."], [data-setting^="sidebarSections."]') {
        for (const [key, el] of Object.entries(bySetting)) {
          if (key.startsWith('toggles.') || key.startsWith('sidebarSections.')) result.push(el);
        }
        return result;
      }
      if (selector === '[data-setting="profileName"], [data-setting="profileEmail"]') {
        if (bySetting.profileName) result.push(bySetting.profileName);
        if (bySetting.profileEmail) result.push(bySetting.profileEmail);
        return result;
      }
      if (selector === '[data-setting="requestDeleteAccount"]') {
        if (bySetting.requestDeleteAccount) result.push(bySetting.requestDeleteAccount);
        return result;
      }
      return result;
    },
    addEventListener() {},
  };

  return {
    document,
    bySetting,
    choicesGroups,
    status,
    panels,
    summaryValue,
    deleteBtn,
  };
}

function extractSettingsScript(html) {
  const match = html.match(/<script>[\s\S]*?<\/script>/g);
  if (!match) throw new Error('Inga script-taggar hittades i HTML-filen');
  // Sista script-taggen innehåller inställningslogiken.
  const last = match[match.length - 1];
  return last.replace(/<\/?script>/g, '');
}

function runHarness({ fetchImpl, confirmImpl = () => true } = {}) {
  const dom = buildDom();
  const fetchCalls = [];
  const timeouts = [];

  const fetchFn =
    fetchImpl ||
    (() => {
      throw new Error('fetch ska inte anropas i detta test');
    });

  const window = {
    setTimeout(cb, ms) {
      timeouts.push({ cb, ms });
      return timeouts.length;
    },
    clearTimeout() {},
    confirm: confirmImpl,
    location: { origin: 'https://arcana.hairtpclinic.com' },
  };

  const context = {
    document: dom.document,
    window,
    fetch: async (...args) => {
      fetchCalls.push(args);
      return fetchFn(...args);
    },
    console: { log() {}, error() {}, warn() {} },
    URL,
    URLSearchParams,
    JSON,
  };

  const source = extractSettingsScript(read(SETTINGS_HTML));
  vm.runInNewContext(source, context);

  return {
    ...dom,
    fetchCalls,
    timeouts,
    runPendingTimeouts() {
      for (const t of timeouts) {
        if (typeof t.cb === 'function') t.cb();
      }
    },
  };
}

function okResponse(body) {
  return {
    status: 200,
    ok: true,
    json: async () => body,
  };
}

async function flushHarness(harness) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.runPendingTimeouts();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function makeSampleSettings(overrides = {}) {
  return {
    theme: 'mist',
    density: 'compact',
    sidebarSections: [
      { id: 'ai-prediction', label: 'AI-förutsägelse', enabled: true, order: 1 },
      { id: 'metrics', label: 'Mätvärden', enabled: true, order: 2 },
      { id: 'templates', label: 'Mallar', enabled: true, order: 3 },
      { id: 'scheduling', label: 'Smart schemaläggning', enabled: true, order: 4 },
      { id: 'upsell', label: 'Merförsäljningsmöjligheter', enabled: false, order: 5 },
      { id: 'assignment', label: 'Auto-tilldela', enabled: true, order: 6 },
    ],
    profileName: 'Fazli Krasniqi',
    profileEmail: 'fazli@hairtpclinic.com',
    toggles: {
      googleCalendarSync: true,
      outlookIntegration: false,
      automaticBookingConfirmation: true,
      paymentReminders: true,
      stripeIntegration: true,
      swishPayments: false,
      emailSignature: true,
      readReceipts: false,
      outOfOfficeAutoReplies: true,
      weeklySummary: true,
      customerBehaviorTracking: true,
      exportToExcel: true,
      smartReplySuggestions: true,
      automaticPrioritization: true,
      churnPrediction: true,
      desktopNotifications: true,
      soundAlerts: false,
      slaAlerts: true,
      teamMentions: true,
      twoFactorAuth: false,
      activityLogging: true,
      compactConversationView: true,
      colorCodedPriorities: true,
      advancedFilters: false,
    },
    mailFoundation: { defaults: { senderName: 'Hair TP' } },
    bookingReminderLeadTime: { globalDefaultHours: 24 },
    bookingPolicy: { globalDefaults: { cancelWindowHours: 48 } },
    deleteRequestedAt: null,
    ...overrides,
  };
}

/**
 * Plockar ut taggarna i filen och matchar attribut inom varje tagg — inte på
 * textsträngar tvärs filen.
 *
 * Testerna letade först efter `data-setting="density" data-value="compact"`
 * som en sammanhängande sträng. Det höll tills prettier körde vid commit och
 * bröt långa taggar över flera rader:
 *
 *     <button
 *       class="choice"
 *       data-setting="density"
 *       data-value="compact"
 *
 * Då hittade testet ingenting, fast markupen var oförändrad i sak. En
 * formatterare ska inte kunna fälla ett test.
 */
function taggarMed(html, attribut) {
  return [...html.matchAll(/<[a-zA-Z][^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) =>
      Object.entries(attribut).every(([namn, varde]) =>
        new RegExp(namn + '="' + varde + '"').test(tag)
      )
    );
}

test('alla förväntade kontroller har data-setting', () => {
  const html = read(SETTINGS_HTML);
  for (const item of EXPECTED_SETTINGS) {
    if (item.selector) {
      const par = [...item.selector.matchAll(/([a-z-]+)="([^"]+)"/g)];
      const attribut = Object.fromEntries(par.map(([, n, v]) => [n, v]));
      assert.equal(
        taggarMed(html, attribut).length,
        1,
        'Saknar exakt en tagg för ' + item.selector
      );
      continue;
    }
    assert.ok(
      taggarMed(html, { 'data-setting': item.setting }).length >= 1,
      'Saknar data-setting för ' + item.setting
    );
  }
});

test('sidans script anropar GET /api/v1/cco/settings vid start', async () => {
  const settings = makeSampleSettings();
  const harness = runHarness({
    fetchImpl: async () => okResponse({ settings }),
  });

  await flushHarness(harness);

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0][0], '/api/v1/cco/settings');
  assert.equal(harness.fetchCalls[0][1].credentials, 'include');
  assert.equal(harness.fetchCalls[0][1].headers['Content-Type'], 'application/json');
});

test('GET-svaret sätter kontrollerna och bevarar profilvärden', async () => {
  const settings = makeSampleSettings();
  const harness = runHarness({
    fetchImpl: async () => okResponse({ settings }),
  });

  await flushHarness(harness);

  assert.equal(harness.bySetting.profileName.value, 'Fazli Krasniqi');
  assert.equal(harness.bySetting.profileEmail.value, 'fazli@hairtpclinic.com');
  assert.equal(harness.bySetting['toggles.swishPayments'].checked, false);
  assert.equal(harness.bySetting['sidebarSections.upsell'].checked, false);
  assert.equal(harness.summaryValue.textContent, 'Kompakt + Ljust');
});

test('en ändrad switch ger PUT /api/v1/cco/settings med hela dokumentet', async () => {
  const settings = makeSampleSettings();
  const putBodies = [];
  const harness = runHarness({
    fetchImpl: async (url, opts) => {
      if (opts.method === 'PUT') {
        putBodies.push(JSON.parse(opts.body));
        return okResponse({
          settings: { ...settings, toggles: { ...settings.toggles, swishPayments: true } },
        });
      }
      return okResponse({ settings });
    },
  });

  await flushHarness(harness);

  harness.bySetting['toggles.swishPayments'].checked = true;
  harness.bySetting['toggles.swishPayments'].emit('change');
  await flushHarness(harness);

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.fetchCalls[1][0], '/api/v1/cco/settings');
  assert.equal(harness.fetchCalls[1][1].method, 'PUT');
  const putBody = putBodies[0];
  assert.equal(putBody.toggles.swishPayments, true);
  assert.deepEqual(putBody.mailFoundation, settings.mailFoundation);
  assert.deepEqual(putBody.bookingReminderLeadTime, settings.bookingReminderLeadTime);
  assert.deepEqual(putBody.bookingPolicy, settings.bookingPolicy);
});

test('PUT vid temaändring bevarar bokningsreglerna oförändrade', async () => {
  const settings = makeSampleSettings();
  const putBodies = [];
  const harness = runHarness({
    fetchImpl: async (url, opts) => {
      if (opts.method === 'PUT') {
        putBodies.push(JSON.parse(opts.body));
        return okResponse({ settings });
      }
      return okResponse({ settings });
    },
  });

  await flushHarness(harness);

  const darkBtn = harness.bySetting['theme:dark'];
  const themeGroup = harness.choicesGroups.find(
    (g) => g.group.getAttribute('data-group') === 'theme'
  );
  darkBtn.setAttribute('aria-pressed', 'true');
  themeGroup.group.emit('click', { target: darkBtn });
  await flushHarness(harness);

  const putBody = putBodies[0];
  assert.equal(putBody.theme, 'dark');
  assert.deepEqual(putBody.bookingPolicy, settings.bookingPolicy);
  assert.deepEqual(putBody.bookingReminderLeadTime, settings.bookingReminderLeadTime);
  assert.deepEqual(putBody.mailFoundation, settings.mailFoundation);
});

test('401 döljer panelerna och visar felmeddelande', async () => {
  const harness = runHarness({
    fetchImpl: async () => ({
      status: 401,
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    }),
  });

  await flushHarness(harness);

  assert.equal(harness.panels.style.display, 'none');
  assert.match(harness.status.textContent, /inloggad/);
  assert.match(harness.status.className, /error/);
});

test('radera konto kräver bekräftelse och anropar rätt endpoint', async () => {
  const settings = makeSampleSettings();
  let confirmed = false;
  const harness = runHarness({
    fetchImpl: async (url, opts) => {
      if (opts.method === 'POST') {
        return okResponse({ ok: true, deleteRequestedAt: '2026-08-22T12:00:00.000Z' });
      }
      return okResponse({ settings });
    },
    confirmImpl: () => {
      confirmed = true;
      return true;
    },
  });

  harness.deleteBtn.emit('click');

  assert.equal(confirmed, true);
  const postCall = harness.fetchCalls.find((c) => c[1]?.method === 'POST');
  assert.ok(postCall, 'POST saknas');
  assert.equal(postCall[0], '/api/v1/cco/settings/request-delete-account');
});

test('radera konto utan bekräftelse skickar ingen POST', async () => {
  const settings = makeSampleSettings();
  const harness = runHarness({
    fetchImpl: async () => okResponse({ settings }),
    confirmImpl: () => false,
  });

  harness.deleteBtn.emit('click');

  const postCall = harness.fetchCalls.find((c) => c[1]?.method === 'POST');
  assert.equal(postCall, undefined);
});

test('valknapparna bär storens kanoniska värden, inte etiketterna', () => {
  // Knapparna hette först light / dark / comfortable / spacious. De gick att
  // spara — storen har alias för dem — men inte att läsa tillbaka, för
  // applySettings jämför data-value med det servern returnerar, och servern
  // returnerar mist / ink / balanced / airy. Efter en omladdning stod alltså
  // ingen temaknapp som vald.
  //
  // Enhetstesterna missade det eftersom DOM-mocken gav tillbaka samma värde
  // som skickades in. Felet syntes först när sidan kördes i en webbläsare mot
  // det riktiga API:et. compact var identiskt i båda ändar, vilket är varför
  // täthetsväljaren såg ut att fungera.
  //
  // Testet läser aliastabellerna ur storen i stället för att upprepa dem, så
  // att sidan och storen inte kan glida isär.
  const store = read(path.join(ROOT, 'src', 'ops', 'ccoSettingsStore.js'));

  function aliasTable(namn) {
    const block = store.match(new RegExp(namn + '\\s*=\\s*Object\\.freeze\\(\\{([^}]*)\\}'));
    assert.ok(block, namn + ' hittades inte i ccoSettingsStore.js');
    const table = {};
    for (const rad of block[1].split(',')) {
      const m = rad.match(/([a-zA-Z]+)\s*:\s*'([a-zA-Z]+)'/);
      if (m) table[m[1]] = m[2];
    }
    assert.ok(Object.keys(table).length >= 3, namn + ' tolkades tomt');
    return table;
  }

  const html = read(SETTINGS_HTML);
  const fall = [
    { setting: 'theme', alias: aliasTable('THEME_ALIASES') },
    { setting: 'density', alias: aliasTable('DENSITY_ALIASES') },
  ];

  for (const { setting, alias } of fall) {
    const varden = taggarMed(html, { 'data-setting': setting })
      .map((tag) => (tag.match(/data-value="([a-zA-Z-]+)"/) || [])[1])
      .filter(Boolean);

    assert.ok(varden.length >= 3, 'hittade inga knappar för ' + setting);

    for (const v of varden) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(alias, v),
        setting + '-knappen "' + v + '" finns inte i storens aliastabell'
      );
      assert.equal(
        alias[v],
        v,
        setting +
          '-knappen "' +
          v +
          '" är ett alias för "' +
          alias[v] +
          '". ' +
          'Storen returnerar "' +
          alias[v] +
          '", så knappen skulle aldrig bli markerad ' +
          'efter omladdning. Använd det kanoniska värdet.'
      );
    }
  }
});
