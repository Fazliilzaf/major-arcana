'use strict';

/* Renderar C6-tidslinjen från public/cco-komm-panel.js i en minimal DOM-stub
 * och verifierar öppna-länkarnas kontrakt:
 *  - native asset → /api/v1/cco/assets/:assetId/download?inline=1 (INTE
 *    /cco-patient-master/file, INTE Drive-länk)
 *  - mailrad → dispatchar cco:open-conversation med rätt conversationKey
 *  - tom kund → trygg empty state
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PANEL_PATH = path.join(__dirname, '..', '..', 'public', 'cco-komm-panel.js');

function makeNode(tag) {
  return {
    tagName: String(tag || '').toUpperCase(),
    children: [],
    _attrs: {},
    dataset: {},
    style: {},
    className: '',
    _text: '',
    _listeners: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    focus() {},
    appendChild(c) {
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    setAttribute(k, v) {
      this._attrs[k] = String(v);
    },
    getAttribute(k) {
      return this._attrs[k];
    },
    addEventListener(type, fn) {
      (this._listeners[type] ||= []).push(fn);
    },
    removeEventListener() {},
    remove() {},
    set textContent(v) {
      this._text = v;
      this.children = [];
    },
    get textContent() {
      if (this.children.length)
        return this.children.map((c) => c.textContent ?? c._text ?? '').join('');
      return this._text;
    },
    set innerHTML(_v) {
      this._text = '';
      this.children = [];
    },
    get innerHTML() {
      return '';
    },
    querySelector(sel) {
      return findAll(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return findAll(this, sel);
    },
    click() {
      (this._listeners.click || []).forEach((fn) =>
        fn({ preventDefault() {}, stopPropagation() {} })
      );
    },
  };
}

function matchesSel(node, sel) {
  if (sel.startsWith('.'))
    return String(node.className || '')
      .split(/\s+/)
      .includes(sel.slice(1));
  if (sel.startsWith('[')) {
    const m = sel.match(/^\[([^\]=]+)\]$/);
    return m && node._attrs[m[1]] != null;
  }
  return node.tagName === sel.toUpperCase();
}

function findAll(root, sel) {
  const out = [];
  (function walk(n) {
    for (const c of n.children || []) {
      if (matchesSel(c, sel)) out.push(c);
      walk(c);
    }
  })(root);
  return out;
}

function loadPanel({ timelinePayload }) {
  const dispatched = [];
  const documentStub = {
    readyState: 'complete',
    body: makeNode('body'),
    createElement: (t) => makeNode(t),
    createTextNode: (t) => ({ _text: String(t), textContent: String(t), children: [] }),
    addEventListener() {},
    dispatchEvent(ev) {
      dispatched.push(ev);
      return true;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  class CustomEventStub {
    constructor(type, init) {
      this.type = type;
      this.detail = (init || {}).detail;
      this.bubbles = !!(init || {}).bubbles;
    }
  }
  async function fetchStub(url) {
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).includes('/unified-timeline')) return timelinePayload;
        return { events: [], counts: {}, threads: [], feed: [], items: [], journey: null };
      },
    };
  }
  const win = {};
  const sandbox = {
    window: win,
    document: documentStub,
    fetch: fetchStub,
    CustomEvent: CustomEventStub,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    console,
  };
  win.window = win;
  win.document = documentStub;
  win.fetch = fetchStub;
  win.CustomEvent = CustomEventStub;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(PANEL_PATH, 'utf8'), sandbox);
  return { CcoKommPanel: win.CcoKommPanel, dispatched };
}

async function flush() {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
}

test('C6 UI: native asset-rad öppnas via /api/v1/cco/assets/:id/download?inline=1 (ej migration-index, ej Drive)', async () => {
  const timelinePayload = {
    customerId: 'cust-ui',
    counts: { all: 2, documents: 2 },
    events: [
      {
        ts: '2026-06-02T10:00:00.000Z',
        kind: 'asset_uploaded',
        category: 'documents',
        icon: '📎',
        title: 'Journalkopia',
        displayType: 'dokument',
        source: 'asset',
        meta: {
          assetId: 'native-doc-9',
          openRef: { kind: 'patient_asset', assetId: 'native-doc-9' },
        },
      },
      {
        ts: '2026-06-01T10:00:00.000Z',
        kind: 'asset_uploaded',
        category: 'documents',
        icon: '📎',
        title: 'Före-bild',
        displayType: 'bild',
        source: 'asset',
        meta: {
          assetId: 'native-img-3',
          openRef: { kind: 'patient_asset', assetId: 'native-img-3' },
        },
      },
    ],
  };
  const { CcoKommPanel } = loadPanel({ timelinePayload });
  const host = makeNode('div');
  await CcoKommPanel.mount(host, {
    customerId: 'cust-ui',
    tenantId: 'hairtpclinic',
    role: 'owner',
  });
  await flush();

  const anchors = findAll(host, '.cco-komm-timeline-link').filter((n) => n.tagName === 'A');
  assert.equal(anchors.length, 2, 'två asset-öppna-länkar');
  for (const a of anchors) {
    const href = a.getAttribute('href');
    assert.match(
      href,
      /^\/api\/v1\/cco\/assets\/native-(doc-9|img-3)\/download\?inline=1$/,
      'native asset-download-URL: ' + href
    );
    assert.ok(!/cco-patient-master\/file/.test(href), 'får INTE använda migration-index-routen');
    assert.ok(!/drive\.google|webViewLink/i.test(href), 'ingen Drive-länk');
  }
});

test('C6 UI: mailrad dispatchar cco:open-conversation med rätt conversationKey', async () => {
  const timelinePayload = {
    customerId: 'cust-ui',
    counts: { all: 1, communication: 1 },
    events: [
      {
        ts: '2026-06-03T10:00:00.000Z',
        kind: 'incoming_mail',
        category: 'communication',
        icon: '📥',
        title: 'Fråga om tid',
        displayType: 'mail',
        source: 'thread',
        meta: { conversationKey: 'conv-abc', mailboxId: 'info@hairtpclinic.com', openRef: null },
      },
    ],
  };
  const { CcoKommPanel, dispatched } = loadPanel({ timelinePayload });
  const host = makeNode('div');
  await CcoKommPanel.mount(host, {
    customerId: 'cust-ui',
    tenantId: 'hairtpclinic',
    role: 'owner',
  });
  await flush();

  const btn = findAll(host, '.cco-komm-timeline-link').find((n) => n.tagName === 'BUTTON');
  assert.ok(btn, 'mailrad renderar en öppna-konversation-knapp');
  btn.click();
  const evt = dispatched.find((e) => e.type === 'cco:open-conversation');
  assert.ok(evt, 'cco:open-conversation dispatchad');
  assert.equal(evt.detail.conversationKey, 'conv-abc');
  assert.equal(evt.detail.mailboxId, 'info@hairtpclinic.com');
});

test('C6 UI: tom kund ger trygg empty state', async () => {
  const timelinePayload = { customerId: 'cust-empty', counts: { all: 0 }, events: [] };
  const { CcoKommPanel } = loadPanel({ timelinePayload });
  const host = makeNode('div');
  await CcoKommPanel.mount(host, {
    customerId: 'cust-empty',
    tenantId: 'hairtpclinic',
    role: 'owner',
  });
  await flush();

  const empties = findAll(host, '.cco-komm-empty').map((n) => n.textContent);
  assert.ok(
    empties.some((t) => /ännu inga händelser/.test(t)),
    'trygg total-empty text visas'
  );
});
