'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

test('visit media soft-delete uses audited asset state machine and never hard-deletes', () => {
  const route = server.match(
    /\/api\/v1\/cco\/assets\/:assetId\/soft-delete[\s\S]*?res\.json\(\{ ok: true[\s\S]*?\n\s*}\n\s*\);/
  );
  assert.ok(route, 'soft-delete route must exist');
  assert.match(route[0], /requireCcoAuthenticated/);
  assert.match(route[0], /requireCcoAuthenticated,[\s\S]*attachRole/);
  assert.match(route[0], /store\.softDeleteAsset/);
  assert.match(route[0], /target: 'REJECTED'/);
  assert.doesNotMatch(route[0], /hardDeleteAsset/);
});

test('visit media upload stores bounded video duration metadata', () => {
  assert.match(server, /Math\.min\(24 \* 60 \* 60, Math\.round\(rawDurationSeconds\)\)/);
  assert.match(server, /technicalInfo: \{[\s\S]*mediaKind: 'video'[\s\S]*durationSeconds/);
});
