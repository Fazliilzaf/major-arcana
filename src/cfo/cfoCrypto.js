'use strict';

/**
 * cfoCrypto.js — minimal AES-256-GCM-kryptering för känsliga CFO-tokens.
 *
 * Återanvänder samma princip som CMO-mvp/backend/lib/crypto.js för att vara
 * förutsägbar: ENCRYPTION_KEY vinner, annars JWT_SECRET. Båda härleds till en
 * 32-bytes nyckel via SHA-256 om de inte redan är exakt 32 bytes.
 *
 * Användningsområde: kryptera refresh_token för Google Ads-connector på disk.
 */

const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!raw) {
    throw new Error('ENCRYPTION_KEY eller JWT_SECRET måste vara satt för att kryptera CFO-tokens');
  }
  // Om nyckeln redan är exakt 32 bytes, använd den rakt av; annars härled med SHA-256.
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length === KEY_LENGTH) return buf;
  return crypto.createHash('sha256').update(buf).digest();
}

function encrypt(text) {
  if (text == null) return null;
  const plain = String(text);
  if (!plain) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

function decrypt(encryptedText) {
  if (encryptedText == null) return null;
  try {
    const key = getKey();
    const combined = Buffer.from(String(encryptedText), 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[cfoCrypto] avkryptering misslyckades:', err?.message);
    return null;
  }
}

module.exports = { encrypt, decrypt };
