const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverSource = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');

function routeBlock(route) {
  const start = serverSource.indexOf(`'${route}'`);
  assert.notEqual(start, -1, `${route} route is missing`);
  const nextRoute = serverSource.indexOf('\n  app.', start + route.length);
  return serverSource.slice(start, nextRoute === -1 ? start + 900 : nextRoute);
}

test('CCO asset binary routes require real auth before RBAC role fallback', () => {
  assert.match(serverSource, /let ccoRequireAuthMiddleware = null;/);
  assert.match(serverSource, /ccoRequireAuthMiddleware = auth\.requireAuth;/);

  for (const route of [
    '/api/v1/cco/patients/:patientId/assets',
    '/api/v1/cco/assets/:assetId/download',
    '/api/v1/cco/assets/:assetId/thumbnail',
    '/api/drive/files/:id',
  ]) {
    const block = routeBlock(route);
    const authIndex = block.indexOf('requireCcoAuthenticated');
    const attachIndex = block.indexOf('attachRole');
    const permissionIndex = block.indexOf("requirePermission('asset.read')");
    assert.ok(authIndex >= 0, `${route} must require authenticated staff session`);
    assert.ok(attachIndex > authIndex, `${route} must authenticate before attachRole fallback`);
    assert.ok(permissionIndex > attachIndex, `${route} must check asset.read after attachRole`);
  }
});

test('CCO asset QA mutation route requires real auth before asset.write', () => {
  const block = routeBlock('/api/v1/cco/asset-qa/backfill-thumbnails');
  const authIndex = block.indexOf('requireCcoAuthenticated');
  const attachIndex = block.indexOf('attachRole');
  const permissionIndex = block.indexOf("requirePermission('asset.write')");
  assert.ok(authIndex >= 0, 'backfill route must require authenticated staff session');
  assert.ok(attachIndex > authIndex, 'backfill route must authenticate before attachRole fallback');
  assert.ok(
    permissionIndex > attachIndex,
    'backfill route must check asset.write after attachRole'
  );
});

test('CCO asset download uses RFC 5987 filename encoding for non-ASCII filenames', () => {
  const block = routeBlock('/api/v1/cco/assets/:assetId/download');
  assert.match(serverSource, /function buildSafeContentDisposition/);
  assert.match(serverSource, /filename\*=UTF-8''/);
  assert.match(block, /buildSafeContentDisposition\(disposition, asset\.originalFileName/);
});
