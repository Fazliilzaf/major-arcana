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

const RUNTIME_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

function extractFunctionSource(source, functionName, { async = false } = {}) {
  const signatures = async
    ? [`async function ${functionName}(`, `function ${functionName}(`]
    : [`function ${functionName}(`];
  const startIndex = signatures
    .map((signature) => source.indexOf(signature))
    .find((index) => index !== -1);
  assert.notEqual(startIndex, undefined, `Kunde inte hitta ${functionName}.`);

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

  throw new Error(`Kunde inte extrahera ${functionName}.`);
}

function createStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test('getAdminToken läser sessionStorage före localhost-fallback', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getAdminToken');
  const isLocalPreviewHost = () => false;
  const getAdminToken = new Function(
    'ADMIN_TOKEN_STORAGE_KEY',
    'isLocalPreviewHost',
    'normalizeText',
    'window',
    `${functionSource}; return getAdminToken;`
  )(
    'ARCANA_ADMIN_TOKEN',
    isLocalPreviewHost,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      localStorage: createStorage(),
      sessionStorage: createStorage({ ARCANA_ADMIN_TOKEN: 'session-token' }),
    }
  );

  assert.equal(getAdminToken(), 'session-token');
});

test('getAdminToken ger preview-token på localhost när lagringen är tom', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getAdminToken');
  const getAdminToken = new Function(
    'ADMIN_TOKEN_STORAGE_KEY',
    'isLocalPreviewHost',
    'normalizeText',
    'window',
    `${functionSource}; return getAdminToken;`
  )(
    'ARCANA_ADMIN_TOKEN',
    () => true,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      localStorage: createStorage(),
      sessionStorage: createStorage(),
    }
  );

  assert.equal(getAdminToken(), '__preview_local__');
});

test('getAdminToken förblir tom utanför localhost när token saknas', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getAdminToken');
  const getAdminToken = new Function(
    'ADMIN_TOKEN_STORAGE_KEY',
    'isLocalPreviewHost',
    'normalizeText',
    'window',
    `${functionSource}; return getAdminToken;`
  )(
    'ARCANA_ADMIN_TOKEN',
    () => false,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      localStorage: createStorage(),
      sessionStorage: createStorage(),
    }
  );

  assert.equal(getAdminToken(), '');
});

test('waitForTruthWorklistAuthToken faller tillbaka till localhost-preview när token saknas', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'waitForTruthWorklistAuthToken', {
    async: true,
  });
  const waitForTruthWorklistAuthToken = new Function(
    'getAdminToken',
    'isLocalPreviewHost',
    'normalizeText',
    'window',
    `${functionSource}; return waitForTruthWorklistAuthToken;`
  )(
    () => '',
    () => true,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      setTimeout() {
        return 1;
      },
    }
  );

  const token = await waitForTruthWorklistAuthToken({ timeoutMs: 0, intervalMs: 20 });
  assert.equal(token, '__preview_local__');
});

test('waitForRuntimeAuthToken förblir strikt utanför localhost när token saknas', async () => {
  const source = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'waitForRuntimeAuthToken', {
    async: true,
  });
  const waitForRuntimeAuthToken = new Function(
    'getAdminToken',
    'isLocalPreviewHost',
    'normalizeText',
    'windowObject',
    `${functionSource}; return waitForRuntimeAuthToken;`
  )(
    () => '',
    () => false,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      setTimeout() {
        return 1;
      },
    }
  );

  const token = await waitForRuntimeAuthToken({ timeoutMs: 0, intervalMs: 20 });
  assert.equal(token, '');
});

test('waitForRuntimeAuthToken ger preview-token på localhost när token saknas', async () => {
  const source = fs.readFileSync(RUNTIME_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'waitForRuntimeAuthToken', {
    async: true,
  });
  const waitForRuntimeAuthToken = new Function(
    'getAdminToken',
    'isLocalPreviewHost',
    'normalizeText',
    'windowObject',
    `${functionSource}; return waitForRuntimeAuthToken;`
  )(
    () => '',
    () => true,
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
    {
      setTimeout() {
        return 1;
      },
    }
  );

  const token = await waitForRuntimeAuthToken({ timeoutMs: 0, intervalMs: 20 });
  assert.equal(token, '__preview_local__');
});

test('apiRequest rensar stale token och retryar utan bearer-token i localhost-preview', async () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'apiRequest', { async: true });
  const fetchCalls = [];
  let clearedCount = 0;
  let tokenReads = 0;
  const windowObject = {
    location: { origin: 'http://localhost:3000' },
  };
  const fetchMock = async (_url, options = {}) => {
    fetchCalls.push(options.headers?.Authorization || '');
    if (fetchCalls.length === 1) {
      return {
        ok: false,
        status: 401,
        async text() {
          return JSON.stringify({ error: 'Sessionen är ogiltig eller har gått ut.' });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ ok: true });
      },
    };
  };
  const apiRequest = new Function(
    'window',
    'fetch',
    'getAdminToken',
    'getActiveWorkspaceContext',
    'isLocalPreviewHost',
    'clearAdminToken',
    'isAuthFailure',
    'normalizeText',
    `${functionSource}; return apiRequest;`
  )(
    windowObject,
    fetchMock,
    () => {
      tokenReads += 1;
      return tokenReads === 1 ? 'stale-token' : '__preview_local__';
    },
    () => ({ workspaceId: 'default', conversationId: '', customerId: '', customerName: '' }),
    () => true,
    () => {
      clearedCount += 1;
    },
    (statusCode, message = '') =>
      Number(statusCode) === 401 ||
      (Number(statusCode) === 403 && String(message).toLowerCase().includes('session')),
    (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim())
  );

  const payload = await apiRequest('/api/v1/auth/me');
  assert.deepEqual(payload, { ok: true });
  assert.equal(clearedCount, 1);
  assert.deepEqual(fetchCalls, ['Bearer stale-token', '']);
});

test('getCustomerImportBody markerar cliento som sourceSystem i alla importlägen', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getCustomerImportBody');
  function buildGetter(state) {
    const buildCustomerImportRowsPayloadCalls = [];
    const getCustomerImportBody = new Function(
      'customerImportTextInput',
      'state',
      'normalizeText',
      'asArray',
      'buildCustomerImportRowsPayload',
      'getOperationalImportMailboxId',
      'inferCustomerImportFileName',
      `${functionSource}; return getCustomerImportBody;`
    )(
      null,
      state,
      (value) => (typeof value === 'string' ? value.trim() : String(value || '').trim()),
      (value) => (Array.isArray(value) ? value : value ? [value] : []),
      (rows) => {
        buildCustomerImportRowsPayloadCalls.push(rows);
        return [{ rowNumber: 1 }];
      },
      () => 'Kons',
      () => 'customer-import.csv'
    );

    return { getCustomerImportBody, buildCustomerImportRowsPayloadCalls };
  }

  const previewFixture = buildGetter({
    customerImport: {
      sourceText: 'import text',
      fileName: '',
      sourceBinaryBase64: '',
      preview: {
        rows: [{ rowNumber: 1 }],
      },
    },
  });
  const previewBody = previewFixture.getCustomerImportBody();
  assert.equal(previewBody.sourceSystem, 'cliento');
  assert.deepEqual(previewBody.rows, [{ rowNumber: 1 }]);
  assert.equal(previewBody.defaultMailboxId, 'Kons');
  assert.equal(previewFixture.buildCustomerImportRowsPayloadCalls.length, 1);

  const binaryFixture = buildGetter({
    customerImport: {
      sourceText: '',
      fileName: '',
      sourceBinaryBase64: 'base64-data',
      preview: null,
    },
  });
  const binaryBody = binaryFixture.getCustomerImportBody();
  assert.equal(binaryBody.sourceSystem, 'cliento');
  assert.equal(binaryBody.binaryBase64, 'base64-data');

  const textFixture = buildGetter({
    customerImport: {
      sourceText: 'Customer Name,customer@example.com',
      fileName: '',
      sourceBinaryBase64: '',
      preview: null,
    },
  });
  const textBody = textFixture.getCustomerImportBody();
  assert.equal(textBody.sourceSystem, 'cliento');
  assert.equal(textBody.text, 'Customer Name,customer@example.com');
});

test('getSelectedRuntimeFocusThread behåller fokus-tråden under loading', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'getSelectedRuntimeFocusThread');
  const selectedThread = { id: 'thread-1', customerName: 'Egzona' };
  const getSelectedRuntimeFocusThread = new Function(
    'state',
    'getSelectedRuntimeThreadTruth',
    'isLocalPreviewHost',
    `${functionSource}; return getSelectedRuntimeFocusThread;`
  )(
    { runtime: { loading: true, authRequired: false } },
    () => ({ focusThread: selectedThread }),
    () => true
  );

  assert.equal(getSelectedRuntimeFocusThread(), selectedThread);
});

test('deriveRuntimeRelevantActivityAt använder senaste relevanta aktivitet', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const functionSource = extractFunctionSource(source, 'deriveRuntimeRelevantActivityAt');
  const deriveRuntimeRelevantActivityAt = new Function(
    'asArray',
    'asText',
    'toIso',
    `${functionSource}; return deriveRuntimeRelevantActivityAt;`
  )(
    (value) => (Array.isArray(value) ? value : value ? [value] : []),
    (value) => (typeof value === 'string' ? value : String(value || '')),
    (value) => {
      const parsed = Date.parse(String(value || ''));
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
    }
  );

  const latestIso = deriveRuntimeRelevantActivityAt(
    {
      lastInboundAt: '2026-04-13T10:00:00.000Z',
      lastOutboundAt: '2026-04-13T10:05:00.000Z',
      lastActionTakenAt: '2026-04-13T10:10:00.000Z',
    },
    {
      canonicalMessages: [{ sentAt: '2026-04-13T09:55:00.000Z' }],
      historyEvents: [{ recordedAt: '2026-04-13T10:08:00.000Z' }],
    }
  );

  assert.equal(latestIso, '2026-04-13T10:10:00.000Z');
});
