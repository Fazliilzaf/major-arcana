'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'cco-kunder-mobil-real.js'),
  'utf8'
);

test('customer dossier forwards its existing session token to the communication panel', () => {
  const mountIndex = source.indexOf('global.CcoKommPanel.mount(kommHost');
  assert.notEqual(mountIndex, -1, 'customer dossier mounts the communication panel');

  const mountBlock = source.slice(mountIndex - 200, mountIndex + 600);
  assert.match(mountBlock, /const token = getToken\(\);/);
  assert.match(mountBlock, /\.\.\.\(token \? \{ Authorization: `Bearer \$\{token\}` \} : \{\}\)/);
});
