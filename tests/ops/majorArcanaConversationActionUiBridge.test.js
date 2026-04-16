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
  const refreshReasons = [];
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
    'refreshWorkspaceBootstrapForSelectedThread',
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
    async (reason) => {
      refreshReasons.push(reason);
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
  assert.deepEqual(refreshReasons, ['mark handled']);
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
  const refreshReasons = [];
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
    'refreshWorkspaceBootstrapForSelectedThread',
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
    async (reason) => {
      refreshReasons.push(reason);
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
  assert.deepEqual(refreshReasons, ['reply later']);
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
