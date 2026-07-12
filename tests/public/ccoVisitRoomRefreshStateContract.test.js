'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const ui = fs.readFileSync(
  path.join(root, 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js'),
  'utf8'
);
const canon = fs.readFileSync(
  path.join(root, 'public', 'major-arcana-preview', 'app', 'cco-v12-canon.js'),
  'utf8'
);

test('V12 visit room refresh preserves room identity and scroll after patient reload', () => {
  assert.match(canon, /data-visit-room-encounter/);
  assert.match(canon, /data-visit-room-date/);
  assert.match(ui, /\.v12-canon-visit-segment\[open\]/);
  assert.match(ui, /room\.open = true/);
  assert.match(ui, /scroll\.scrollTop = state\.scrollTop/);
  assert.match(ui, /bindV12WorkspaceOverlayBody\(body, ctx\)/);
});

test('visit room fallback uses date only when encounterId is unavailable', () => {
  assert.match(
    ui,
    /roomState\.encounterId[\s\S]*encounterId === roomState\.encounterId[\s\S]*roomState\.date[\s\S]*date === roomState\.date/
  );
});
