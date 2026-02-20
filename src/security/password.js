const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 10;

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Lösenord måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`);
  }
}

async function hashPassword(password) {
  validatePassword(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return {
    salt,
    hash: Buffer.from(derivedKey).toString('hex'),
  };
}

async function verifyPassword(password, salt, expectedHash) {
  if (typeof password !== 'string' || typeof salt !== 'string' || typeof expectedHash !== 'string') {
    return false;
  }

  try {
    const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
    const actual = Buffer.from(derivedKey).toString('hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
};
