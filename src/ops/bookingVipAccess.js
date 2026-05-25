'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SEED_PATH = 'migration/booking-vip-tokens.seed.json';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function loadVipTokenSeed({ repoRoot = process.cwd() } = {}) {
  const fullPath = path.join(repoRoot, SEED_PATH);
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return asArray(raw.tokens);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function loadVipTokensFromEnv() {
  const raw = normalizeText(process.env.ARCANA_BOOKING_VIP_TOKENS_JSON);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return asArray(parsed.tokens || parsed);
  } catch {
    return [];
  }
}

function normalizeVipTokenRecord(record = {}) {
  const safe = asObject(record);
  const tokenId = normalizeText(safe.tokenId || safe.token || safe.id);
  if (!tokenId) return null;
  return {
    tokenId,
    label: normalizeText(safe.label) || tokenId,
    serviceIds: asArray(safe.serviceIds).map(normalizeText).filter(Boolean),
    resourceIds: asArray(safe.resourceIds).map(normalizeText).filter(Boolean),
    clientoSrvId: normalizeText(safe.clientoSrvId) || null,
    clientoResIds: asArray(safe.clientoResIds).map((item) => normalizeText(String(item))).filter(Boolean),
    active: safe.active !== false,
  };
}

function listBookingVipTokens() {
  const byId = new Map();
  for (const item of [...loadVipTokenSeed(), ...loadVipTokensFromEnv()]) {
    const normalized = normalizeVipTokenRecord(item);
    if (!normalized || !normalized.active) continue;
    byId.set(normalized.tokenId, normalized);
  }
  return Array.from(byId.values());
}

function resolveBookingVipToken(tokenId = '') {
  const wanted = normalizeText(tokenId);
  if (!wanted) return null;
  return listBookingVipTokens().find((item) => item.tokenId === wanted) || null;
}

function isServiceAllowedForVipToken(serviceId = '', tokenRecord = {}) {
  const id = normalizeText(serviceId);
  if (!id || !tokenRecord) return false;
  if (!tokenRecord.serviceIds.length) return true;
  return tokenRecord.serviceIds.includes(id);
}

function isResourceAllowedForVipToken(resourceId = '', tokenRecord = {}) {
  const id = normalizeText(resourceId);
  if (!id || !tokenRecord) return false;
  if (!tokenRecord.resourceIds.length) return true;
  return tokenRecord.resourceIds.includes(id);
}

module.exports = {
  SEED_PATH,
  isResourceAllowedForVipToken,
  isServiceAllowedForVipToken,
  listBookingVipTokens,
  resolveBookingVipToken,
};
