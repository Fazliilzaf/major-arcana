'use strict';

/**
 * Prod Bearer-token för Drive pilot/verify m.fl.
 *
 * Ordning:
 * 1. ARCANA_SMOKE_BEARER_TOKEN om den svarar 200 på /api/v1/auth/me
 * 2. STAFF-login (get-prod-auth-token.js)
 * 3. OWNER-login med STAFF-reserv (--owner + inbyggd fallback)
 */
const { execSync } = require('node:child_process');
const path = require('node:path');

const TOKEN_SCRIPT = path.join(__dirname, '..', 'get-prod-auth-token.js');

function normalizeBase(baseUrl) {
  return String(
    baseUrl ||
      process.env.ARCANA_PROD_URL ||
      process.env.BASE_URL ||
      'https://arcana.hairtpclinic.com'
  ).replace(/\/+$/, '');
}

async function probeToken(baseUrl, token) {
  if (!token || token.length < 20) return false;
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-arcana-client': 'major_arcana_admin',
      },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

function execTokenScript(args, baseUrl) {
  return execSync(`node "${TOKEN_SCRIPT}" ${args.join(' ')}`.trim(), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ARCANA_PROD_URL: baseUrl },
  }).trim();
}

async function resolveProdAuthToken(options = {}) {
  const baseUrl = normalizeBase(options.baseUrl);
  const preferOwner = options.preferOwner === true;
  const fromEnv = String(process.env.ARCANA_SMOKE_BEARER_TOKEN || '').trim();

  if (fromEnv && (await probeToken(baseUrl, fromEnv))) {
    return fromEnv;
  }

  const attempts = preferOwner ? [['--owner'], []] : [[], ['--owner']];
  let lastErr = null;
  for (const args of attempts) {
    try {
      const token = execTokenScript(args, baseUrl);
      if (token.length >= 20 && (await probeToken(baseUrl, token))) {
        return token;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw (
    lastErr ||
    new Error('Kunde inte hämta giltig prod-token (SMOKE_BEARER ogiltig, login misslyckades).')
  );
}

module.exports = {
  normalizeBase,
  probeToken,
  resolveProdAuthToken,
};
