'use strict';

const crypto = require('node:crypto');

function generateTotpCodeAt(secretRaw, timestampMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = String(secretRaw || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  if (!secret) return '';

  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of secret) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  const key = Buffer.from(bytes);
  if (!key.length) return '';

  const counter = Math.floor(Math.max(0, Number(timestampMs) || Date.now()) / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

function generateTotpCodes(secretRaw) {
  const secret = String(secretRaw || '').trim();
  if (!secret) return [];
  const now = Date.now();
  const offsetsMs = [0, -30_000, 30_000, -60_000, 60_000];
  const codes = [];
  for (const offset of offsetsMs) {
    const code = generateTotpCodeAt(secret, now + offset);
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

function buildMfaVerifyAttempts({
  mfaCode = '',
  mfaSecret = '',
  mfaRecoveryCode = '',
  setupSecret = '',
  setupRecoveryCodes = [],
  storeSecret = '',
} = {}) {
  const attempts = [];
  const providedCode = String(mfaCode || '').trim();
  const providedRecoveryCode = String(mfaRecoveryCode || '').trim();
  if (providedCode) attempts.push(providedCode);
  if (providedRecoveryCode) attempts.push(providedRecoveryCode);
  for (const code of generateTotpCodes(setupSecret)) attempts.push(code);
  for (const code of generateTotpCodes(mfaSecret)) attempts.push(code);
  for (const code of generateTotpCodes(storeSecret)) attempts.push(code);
  if (Array.isArray(setupRecoveryCodes) && setupRecoveryCodes.length > 0) {
    attempts.push(String(setupRecoveryCodes[0] || '').trim());
  }

  const unique = [];
  for (const attempt of attempts) {
    const normalized = String(attempt || '').trim();
    if (!normalized) continue;
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return unique.slice(0, 9);
}

function isMfaCodeError(error) {
  const message = String(error?.message || error || '')
    .trim()
    .toLowerCase();
  return (
    message.includes('mfa') ||
    message.includes('fel mfa') ||
    message.includes('otp') ||
    message.includes('totp') ||
    message.includes('verification code')
  );
}

module.exports = {
  generateTotpCodeAt,
  generateTotpCodes,
  buildMfaVerifyAttempts,
  isMfaCodeError,
};
