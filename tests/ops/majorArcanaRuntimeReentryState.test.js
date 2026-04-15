const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REENTRY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-reentry-state.js'
);

function createSessionStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function createReentryHarness({
  initialRuntime = {},
  initialWorkspace = {},
} = {}) {
  const source = fs.readFileSync(REENTRY_PATH, 'utf8');
  const sessionStorage = createSessionStorage();
  const windowObject = {
    sessionStorage,
  };
  windowObject.window = windowObject;

  const createdModule = new Function(
    'window',
    `${source}
     return window.MajorArcanaPreviewReentryState;`
  )(windowObject);

  assert.ok(createdModule, 'Kunde inte ladda reentry-modulen.');

  const state = {
    runtime: {
      mode: 'live',
      leftColumnMode: 'default',
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'all',
      activeLaneId: 'all',
      activeFocusSection: 'conversation',
      historyExpanded: true,
      historyContextThreadId: 'thread-1',
      historySearch: '',
      historyMailboxFilter: 'all',
      historyResultTypeFilter: 'all',
      historyRangeFilter: 'all',
      queueInlinePanel: { open: false, laneId: '', feedKey: '' },
      queueHistory: { open: false, selectedConversationId: '', scopeKey: '' },
      reentry: {},
      ...initialRuntime,
    },
  };

  const workspace = {
    selectedMailboxIds: Array.isArray(initialWorkspace.selectedMailboxIds)
      ? initialWorkspace.selectedMailboxIds.slice()
      : state.runtime.selectedMailboxIds.slice(),
    selectedThreadId: typeof initialWorkspace.selectedThreadId === 'string'
      ? initialWorkspace.selectedThreadId
      : state.runtime.selectedThreadId,
    selectedOwnerKey: typeof initialWorkspace.selectedOwnerKey === 'string'
      ? initialWorkspace.selectedOwnerKey
      : state.runtime.selectedOwnerKey,
    activeLaneId: typeof initialWorkspace.activeLaneId === 'string'
      ? initialWorkspace.activeLaneId
      : state.runtime.activeLaneId,
    focusSection: typeof initialWorkspace.focusSection === 'string'
      ? initialWorkspace.focusSection
      : state.runtime.activeFocusSection,
    historyExpanded:
      typeof initialWorkspace.historyExpanded === 'boolean'
        ? initialWorkspace.historyExpanded
        : state.runtime.historyExpanded,
  };

  const api = createdModule.createRuntimeReentryStateApi({
    asArray(value) {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    asText(value, fallback = '') {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    canonicalizeRuntimeMailboxId(value) {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    getRuntimeLeftColumnState() {
      return { mode: state.runtime.leftColumnMode };
    },
    normalizeKey(value, fallback = '') {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return fallback;
      return String(value).trim().toLowerCase();
    },
    normalizeMailboxId(value) {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    state,
    workspaceSourceOfTruth: {
      getSelectedMailboxIds() {
        return workspace.selectedMailboxIds.slice();
      },
      setSelectedMailboxIds(nextMailboxIds) {
        workspace.selectedMailboxIds = Array.isArray(nextMailboxIds)
          ? nextMailboxIds.slice()
          : [];
        state.runtime.selectedMailboxIds = workspace.selectedMailboxIds.slice();
        return workspace.selectedMailboxIds.slice();
      },
      getSelectedThreadId() {
        return workspace.selectedThreadId;
      },
      setSelectedThreadId(nextThreadId) {
        workspace.selectedThreadId =
          typeof nextThreadId === 'string'
            ? nextThreadId
            : nextThreadId === undefined || nextThreadId === null
              ? ''
              : String(nextThreadId);
        state.runtime.selectedThreadId = workspace.selectedThreadId;
        return workspace.selectedThreadId;
      },
      getSelectedOwnerKey() {
        return workspace.selectedOwnerKey;
      },
      setSelectedOwnerKey(nextOwnerKey) {
        workspace.selectedOwnerKey =
          typeof nextOwnerKey === 'string'
            ? nextOwnerKey
            : nextOwnerKey === undefined || nextOwnerKey === null
              ? 'all'
              : String(nextOwnerKey);
        state.runtime.selectedOwnerKey = workspace.selectedOwnerKey;
        return workspace.selectedOwnerKey;
      },
      getActiveLaneId() {
        return workspace.activeLaneId;
      },
      setActiveLaneId(nextLaneId) {
        workspace.activeLaneId =
          typeof nextLaneId === 'string'
            ? nextLaneId
            : nextLaneId === undefined || nextLaneId === null
              ? 'all'
              : String(nextLaneId);
        state.runtime.activeLaneId = workspace.activeLaneId;
        return workspace.activeLaneId;
      },
      setFocusSection(nextSection) {
        workspace.focusSection =
          typeof nextSection === 'string'
            ? nextSection
            : nextSection === undefined || nextSection === null
              ? 'conversation'
              : String(nextSection);
        state.runtime.activeFocusSection = workspace.focusSection;
        return workspace.focusSection;
      },
      setHistoryExpanded(nextOpen) {
        workspace.historyExpanded = Boolean(nextOpen);
        state.runtime.historyExpanded = workspace.historyExpanded;
        return workspace.historyExpanded;
      },
    },
    windowObject,
  });

  return { api, sessionStorage, state, workspace };
}

test('runtime re-entry restore fångar exakt sparat state och klassas som restored_from_saved_state', () => {
  const harness = createReentryHarness({
    initialRuntime: {
      mode: 'live',
      leftColumnMode: 'default',
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      activeFocusSection: 'history',
      historyExpanded: false,
      historyContextThreadId: 'thread-1',
      historySearch: 'egzona',
      historyMailboxFilter: 'kons',
      historyResultTypeFilter: 'message',
      historyRangeFilter: '7d',
      queueInlinePanel: { open: true, laneId: 'act-now', feedKey: 'sent' },
      queueHistory: { open: true, selectedConversationId: 'thread-1', scopeKey: 'kons' },
    },
    initialWorkspace: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      focusSection: 'history',
      historyExpanded: false,
    },
  });

  const savedSnapshot = harness.api.captureRuntimeReentrySnapshot({
    reason: 'before_auth_loss',
  });
  assert.equal(savedSnapshot.selectedThreadId, 'thread-1');
  assert.ok(
    harness.sessionStorage.getItem('cco.runtimeReentryState.v1'),
    'Förväntade att snapshot sparas i sessionStorage.'
  );

  harness.state.runtime.selectedMailboxIds = ['archive@hairtpclinic.com'];
  harness.state.runtime.selectedThreadId = 'thread-9';
  harness.state.runtime.selectedOwnerKey = 'all';
  harness.state.runtime.activeLaneId = 'all';
  harness.state.runtime.activeFocusSection = 'conversation';
  harness.state.runtime.historyExpanded = true;
  harness.state.runtime.historyContextThreadId = '';
  harness.state.runtime.historySearch = '';
  harness.state.runtime.historyMailboxFilter = 'all';
  harness.state.runtime.historyResultTypeFilter = 'all';
  harness.state.runtime.historyRangeFilter = 'all';
  harness.state.runtime.queueInlinePanel = { open: false, laneId: '', feedKey: '' };
  harness.state.runtime.queueHistory = { open: false, selectedConversationId: '', scopeKey: '' };

  const outcome = harness.api.restoreRuntimeReentrySnapshot({ reason: 'auth_return' });

  assert.equal(outcome.status, 'restored_from_saved_state');
  assert.equal(outcome.exactMatch, true);
  assert.equal(harness.state.runtime.selectedThreadId, 'thread-1');
  assert.deepEqual(harness.workspace.selectedMailboxIds, ['kons@hairtpclinic.com']);
  assert.equal(harness.state.runtime.historyExpanded, false);
  assert.equal(harness.state.runtime.queueHistory.selectedConversationId, 'thread-1');
  assert.equal(harness.api.getRuntimeReentryOutcome().status, 'restored_from_saved_state');
});

test('runtime re-entry hint-only restore låter live scope ligga kvar när snapshot annars är stale', () => {
  const harness = createReentryHarness({
    initialRuntime: {
      mode: 'live',
      leftColumnMode: 'default',
      selectedMailboxIds: ['live@hairtpclinic.com'],
      selectedThreadId: 'thread-live',
      selectedOwnerKey: 'all',
      activeLaneId: 'all',
      activeFocusSection: 'conversation',
      historyExpanded: true,
      historyContextThreadId: '',
      historySearch: '',
      historyMailboxFilter: 'all',
      historyResultTypeFilter: 'all',
      historyRangeFilter: 'all',
      queueInlinePanel: { open: false, laneId: '', feedKey: '' },
      queueHistory: { open: false, selectedConversationId: '', scopeKey: '' },
    },
    initialWorkspace: {
      selectedMailboxIds: ['live@hairtpclinic.com'],
      selectedThreadId: 'thread-live',
      selectedOwnerKey: 'all',
      activeLaneId: 'all',
      focusSection: 'conversation',
      historyExpanded: true,
    },
  });

  harness.state.runtime.selectedMailboxIds = ['stale@hairtpclinic.com'];
  harness.workspace.selectedMailboxIds = ['stale@hairtpclinic.com'];
  harness.state.runtime.selectedThreadId = 'thread-stale';
  harness.workspace.selectedThreadId = 'thread-stale';
  harness.state.runtime.selectedOwnerKey = 'sprint';
  harness.workspace.selectedOwnerKey = 'sprint';
  harness.state.runtime.activeLaneId = 'act-now';
  harness.workspace.activeLaneId = 'act-now';
  harness.state.runtime.queueInlinePanel = { open: true, laneId: 'act-now', feedKey: '' };
  harness.state.runtime.queueHistory = {
    open: true,
    selectedConversationId: 'thread-stale',
    scopeKey: 'stale',
  };

  const savedSnapshot = harness.api.captureRuntimeReentrySnapshot({
    reason: 'before_live_reload',
  });
  assert.deepEqual(savedSnapshot.mailboxscope, ['stale@hairtpclinic.com']);

  harness.state.runtime.selectedMailboxIds = ['live@hairtpclinic.com'];
  harness.workspace.selectedMailboxIds = ['live@hairtpclinic.com'];
  harness.state.runtime.selectedThreadId = 'thread-live';
  harness.workspace.selectedThreadId = 'thread-live';
  harness.state.runtime.selectedOwnerKey = 'all';
  harness.workspace.selectedOwnerKey = 'all';
  harness.state.runtime.activeLaneId = 'all';
  harness.workspace.activeLaneId = 'all';
  harness.state.runtime.queueInlinePanel = { open: false, laneId: '', feedKey: '' };
  harness.state.runtime.queueHistory = {
    open: false,
    selectedConversationId: '',
    scopeKey: '',
  };

  const outcome = harness.api.restoreRuntimeReentrySnapshot({
    reason: 'live_runtime_load',
    scopeMode: 'hint_only',
  });

  assert.equal(outcome.status === 'restored_from_saved_state', false);
  assert.deepEqual(harness.workspace.selectedMailboxIds, ['live@hairtpclinic.com']);
  assert.equal(harness.state.runtime.selectedOwnerKey, 'all');
  assert.equal(harness.state.runtime.activeLaneId, 'all');
  assert.equal(harness.state.runtime.queueInlinePanel.open, false);
  assert.equal(harness.state.runtime.queueHistory.open, false);
});

test('runtime re-entry restore klassas som restored_with_partial_fallback när ett grundfält avviker', () => {
  const harness = createReentryHarness();

  harness.api.captureRuntimeReentrySnapshot({ reason: 'before_auth_loss' });
  harness.state.runtime.mode = 'auth_required';
  harness.state.runtime.selectedThreadId = 'thread-9';
  harness.state.runtime.selectedMailboxIds = ['archive@hairtpclinic.com'];
  harness.state.runtime.queueHistory = { open: false, selectedConversationId: '', scopeKey: '' };

  const outcome = harness.api.restoreRuntimeReentrySnapshot({ reason: 'auth_return' });

  assert.equal(outcome.status, 'restored_with_partial_fallback');
  assert.equal(outcome.exactMatch, false);
  assert.ok(outcome.fallbackFields.includes('runtimeMode'));
  assert.ok(outcome.matchedFields.includes('selectedThreadId'));
  assert.deepEqual(harness.workspace.selectedMailboxIds, ['kons@hairtpclinic.com']);
  assert.equal(harness.state.runtime.selectedThreadId, 'thread-1');
});

test('runtime re-entry capture skriver inte över en meningsfull snapshot med default-läge', () => {
  const harness = createReentryHarness({
    initialRuntime: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      activeFocusSection: 'history',
      historyExpanded: false,
      historyContextThreadId: 'thread-1',
      historySearch: 'egzona',
      historyMailboxFilter: 'kons',
      historyResultTypeFilter: 'message',
      historyRangeFilter: '7d',
      queueInlinePanel: { open: true, laneId: 'act-now', feedKey: 'sent' },
      queueHistory: { open: true, selectedConversationId: 'thread-1', scopeKey: 'kons' },
    },
    initialWorkspace: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      focusSection: 'history',
      historyExpanded: false,
    },
  });

  const savedSnapshot = harness.api.captureRuntimeReentrySnapshot({
    reason: 'before_auth_loss',
  });
  assert.equal(savedSnapshot.selectedThreadId, 'thread-1');
  assert.equal(harness.api.getRuntimeReentrySnapshot().selectedThreadId, 'thread-1');

  harness.state.runtime.selectedMailboxIds = [];
  harness.state.runtime.selectedThreadId = '';
  harness.state.runtime.selectedOwnerKey = 'all';
  harness.state.runtime.activeLaneId = 'all';
  harness.state.runtime.activeFocusSection = 'conversation';
  harness.state.runtime.historyExpanded = true;
  harness.state.runtime.historyContextThreadId = '';
  harness.state.runtime.historySearch = '';
  harness.state.runtime.historyMailboxFilter = 'all';
  harness.state.runtime.historyResultTypeFilter = 'all';
  harness.state.runtime.historyRangeFilter = 'all';
  harness.state.runtime.queueInlinePanel = { open: false, laneId: '', feedKey: '' };
  harness.state.runtime.queueHistory = { open: false, selectedConversationId: '', scopeKey: '' };

  const snapshotAfterDefaultCapture = harness.api.captureRuntimeReentrySnapshot({
    reason: 'auth_failure',
  });

  assert.equal(snapshotAfterDefaultCapture.selectedThreadId, 'thread-1');
  assert.equal(harness.api.getRuntimeReentrySnapshot().selectedThreadId, 'thread-1');
  assert.equal(harness.api.getRuntimeReentrySnapshot().queueHistory.selectedConversationId, 'thread-1');
});

test('runtime re-entry capture skriver inte över saved state vid focus_section_change noise', () => {
  const harness = createReentryHarness({
    initialRuntime: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      activeFocusSection: 'history',
      historyExpanded: false,
      historyContextThreadId: 'thread-1',
      historySearch: 'egzona',
      historyMailboxFilter: 'kons',
      historyResultTypeFilter: 'message',
      historyRangeFilter: '7d',
      queueInlinePanel: { open: true, laneId: 'act-now', feedKey: 'sent' },
      queueHistory: { open: true, selectedConversationId: 'thread-1', scopeKey: 'kons' },
    },
    initialWorkspace: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'thread-1',
      selectedOwnerKey: 'sprint',
      activeLaneId: 'act-now',
      focusSection: 'history',
      historyExpanded: false,
    },
  });

  harness.api.captureRuntimeReentrySnapshot({ reason: 'before_auth_loss' });
  harness.state.runtime.selectedMailboxIds = [];
  harness.state.runtime.selectedThreadId = '';
  harness.state.runtime.selectedOwnerKey = 'all';
  harness.state.runtime.activeLaneId = 'all';
  harness.state.runtime.activeFocusSection = 'conversation';
  harness.state.runtime.historyExpanded = true;
  harness.state.runtime.historyContextThreadId = '';
  harness.state.runtime.historySearch = '';
  harness.state.runtime.historyMailboxFilter = 'all';
  harness.state.runtime.historyResultTypeFilter = 'all';
  harness.state.runtime.historyRangeFilter = 'all';
  harness.state.runtime.queueInlinePanel = { open: false, laneId: '', feedKey: '' };
  harness.state.runtime.queueHistory = { open: false, selectedConversationId: '', scopeKey: '' };

  harness.api.captureRuntimeReentrySnapshot({ reason: 'focus_section_change' });

  assert.equal(harness.api.getRuntimeReentrySnapshot().selectedThreadId, 'thread-1');
  assert.equal(harness.api.getRuntimeReentrySnapshot().queueHistory.selectedConversationId, 'thread-1');
});

test('runtime re-entry capture skriver inte över Historik-snapshot vid runtime_thread_selected noise under reload', () => {
  const harness = createReentryHarness({
    initialRuntime: {
      mode: 'live',
      leftColumnMode: 'history',
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'history-thread-1',
      selectedOwnerKey: 'all',
      activeLaneId: 'all',
      activeFocusSection: 'notes',
      historyExpanded: true,
      historyContextThreadId: 'history-thread-1',
      historySearch: '',
      historyMailboxFilter: 'all',
      historyResultTypeFilter: 'all',
      historyRangeFilter: 'all',
      queueInlinePanel: { open: false, laneId: '', feedKey: '' },
      queueHistory: {
        open: true,
        selectedConversationId: 'history-thread-1',
        scopeKey: 'kons@hairtpclinic.com',
      },
    },
    initialWorkspace: {
      selectedMailboxIds: ['kons@hairtpclinic.com'],
      selectedThreadId: 'history-thread-1',
      selectedOwnerKey: 'all',
      activeLaneId: 'all',
      focusSection: 'notes',
      historyExpanded: true,
    },
  });

  harness.api.captureRuntimeReentrySnapshot({ reason: 'before_live_reload' });

  harness.state.runtime.leftColumnMode = 'default';
  harness.state.runtime.selectedThreadId = 'live-thread-1';
  harness.workspace.selectedThreadId = 'live-thread-1';
  harness.state.runtime.activeFocusSection = 'conversation';
  harness.workspace.focusSection = 'conversation';
  harness.state.runtime.historyContextThreadId = 'live-thread-1';
  harness.state.runtime.queueHistory = {
    open: false,
    selectedConversationId: '',
    scopeKey: 'kons@hairtpclinic.com',
  };

  const noisySnapshot = harness.api.captureRuntimeReentrySnapshot({
    reason: 'runtime_thread_selected',
  });

  assert.equal(noisySnapshot.leftColumnMode, 'history');
  assert.equal(noisySnapshot.activeFocusSection, 'notes');
  assert.equal(noisySnapshot.selectedThreadId, 'live-thread-1');
  assert.equal(noisySnapshot.queueHistory.open, true);
  assert.equal(noisySnapshot.queueHistory.selectedConversationId, 'history-thread-1');
  assert.equal(
    harness.api.getRuntimeReentrySnapshot().queueHistory.selectedConversationId,
    'history-thread-1'
  );
});

test('runtime re-entry restore faller tydligt tillbaka till default utan sparad snapshot', () => {
  const harness = createReentryHarness();

  const outcome = harness.api.restoreRuntimeReentrySnapshot({ reason: 'auth_return' });

  assert.equal(outcome.status, 'fallback_to_default');
  assert.equal(outcome.exactMatch, false);
  assert.equal(harness.api.getRuntimeReentrySnapshot(), null);
  assert.equal(harness.api.getRuntimeReentryOutcome().status, 'fallback_to_default');
});
