'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const serverSource = fs.readFileSync(path.join(projectRoot, 'server.js'), 'utf8');
const configSource = fs.readFileSync(path.join(projectRoot, 'src/config.js'), 'utf8');
const financeHtml = fs.readFileSync(path.join(projectRoot, 'public/finance.html'), 'utf8');
const {
  getActor,
  normalizeRole,
  requireAnyRole,
  ALL_ROLES,
} = require('../../src/security/ccoRbac');

test('ORD-67b: /api/v1/cco-cf mountar requireCcoAuthenticated före attachRole-routes', () => {
  const cfoRouterSource = fs.readFileSync(path.join(projectRoot, 'src/routes/cfo.js'), 'utf8');
  assert.match(
    cfoRouterSource,
    /createCfoRouter\s*\(/,
    'createCfoRouter saknas i src/routes/cfo.js'
  );
  const idx = cfoRouterSource.indexOf("router.use('/cco-cf', requireAuthenticated)");
  assert.notEqual(idx, -1, 'cco-cf auth-brygga saknas i src/routes/cfo.js');
  const cfBlock = cfoRouterSource.slice(idx, idx + 800);
  assert.match(cfBlock, /router\.get\('\/cco-cf\/dashboard'/);
  assert.ok(
    cfBlock.indexOf('requireAuthenticated') < cfBlock.indexOf('attachRole'),
    'requireAuthenticated måste föregå attachRole i CF-routern'
  );
});

test('ORD-67c: getActor exporteras och läser req.auth', () => {
  assert.equal(typeof getActor, 'function');
  const actor = getActor({
    auth: { userId: 'u-finance', email: 'fin@hairtpclinic.com', role: 'owner' },
  });
  assert.equal(actor.userId, 'u-finance');
  assert.equal(actor.email, 'fin@hairtpclinic.com');
  assert.equal(actor.role, 'owner');
});

test('ORD-67d: config.dataDir aliasar stateRoot för beständiga CF-stores', () => {
  assert.match(configSource, /dataDir:\s*stateRoot/);
  assert.match(configSource, /ORD-67d/);
});

test('ORD-67: finance-rollen normaliseras för CF RBAC', () => {
  assert.ok(ALL_ROLES.includes('finance'));
  assert.equal(normalizeRole('finance'), 'finance');
  assert.equal(normalizeRole('FINANCE'), 'finance');
});

test('ORD-67: requireAnyRole släpper igenom finance på cfRBAC-listan', () => {
  const middleware = requireAnyRole(['owner', 'finance', 'revisor']);
  assert.equal(typeof middleware, 'function');
  let nextCalled = false;
  middleware({ auth: { role: 'finance' } }, { status: () => ({ json: () => {} }) }, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test('ORD-67: finance.html injicerar Bearer för /api/v1-anrop', () => {
  assert.match(financeHtml, /ARCANA_ADMIN_TOKEN/);
  assert.match(financeHtml, /url\.startsWith\('\/api\/v1'\)/);
  assert.match(financeHtml, /Authorization/);
});

test('ORD-67: voucher-sync routes monteras via cfoVoucherSync-router', () => {
  const routerSource = fs.readFileSync(
    path.join(projectRoot, 'src/routes/cfoVoucherSync.js'),
    'utf8'
  );
  assert.match(serverSource, /createCfoVoucherSyncRouter/);
  assert.match(routerSource, /\/cco-cf\/voucher-sync\/dry-run/);
  assert.match(routerSource, /\/cco-cf\/voucher-sync\/run/);
});
