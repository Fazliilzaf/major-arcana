const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-queue-renderers.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i runtime-queue-renderers.js.`);

  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parameterDepth += 1;
    if (character === ')') parameterDepth -= 1;
    if (character === '{' && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `Kunde inte hitta funktionskroppen för ${functionName}.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(`Kunde inte extrahera ${functionName} från runtime-queue-renderers.js.`);
}

function createClassList() {
  const active = new Set();
  return {
    toggle(name, force) {
      if (force === undefined) {
        if (active.has(name)) {
          active.delete(name);
        } else {
          active.add(name);
        }
        return;
      }
      if (force) {
        active.add(name);
      } else {
        active.delete(name);
      }
    },
    contains(name) {
      return active.has(name);
    },
  };
}

function createElementStub() {
  return {
    hidden: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    classList: createClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

test('renderRuntimeQueueLaneState kopplar kategoribubblor till samma inline-panel-shell', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const renderRuntimeQueueLaneStateSource = extractFunctionSource(source, 'renderRuntimeQueueLaneState');

  const queueLaneButtons = [
    {
      ...createElementStub(),
      dataset: { queueLane: 'all' },
    },
    {
      ...createElementStub(),
      dataset: { queueLane: 'act-now' },
    },
  ];
  const queueViewJumpButtons = [
    {
      ...createElementStub(),
      dataset: { queueViewJump: 'sent' },
    },
  ];
  const queueCollapsedList = {
    querySelectorAll() {
      return [];
    },
  };
  const queueActiveLaneLabel = createElementStub();

  const renderRuntimeQueueLaneState = new Function(
    'QUEUE_LANE_LABELS',
    'getOrderedQueueLaneIds',
    'normalizeKey',
    'queueActiveLaneLabel',
    'queueCollapsedList',
    'queueLaneButtons',
    'queueViewJumpButtons',
    'state',
    `${renderRuntimeQueueLaneStateSource}
     return renderRuntimeQueueLaneState;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    () => ['all', 'act-now'],
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueActiveLaneLabel,
    queueCollapsedList,
    queueLaneButtons,
    queueViewJumpButtons,
    {
      runtime: {
        activeLaneId: 'all',
        queueInlinePanel: {
          open: true,
          laneId: 'act-now',
        },
      },
    }
  );

  renderRuntimeQueueLaneState();

  assert.equal(queueLaneButtons[0].attributes['aria-controls'], 'queue-inline-history');
  assert.equal(queueLaneButtons[0].attributes['aria-expanded'], 'false');
  assert.equal(queueLaneButtons[1].attributes['aria-controls'], 'queue-inline-history');
  assert.equal(queueLaneButtons[1].attributes['aria-expanded'], 'true');
  assert.equal(queueLaneButtons[1].attributes['aria-pressed'], 'true');
  assert.equal(queueViewJumpButtons[0].attributes['aria-controls'], 'queue-inline-history');
});

test('renderQueueHistorySection visar lane-panelen i samma inline-shell som historik', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const laneThreads = [
    {
      id: 'thread-1',
      customerName: 'Egzona',
      lastActivityLabel: '28 mars',
      lastActivityAt: '2026-03-28T10:00:00.000Z',
      displaySubject: 'Kons flow verification',
      preview: 'Detta är första kundsignalen.',
      mailboxLabel: 'Kons',
    },
    {
      id: 'thread-2',
      customerName: 'Pedram',
      lastActivityLabel: '26 mars',
      lastActivityAt: '2026-03-26T10:00:00.000Z',
      displaySubject: 'Pedram Kontaktformulär',
      preview: 'Detta är andra kundsignalen.',
      mailboxLabel: 'Kons',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    (laneId) => (laneId === 'act-now' ? laneThreads : []),
    () => laneThreads,
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        activeLaneId: 'act-now',
        selectedThreadId: 'thread-1',
        queueInlinePanel: {
          open: true,
          laneId: 'act-now',
        },
        queueHistory: {
          open: false,
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueContent.hidden, true);
  assert.equal(queuePrimaryLaneTag.hidden, true);
  assert.equal(queueTitle.textContent, 'Agera nu (2)');
  assert.match(queueHistoryMeta.textContent, /2 mejl/i);
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="thread-1"/);
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="thread-2"/);
  assert.match(queueHistoryList.innerHTML, /queue-history-item-subject/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /Mottaget|Skickat/);
  assert.equal(queueHistoryLoadMoreButton.hidden, true);
  assert.equal(queueHistoryToggle.attributes['aria-expanded'], 'false');
});

test('renderQueueHistorySection behåller historik som eget läge', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        activeLaneId: 'all',
        selectedThreadId: '',
        queueInlinePanel: {
          open: false,
          laneId: '',
        },
        queueHistory: {
          open: true,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueContent.hidden, true);
  assert.equal(queuePrimaryLaneTag.hidden, true);
  assert.equal(queueTitle.textContent, 'Historik (0)');
  assert.equal(queueHistoryToggle.attributes['aria-expanded'], 'true');
  assert.equal(queueHistoryLoadMoreButton.hidden, true);
  assert.equal(queueHistoryMeta.textContent, '');
  assert.doesNotMatch(queueHistoryMeta.textContent, /äldre mejl|offline historikläge/i);
  assert.match(queueHistoryList.innerHTML, /Ingen historik hittades i valt mailboxscope ännu/i);
});

test('renderQueueHistorySection visar vanlig arbetslista i queue-history-list nar ingen panel ar oppen', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const activeLaneThreads = [
    {
      id: 'queue-1',
      customerName: 'Egzona',
      lastActivityLabel: 'Idag 13:18',
      lastActivityAt: '2026-03-30T13:18:00.000Z',
      displaySubject: 'Kons flow verification',
      preview: 'Första synliga live-mejlet.',
      mailboxLabel: 'Kons',
    },
    {
      id: 'queue-2',
      customerName: 'Pedram',
      lastActivityLabel: 'Idag 11:05',
      lastActivityAt: '2026-03-30T11:05:00.000Z',
      displaySubject: 'Pedram Kontaktformulär',
      preview: 'Andra synliga live-mejlet.',
      mailboxLabel: 'Kons',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    (laneId) => (laneId === 'act-now' ? activeLaneThreads : []),
    () => activeLaneThreads,
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        live: true,
        activeLaneId: 'act-now',
        queueInlinePanel: {
          open: false,
          laneId: '',
          feedKey: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueContent.hidden, true);
  assert.equal(queueTitle.textContent, 'Arbetslista (2)');
  assert.equal(queueHistoryMeta.textContent, '');
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="queue-1"/);
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="queue-2"/);
  assert.equal(queueHistoryLoadMoreButton.hidden, true);
  assert.equal(queueHistoryToggle.attributes['aria-expanded'], 'false');
});

test('renderQueueHistorySection visar loading i samma kortsystem som live-kön', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const buildUnifiedQueueLoadingItemsSource = extractFunctionSource(source, 'buildUnifiedQueueLoadingItems');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${buildUnifiedQueueLoadingItemsSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        live: true,
        loading: true,
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
          feedKey: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueTitle.textContent, 'Arbetslista (0)');
  assert.equal(queueHistoryMeta.textContent, 'Laddar live-trådar…');
  assert.equal(queueHistoryList.dataset.queueListMode, 'live');
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="runtime-loading-1"/);
  assert.match(queueHistoryList.innerHTML, /Synkar live-kö/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /queue-history-empty/);
});

test('renderQueueHistorySection visar live-tomlage i samma kortsystem som övriga mailrutor', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        live: true,
        loading: false,
        error: '',
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
          feedKey: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueTitle.textContent, 'Arbetslista (0)');
  assert.equal(queueHistoryList.dataset.queueListMode, 'live');
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="runtime-unified-empty"/);
  assert.match(
    queueHistoryList.innerHTML,
    /Välj fler mailboxar eller vänta på nästa inkommande konversation\.|Mailboxfiltret gav inga aktiva trådar/
  );
  assert.doesNotMatch(queueHistoryList.innerHTML, /queue-history-empty/);
});

test('renderQueueHistorySection visar redan kända livekort under loading när kön ännu har trådar', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const buildUnifiedQueueLoadingItemsSource = extractFunctionSource(source, 'buildUnifiedQueueLoadingItems');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const loadingThreads = [
    {
      id: 'runtime-loading-thread-1',
      customerName: 'Livekund 1',
      mailboxAddress: 'contact@hairtpclinic.com',
      subject: 'Första aktiv tråd',
    },
    {
      id: 'runtime-loading-thread-2',
      customerName: 'Livekund 2',
      mailboxAddress: 'contact@hairtpclinic.com',
      subject: 'Andra aktiv tråd',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${buildUnifiedQueueLoadingItemsSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => loadingThreads,
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        live: true,
        loading: true,
        activeLaneId: 'all',
        selectedThreadId: 'runtime-loading-thread-1',
        queueInlinePanel: {
          open: false,
          laneId: '',
          feedKey: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueTitle.textContent, 'Arbetslista (2)');
  assert.equal(queueHistoryMeta.textContent, 'Synkar live-trådar…');
  assert.equal(queueHistoryList.dataset.queueListMode, 'live');
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="runtime-loading-thread-1"/);
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="runtime-loading-thread-2"/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /Synkar live-kö/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /Förbereder arbetsyta/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /queue-history-empty/);
});

test('renderQueueInlineLaneList använder befintlig thread-card-live-design i live-läget', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'renderQueueInlineLaneList');

  assert.match(
    functionSource,
    /queueHistoryList\.dataset\.queueListMode = "live"/,
    'Den enhetliga vänsterkön ska markera sitt läge som live när riktiga runtime-trådar renderas.'
  );

  assert.match(
    functionSource,
    /const renderLiveThreadCard =[\s\S]*typeof buildThreadCardMarkup === "function"[\s\S]*renderLiveThreadCard\(thread,\s*index,\s*thread\.id === state\.runtime\.selectedThreadId\)/,
    'Live-rader i den enhetliga vänsterkön ska använda den redan befintliga thread-card-live-designen och ha en säker fallback när hjälpen saknas.'
  );
});

test('renderQueueHistorySection visar skickade i samma inline-shell som historik', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const getQueueInlineFeedMetaSource = extractFunctionSource(source, 'getQueueInlineFeedMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const getMailFeedRuntimeThreadsSource = extractFunctionSource(source, 'getMailFeedRuntimeThreads');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const sentThreads = [
    {
      id: 'sent-1',
      customerName: 'Egzona',
      lastActivityLabel: 'Idag 21:39',
      lastActivityAt: '2026-03-30T21:39:00.000Z',
      displaySubject: 'RE: Bekräftad bokning',
      preview: 'Skickat från Kons med tydligt nästa steg.',
      mailboxLabel: 'Kons',
      tags: ['sent'],
      mailboxAddress: 'kons@hairtpclinic.com',
    },
  ];

  const renderQueueHistorySection = new Function(
    'MAIL_FEEDS',
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'getMailboxScopedRuntimeThreads',
    'getMailFeedRuntimeState',
    'isLaterRuntimeThread',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${getQueueInlineFeedMetaSource}
     ${renderQueueHistoryListSource}
     ${getMailFeedRuntimeThreadsSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { sent: [] },
    { all: 'Alla' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => sentThreads,
    () => ({ selectedKeys: [] }),
    () => false,
    (thread) => Array.isArray(thread?.tags) && thread.tags.includes('sent'),
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        queueInlinePanel: {
          open: true,
          laneId: '',
          feedKey: 'sent',
        },
        queueHistory: {
          open: false,
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueContent.hidden, true);
  assert.equal(queueTitle.textContent, 'Skickade (1)');
  assert.match(queueHistoryMeta.textContent, /skickade mejl/i);
  assert.match(queueHistoryList.innerHTML, /data-runtime-thread="sent-1"/);
});

test('renderQueueHistorySection prioriterar historik over live-fel nar historikpanelen ar oppen', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const historyItems = [
    {
      initials: 'SG',
      counterpartyLabel: 'Shahram',
      title: 'Offline historiktrad',
      detail: 'Historik ska synas aven nar live runtime ar offline.',
      mailboxLabel: 'Kons',
      recordedAt: '2026-03-30T10:00:00.000Z',
      time: '30 mars',
      direction: 'inbound',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        mode: 'offline_history',
        live: false,
        authRequired: false,
        error: 'Servern kör offline-läge.',
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
        },
        queueHistory: {
          open: true,
          loading: false,
          error: '',
          items: historyItems,
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueTitle.textContent, 'Historik (1)');
  assert.equal(queueHistoryMeta.textContent, '');
  assert.doesNotMatch(queueHistoryMeta.textContent, /offline historikläge/i);
  assert.match(queueHistoryList.innerHTML, /Shahram/);
  assert.match(queueHistoryList.innerHTML, /Offline historiktrad/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /Servern kör offline-läge/i);
});

test('renderQueueHistorySection visar offline fallback-arbetslista i defaultlaget', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const defaultThreads = [
    {
      id: 'offline-thread-1',
      customerName: 'Pedram',
      lastActivityLabel: 'Idag 09:30',
      lastActivityAt: '2026-03-31T09:30:00.000Z',
      displaySubject: 'Historikbaserad fallback',
      preview: 'Arbetskön ska visa historikbaserad fallback utan att fastna i live-felet.',
      mailboxLabel: 'Kons',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => defaultThreads,
    () => defaultThreads,
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        mode: 'offline_history',
        live: false,
        authRequired: false,
        loading: false,
        error: 'Servern kör offline-läge.',
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueTitle.textContent, 'Arbetslista (1)');
  assert.equal(queueHistoryMeta.textContent, '');
  assert.match(queueHistoryList.innerHTML, /offline-thread-1/);
  assert.match(queueHistoryList.innerHTML, /Arbetskön ska visa historikbaserad fallback/);
  assert.doesNotMatch(queueHistoryList.innerHTML, /Servern kör offline-läge/i);
});

test('renderQueueHistorySection visar inte separat offline-meta nar lokal historik saknas', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla', 'act-now': 'Agera nu' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => [],
    () => [],
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        mode: 'offline_history',
        live: false,
        authRequired: false,
        loading: false,
        error: 'Ingen lokal historik hittades i valt mailboxscope ännu. Livekön är fortsatt offline.',
        offlineWorkingSetMeta:
          'Ingen lokal historik hittades i valt mailboxscope ännu.',
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(queueTitle.textContent, 'Arbetslista (0)');
  assert.equal(queueHistoryMeta.textContent, '');
  assert.match(
    queueHistoryList.innerHTML,
    /Ingen lokal historik hittades i valt mailboxscope ännu\.|Livekön är offline och ingen historik hittades i valt mailboxscope ännu\./
  );
  assert.doesNotMatch(queueHistoryList.innerHTML, /Livekön kunde inte läsas just nu/i);
});

test('renderQueueHistorySection håller Historik neutral och gör inte Alla eller Historik till särskilda specialytor', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');

  assert.doesNotMatch(
    source,
    /hela mailboxens strukturerade mejlspår|arbetslistans Alla|full mailboxyta/i,
    'Historikcopy ska inte skriva om CCO-ytan till en ny produktmodell.'
  );

  assert.match(
    source,
    /Ingen historik hittades i valt mailboxscope ännu\./,
    'Historik ska beskrivas neutralt utan att få ett separat specialläge i meta-raden.'
  );
});

test('renderQueueHistorySection döljer scope-actions i offline_history', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');

  assert.match(
    source,
    /const showHistoryCompleteAction =[\s\S]*runtimeMode !== "offline_history"/,
    'Historikhuvudets klar-action ska inte visas i offline_history eftersom tråden inte är live-handlingsbar där.'
  );

  assert.match(
    source,
    /const showHistoryDeleteAction =[\s\S]*runtimeMode !== "offline_history"/,
    'Historikhuvudets delete-action ska inte visas i offline_history eftersom den tidigare skapade ett extra actionlager i fallback-läget.'
  );
});

test('renderQueueHistorySection kan inte återvisa legacy queue-content när unified queue-list är aktiv', () => {
  const source = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const getQueueHistoryItemInitialsSource = extractFunctionSource(source, 'getQueueHistoryItemInitials');
  const buildQueueHistoryCardMarkupSource = extractFunctionSource(source, 'buildQueueHistoryCardMarkup');
  const buildQueueInlineLaneHistoryItemSource = extractFunctionSource(source, 'buildQueueInlineLaneHistoryItem');
  const renderQueueInlineLaneListSource = extractFunctionSource(source, 'renderQueueInlineLaneList');
  const getQueueInlineLaneMetaSource = extractFunctionSource(source, 'getQueueInlineLaneMeta');
  const renderQueueHistoryListSource = extractFunctionSource(source, 'renderQueueHistoryList');
  const renderQueueHistorySectionSource = extractFunctionSource(source, 'renderQueueHistorySection');

  const queueHistoryPanel = createElementStub();
  const queueHistoryToggle = createElementStub();
  const queuePrimaryLaneTag = createElementStub();
  const queueContent = createElementStub();
  const queueHistoryHead = createElementStub();
  const queueHistoryMeta = createElementStub();
  const queueHistoryList = createElementStub();
  const queueHistoryLoadMoreButton = createElementStub();
  const queueTitle = createElementStub();
  const defaultThreads = [
    {
      id: 'queue-kons-1',
      customerName: 'Shahram',
      lastActivityLabel: '30 mars',
      lastActivityAt: '2026-03-30T10:00:00.000Z',
      displaySubject: 'Kons arbetsyta',
      preview: 'Legacy-listan får inte bli synlig igen.',
      mailboxLabel: 'Kons',
    },
  ];

  const renderQueueHistorySection = new Function(
    'QUEUE_LANE_LABELS',
    'asArray',
    'asText',
    'compactRuntimeCopy',
    'escapeHtml',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isSentRuntimeThread',
    'normalizeKey',
    'queueContent',
    'queueHistoryCount',
    'queueHistoryHead',
    'queueHistoryList',
    'queueHistoryLoadMoreButton',
    'queueHistoryMeta',
    'queueHistoryPanel',
    'queueHistoryToggle',
    'queuePrimaryLaneTag',
    'renderThreadContextRows',
    'setQueueContextVisibility',
    'state',
    'queueTitle',
    `${getQueueHistoryItemInitialsSource}
     ${buildQueueHistoryCardMarkupSource}
     ${buildQueueInlineLaneHistoryItemSource}
     ${renderQueueInlineLaneListSource}
     ${getQueueInlineLaneMetaSource}
     ${renderQueueHistoryListSource}
     ${renderQueueHistorySectionSource}
     return renderQueueHistorySection;`
  )(
    { all: 'Alla' },
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => (typeof value === 'string' ? value : value == null ? '' : String(value)),
    (value) => String(value),
    () => defaultThreads,
    () => defaultThreads,
    () => false,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    queueContent,
    null,
    queueHistoryHead,
    queueHistoryList,
    queueHistoryLoadMoreButton,
    queueHistoryMeta,
    queueHistoryPanel,
    queueHistoryToggle,
    queuePrimaryLaneTag,
    () => {},
    () => {},
    {
      runtime: {
        mode: 'live',
        live: true,
        authRequired: false,
        loading: false,
        error: '',
        activeLaneId: 'all',
        queueInlinePanel: {
          open: false,
          laneId: '',
          feedKey: '',
        },
        queueHistory: {
          open: false,
          loading: false,
          error: '',
          items: [],
          hasMore: false,
        },
      },
    },
    queueTitle
  );

  renderQueueHistorySection();

  assert.equal(queueHistoryPanel.hidden, false);
  assert.equal(
    queueContent.hidden,
    true,
    'queueContent måste förbli dold när queue-history-list är den aktiva listytan.'
  );
  assert.equal(queueTitle.textContent, 'Arbetslista (1)');
  assert.match(queueHistoryList.innerHTML, /queue-kons-1/);
});
