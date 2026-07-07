'use strict';

/* PR 47 — Klientsidan renderar dubblett-notisen: när servern fällt ihop identiska
 * kopior (duplicateCount > 1) visas en diskret utfällbar "Mottogs N ggr" med
 * när/var per kopia, i stället för att samma mail dyker upp flera gånger. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const konv = fs.readFileSync(path.join(repoRoot, 'public', 'konversationer.html'), 'utf8');

test('PR47: renderThreadMessages anropar dubblett-notisen', () => {
  assert.match(konv, /renderMessageDuplicateNote\(message\)/);
});

test('PR47: notisen visas bara när duplicateCount > 1 och listar kopiorna', () => {
  const fn = konv.match(/function renderMessageDuplicateNote\(message\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn, 'renderMessageDuplicateNote ska finnas');
  assert.match(fn[0], /duplicateCount/);
  assert.match(fn[0], /if \(count <= 1\) return ''/);
  assert.match(fn[0], /Mottogs \$\{count\} ggr/);
  assert.match(fn[0], /message\.duplicates/);
});

test('PR47: CSS för dubblett-notisen finns', () => {
  assert.match(konv, /\.msg-dup\s*\{/);
  assert.match(konv, /\.msg-dup-list\s*\{/);
});
