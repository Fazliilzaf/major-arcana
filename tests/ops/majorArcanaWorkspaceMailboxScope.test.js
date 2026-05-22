const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKSPACE_STATE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-workspace-state.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(
    startIndex,
    -1,
    `Kunde inte hitta ${functionName} i runtime-workspace-state.js.`
  );

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

  throw new Error(`Kunde inte extrahera ${functionName} från runtime-workspace-state.js.`);
}

test('workspace-state kanoniserar valt mailboxscope till full mailboxadress', () => {
  const source = fs.readFileSync(WORKSPACE_STATE_PATH, 'utf8');
  const createWorkspaceStateApiSource = extractFunctionSource(source, 'createWorkspaceStateApi');
  const createWorkspaceStateApi = new Function(
    `${createWorkspaceStateApiSource}; return createWorkspaceStateApi;`
  )();

  const state = {
    view: 'conversations',
    mailboxAdminOpen: false,
    moreMenuOpen: false,
    noteMode: { open: false },
    runtime: {
      activeFocusSection: 'conversation',
      selectedThreadId: '',
      activeLaneId: 'all',
      selectedMailboxIds: [],
      selectedOwnerKey: 'all',
      historyExpanded: true,
    },
  };

  const workspaceStateApi = createWorkspaceStateApi({
    AUX_VIEWS: new Set(),
    QUEUE_LANE_ORDER: ['all', 'act-now'],
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
    canonicalizeMailboxId(value) {
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : String(value || '').trim().toLowerCase();
      if (normalized === 'kons') return 'kons@hairtpclinic.com';
      return normalized;
    },
    normalizeKey(value) {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    normalizeMailboxId(value) {
      if (typeof value === 'string') return value.trim().toLowerCase();
      if (value === undefined || value === null) return '';
      return String(value).trim().toLowerCase();
    },
    state,
  });

  const selectedMailboxIds = workspaceStateApi.setSelectedMailboxIds(['kons']);

  assert.deepEqual(selectedMailboxIds, ['kons@hairtpclinic.com']);
  assert.deepEqual(workspaceStateApi.getSelectedMailboxIds(), ['kons@hairtpclinic.com']);
  assert.deepEqual(state.runtime.selectedMailboxIds, ['kons@hairtpclinic.com']);
});
