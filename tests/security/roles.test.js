const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLE_OWNER,
  ROLE_STAFF,
  ROLE_PATIENT,
  normalizeRole,
  isValidRole,
  getPermissionsForRole,
} = require('../../src/security/roles');

test('normalizeRole trims and uppercases', () => {
  assert.equal(normalizeRole('  owner  '), 'OWNER');
  assert.equal(normalizeRole(null), '');
});

test('isValidRole accepts known roles only', () => {
  assert.equal(isValidRole('OWNER'), true);
  assert.equal(isValidRole('staff'), true);
  assert.equal(isValidRole('guest'), false);
});

test('isValidRole accepterar whitespace och blandad casing', () => {
  assert.equal(isValidRole('  patient '), true);
  assert.equal(isValidRole('owner'), true);
});

test('normalizeRole blank eller endast whitespace ger tom sträng', () => {
  assert.equal(normalizeRole('   \t\n'), '');
  assert.equal(normalizeRole(''), '');
});

test('getPermissionsForRole returns a copy with expected shape', () => {
  const owner = getPermissionsForRole(ROLE_OWNER);
  const again = getPermissionsForRole(ROLE_OWNER);
  assert.notEqual(owner, again);
  assert.ok(owner.includes('ops:state_restore'));
  assert.ok(owner.includes('users:invite_staff'));

  const staff = getPermissionsForRole(ROLE_STAFF);
  assert.ok(staff.includes('templates:generate_draft'));
  assert.equal(staff.includes('ops:state_restore'), false);

  const patient = getPermissionsForRole(ROLE_PATIENT);
  assert.deepEqual(patient, ['auth:login', 'auth:logout', 'auth:me']);

  assert.deepEqual(getPermissionsForRole('unknown'), []);
});

test('getPermissionsForRole normaliserar rollsträng före uppslag', () => {
  const spaced = getPermissionsForRole('  staff  ');
  const staff = getPermissionsForRole(ROLE_STAFF);
  assert.deepEqual(spaced, staff);
});

test('getPermissionsForRole owner har mallaktivering som staff saknar', () => {
  const owner = getPermissionsForRole(ROLE_OWNER);
  const staff = getPermissionsForRole(ROLE_STAFF);
  assert.ok(owner.includes('templates:activate_version'));
  assert.equal(staff.includes('templates:activate_version'), false);
});

test('getPermissionsForRole ger ny array varje gång', () => {
  const first = getPermissionsForRole(ROLE_OWNER);
  first.push('should-not-persist');
  const second = getPermissionsForRole(ROLE_OWNER);
  assert.equal(second.includes('should-not-persist'), false);
  assert.ok(second.length >= first.length - 1);
});

test('normalizeRole hanterar icke-strängar robust', () => {
  assert.equal(normalizeRole(123), '');
  assert.equal(normalizeRole({ role: 'owner' }), '');
  assert.equal(normalizeRole([]), '');
});

test('isValidRole returnerar false för nullish och whitespace', () => {
  assert.equal(isValidRole(null), false);
  assert.equal(isValidRole(undefined), false);
  assert.equal(isValidRole('   '), false);
});

test('permissions är unika inom samma roll', () => {
  const owner = getPermissionsForRole(ROLE_OWNER);
  const staff = getPermissionsForRole(ROLE_STAFF);
  assert.equal(new Set(owner).size, owner.length);
  assert.equal(new Set(staff).size, staff.length);
});
