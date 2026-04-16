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
const RUNTIME_DOM_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

function extractFunctionSource(source, functionName, { async = false } = {}) {
  const signature = `${async ? 'async ' : ''}function ${functionName}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Kunde inte hitta ${functionName} i källfilen.`);
  let parenDepth = 0;
  let braceStart = -1;
  for (let index = source.indexOf('(', start); index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parenDepth += 1;
    if (character === ')') {
      parenDepth -= 1;
      continue;
    }
    if (character === '{' && parenDepth === 0) {
      braceStart = index;
      break;
    }
  }
  assert.notEqual(braceStart, -1, `Kunde inte hitta funktionskroppen för ${functionName}.`);
  let depth = 1;
  let index = braceStart + 1;
  while (depth > 0 && index < source.length) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    index += 1;
  }
  return source.slice(start, index);
}

test('applyHandledToThread använder backend-write och bootstrap-refresh utan lokal handled patch', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'applyHandledToThread', { async: true });
  assert.doesNotMatch(
    functionSource,
    /patchStudioThreadAfterHandled/,
    'Handled-actionen ska inte längre använda lokal patch som primär write-path.'
  );

  const requestCalls = [];
  const refreshCalls = [];
  const feedbackCalls = [];
  const studioOpenStates = [];
  const collapsedStates = [];
  const focusStatusLine = { textContent: '' };
  const applyHandledToThread = new Function(
    'requestConversationAction',
    'setStudioFeedback',
    'setStudioOpen',
    'setContextCollapsed',
    'focusStatusLine',
    'refreshConversationActionRuntimeProjection',
    `${functionSource}; return applyHandledToThread;`
  )(
    async (...args) => {
      requestCalls.push(args);
      return { ok: true };
    },
    (...args) => feedbackCalls.push(args),
    (value) => studioOpenStates.push(value),
    (value) => collapsedStates.push(value),
    focusStatusLine,
    async (...args) => {
      refreshCalls.push(args);
    }
  );

  const result = await applyHandledToThread({ id: 'thread-1' }, 'Manuellt klar', {
    closeStudio: true,
  });

  assert.equal(result, true);
  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0][0], '/api/v1/cco/handled');
  assert.equal(requestCalls[0][1].id, 'thread-1');
  assert.equal(requestCalls[0][2].body.actionLabel, 'Manuellt klar');
  assert.deepEqual(refreshCalls, [[{ id: 'thread-1' }, 'mark handled']]);
  assert.deepEqual(feedbackCalls, [['Tråden markerades som klar: Manuellt klar.', 'success']]);
  assert.deepEqual(studioOpenStates, [false]);
  assert.deepEqual(collapsedStates, [false]);
});

test('applyReplyLaterToThread använder backend-write och bootstrap-refresh utan lokal later patch', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'applyReplyLaterToThread', { async: true });
  assert.doesNotMatch(
    functionSource,
    /patchStudioThreadAfterReplyLater/,
    'Reply-later-actionen ska inte längre använda lokal patch som primär write-path.'
  );

  const requestCalls = [];
  const refreshCalls = [];
  const auxStatusCalls = [];
  const focusStatusLine = { textContent: '' };
  const state = { later: { option: 'tomorrow_morning' } };
  const laterStatus = { id: 'later-status' };
  const applyReplyLaterToThread = new Function(
    'requestConversationAction',
    'state',
    'resolveLaterOptionDueAt',
    'setStudioFeedback',
    'setStudioOpen',
    'setContextCollapsed',
    'focusStatusLine',
    'setAuxStatus',
    'laterStatus',
    'refreshConversationActionRuntimeProjection',
    `${functionSource}; return applyReplyLaterToThread;`
  )(
    async (...args) => {
      requestCalls.push(args);
      return { ok: true };
    },
    state,
    () => '2026-04-17T07:00:00.000Z',
    () => {},
    () => {},
    () => {},
    focusStatusLine,
    (...args) => auxStatusCalls.push(args),
    laterStatus,
    async (...args) => {
      refreshCalls.push(args);
    }
  );

  const result = await applyReplyLaterToThread({ id: 'thread-2' }, 'Imorgon 09:00', {
    closeStudio: false,
  });

  assert.equal(result, true);
  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0][0], '/api/v1/cco/reply-later');
  assert.equal(requestCalls[0][1].id, 'thread-2');
  assert.equal(requestCalls[0][2].body.followUpDueAt, '2026-04-17T07:00:00.000Z');
  assert.equal(requestCalls[0][2].body.nextActionLabel, 'Återuppta senare');
  assert.equal(
    requestCalls[0][2].body.nextActionSummary,
    'Tråden är parkerad till Imorgon 09:00.'
  );
  assert.equal(focusStatusLine.textContent, 'Tråden parkerades till Imorgon 09:00.');
  assert.equal(auxStatusCalls.length, 1);
  assert.deepEqual(refreshCalls, [[{ id: 'thread-2' }, 'reply later']]);
});

test('refreshConversationActionRuntimeProjection använder live runtime-reload med reconcile när live är aktivt', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'refreshConversationActionRuntimeProjection');

  const loadLiveRuntimeCalls = [];
  const bootstrapReasons = [];
  const state = {
    runtime: {
      live: true,
      loaded: true,
      authRequired: false,
      mode: 'live',
      selectedMailboxIds: ['kons@hairtpclinic.com'],
    },
  };

  const refreshConversationActionRuntimeProjection = new Function(
    'asArray',
    'asText',
    'getRequestedRuntimeMailboxIds',
    'getRuntimeMode',
    'getSelectedRuntimeMailboxScopeIds',
    'loadLiveRuntime',
    'normalizeKey',
    'refreshWorkspaceBootstrapForSelectedThread',
    'state',
    'workspaceSourceOfTruth',
    `${functionSource}; return refreshConversationActionRuntimeProjection;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => ['fallback@hairtpclinic.com'],
    () => 'live',
    () => ['kons@hairtpclinic.com'],
    async (options) => {
      loadLiveRuntimeCalls.push(options);
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    async (reason) => {
      bootstrapReasons.push(reason);
    },
    state,
    {
      getSelectedThreadId() {
        return 'selected-fallback';
      },
    }
  );

  await refreshConversationActionRuntimeProjection({ id: 'thread-1' }, 'mark handled');

  assert.deepEqual(loadLiveRuntimeCalls, [
    {
      requestedMailboxIds: ['kons@hairtpclinic.com'],
      preferredThreadId: 'thread-1',
      resetHistoryOnChange: true,
    },
  ]);
  assert.deepEqual(bootstrapReasons, []);
});

test('refreshConversationActionRuntimeProjection faller tillbaka till workspace bootstrap när live runtime inte ska laddas om', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'refreshConversationActionRuntimeProjection');

  const loadLiveRuntimeCalls = [];
  const bootstrapReasons = [];
  const state = {
    runtime: {
      live: false,
      loaded: false,
      authRequired: false,
      mode: 'offline_history',
      selectedMailboxIds: [],
    },
  };

  const refreshConversationActionRuntimeProjection = new Function(
    'asArray',
    'asText',
    'getRequestedRuntimeMailboxIds',
    'getRuntimeMode',
    'getSelectedRuntimeMailboxScopeIds',
    'loadLiveRuntime',
    'normalizeKey',
    'refreshWorkspaceBootstrapForSelectedThread',
    'state',
    'workspaceSourceOfTruth',
    `${functionSource}; return refreshConversationActionRuntimeProjection;`
  )(
    (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
    (value, fallback = '') => {
      if (typeof value === 'string') return value;
      if (value === undefined || value === null) return fallback;
      return String(value);
    },
    () => ['fallback@hairtpclinic.com'],
    () => 'offline_history',
    () => [],
    async (options) => {
      loadLiveRuntimeCalls.push(options);
    },
    (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    async (reason) => {
      bootstrapReasons.push(reason);
    },
    state,
    {
      getSelectedThreadId() {
        return 'selected-fallback';
      },
    }
  );

  await refreshConversationActionRuntimeProjection({ id: 'thread-2' }, 'reply later');

  assert.deepEqual(loadLiveRuntimeCalls, []);
  assert.deepEqual(bootstrapReasons, ['reply later']);
});

test('finalizeRuntimeLoad renderar om efter bootstrap så fokus och intel läser samma post-bootstrap-state', async () => {
  const source = fs.readFileSync(RUNTIME_DOM_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'finalizeRuntimeLoad', { async: true });

  const renderCalls = [];
  const loadBootstrapCalls = [];

  const finalizeRuntimeLoad = new Function(
    'clearRuntimeAuthRecoveryTimer',
    'ensureRuntimeMailboxSelection',
    'normalizeVisibleRuntimeScope',
    'state',
    'ensureCustomerRuntimeProfilesFromLive',
    'refreshCustomerIdentitySuggestions',
    'renderRuntimeConversationShell',
    'loadQueueHistory',
    'loadBootstrap',
    'console',
    `${functionSource}; return finalizeRuntimeLoad;`
  )(
    () => {},
    () => {},
    () => {},
    { customerRuntime: { loaded: false } },
    () => {},
    async () => {},
    () => renderCalls.push('render'),
    () => ({ catch() {} }),
    async (options) => {
      loadBootstrapCalls.push(options);
    },
    console
  );

  await finalizeRuntimeLoad({
    preferredThreadId: 'thread-1',
    resetHistoryOnChange: true,
  });

  assert.equal(loadBootstrapCalls.length, 1);
  assert.equal(renderCalls.length, 2);
});

test('selectRuntimeThread renderar om igen efter bootstrap så högerpanelen inte ligger kvar på stale truth', async () => {
  const source = fs.readFileSync(RUNTIME_DOM_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'selectRuntimeThread');

  const renderCalls = [];
  const bootstrapCalls = [];

  const selectRuntimeThread = new Function(
    'asText',
    'summarizeSelectedRuntimeThreadTruthForDiagnostics',
    'summarizeRuntimeOpenFlowThread',
    'getSelectedRuntimeThread',
    'state',
    'reconcileRuntimeScopeSelection',
    'syncSelectedCustomerIdentityForThread',
    'ensureRuntimeOpenFlowDiagnostics',
    'recordRuntimeOpenFlowEvent',
    'renderRuntimeConversationShell',
    'captureRuntimeReentrySnapshot',
    'queueHistoryList',
    'requestRuntimeThreadHydration',
    'loadBootstrap',
    `${functionSource}; return selectRuntimeThread;`
  )(
    (value) => (value == null ? '' : String(value)),
    () => ({ selectedThreadId: 'thread-1' }),
    () => ({ id: 'thread-1' }),
    () => ({ id: 'thread-1' }),
    { runtime: { queueHistory: {} } },
    () => {},
    () => {},
    () => ({}),
    () => {},
    () => renderCalls.push('render'),
    () => {},
    { querySelectorAll() { return []; } },
    () => ({ catch() {} }),
    async (options) => {
      bootstrapCalls.push(options);
    }
  );

  selectRuntimeThread('thread-2', { reloadBootstrap: true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(bootstrapCalls.length, 1);
  assert.equal(renderCalls.length, 2);
});

test('bulk handled och later använder inte längre lokala patch-hjälpare direkt', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const bulkCommandSource = extractFunctionSource(source, 'handleMailFeedBulkCommand', {
    async: true,
  });
  const applyLaterOptionSource = extractFunctionSource(source, 'applyLaterOption', {
    async: true,
  });

  assert.doesNotMatch(
    bulkCommandSource,
    /patchStudioThreadAfterHandled/,
    'Bulk handled ska gå via backend-pathen, inte lokal handled-patch.'
  );
  assert.match(
    bulkCommandSource,
    /requestConversationAction\("\/api\/v1\/cco\/handled"/,
    'Bulk handled måste använda den nya handled-routen.'
  );

  assert.doesNotMatch(
    applyLaterOptionSource,
    /patchStudioThreadAfterReplyLater/,
    'Later-dialogen ska inte längre använda lokal reply-later-patch som write-path.'
  );
  assert.match(
    applyLaterOptionSource,
    /requestConversationAction\("\/api\/v1\/cco\/reply-later"/,
    'Bulk later måste använda den nya reply-later-routen.'
  );
  assert.match(
    applyLaterOptionSource,
    /await applyReplyLaterToThread\(/,
    'Single-thread later ska återanvända backend-först-hjälparen.'
  );
});
