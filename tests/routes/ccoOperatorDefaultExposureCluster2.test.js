'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');

/** Staff-only routes exposed by operator-default attachRole (cluster 2). */
const CLUSTER2_ROUTES = [
  { method: 'get', path: '/api/v1/cco-customer-identity/suggestions' },
  { method: 'get', path: '/api/v1/cco-photo-annotations/customer/:cid' },
  { method: 'get', path: '/api/v1/cco-treatment-plans/customer/:cid' },
  { method: 'get', path: '/api/v1/cco-encounters/customer/:cid/composite' },
  { method: 'get', path: '/api/v1/cco-operator-dashboard/customer-actions' },
  { method: 'get', path: '/api/v1/cco-customers/:id/timeline' },
  { method: 'get', path: '/api/v1/cco-customers/:id/agreements' },
  { method: 'get', path: '/api/v1/cco-customers/:id/journal-feed' },
  { method: 'get', path: '/api/v1/cco-customers/:id/journal-timeline' },
  { method: 'get', path: '/api/v1/cco-aftercare/jobs' },
  { method: 'get', path: '/api/v1/cco-aftercare/jobs/:id' },
  { method: 'get', path: '/api/v1/cco-journal-quick/stats' },
  { method: 'get', path: '/api/v1/cco-portal/invites' },
  { method: 'post', path: '/api/v1/cco-portal/invites' },
];

function assertRouteGated(source, method, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`app\\.${method}\\([\\s\\n]*'${escaped}'[\\s\\S]{0,400}?attachRole`);
  const match = source.match(re);
  const label = `${method.toUpperCase()} ${routePath}`;
  assert.ok(match, `${label}: route block not found in server.js`);
  const block = match[0];
  const authIdx = block.indexOf('requireCcoAuthenticated');
  const roleIdx = block.indexOf('attachRole');
  assert.notEqual(authIdx, -1, `${label}: missing requireCcoAuthenticated`);
  assert.ok(authIdx < roleIdx, `${label}: requireCcoAuthenticated must precede attachRole`);
}

for (const route of CLUSTER2_ROUTES) {
  test(`${route.method.toUpperCase()} ${route.path} is gated (auth before attachRole)`, () => {
    assertRouteGated(serverSource, route.method, route.path);
  });
}
