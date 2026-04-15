const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i app.js.`);

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

  throw new Error(`Kunde inte extrahera ${functionName} från app.js.`);
}

function createReconcileHarness({
  initialSelectedThreadId = '',
  initialHistoryContextThreadId = 'history-open',
  visibleThreads = [],
  initialSelectedMailboxIds = ['contact@hairtpclinic.com'],
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'reconcileRuntimeSelection');
  const writeCalls = [];
  const mailboxWrites = [];
  let selectedThreadId = initialSelectedThreadId;
  let selectedMailboxIds = initialSelectedMailboxIds.slice();
  let resetCount = 0;
  const state = {
    runtime: {
      historyContextThreadId: initialHistoryContextThreadId,
    },
  };

  const reconcileRuntimeSelection = new Function(
    'asArray',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'getFilteredRuntimeThreads',
    'isVerificationRuntimeThread',
    'resetRuntimeHistoryFilters',
    'runtimeConversationIdsMatch',
    'state',
    'getThreadHistoryMailboxOptions',
    'getSelectedRuntimeMailboxScopeIds',
    'workspaceSourceOfTruth',
    `${functionSource}; return reconcileRuntimeSelection;`
  )(
    (value) => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    () => visibleThreads,
    (thread) => thread?.isVerificationThread === true,
    () => {
      resetCount += 1;
    },
    (left, right) =>
      String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(),
    state,
    (thread) =>
      Array.isArray(thread?.historyMailboxOptions) && thread.historyMailboxOptions.length
        ? thread.historyMailboxOptions
        : thread?.mailboxAddress
          ? [{ id: thread.mailboxAddress, label: thread.mailboxLabel || thread.mailboxAddress }]
          : [],
    () => selectedMailboxIds.slice(),
    {
      getSelectedThreadId() {
        return selectedThreadId;
      },
      setSelectedThreadId(nextThreadId) {
        selectedThreadId =
          typeof nextThreadId === 'string'
            ? nextThreadId
            : nextThreadId === undefined || nextThreadId === null
              ? ''
              : String(nextThreadId);
        writeCalls.push(selectedThreadId);
        return selectedThreadId;
      },
      getSelectedMailboxIds() {
        return selectedMailboxIds.slice();
      },
      setSelectedMailboxIds(nextMailboxIds) {
        selectedMailboxIds = Array.isArray(nextMailboxIds) ? nextMailboxIds.slice() : [];
        mailboxWrites.push(selectedMailboxIds.slice());
        return selectedMailboxIds.slice();
      },
    }
  );

  return {
    getResetCount() {
      return resetCount;
    },
    getSelectedMailboxIds() {
      return selectedMailboxIds.slice();
    },
    getSelectedThreadId() {
      return selectedThreadId;
    },
    getSelectedMailboxWrites() {
      return mailboxWrites.map((entry) => entry.slice());
    },
    run(options = {}) {
      return reconcileRuntimeSelection(visibleThreads, options);
    },
    state,
    writeCalls,
  };
}

function createNormalizeScopeHarness({
  threads = [],
  filteredThreads = threads,
  filteredThreadsByLane = null,
  mailboxScopedThreads = threads,
  queueScopedThreads = mailboxScopedThreads,
  selectedMailboxIds = ['contact@hairtpclinic.com'],
  selectedOwnerKey = 'all',
  activeLaneId = 'all',
  selectedThreadId = 'thread-current',
  availableMailboxes = [{ id: 'contact@hairtpclinic.com', label: 'Contact' }],
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'normalizeVisibleRuntimeScope');
  const reconcileCalls = [];
  const selectedMailboxWrites = [];
  const ownerWrites = [];
  const laneWrites = [];
  let mailboxIds = selectedMailboxIds.slice();
  let ownerKey = selectedOwnerKey;
  let laneId = activeLaneId;
  let currentThreadId = selectedThreadId;
  const state = {
    runtime: {
      threads,
    },
  };

  const normalizeVisibleRuntimeScope = new Function(
    'asText',
    'getAvailableRuntimeMailboxes',
    'getFilteredRuntimeThreads',
    'getMailboxScopedRuntimeThreads',
    'getOrderedQueueLaneIds',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'isHandledRuntimeThread',
    'isVerificationRuntimeThread',
    'normalizeKey',
    'normalizeMailboxId',
    'normalizePrimaryQueueLaneId',
    'runtimeConversationIdsMatch',
    'reconcileRuntimeSelection',
    'state',
    'workspaceSourceOfTruth',
    `${functionSource}; return normalizeVisibleRuntimeScope;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => availableMailboxes,
    () => {
      if (filteredThreadsByLane && typeof filteredThreadsByLane === 'object') {
        return Array.isArray(filteredThreadsByLane[laneId]) ? filteredThreadsByLane[laneId] : [];
      }
      return filteredThreads;
    },
    () => mailboxScopedThreads,
    () => ['later', 'sprint', 'act-now', 'high-risk'],
    (laneId, laneThreads = []) => {
      const normalizedLaneId =
        typeof laneId === 'string' ? laneId.trim().toLowerCase() : String(laneId || '').trim().toLowerCase();
      return Array.isArray(laneThreads)
        ? laneThreads.filter((thread) => Array.isArray(thread.tags) && thread.tags.includes(normalizedLaneId))
        : [];
    },
    () => queueScopedThreads,
    (thread) => Boolean(thread?.handled),
    (thread) => thread?.isVerificationThread === true,
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    (value) => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? ''
            : String(value);
      return text.trim().toLowerCase();
    },
    (value) => {
      const normalizedLaneId =
        typeof value === 'string'
          ? value.trim().toLowerCase()
          : value === undefined || value === null
            ? 'all'
            : String(value).trim().toLowerCase();
      const allowedLaneIds = ['all', 'later', 'sprint', 'act-now', 'high-risk'];
      return allowedLaneIds.includes(normalizedLaneId) ? normalizedLaneId : 'all';
    },
    (left, right) =>
      String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(),
    (visible, options) => {
      reconcileCalls.push({
        visibleThreadIds: Array.isArray(visible) ? visible.map((thread) => thread.id) : [],
        options,
      });
      return {
        changed: false,
        previousSelectedThreadId: currentThreadId,
        selectedThreadId: currentThreadId,
      };
    },
    state,
    {
      getActiveLaneId() {
        return laneId;
      },
      getSelectedMailboxIds() {
        return mailboxIds.slice();
      },
      getSelectedOwnerKey() {
        return ownerKey;
      },
      getSelectedThreadId() {
        return currentThreadId;
      },
      setActiveLaneId(nextLaneId) {
        laneId = nextLaneId;
        laneWrites.push(nextLaneId);
        return laneId;
      },
      setSelectedMailboxIds(nextMailboxIds) {
        mailboxIds = Array.isArray(nextMailboxIds) ? nextMailboxIds.slice() : [];
        selectedMailboxWrites.push(mailboxIds.slice());
        return mailboxIds.slice();
      },
      setSelectedOwnerKey(nextOwnerKey) {
        ownerKey = nextOwnerKey;
        ownerWrites.push(nextOwnerKey);
        return ownerKey;
      },
    }
  );

  return {
    getLaneWrites() {
      return laneWrites.slice();
    },
    getOwnerWrites() {
      return ownerWrites.slice();
    },
    getReconcileCalls() {
      return reconcileCalls.slice();
    },
    getSelectedMailboxWrites() {
      return selectedMailboxWrites.map((entry) => entry.slice());
    },
    run(options = {}) {
      return normalizeVisibleRuntimeScope(options);
    },
  };
}

function createEnsureRuntimeMailboxSelectionHarness({
  availableMailboxIds = [],
  selectedMailboxIds = ['contact@hairtpclinic.com'],
  preferredMailboxId = 'kons@hairtpclinic.com',
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'ensureRuntimeMailboxSelection');
  const mailboxWrites = [];
  let currentSelectedMailboxIds = selectedMailboxIds.slice();

  const ensureRuntimeMailboxSelection = new Function(
    'getCanonicalAvailableRuntimeMailboxIds',
    'getPreferredOperationalMailboxId',
    'workspaceSourceOfTruth',
    `${functionSource}; return ensureRuntimeMailboxSelection;`
  )(
    () => availableMailboxIds.slice(),
    () => preferredMailboxId,
    {
      getSelectedMailboxIds() {
        return currentSelectedMailboxIds.slice();
      },
      setSelectedMailboxIds(nextMailboxIds) {
        currentSelectedMailboxIds = Array.isArray(nextMailboxIds) ? nextMailboxIds.slice() : [];
        mailboxWrites.push(currentSelectedMailboxIds.slice());
        return currentSelectedMailboxIds.slice();
      },
    }
  );

  return {
    getSelectedMailboxIds() {
      return currentSelectedMailboxIds.slice();
    },
    getSelectedMailboxWrites() {
      return mailboxWrites.map((entry) => entry.slice());
    },
    run() {
      return ensureRuntimeMailboxSelection();
    },
  };
}

function createGetSelectedRuntimeThreadTruthHarness({
  filteredThreads = [],
  queueScopedThreads = filteredThreads,
  mailboxScopedThreads = queueScopedThreads,
  runtimeThreads = mailboxScopedThreads,
  legacyThreads = [],
  queueInlinePanel = { open: false, laneId: '', feedKey: '' },
  queueHistory = { open: false },
  selectedThreadId = '',
  selectedOfflineHistoryThread = null,
  activeFocusMailboxIds = ['contact@hairtpclinic.com'],
  focusTruthPrimaryEnabled = true,
  live = true,
  authRequired = false,
  loading = false,
  runtimeMode = live ? 'live' : authRequired ? 'auth_required' : 'offline_history',
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getSelectedRuntimeThreadTruth');

  const getSelectedRuntimeThreadTruth = new Function(
    'asArray',
    'asText',
    'canonicalizeRuntimeMailboxId',
    'getFilteredRuntimeThreads',
    'isVerificationRuntimeThread',
    'isLaterRuntimeThread',
    'isSentRuntimeThread',
    'getLegacyRuntimeThreadById',
    'getMailboxScopedRuntimeThreads',
    'getQueueLaneThreads',
    'getSelectedQueueHistoryConversationId',
    'getQueueScopedRuntimeThreads',
    'getRuntimeMode',
    'getRuntimeLeftColumnState',
    'getSelectedOfflineHistoryThread',
    'isOfflineHistoryReadOnlyMode',
    'normalizeKey',
    'runtimeConversationIdsMatch',
    'state',
    'workspaceSourceOfTruth',
    `${functionSource}; return getSelectedRuntimeThreadTruth;`
  )(
    (value) => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null) return [];
      return [value];
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    (value) => {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    () => filteredThreads,
    (thread) => thread?.isVerificationThread === true,
    (thread) => Array.isArray(thread?.tags) && thread.tags.includes('later'),
    (thread) => Array.isArray(thread?.tags) && thread.tags.includes('sent'),
    (threadId) =>
      legacyThreads.find((thread) => {
        const normalize = (value) =>
          typeof value === 'string'
            ? value.trim().toLowerCase()
            : value === undefined || value === null
              ? ''
              : String(value).trim().toLowerCase();
        return normalize(thread?.id) === normalize(threadId);
      }) || null,
    () => mailboxScopedThreads,
    (laneId, threads = queueScopedThreads) => {
      const normalizedLaneId =
        typeof laneId === 'string' ? laneId.trim().toLowerCase() : String(laneId || '').trim().toLowerCase();
      const candidates = Array.isArray(threads) ? threads : [];
      if (normalizedLaneId === 'all') {
        return candidates.filter((thread) => !Array.isArray(thread.tags) || !thread.tags.includes('later'));
      }
      return candidates.filter((thread) => Array.isArray(thread.tags) && thread.tags.includes(normalizedLaneId));
    },
    () => queueHistory?.selectedConversationId || '',
    () => queueScopedThreads,
    () => runtimeMode,
    () => {
      const inlineFeedKey =
        typeof queueInlinePanel?.feedKey === 'string'
          ? queueInlinePanel.feedKey.trim().toLowerCase()
          : '';
      const inlineLaneId =
        typeof queueInlinePanel?.laneId === 'string'
          ? queueInlinePanel.laneId.trim().toLowerCase()
          : 'all';
      if (queueHistory?.open) {
        return { mode: 'history', open: true, laneId: '', feedKey: '' };
      }
      if (queueInlinePanel?.open && inlineFeedKey) {
        return { mode: 'feed', open: true, laneId: '', feedKey: inlineFeedKey };
      }
      if (queueInlinePanel?.open) {
        return { mode: 'lane', open: true, laneId: inlineLaneId || 'all', feedKey: '' };
      }
      return { mode: 'default', open: false, laneId: 'all', feedKey: '' };
    },
    () => selectedOfflineHistoryThread,
    () =>
      queueHistory?.open === true &&
      runtimeMode === 'offline_history' &&
      Boolean(queueHistory?.selectedConversationId),
    (value, fallback = '') => {
      const text =
        typeof value === 'string'
          ? value
          : value === undefined || value === null
            ? fallback
            : String(value);
      return text.trim().toLowerCase();
    },
    (left, right) => {
      const normalize = (value) =>
        typeof value === 'string'
          ? value.trim().toLowerCase()
          : value === undefined || value === null
            ? ''
            : String(value).trim().toLowerCase();
      return Boolean(normalize(left) && normalize(left) === normalize(right));
    },
    {
      runtime: {
        live,
        authRequired,
        loading,
        threads: runtimeThreads,
        truthPrimaryLegacyThreads: legacyThreads,
        focusTruthPrimary: {
          enabled: focusTruthPrimaryEnabled,
          activeMailboxIds: activeFocusMailboxIds,
        },
        queueInlinePanel,
        queueHistory,
        activeLaneId: 'all',
      },
    },
    {
      getSelectedThreadId() {
        return selectedThreadId;
      },
    }
  );

  return getSelectedRuntimeThreadTruth;
}

function createGetSelectedRuntimeThreadHarness(options = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getSelectedRuntimeThread');
  const getSelectedRuntimeThreadTruth = createGetSelectedRuntimeThreadTruthHarness(options);

  return new Function(
    'getSelectedRuntimeThreadTruth',
    `${functionSource}; return getSelectedRuntimeThread;`
  )(getSelectedRuntimeThreadTruth);
}

function createEnsureRuntimeSelectionHarness({
  filteredThreads = [],
  queueScopedThreads = filteredThreads,
  mailboxScopedThreads = queueScopedThreads,
  selectedThreadId = 'thread-current',
  queueInlinePanel = { open: false, laneId: '' },
  queueHistory = { open: false },
  selectedHistoryConversationId = '',
  offlineHistoryReadOnly = false,
} = {}) {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'ensureRuntimeSelection');
  const reconcileCalls = [];
  const normalizeCalls = [];
  const selectedThreadWrites = [];
  let currentSelectedThreadId = selectedThreadId;

  const ensureRuntimeSelection = new Function(
    'asText',
    'getFilteredRuntimeThreads',
    'getMailFeedRuntimeThreads',
    'getMailboxScopedRuntimeThreads',
    'getSelectedQueueHistoryConversationId',
    'getQueueLaneThreads',
    'getQueueScopedRuntimeThreads',
    'getRuntimeLeftColumnState',
    'isOfflineHistoryReadOnlyMode',
    'normalizeVisibleRuntimeScope',
    'runtimeConversationIdsMatch',
    'reconcileRuntimeSelection',
    'state',
    'workspaceSourceOfTruth',
    `${functionSource}; return ensureRuntimeSelection;`
  )(
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => filteredThreads,
    () => [],
    () => mailboxScopedThreads,
    () => selectedHistoryConversationId,
    (laneId, threads = queueScopedThreads) => {
      const normalizedLaneId =
        typeof laneId === 'string' ? laneId.trim().toLowerCase() : String(laneId || '').trim().toLowerCase();
      const candidates = Array.isArray(threads) ? threads : [];
      if (normalizedLaneId === 'all') {
        return candidates;
      }
      return candidates.filter((thread) => Array.isArray(thread.tags) && thread.tags.includes(normalizedLaneId));
    },
    () => queueScopedThreads,
    () => {
      const inlineFeedKey =
        typeof queueInlinePanel?.feedKey === 'string'
          ? queueInlinePanel.feedKey.trim().toLowerCase()
          : '';
      const inlineLaneId =
        typeof queueInlinePanel?.laneId === 'string'
          ? queueInlinePanel.laneId.trim().toLowerCase()
          : 'all';
      if (queueHistory?.open) {
        return { mode: 'history', open: true, laneId: '', feedKey: '' };
      }
      if (queueInlinePanel?.open && inlineFeedKey) {
        return { mode: 'feed', open: true, laneId: '', feedKey: inlineFeedKey };
      }
      if (queueInlinePanel?.open) {
        return { mode: 'lane', open: true, laneId: inlineLaneId || 'all', feedKey: '' };
      }
      return { mode: 'default', open: false, laneId: 'all', feedKey: '' };
    },
    () => offlineHistoryReadOnly,
    (options) => {
      normalizeCalls.push(options);
      return { source: 'normalize', options };
    },
    (left, right) =>
      String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase(),
    (visibleThreads) => {
      reconcileCalls.push(visibleThreads);
      return { source: 'reconcile', visibleThreads };
    },
    {
      runtime: {
        queueInlinePanel,
        queueHistory,
      },
    },
    {
      getSelectedThreadId() {
        return currentSelectedThreadId;
      },
      setSelectedThreadId(nextThreadId) {
        currentSelectedThreadId =
          typeof nextThreadId === 'string'
            ? nextThreadId
            : nextThreadId === undefined || nextThreadId === null
              ? ''
              : String(nextThreadId);
        selectedThreadWrites.push(currentSelectedThreadId);
        return currentSelectedThreadId;
      },
    }
  );

  return {
    getNormalizeCalls() {
      return normalizeCalls.slice();
    },
    getReconcileCalls() {
      return reconcileCalls.slice();
    },
    getSelectedThreadWrites() {
      return selectedThreadWrites.slice();
    },
    run() {
      return ensureRuntimeSelection();
    },
  };
}

test('reconcileRuntimeSelection behaller vald trad nar den fortfarande ar synlig i ny lane', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'thread-2',
    visibleThreads: [{ id: 'thread-1' }, { id: 'thread-2' }, { id: 'thread-3' }],
  });

  const result = harness.run({
    preferredThreadId: 'thread-2',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, false);
  assert.equal(result.selectedThreadId, 'thread-2');
  assert.equal(harness.getSelectedThreadId(), 'thread-2');
  assert.deepEqual(harness.writeCalls, []);
  assert.equal(harness.state.runtime.historyContextThreadId, 'history-open');
  assert.equal(harness.getResetCount(), 0);
});

test('reconcileRuntimeSelection synkar mailboxscope med vald trad även när samma thread redan var vald', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'thread-2',
    initialSelectedMailboxIds: ['contact@hairtpclinic.com'],
    visibleThreads: [
      {
        id: 'thread-2',
        mailboxAddress: 'fazli@hairtpclinic.com',
        mailboxLabel: 'Fazli',
        historyMailboxOptions: [
          { id: 'fazli@hairtpclinic.com', label: 'Fazli' },
        ],
      },
    ],
  });

  const result = harness.run({
    preferredThreadId: 'thread-2',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, false);
  assert.equal(result.selectedThreadId, 'thread-2');
  assert.equal(harness.getSelectedThreadId(), 'thread-2');
  assert.deepEqual(harness.getSelectedMailboxIds(), ['fazli@hairtpclinic.com']);
  assert.deepEqual(harness.getSelectedMailboxWrites(), [['fazli@hairtpclinic.com']]);
});

test('reconcileRuntimeSelection bevarar manuellt mailboxscope när scope redan är pinnat', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'thread-2',
    initialSelectedMailboxIds: ['contact@hairtpclinic.com'],
    visibleThreads: [
      {
        id: 'thread-2',
        mailboxAddress: 'fazli@hairtpclinic.com',
        mailboxLabel: 'Fazli',
        historyMailboxOptions: [
          { id: 'fazli@hairtpclinic.com', label: 'Fazli' },
        ],
      },
    ],
  });

  harness.state.runtime.mailboxScopePinned = true;

  const result = harness.run({
    preferredThreadId: 'thread-2',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, false);
  assert.equal(result.selectedThreadId, 'thread-2');
  assert.equal(harness.getSelectedThreadId(), 'thread-2');
  assert.deepEqual(harness.getSelectedMailboxIds(), ['contact@hairtpclinic.com']);
  assert.deepEqual(harness.getSelectedMailboxWrites(), []);
});

test('reconcileRuntimeSelection behaller vald trad nar conversationId bara skiljer i casing', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'MAILBOX:ABC123',
    visibleThreads: [{ id: 'mailbox:abc123' }, { id: 'mailbox:def456' }],
  });

  const result = harness.run({
    preferredThreadId: 'MAILBOX:ABC123',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.selectedThreadId, 'mailbox:abc123');
  assert.equal(harness.getSelectedThreadId(), 'mailbox:abc123');
  assert.deepEqual(harness.writeCalls, ['mailbox:abc123']);
});

test('reconcileRuntimeSelection faller tillbaka till forsta synliga trad nar tidigare val faller ur lane', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'thread-2',
    visibleThreads: [{ id: 'thread-4' }, { id: 'thread-5' }],
  });

  const result = harness.run({
    preferredThreadId: 'thread-2',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.previousSelectedThreadId, 'thread-2');
  assert.equal(result.selectedThreadId, 'thread-4');
  assert.equal(harness.getSelectedThreadId(), 'thread-4');
  assert.deepEqual(harness.writeCalls, ['thread-4']);
  assert.equal(harness.state.runtime.historyContextThreadId, '');
  assert.equal(harness.getResetCount(), 1);
});

test('reconcileRuntimeSelection tommer selection nar target-lane saknar synliga tradar', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: 'thread-2',
    visibleThreads: [],
  });

  const result = harness.run({
    preferredThreadId: 'thread-2',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.previousSelectedThreadId, 'thread-2');
  assert.equal(result.selectedThreadId, '');
  assert.equal(harness.getSelectedThreadId(), '');
  assert.deepEqual(harness.writeCalls, ['']);
  assert.equal(harness.state.runtime.historyContextThreadId, '');
  assert.equal(harness.getResetCount(), 1);
});

test('normalizeVisibleRuntimeScope skickar preferredThreadId vidare vid mailboxreload', () => {
  const harness = createNormalizeScopeHarness({
    threads: [
      {
        id: 'thread-contact',
        mailboxAddress: 'contact@hairtpclinic.com',
      },
    ],
    filteredThreads: [
      {
        id: 'thread-contact',
        mailboxAddress: 'contact@hairtpclinic.com',
      },
    ],
    mailboxScopedThreads: [
      {
        id: 'thread-contact',
        mailboxAddress: 'contact@hairtpclinic.com',
      },
    ],
    queueScopedThreads: [
      {
        id: 'thread-contact',
        mailboxAddress: 'contact@hairtpclinic.com',
      },
    ],
    selectedMailboxIds: ['contact@hairtpclinic.com'],
    selectedThreadId: 'thread-kons',
  });

  harness.run({
    preferredThreadId: 'thread-contact',
    resetHistoryOnChange: true,
  });

  assert.deepEqual(harness.getSelectedMailboxWrites(), []);
  assert.deepEqual(harness.getOwnerWrites(), []);
  assert.deepEqual(harness.getLaneWrites(), []);
  assert.deepEqual(harness.getReconcileCalls(), [
    {
      visibleThreadIds: ['thread-contact'],
      options: {
        preferredThreadId: 'thread-contact',
        resetHistoryOnChange: true,
      },
    },
  ]);
});

test('normalizeVisibleRuntimeScope kor reconcile-pathen aven nar mailboxreload ger tom runtime', () => {
  const harness = createNormalizeScopeHarness({
    threads: [],
    filteredThreads: [],
    mailboxScopedThreads: [],
    queueScopedThreads: [],
    selectedMailboxIds: ['contact@hairtpclinic.com'],
    selectedThreadId: 'thread-kons',
  });

  harness.run({
    preferredThreadId: 'thread-kons',
    resetHistoryOnChange: true,
  });

  assert.deepEqual(harness.getSelectedMailboxWrites(), []);
  assert.deepEqual(harness.getOwnerWrites(), []);
  assert.deepEqual(harness.getLaneWrites(), []);
  assert.deepEqual(harness.getReconcileCalls(), [
    {
      visibleThreadIds: [],
      options: {
        preferredThreadId: 'thread-kons',
        resetHistoryOnChange: true,
      },
    },
  ]);
});

test('normalizeVisibleRuntimeScope autoskiftar inte tillbaka till alla mailboxar nar scope saknar traffar', () => {
  const harness = createNormalizeScopeHarness({
    threads: [
      {
        id: 'thread-contact',
        mailboxAddress: 'contact@hairtpclinic.com',
      },
    ],
    filteredThreads: [],
    mailboxScopedThreads: [],
    queueScopedThreads: [],
    selectedMailboxIds: ['kons@hairtpclinic.com'],
    selectedThreadId: 'thread-contact',
  });

  harness.run({
    preferredThreadId: 'thread-contact',
    resetHistoryOnChange: true,
  });

  assert.deepEqual(
    harness.getSelectedMailboxWrites(),
    [],
    'mailboxscope får inte expanderas tillbaka till alla när valt scope är tomt.'
  );
  assert.deepEqual(harness.getReconcileCalls(), [
    {
      visibleThreadIds: [],
      options: {
        preferredThreadId: 'thread-contact',
        resetHistoryOnChange: true,
      },
    },
  ]);
});

test('ensureRuntimeMailboxSelection bevarar valt mailboxscope nar live-listan ar tom under load', () => {
  const harness = createEnsureRuntimeMailboxSelectionHarness({
    availableMailboxIds: [],
    selectedMailboxIds: ['contact@hairtpclinic.com'],
    preferredMailboxId: 'kons@hairtpclinic.com',
  });

  harness.run();

  assert.deepEqual(harness.getSelectedMailboxIds(), ['contact@hairtpclinic.com']);
  assert.deepEqual(harness.getSelectedMailboxWrites(), []);
});

test('normalizeVisibleRuntimeScope hoppar till forsta icke-tomma lane nar live har tradar men aktiv lane ar tom', () => {
  const sprintThread = {
    id: 'thread-sprint',
    mailboxAddress: 'contact@hairtpclinic.com',
    tags: ['sprint'],
  };
  const harness = createNormalizeScopeHarness({
    threads: [sprintThread],
    filteredThreads: [],
    filteredThreadsByLane: {
      all: [],
      sprint: [sprintThread],
    },
    mailboxScopedThreads: [sprintThread],
    queueScopedThreads: [sprintThread],
    selectedMailboxIds: ['contact@hairtpclinic.com'],
    activeLaneId: 'all',
    selectedThreadId: '',
  });

  harness.run({
    preferredThreadId: '',
    resetHistoryOnChange: true,
    allowLaneFallback: true,
  });

  assert.deepEqual(harness.getLaneWrites(), ['sprint']);
  assert.deepEqual(harness.getReconcileCalls(), [
    {
      visibleThreadIds: ['thread-sprint'],
      options: {
        preferredThreadId: '',
        resetHistoryOnChange: true,
      },
    },
  ]);
});

test('normalizeVisibleRuntimeScope valjer lane med riktig kundtrad fore lane med enbart verifieringstrad', () => {
  const verificationThread = {
    id: 'thread-qa',
    mailboxAddress: 'contact@hairtpclinic.com',
    tags: ['later'],
    isVerificationThread: true,
  };
  const customerThread = {
    id: 'thread-customer',
    mailboxAddress: 'contact@hairtpclinic.com',
    tags: ['act-now'],
  };
  const harness = createNormalizeScopeHarness({
    threads: [verificationThread, customerThread],
    filteredThreads: [],
    filteredThreadsByLane: {
      all: [],
      later: [verificationThread],
      'act-now': [customerThread],
    },
    mailboxScopedThreads: [verificationThread, customerThread],
    queueScopedThreads: [verificationThread, customerThread],
    selectedMailboxIds: ['contact@hairtpclinic.com'],
    activeLaneId: 'all',
    selectedThreadId: '',
  });

  harness.run({
    preferredThreadId: '',
    resetHistoryOnChange: true,
    allowLaneFallback: true,
  });

  assert.deepEqual(harness.getLaneWrites(), ['act-now']);
  assert.deepEqual(harness.getReconcileCalls(), [
    {
      visibleThreadIds: ['thread-customer'],
      options: {
        preferredThreadId: '',
        resetHistoryOnChange: true,
      },
    },
  ]);
});

test('getSelectedRuntimeThread faller tillbaka till bredare live-scope nar aktuell lane ar tom', () => {
  const thread = { id: 'thread-live-1' };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [],
    queueScopedThreads: [thread],
    mailboxScopedThreads: [thread],
    runtimeThreads: [thread],
    selectedThreadId: '',
    live: true,
    authRequired: false,
    loading: false,
  });

  assert.deepEqual(getSelectedRuntimeThread(), thread);
});

test('getSelectedRuntimeThread prioriterar riktig kundtrad fore verifieringstrad vid auto-val', () => {
  const verificationThread = { id: 'thread-qa', isVerificationThread: true };
  const customerThread = { id: 'thread-customer' };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [verificationThread, customerThread],
    queueScopedThreads: [verificationThread, customerThread],
    mailboxScopedThreads: [verificationThread, customerThread],
    runtimeThreads: [verificationThread, customerThread],
    selectedThreadId: '',
    live: true,
    authRequired: false,
    loading: false,
  });

  assert.deepEqual(getSelectedRuntimeThread(), customerThread);
});

test('getSelectedRuntimeThread prioriterar oppnad inline-panel-lane fore vanlig arbetsko', () => {
  const allThread = { id: 'thread-all', tags: ['act-now'] };
  const reviewThread = { id: 'thread-review', tags: ['review'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [allThread],
    queueScopedThreads: [allThread, reviewThread],
    mailboxScopedThreads: [allThread, reviewThread],
    runtimeThreads: [allThread, reviewThread],
    queueInlinePanel: {
      open: true,
      laneId: 'review',
    },
    selectedThreadId: '',
    live: true,
    authRequired: false,
    loading: false,
  });

  assert.deepEqual(getSelectedRuntimeThread(), reviewThread);
});

test('getSelectedRuntimeThread prioriterar historiklaget utan att fastna i aktiv lane', () => {
  const visibleThread = { id: 'thread-visible', tags: ['act-now'] };
  const historyThread = { id: 'thread-history', tags: ['today'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [visibleThread],
    queueScopedThreads: [visibleThread, historyThread],
    mailboxScopedThreads: [visibleThread, historyThread],
    runtimeThreads: [visibleThread, historyThread],
    queueInlinePanel: { open: false, laneId: '', feedKey: '' },
    queueHistory: { open: true },
    selectedThreadId: 'thread-history',
    live: true,
    authRequired: false,
    loading: false,
  });

  assert.deepEqual(getSelectedRuntimeThread(), historyThread);
});

test('getSelectedRuntimeThread returnerar vald offline-historiktrad nar historiklaget ar oppet offline', () => {
  const offlineHistoryThread = {
    id: 'history-thread-1',
    customerName: 'Historikkund',
    offlineHistorySelection: true,
  };
  const visibleLiveThread = { id: 'thread-live-visible', tags: ['act-now'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [visibleLiveThread],
    queueScopedThreads: [visibleLiveThread],
    mailboxScopedThreads: [visibleLiveThread],
    runtimeThreads: [visibleLiveThread],
    queueHistory: { open: true, selectedConversationId: 'history-thread-1' },
    selectedThreadId: 'history-thread-1',
    selectedOfflineHistoryThread: offlineHistoryThread,
    live: false,
    authRequired: false,
    loading: false,
    runtimeMode: 'offline_history',
  });

  assert.deepEqual(getSelectedRuntimeThread(), offlineHistoryThread);
});

test('getSelectedRuntimeThread returnerar null i offline-historiklage nar ingen historikruta ar vald', () => {
  const visibleLiveThread = { id: 'thread-live-visible', tags: ['act-now'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [visibleLiveThread],
    queueScopedThreads: [visibleLiveThread],
    mailboxScopedThreads: [visibleLiveThread],
    runtimeThreads: [visibleLiveThread],
    queueHistory: { open: true, selectedConversationId: '' },
    selectedThreadId: '',
    selectedOfflineHistoryThread: null,
    live: false,
    authRequired: false,
    loading: false,
    runtimeMode: 'offline_history',
  });

  assert.equal(getSelectedRuntimeThread(), null);
});

test('getSelectedRuntimeThread returnerar vald offline-historiktrad nar historiklaget ar oppet utan live-runtime-mode', () => {
  const offlineHistoryThread = {
    id: 'history-thread-runtime-error',
    customerName: 'Historik utan live',
    offlineHistorySelection: true,
  };
  const visibleLiveThread = { id: 'thread-live-visible', tags: ['act-now'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [visibleLiveThread],
    queueScopedThreads: [visibleLiveThread],
    mailboxScopedThreads: [visibleLiveThread],
    runtimeThreads: [visibleLiveThread],
    queueHistory: { open: true, selectedConversationId: 'history-thread-runtime-error' },
    selectedThreadId: 'history-thread-runtime-error',
    selectedOfflineHistoryThread: offlineHistoryThread,
    live: false,
    authRequired: false,
    loading: false,
    runtimeMode: 'runtime_error',
  });

  assert.notDeepEqual(getSelectedRuntimeThread(), offlineHistoryThread);
});

test('getSelectedRuntimeThreadTruth markerar offline-historik som vald runtime- och focus-sanning', () => {
  const offlineHistoryThread = {
    id: 'history-thread-1',
    customerName: 'Historikkund',
    mailboxAddress: 'contact@hairtpclinic.com',
    offlineHistorySelection: true,
  };
  const getSelectedRuntimeThreadTruth = createGetSelectedRuntimeThreadTruthHarness({
    filteredThreads: [],
    queueScopedThreads: [],
    mailboxScopedThreads: [],
    runtimeThreads: [],
    queueHistory: { open: true, selectedConversationId: 'history-thread-1' },
    selectedThreadId: 'history-thread-1',
    selectedOfflineHistoryThread: offlineHistoryThread,
    live: false,
    authRequired: false,
    loading: false,
    runtimeMode: 'offline_history',
  });

  const truth = getSelectedRuntimeThreadTruth();

  assert.equal(truth.runtimeSource, 'offline_history');
  assert.equal(truth.focusSource, 'offline_history');
  assert.equal(truth.leftColumnMode, 'history');
  assert.equal(truth.runtimeMode, 'offline_history');
  assert.equal(truth.offlineHistoryReadOnly, true);
  assert.deepEqual(truth.runtimeThread, offlineHistoryThread);
  assert.deepEqual(truth.focusThread, offlineHistoryThread);
});

test('getSelectedRuntimeThreadTruth markerar legacy focus fallback nar truth primary focus inte ar aktiv', () => {
  const runtimeThread = {
    id: 'thread-live-1',
    mailboxAddress: 'contact@hairtpclinic.com',
    customerName: 'Livekund',
  };
  const legacyThread = {
    id: 'thread-live-1',
    mailboxAddress: 'contact@hairtpclinic.com',
    customerName: 'Legacykund',
    worklistSource: 'legacy',
  };
  const getSelectedRuntimeThreadTruth = createGetSelectedRuntimeThreadTruthHarness({
    filteredThreads: [runtimeThread],
    queueScopedThreads: [runtimeThread],
    mailboxScopedThreads: [runtimeThread],
    runtimeThreads: [runtimeThread],
    legacyThreads: [legacyThread],
    selectedThreadId: 'thread-live-1',
    focusTruthPrimaryEnabled: false,
    activeFocusMailboxIds: ['contact@hairtpclinic.com'],
    live: true,
    authRequired: false,
    loading: false,
    runtimeMode: 'live',
  });

  const truth = getSelectedRuntimeThreadTruth();

  assert.equal(truth.runtimeSource, 'filtered_scope');
  assert.equal(truth.focusSource, 'legacy_focus_fallback');
  assert.equal(truth.focusScopeActive, true);
  assert.equal(truth.focusTruthPrimaryEnabled, false);
  assert.deepEqual(truth.runtimeThread, runtimeThread);
  assert.deepEqual(truth.focusThread, legacyThread);
});

test('getSelectedRuntimeThread prioriterar oppnad inline-panel-feed fore vanlig arbetsko', () => {
  const visibleThread = { id: 'thread-visible', tags: ['act-now'] };
  const sentThread = { id: 'thread-sent', tags: ['sent'] };
  const getSelectedRuntimeThread = createGetSelectedRuntimeThreadHarness({
    filteredThreads: [visibleThread],
    queueScopedThreads: [visibleThread],
    mailboxScopedThreads: [visibleThread, sentThread],
    runtimeThreads: [visibleThread, sentThread],
    queueInlinePanel: {
      open: true,
      laneId: '',
      feedKey: 'sent',
    },
    selectedThreadId: 'thread-sent',
    live: true,
    authRequired: false,
    loading: false,
  });

  assert.deepEqual(getSelectedRuntimeThread(), sentThread);
});

test('ensureRuntimeSelection sjalvlaker till lane-fallback nar listan annars blir blank', () => {
  const harness = createEnsureRuntimeSelectionHarness({
    filteredThreads: [],
    selectedThreadId: 'thread-live-1',
    queueInlinePanel: { open: false, laneId: '' },
    queueHistory: { open: false },
  });

  const result = harness.run();

  assert.equal(result.source, 'normalize');
  assert.deepEqual(harness.getReconcileCalls(), []);
  assert.deepEqual(harness.getNormalizeCalls(), [
    {
      allowLaneFallback: true,
      preferredThreadId: 'thread-live-1',
      resetHistoryOnChange: false,
    },
  ]);
});

test('ensureRuntimeSelection hoppar inte lane-fallback nar inline-panelen redan ar oppen', () => {
  const harness = createEnsureRuntimeSelectionHarness({
    filteredThreads: [],
    queueInlinePanel: { open: true, laneId: 'all' },
    queueHistory: { open: false },
  });

  const result = harness.run();

  assert.equal(result.source, 'reconcile');
  assert.equal(harness.getNormalizeCalls().length, 0);
  assert.equal(harness.getReconcileCalls().length, 1);
});

test('ensureRuntimeSelection later vald offline-historiktrad vara source of truth i historiklaget', () => {
  const harness = createEnsureRuntimeSelectionHarness({
    filteredThreads: [{ id: 'live-thread-1' }],
    queueScopedThreads: [{ id: 'live-thread-1' }],
    mailboxScopedThreads: [{ id: 'live-thread-1' }],
    selectedThreadId: 'live-thread-1',
    queueHistory: { open: true },
    selectedHistoryConversationId: 'history-thread-7',
    offlineHistoryReadOnly: true,
  });

  const result = harness.run();

  assert.deepEqual(result, {
    changed: true,
    previousSelectedThreadId: 'live-thread-1',
    selectedThreadId: 'history-thread-7',
  });
  assert.deepEqual(harness.getSelectedThreadWrites(), ['history-thread-7']);
  assert.equal(harness.getNormalizeCalls().length, 0);
  assert.equal(harness.getReconcileCalls().length, 0);
});

test('ensureRuntimeSelection rensar stale live-trad nar offline-historiklaget saknar valt kort', () => {
  const harness = createEnsureRuntimeSelectionHarness({
    filteredThreads: [{ id: 'live-thread-1' }],
    queueScopedThreads: [{ id: 'live-thread-1' }],
    mailboxScopedThreads: [{ id: 'live-thread-1' }],
    selectedThreadId: 'live-thread-1',
    queueHistory: { open: true },
    selectedHistoryConversationId: '',
    offlineHistoryReadOnly: true,
  });

  const result = harness.run();

  assert.deepEqual(result, {
    changed: true,
    previousSelectedThreadId: 'live-thread-1',
    selectedThreadId: '',
  });
  assert.deepEqual(harness.getSelectedThreadWrites(), ['']);
  assert.equal(harness.getNormalizeCalls().length, 0);
  assert.equal(harness.getReconcileCalls().length, 0);
});

test('reconcileRuntimeSelection prioriterar riktig kundtrad fore verifieringstrad nar valet ar automatiskt', () => {
  const harness = createReconcileHarness({
    initialSelectedThreadId: '',
    visibleThreads: [
      { id: 'thread-qa', isVerificationThread: true },
      { id: 'thread-customer' },
    ],
  });

  const result = harness.run({
    preferredThreadId: '',
    resetHistoryOnChange: true,
  });

  assert.equal(result.changed, true);
  assert.equal(result.selectedThreadId, 'thread-customer');
  assert.equal(harness.getSelectedThreadId(), 'thread-customer');
  assert.deepEqual(harness.writeCalls, ['thread-customer']);
  assert.equal(harness.getResetCount(), 1);
});
