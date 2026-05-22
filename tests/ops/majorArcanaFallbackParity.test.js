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

function buildFocusReadStateFactory() {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const helperSource = extractFunctionSource(source, 'resolveRuntimeFoundationState');
  const focusSource = extractFunctionSource(source, 'getRuntimeFocusReadState');

  return new Function(
    'state',
    'FOCUS_TRUTH_PRIMARY',
    'canonicalizeRuntimeMailboxId',
    'normalizeKey',
    'asArray',
    'asText',
    'asNumber',
    'getSelectedRuntimeFocusThread',
    'getLegacyRuntimeThreadById',
    `${helperSource}\n${focusSource}\nreturn getRuntimeFocusReadState;`
  );
}

function createTestEnvironment({ focusTruthPrimaryEnabled = false, activeMailboxIds = [] } = {}) {
  const state = {
    runtime: {
      focusTruthPrimary: {
        enabled: focusTruthPrimaryEnabled,
        activeMailboxIds,
      },
    },
  };

  const factory = buildFocusReadStateFactory();
  return factory(
    state,
    { readOnly: false },
    (value) => {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    (value, fallback = '') => {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return fallback;
      return String(value).trim().toLowerCase();
    },
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
    (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    () => null,
    () => null
  );
}

test('kons-thread med canonical foundation visar Mail foundation i fallback-pathen', () => {
  const getRuntimeFocusReadState = createTestEnvironment({
    focusTruthPrimaryEnabled: false,
    activeMailboxIds: [],
  });

  const focusReadState = getRuntimeFocusReadState({
    mailboxAddress: 'kons@hairtpclinic.com',
    worklistSource: 'legacy',
    threadDocument: {
      sourceStore: 'thread_document',
      messageCount: 2,
      hasQuotedContent: true,
      hasSignatureBlocks: false,
      hasSystemBlocks: false,
      messages: [{ id: 'a' }, { id: 'b' }],
    },
    messages: [
      {
        latest: true,
        mailDocument: {
          sourceStore: 'mail_document',
          previewText: 'Hej',
          primaryBodyText: 'Hej där',
        },
        mailThreadMessage: {
          presentation: {
            previewText: 'Hej',
            conversationText: 'Hej där',
          },
          primaryBody: {
            text: 'Hej där',
          },
        },
      },
    ],
  });

  assert.equal(focusReadState.foundationDriven, true);
  assert.equal(focusReadState.fallbackDriven, false);
  assert.equal(focusReadState.foundationLabel, 'Mail foundation');
  assert.equal(focusReadState.fallbackLabel, '');
});

test('verkligt foundation-lös tråd behåller Legacy fallback', () => {
  const getRuntimeFocusReadState = createTestEnvironment({
    focusTruthPrimaryEnabled: false,
    activeMailboxIds: [],
  });

  const focusReadState = getRuntimeFocusReadState({
    mailboxAddress: 'kons@hairtpclinic.com',
    worklistSource: 'legacy',
    messages: [
      {
        latest: true,
        body: 'Kort preview utan canonical foundation',
      },
    ],
  });

  assert.equal(focusReadState.foundationDriven, false);
  assert.equal(focusReadState.fallbackDriven, true);
  assert.equal(focusReadState.foundationLabel, '');
  assert.equal(focusReadState.fallbackLabel, 'Legacy fallback');
});
