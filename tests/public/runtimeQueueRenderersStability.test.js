'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'runtime-queue-renderers.js'),
  'utf8'
);

function extractFunctionSource(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `${functionName} saknas`);
  const bodyStart = sourceText.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    if (sourceText[index] === '{') depth += 1;
    if (sourceText[index] === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(start, index + 1);
  }
  throw new Error(`${functionName} saknar avslutande klammer`);
}

test('runtime queue helpers keep background worklist reads mailbox-scoped', () => {
  assert.match(source, /const __CUSTOMER_DEFAULT_MAILBOXES = \["kons"\]/);
  assert.match(source, /parsed\.slice\(0, 1\)\.map/);
  assert.match(source, /const __MAILBOX_DEFAULTS = \["kons"\]/);
  assert.doesNotMatch(source, /params\.set\("limit", "500"\)/);
  assert.match(source, /params\.set\("limit", "50"\)/);
});

test('runtime queue helper canonicalizes persisted mailbox addresses before a scoped request', () => {
  const functionSource = extractFunctionSource(source, '__canonicalMailboxAddress');
  const canonicalMailboxAddress = new Function(
    '__normalizeKey',
    `${functionSource}; return __canonicalMailboxAddress;`
  )((value) => String(value || '').trim().toLowerCase());

  assert.equal(canonicalMailboxAddress('egzona'), 'egzona@hairtpclinic.com');
  assert.equal(canonicalMailboxAddress('Egzona@hairtpclinic.com'), 'egzona@hairtpclinic.com');
  assert.equal(canonicalMailboxAddress('egzona@hairtpclinic.com@hairtpclinic.com'), 'egzona@hairtpclinic.com');
  assert.equal(canonicalMailboxAddress('info@fazli.se'), 'info@fazli.se');
  assert.match(
    source,
    /parsed\.slice\(0, 1\)\.map\(__canonicalMailboxAddress\)\.filter\(Boolean\)/,
    'Vald mailbox ska canonicaliseras före worklist-requesten.'
  );
});
