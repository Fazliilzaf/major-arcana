#!/usr/bin/env node
require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value) {
  const input = String(value || '').trim();
  if (!input) return 'http://localhost:3000';
  return input.replace(/\/+$/, '');
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    email: process.env.ARCANA_OWNER_EMAIL || '',
    password: process.env.ARCANA_OWNER_PASSWORD || '',
    tenantId: process.env.ARCANA_DEFAULT_TENANT || '',
    mfaCode: process.env.ARCANA_OWNER_MFA_CODE || '',
    mfaSecret: process.env.ARCANA_OWNER_MFA_SECRET || '',
    authStorePath: process.env.AUTH_STORE_PATH || './data/auth.json',
    showRecoveryCodes: parseBoolean(process.env.ARCANA_OWNER_MFA_SHOW_RECOVERY_CODES, false),
    printToken: parseBoolean(process.env.ARCANA_OWNER_MFA_PRINT_TOKEN, false),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = normalizeText(argv[index] || '');
    if (item === '--base-url') {
      args.baseUrl = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--email') {
      args.email = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--password') {
      args.password = String(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--tenant') {
      args.tenantId = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--mfa-code') {
      args.mfaCode = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--mfa-secret') {
      args.mfaSecret = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--auth-store-path') {
      args.authStorePath = normalizeText(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (item === '--show-recovery-codes') {
      args.showRecoveryCodes = true;
      continue;
    }
    if (item === '--no-show-recovery-codes') {
      args.showRecoveryCodes = false;
      continue;
    }
    if (item === '--print-token') {
      args.printToken = true;
      continue;
    }
    if (item === '--no-print-token') {
      args.printToken = false;
      continue;
    }
  }

  return args;
}

function generateTotpCode(secretRaw) {
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

  const counter = Math.floor(Date.now() / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
  return code;
}

async function readMfaSecretFromStore({ email = '', authStorePath = './data/auth.json' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return '';
  const filePath = path.resolve(String(authStorePath || './data/auth.json'));
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const users = raw && raw.users && typeof raw.users === 'object' ? Object.values(raw.users) : [];
    const user =
      users.find(
        (item) => String(item?.email || '').trim().toLowerCase() === normalizedEmail
      ) || null;
    return String(user?.mfaSecret || '').trim();
  } catch {
    return '';
  }
}

async function fetchJson(baseUrl, routePath, { method = 'GET', token = '', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok) {
    const error = new Error(data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function pickTenant({ requestedTenantId = '', verifyResponse = {} } = {}) {
  const requested = normalizeText(requestedTenantId);
  if (requested) return requested;
  const tenants = Array.isArray(verifyResponse?.tenants) ? verifyResponse.tenants : [];
  const first = tenants.find((item) => normalizeText(item?.tenantId));
  return normalizeText(first?.tenantId || '');
}

async function completeMfaFlow({
  baseUrl,
  loginResponse,
  tenantId = '',
  email = '',
  mfaCode = '',
  mfaSecret = '',
  authStorePath = './data/auth.json',
}) {
  if (loginResponse?.requiresMfa !== true) {
    return {
      response: loginResponse,
      setup: null,
      usedSetupSecret: false,
      generatedCode: '',
    };
  }

  const mfaTicket = normalizeText(loginResponse?.mfaTicket || '');
  if (!mfaTicket) {
    throw new Error('MFA krävs men mfaTicket saknas i login-svaret.');
  }

  const setup = loginResponse?.mfa && typeof loginResponse.mfa === 'object' ? loginResponse.mfa : null;
  const setupSecret = normalizeText(setup?.secret || '');
  let resolvedCode = normalizeText(mfaCode || '');
  let usedSetupSecret = false;

  if (!resolvedCode) {
    let resolvedSecret = normalizeText(mfaSecret || '');
    if (!resolvedSecret && setupSecret) {
      resolvedSecret = setupSecret;
      usedSetupSecret = true;
    }
    if (!resolvedSecret) {
      resolvedSecret = await readMfaSecretFromStore({ email, authStorePath });
    }
    if (resolvedSecret) {
      resolvedCode = generateTotpCode(resolvedSecret);
    }
  }

  if (!resolvedCode) {
    throw new Error(
      'MFA-kod kunde inte genereras. Ange --mfa-code eller --mfa-secret (eller AUTH_STORE_PATH med secret).'
    );
  }

  let verifyResponse = await fetchJson(baseUrl, '/api/v1/auth/mfa/verify', {
    method: 'POST',
    body: {
      mfaTicket,
      code: resolvedCode,
      tenantId: tenantId || undefined,
    },
  });

  if (verifyResponse?.requiresTenantSelection === true) {
    const loginTicket = normalizeText(verifyResponse?.loginTicket || '');
    const selectedTenant = pickTenant({
      requestedTenantId: tenantId,
      verifyResponse,
    });
    if (!loginTicket || !selectedTenant) {
      throw new Error('MFA verifierad men tenant-val krävs och kunde inte slutföras automatiskt.');
    }
    verifyResponse = await fetchJson(baseUrl, '/api/v1/auth/select-tenant', {
      method: 'POST',
      body: {
        loginTicket,
        tenantId: selectedTenant,
      },
    });
  }

  return {
    response: verifyResponse,
    setup,
    usedSetupSecret,
    generatedCode: resolvedCode,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(args.baseUrl);
  const email = normalizeText(args.email);
  const password = String(args.password || '');
  const tenantId = normalizeText(args.tenantId);

  if (!email || !password) {
    throw new Error(
      'Saknar credentials. Sätt ARCANA_OWNER_EMAIL och ARCANA_OWNER_PASSWORD (eller --email/--password).'
    );
  }

  const loginResponse = await fetchJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      tenantId: tenantId || undefined,
    },
  });

  let authResponse = loginResponse;
  let setupInfo = null;
  let usedSetupSecret = false;
  let generatedCode = '';
  if (!authResponse?.token && authResponse?.requiresMfa === true) {
    const completed = await completeMfaFlow({
      baseUrl,
      loginResponse,
      tenantId,
      email,
      mfaCode: args.mfaCode,
      mfaSecret: args.mfaSecret,
      authStorePath: args.authStorePath,
    });
    authResponse = completed.response;
    setupInfo = completed.setup;
    usedSetupSecret = completed.usedSetupSecret;
    generatedCode = completed.generatedCode;
  }

  const token = normalizeText(authResponse?.token || '');
  if (!token) {
    throw new Error('Login/MFA slutfördes inte med token.');
  }

  const effectiveTenant =
    normalizeText(authResponse?.membership?.tenantId || '') ||
    normalizeText(authResponse?.tenantId || '') ||
    tenantId ||
    '-';

  process.stdout.write('✅ OWNER MFA setup/login klart.\n');
  process.stdout.write(`   baseUrl=${baseUrl}\n`);
  process.stdout.write(`   email=${email}\n`);
  process.stdout.write(`   tenant=${effectiveTenant}\n`);
  process.stdout.write(`   tokenLength=${token.length}\n`);

  const setupRequired = setupInfo?.setupRequired === true;
  if (setupRequired) {
    const secret = normalizeText(setupInfo?.secret || '');
    const otpauthUrl = normalizeText(setupInfo?.otpauthUrl || '');
    const recoveryCodes = Array.isArray(setupInfo?.recoveryCodes)
      ? setupInfo.recoveryCodes.map((item) => normalizeText(item)).filter(Boolean)
      : [];

    process.stdout.write('\n');
    process.stdout.write('⚠️ MFA secret/recovery genererades i denna körning.\n');
    process.stdout.write('   Spara dessa säkert och rensa terminalhistorik vid behov.\n');
    process.stdout.write('   Kör inte detta i osäkra CI/logg-flöden utan sekretshantering.\n');
    if (secret) process.stdout.write(`   secret=${secret}\n`);
    if (otpauthUrl) process.stdout.write(`   otpauthUrl=${otpauthUrl}\n`);
    process.stdout.write(`   recoveryCodes=${recoveryCodes.length}\n`);
    if (args.showRecoveryCodes && recoveryCodes.length > 0) {
      for (const code of recoveryCodes) {
        process.stdout.write(`   recoveryCode=${code}\n`);
      }
    } else if (recoveryCodes.length > 0) {
      process.stdout.write('   (lägg till --show-recovery-codes för att skriva ut koder)\n');
    }
  }

  if (generatedCode && usedSetupSecret) {
    process.stdout.write('\n');
    process.stdout.write(
      'ℹ️ MFA verifierades med TOTP genererad från setup-secret i login-svaret.\n'
    );
  }

  if (args.printToken) {
    process.stdout.write(`\nTOKEN=${token}\n`);
  }
}

main().catch((error) => {
  console.error('❌ Kunde inte slutföra OWNER MFA setup');
  console.error(error?.message || error);
  process.exit(1);
});
