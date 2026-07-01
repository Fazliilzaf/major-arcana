const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');
const authPath = path.join(repoRoot, 'public', 'cco-review-auth.js');
const reviewJsPath = path.join(repoRoot, 'public', 'drive-import-review.js');
const reviewHtmlPath = path.join(repoRoot, 'public', 'drive-import-review.html');

test('R3 review auth helper reads admin tokens and injects Bearer auth', () => {
  const source = fs.readFileSync(authPath, 'utf8');

  assert.match(source, /sessionStorage, 'ARCANA_ADMIN_TOKEN'/);
  assert.match(source, /localStorage, 'ARCANA_ADMIN_TOKEN'/);
  assert.match(source, /localStorage, 'arcana_admin_token'/);
  assert.match(source, /Authorization: `Bearer \$\{token\}`/);
  assert.match(source, /fetch\('\/api\/v1\/auth\/me'/);
  assert.match(source, /new URLSearchParams\(\{ next: target \}\)/);
  assert.match(source, /window\.ArcanaReviewAuth = Object\.freeze/);
});

test('drive import review page loads auth before API client and removes role-header workaround', () => {
  const html = fs.readFileSync(reviewHtmlPath, 'utf8');
  const source = fs.readFileSync(reviewJsPath, 'utf8');

  assert.ok(
    html.indexOf('/cco-review-auth.js') < html.indexOf('/drive-import-review.js'),
    'auth helper must load before drive-import-review.js'
  );
  assert.match(source, /window\.ArcanaReviewAuth/);
  assert.match(source, /auth\.authHeaders\(baseHeaders\)/);
  assert.match(source, /await requireReviewAuth\(\)/);
  assert.match(source, /data-auth-panel/);
  assert.doesNotMatch(source, /x-cco-role/);
});
