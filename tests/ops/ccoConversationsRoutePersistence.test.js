'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

test('Konversationer V2 behåller den explicita conversations-routen vid URL-synk', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const conversationsBranch = source.match(
    /if \(shellView === "conversations"\) \{([\s\S]*?)\n    \}/
  )?.[1] || '';

  assert.match(conversationsBranch, /view: "conversations",/);
  assert.doesNotMatch(conversationsBranch, /view: "",/);
});
