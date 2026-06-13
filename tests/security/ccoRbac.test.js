const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeRole, requireAnyRole } = require('../../src/security/ccoRbac');

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
