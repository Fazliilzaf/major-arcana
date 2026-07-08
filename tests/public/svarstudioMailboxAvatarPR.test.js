'use strict';

/* Svarstudio increment #4: mailbox-avatar med rälsfärg + poppig bubbel-accent.
 * Även regression-lås för Bugbot-fyndet: ★ AI-utkast-handlern måste uppdatera
 * live-previewen (renderLivePreview) och ordräknaren. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../../public/konversationer-bottom-actions.js'),
  'utf8'
);
const css = fs.readFileSync(path.join(__dirname, '../../public/konversationer.html'), 'utf8');

test('mailbox-avatar: rälsfärg efter avsändare', () => {
  assert.match(source, /function renderMailboxAvatar\(\)/);
  assert.match(source, /class: 'wb-mbx-avatar'/);
  assert.match(source, /'wb-mbx-avatar wb-mbx-avatar--' \+ tone/);
  // uppdateras vid mailbox-byte
  assert.match(source, /renderLivePreview\(\);\s*renderMailboxAvatar\(\);/);
  // CSS + rälsfärger
  assert.match(css, /\.wb-mbx-avatar--contact \{\s*background: var\(--rail-contact\)/);
  assert.match(css, /\.wb-mbx-avatar--fazli \{\s*background: var\(--rail-fazli\)/);
  assert.match(css, /\.wb-mbx-avatar--egzona \{\s*background: var\(--rail-egzona\)/);
});

test('poppig bubbel-accent: färgad inner-kant på in-/utgående', () => {
  assert.match(css, /\.msg\.is-incoming \.msg-bubble \{/);
  assert.match(css, /inset 3px 0 0 rgba\(187, 71, 121/);
  assert.match(css, /inset 3px 0 0 rgba\(200, 130, 30/);
});

test('Bugbot-fix: AI-utkast uppdaterar live-preview + ordräknare', () => {
  // I ★ AI-utkast-handlern ska både wordCount och renderLivePreview uppdateras
  assert.match(source, /\[AI-utkast[\s\S]*?wordCount\.textContent =[\s\S]*?renderLivePreview\(\);/);
});
