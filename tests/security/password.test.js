const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
} = require('../../src/security/password');

test('hashPassword rejects short passwords', async () => {
  await assert.rejects(() => hashPassword('short'), {
    message: new RegExp(String(MIN_PASSWORD_LENGTH)),
  });
});

test('hashPassword rejects non-string and accepts exakt minimilängd', async () => {
  await assert.rejects(() => hashPassword(null), {
    message: new RegExp(String(MIN_PASSWORD_LENGTH)),
  });
  const ten = 'a'.repeat(MIN_PASSWORD_LENGTH);
  const { salt, hash } = await hashPassword(ten);
  assert.equal(typeof salt, 'string');
  assert.equal(typeof hash, 'string');
  assert.equal(await verifyPassword(ten, salt, hash), true);
});

test('hashPassword rejects undefined password', async () => {
  await assert.rejects(() => hashPassword(undefined), {
    message: new RegExp(String(MIN_PASSWORD_LENGTH)),
  });
});

test('verifyPassword round-trips hashPassword output', async () => {
  const plain = 'long-enough-secret';
  const { salt, hash } = await hashPassword(plain);
  assert.equal(await verifyPassword(plain, salt, hash), true);
  assert.equal(await verifyPassword(`${plain}x`, salt, hash), false);
});

test('verifyPassword returns false for invalid types', async () => {
  assert.equal(await verifyPassword('', 'salt', '00'), false);
  assert.equal(await verifyPassword('password', null, 'ab'), false);
});

test('verifyPassword returns false när hash-längd inte matchar derived key', async () => {
  const plain = 'long-enough-secret';
  const { salt } = await hashPassword(plain);
  assert.equal(await verifyPassword(plain, salt, '00'), false);
});

test('verifyPassword returns false för ogiltig hex i expectedHash', async () => {
  const plain = 'long-enough-secret';
  const { salt } = await hashPassword(plain);
  assert.equal(await verifyPassword(plain, salt, 'not-hex-at-all!!!'), false);
});

test('hashPassword uses random salt and yields different hashes', async () => {
  const plain = 'same-password-for-test';
  const a = await hashPassword(plain);
  const b = await hashPassword(plain);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('verifyPassword returns false for non-string password input', async () => {
  const { salt, hash } = await hashPassword('valid-password-123');
  assert.equal(await verifyPassword(12345, salt, hash), false);
});

test('verifyPassword returnerar false när salt inte hör till samma hash', async () => {
  const { salt: saltA, hash: hashA } = await hashPassword('password-alpha-12');
  const { salt: saltB } = await hashPassword('password-bravo-34');
  assert.equal(await verifyPassword('password-alpha-12', saltB, hashA), false);
});

test('verifyPassword returns false for empty expectedHash', async () => {
  const { salt } = await hashPassword('valid-password-456');
  assert.equal(await verifyPassword('valid-password-456', salt, ''), false);
});

test('verifyPassword returns false when salt or expectedHash is not a string', async () => {
  const { hash } = await hashPassword('valid-password-789');
  assert.equal(await verifyPassword('valid-password-789', 12345, hash), false);
  assert.equal(await verifyPassword('valid-password-789', 'deadbeef', undefined), false);
});

test('hashPassword rejects password one character under minimum', async () => {
  const almost = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
  await assert.rejects(() => hashPassword(almost), {
    message: new RegExp(String(MIN_PASSWORD_LENGTH)),
  });
});
