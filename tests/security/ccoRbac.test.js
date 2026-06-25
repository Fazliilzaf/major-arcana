const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeRole, requireAnyRole, roleHasPermission } = require('../../src/security/ccoRbac');

test('requireAnyRole compares normalized role aliases', async () => {
  assert.equal(normalizeRole('staff'), 'operator');
  assert.equal(normalizeRole('doctor'), 'operator');

  const middleware = requireAnyRole(['doctor', 'staff', 'owner']);
  const req = { headers: { 'x-cco-role': 'staff' } };
  let passed = false;
  const res = {
    status() {
      throw new Error('staff alias should be accepted');
    },
  };

  middleware(req, res, () => {
    passed = true;
  });

  assert.equal(passed, true);
  assert.equal(req.cco.role, 'operator');
});

// Regression (#4): aliaset admin→owner är borttaget. 'admin' är inte en giltig
// roll och får aldrig ärva owner-behörighet.
test('admin is not a role alias and gets no owner permissions', () => {
  assert.equal(normalizeRole('admin'), null);
  assert.equal(roleHasPermission('admin', 'mail.live_send'), false);
  // owner-aliaset självt är oförändrat
  assert.equal(normalizeRole('owner'), 'owner');
  assert.equal(roleHasPermission('owner', 'mail.live_send'), true);
});
