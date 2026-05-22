'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function createDefaultWhitelistState() {
  const ts = nowIso();
  return {
    version: 1,
    updatedAt: ts,
    claims: [
      {
        id: 'product-structured-admin',
        text: 'strukturerad vårdadministration',
        category: 'product',
        approvedBy: 'OWNER',
        approvedAt: ts,
        expiresAt: '2027-12-31T23:59:59.000Z',
      },
      {
        id: 'product-secure-workflows',
        text: 'trygga administrativa arbetsflöden',
        category: 'product',
        approvedBy: 'OWNER',
        approvedAt: ts,
        expiresAt: '2027-12-31T23:59:59.000Z',
      },
      {
        id: 'trust-audit-trail',
        text: 'spårbarhet och audit',
        category: 'trust',
        approvedBy: 'OWNER',
        approvedAt: ts,
        expiresAt: '2027-12-31T23:59:59.000Z',
      },
      {
        id: 'trust-gdpr-aware',
        text: 'med hänsyn till dataskydd och samtycke',
        category: 'compliance',
        approvedBy: 'OWNER',
        approvedAt: ts,
        expiresAt: '2027-12-31T23:59:59.000Z',
      },
    ],
  };
}

function normalizeClaim(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: normalizeText(source.id) || crypto.randomUUID(),
    text: normalizeText(source.text),
    category: normalizeText(source.category).toLowerCase() || 'general',
    approvedBy: normalizeText(source.approvedBy) || 'OWNER',
    approvedAt: normalizeText(source.approvedAt) || nowIso(),
    expiresAt: normalizeText(source.expiresAt) || '',
  };
}

async function createMarketingClaimsWhitelistStore({ filePath = '' } = {}) {
  const resolvedPath = path.resolve(String(filePath || '').trim());
  if (!resolvedPath) throw new Error('marketingClaimsWhitelistStore filePath saknas.');

  let state = await readJson(resolvedPath, null);
  if (!state || typeof state !== 'object') {
    state = createDefaultWhitelistState();
    await writeJsonAtomic(resolvedPath, state);
  }
  if (!Array.isArray(state.claims)) state.claims = [];

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(resolvedPath, state);
  }

  return {
    filePath: resolvedPath,
    async listClaims({ includeExpired = false } = {}) {
      const nowMs = Date.now();
      let items = state.claims.map((claim) => normalizeClaim(claim)).filter((claim) => claim.text);
      if (!includeExpired) {
        items = items.filter((claim) => {
          const expiresAt = normalizeText(claim.expiresAt);
          if (!expiresAt) return true;
          const ts = Date.parse(expiresAt);
          return !Number.isFinite(ts) || ts >= nowMs;
        });
      }
      return items;
    },
    async upsertClaim(input = {}) {
      const claim = normalizeClaim(input);
      const index = state.claims.findIndex((item) => item.id === claim.id);
      if (index >= 0) {
        state.claims[index] = { ...state.claims[index], ...claim };
      } else {
        state.claims.push(claim);
      }
      await save();
      return claim;
    },
    async ensureSeedDefaults() {
      if (state.claims.length > 0) return { seeded: false, count: state.claims.length };
      state = createDefaultWhitelistState();
      await save();
      return { seeded: true, count: state.claims.length };
    },
  };
}

module.exports = {
  createMarketingClaimsWhitelistStore,
  createDefaultWhitelistState,
};
