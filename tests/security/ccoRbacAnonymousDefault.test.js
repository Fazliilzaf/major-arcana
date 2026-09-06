'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getRoleFromRequest, roleHasPermission } = require('../../src/security/ccoRbac');

// Rotfix: oautentiserad request får INTE längre ärva 'operator'.

test('unauthenticated request → anonymous (no operator default)', () => {
  const role = getRoleFromRequest({ headers: {} });
  assert.equal(role, 'anonymous');
  assert.equal(roleHasPermission(role, 'journal.write'), false);
  assert.equal(roleHasPermission(role, 'customers.write'), false);
  assert.equal(roleHasPermission(role, 'journal.read_any'), false);
  assert.equal(roleHasPermission(role, 'mailbox.admin'), false);
});

test('authenticated role from req.auth is honored', () => {
  assert.equal(getRoleFromRequest({ auth: { role: 'owner' }, headers: {} }), 'owner');
  assert.equal(getRoleFromRequest({ auth: { role: 'staff' }, headers: {} }), 'operator');
});

test('X-CCO-Role header is IGNORED in production (no spoofing)', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const role = getRoleFromRequest({ headers: { 'x-cco-role': 'operator' } });
    assert.equal(role, 'anonymous', 'spoofed header must not grant operator in prod');
    assert.equal(roleHasPermission(role, 'customers.write'), false);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('X-CCO-Role header still works outside production (tests/dev)', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    assert.equal(getRoleFromRequest({ headers: { 'x-cco-role': 'operator' } }), 'operator');
  } finally {
    process.env.NODE_ENV = prev;
  }
});
